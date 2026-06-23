import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Use a short timeout so the runaway-sim test stays fast. Must be set BEFORE
// importing the sandbox module (it reads env at load), hence the dynamic import.
process.env.SIM_TIMEOUT_S = process.env.SIM_TIMEOUT_S || "5";
const IMAGE = process.env.SIM_IMAGE || "localhost/nika-sim:latest";

const here = dirname(fileURLToPath(import.meta.url));

// Gate the whole suite on the sandbox image being present.
let reason = false;
try {
  execFileSync("podman", ["image", "exists", IMAGE], { stdio: "ignore" });
} catch {
  reason = `sandbox image ${IMAGE} not available (build: podman build -t nika-sim -f Dockerfile.sim sim/)`;
}

const { runSimulation } = await import("../src/lib/sandbox.js");
const { parseVCD } = await import("../src/lib/vcd.js");

const leaf = (s) => s.name.replace(/\[.*$/, "");
const find = (m, name) => m.signals.find((s) => leaf(s) === name);

test("runs the feature/stress design and produces a rich VCD", { skip: reason }, async () => {
  const source = readFileSync(join(here, "fixtures", "stress.v"), "utf8");
  const r = await runSimulation(source);

  assert.equal(r.ok, true, `expected success, got: ${r.stage} ${r.log}`);
  assert.match(r.log, /STRESS done/); // $display reached stdout(stderr) channel

  const m = parseVCD(r.vcd);

  // Wide bus widths preserved.
  assert.equal(find(m, "counter").width, 32);
  assert.equal(find(m, "accum").width, 16);
  assert.equal(find(m, "shifter").width, 8);

  // Counter actually advances (many transitions over 300 cycles).
  assert.ok(find(m, "counter").changes.length > 50);

  // Tri-state net reaches high-Z at some point.
  const tri = find(m, "tri_w");
  assert.ok(tri.changes.some((c) => c.v === "z"), "tri_w should be z while undriven");

  // Uninitialized reg is x before it is assigned, then becomes defined.
  const uninit = find(m, "uninit");
  assert.equal(uninit.changes[0].v, "x");
  assert.ok(uninit.changes.some((c) => c.v !== "x"), "uninit should resolve to a value");

  // Timeline is in nanoseconds and non-trivial.
  assert.ok(m.timeMax > 100);
});

test("reports a compile failure cleanly", { skip: reason }, async () => {
  const r = await runSimulation("module top; this is not verilog endmodule");
  assert.equal(r.ok, false);
  assert.equal(r.stage, "compile");
  assert.match(r.log, /syntax error/i);
});

test("kills a runaway simulation at the timeout", { skip: reason }, async () => {
  // No $finish, infinite activity -> must be terminated, not hang the test.
  const src = `\`timescale 1ns/1ps
    module tb;
      reg c = 0;
      initial begin $dumpfile("out.vcd"); $dumpvars(0, tb); end
      always #1 c = ~c;
    endmodule`;
  const start = Date.now();
  const r = await runSimulation(src);
  const elapsed = (Date.now() - start) / 1000;
  assert.equal(r.ok, false);
  assert.equal(r.stage, "timeout");
  assert.ok(elapsed < 12, `should stop near SIM_TIMEOUT_S, took ${elapsed}s`);
});
