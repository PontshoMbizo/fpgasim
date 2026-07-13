// Unit tests for the fulgurlab lockstep bridge: harness generation, line codec,
// session management (against fakesim.mjs), and the ws message handler.
// Everything here is hermetic — no container, no iverilog, no network sockets
// (the ws layer is tested through handleConnection with a stub socket).

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  describePins,
  generateLockstepHarness,
  MAX_EDGE_EVENTS_PER_QUANTUM,
} from "../src/lib/lockstepHarness.js";
import {
  inputsToHex,
  hexToOutputs,
  parseSimLine,
  eventsFromSnapshots,
  formatT,
} from "../src/lib/lockstepCodec.js";
import { LockstepSession } from "../src/lib/lockstepSession.js";
import { handleConnection, PROTO } from "../bridge/server.mjs";

const FAKESIM = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fakesim.mjs");
const fakeCmd = [process.execPath, FAKESIM];

const COUNTER_SRC = `
module top(input clk, input rst, output reg [1:0] led);
  always @(posedge clk or posedge rst)
    if (rst) led <= 0; else led <= led + 1;
endmodule
`;

// ---------- describePins / harness generation ----------

test("describePins: clock excluded, multi-bit ports expand per bit, order stable", () => {
  const d = describePins(COUNTER_SRC);
  assert.equal(d.error, undefined);
  assert.equal(d.top, "top");
  assert.equal(d.clockPort, "clk");
  assert.deepEqual(
    d.pins.map((p) => [p.name, p.dir]),
    [["rst", "in"], ["led[0]", "out"], ["led[1]", "out"]]
  );
});

test("describePins: inout rejected, empty source rejected", () => {
  assert.match(describePins("module t(inout a); endmodule").error, /inout/);
  assert.match(describePins("// nothing").error, /no module/);
});

test("harness: instantiates top, drives clock at 27 MHz, reads T lines, caps edges", () => {
  const h = generateLockstepHarness(COUNTER_SRC);
  assert.equal(h.error, undefined);
  assert.match(h.text, /top __fl_dut/);
  assert.match(h.text, /always #18\.519 clk = ~clk/);
  assert.match(h.text, /\$fscanf\(__FL_STDIN, " T %d %h"/);
  assert.match(h.text, new RegExp(`__fl_ev < ${MAX_EDGE_EVENTS_PER_QUANTUM}`));
  // inputs are continuous assigns (X-free at t=0), outputs concat LSB-first
  assert.match(h.text, /assign rst = __fl_in\[0\]/);
  assert.match(h.text, /assign __fl_out = \{led\[1\], led\[0\]\}/);
});

test("harness: clockless design gets no clock block", () => {
  const h = generateLockstepHarness("module top(input a, output y); assign y = ~a; endmodule");
  assert.match(h.text, /no clock-named input/);
  assert.equal(h.clockPort, null);
});

// ---------- codec ----------

test("codec: inputs→hex LSB-first; hex→outputs named", () => {
  const pins = [
    { name: "a", dir: "in" }, { name: "b", dir: "in" },
    { name: "y", dir: "out" }, { name: "z", dir: "out" },
  ];
  assert.equal(inputsToHex(pins, { a: 1 }), "1");
  assert.equal(inputsToHex(pins, { b: 1 }), "2");
  assert.equal(inputsToHex(pins, {}), "0");
  assert.deepEqual(hexToOutputs(pins, "2"), { y: 0, z: 1 });
  assert.deepEqual(hexToOutputs(pins, "3"), { y: 1, z: 1 });
  assert.equal(hexToOutputs(pins, "zz"), null);
});

test("codec: parseSimLine classifies E/O/X and tolerates chatter", () => {
  assert.deepEqual(parseSimLine("O 1000 3f"), { kind: "O", tNs: 1000, outHex: "3f" });
  assert.deepEqual(parseSimLine("E 500 1"), { kind: "E", tNs: 500, outHex: "1" });
  assert.deepEqual(parseSimLine("X eof"), { kind: "X", reason: "eof" });
  assert.equal(parseSimLine("hello world").kind, "log");
  assert.equal(parseSimLine("O nonsense").kind, "log");
  assert.equal(formatT(1000, ""), "T 1000 0\n");
});

test("codec: eventsFromSnapshots diffs per pin", () => {
  const pins = [{ name: "y", dir: "out" }, { name: "z", dir: "out" }];
  const ev = eventsFromSnapshots(pins, "0", [
    { tNs: 10, outHex: "1" },
    { tNs: 20, outHex: "3" },
    { tNs: 30, outHex: "2" },
  ]);
  assert.deepEqual(ev, [[10, "y", 1], [20, "z", 1], [30, "y", 0]]);
});

// ---------- session (against fakesim) ----------

test("session: framing + step/reply + accumulated time", async () => {
  const s = new LockstepSession("plain source", { command: fakeCmd });
  const r1 = await s.step(1000, "5");
  assert.equal(r1.tNs, 1000);
  assert.equal(r1.outHex, "5");
  const r2 = await s.step(1000, "a");
  assert.equal(r2.tNs, 2000);
  assert.equal(r2.outHex, "a");
  s.dispose();
});

test("session: E snapshots collected per step", async () => {
  const s = new LockstepSession("FAKE_EDGES", { command: fakeCmd });
  const r = await s.step(1000, "1");
  assert.equal(r.snaps.length, 2);
  assert.equal(r.snaps[1].outHex, "1");
  s.dispose();
});

test("session: X line ends the session; pending step rejects", async () => {
  let ended;
  const s = new LockstepSession("FAKE_END_AT_2", { command: fakeCmd, onEnd: (r) => (ended = r) });
  await s.step(1000, "0");
  await assert.rejects(() => s.step(1000, "0"), /ended: done/);
  assert.equal(ended, "done");
  assert.equal(s.dead, true);
});

test("session: reply timeout kills the session", async () => {
  const s = new LockstepSession("FAKE_HANG", { command: fakeCmd, replyTimeoutMs: 150 });
  await assert.rejects(() => s.step(1000, "0"), /reply-timeout/);
  assert.equal(s.dead, true);
});

test("session: only one step in flight", async () => {
  const s = new LockstepSession("plain", { command: fakeCmd });
  const p = s.step(1000, "0");
  await assert.rejects(() => s.step(1000, "0"), /in flight/);
  await p;
  s.dispose();
});

test("session: idle timeout fires between steps", async () => {
  let ended;
  const s = new LockstepSession("plain", { command: fakeCmd, idleTimeoutMs: 120, onEnd: (r) => (ended = r) });
  await s.step(1000, "0");
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(s.dead, true);
  assert.equal(ended, "idle-timeout");
});

// ---------- ws message handler (stub socket, fake sessions) ----------

function stubWs() {
  const handlers = {};
  return {
    OPEN: 1,
    readyState: 1,
    sent: [],
    on(ev, fn) { handlers[ev] = fn; },
    send(s) { this.sent.push(JSON.parse(s)); },
    emit(ev, ...a) { return handlers[ev]?.(...a); },
    async say(obj) { await handlers.message(JSON.stringify(obj)); },
    last() { return this.sent[this.sent.length - 1]; },
  };
}

const makeFakeSession = (source, hooks) => new LockstepSession(source, { ...hooks, command: fakeCmd });

test("server: hello/welcome + proto mismatch", async () => {
  const ws = stubWs();
  handleConnection(ws, makeFakeSession);
  await ws.say({ type: "hello", proto: PROTO });
  assert.equal(ws.last().type, "welcome");
  assert.equal(ws.last().backend, "fpgasim");
  await ws.say({ type: "hello", proto: 99 });
  assert.equal(ws.last().type, "error");
  assert.equal(ws.last().stage, "proto");
});

test("server: create → created with pins; step → stepped with outputs+events", async () => {
  const ws = stubWs();
  handleConnection(ws, makeFakeSession);
  await ws.say({ type: "create", source: COUNTER_SRC + "\n// FAKE_EDGES" });
  const created = ws.last();
  assert.equal(created.type, "created");
  assert.deepEqual(created.pins, [
    { name: "rst", dir: "in" }, { name: "led[0]", dir: "out" }, { name: "led[1]", dir: "out" },
  ]);
  assert.equal(created.quantum_ns, 1_000_000);

  await ws.say({ type: "step", session: created.session, t_ns: 0, inputs: { rst: 1 } });
  const stepped = ws.last();
  assert.equal(stepped.type, "stepped");
  assert.deepEqual(Object.keys(stepped.outputs).sort(), ["led[0]", "led[1]"]);
  assert.ok(Array.isArray(stepped.events));

  await ws.say({ type: "dispose", session: created.session });
  assert.equal(ws.last().type, "disposed");
});

test("server: bad create surfaces compile error; unknown session is a proto error", async () => {
  const ws = stubWs();
  handleConnection(ws, makeFakeSession);
  await ws.say({ type: "create", source: "// no module here" });
  assert.equal(ws.last().type, "error");
  assert.equal(ws.last().stage, "compile");
  await ws.say({ type: "step", session: "nope", inputs: {} });
  assert.equal(ws.last().stage, "proto");
});

test("server: ws close disposes sessions", async () => {
  const ws = stubWs();
  handleConnection(ws, makeFakeSession);
  await ws.say({ type: "create", source: COUNTER_SRC });
  const id = ws.last().session;
  assert.ok(id);
  ws.emit("close");
  await ws.say({ type: "step", session: id, inputs: {} });
  assert.equal(ws.last().stage, "proto"); // session gone
});
