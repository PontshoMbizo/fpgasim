import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVCD, toModel } from "../src/lib/vcd.js";

const vcd = (lines) => lines.join("\n");

test("parses scalar signals with an initial sample at t=0", () => {
  const m = parseVCD(vcd([
    "$timescale 1ns $end",
    "$scope module top $end",
    "$var wire 1 ! clk $end",
    "$upscope $end",
    "$enddefinitions $end",
    "#0", "0!", "#1", "1!", "#2", "0!",
  ]));
  assert.equal(m.signals.length, 1);
  const clk = m.signals[0];
  assert.equal(clk.kind, "bit");
  assert.equal(clk.width, 1);
  assert.deepEqual(clk.changes, [{ t: 0, v: "0" }, { t: 1, v: "1" }, { t: 2, v: "0" }]);
  assert.equal(m.timeMax, 2);
});

test("normalizes times to nanoseconds using the timescale", () => {
  const m = parseVCD(vcd([
    "$timescale 1ps $end",
    "$scope module top $end",
    "$var wire 1 ! clk $end",
    "$upscope $end",
    "$enddefinitions $end",
    "#0", "0!", "#5000", "1!",
  ]));
  // 5000 ps -> 5 ns
  assert.deepEqual(m.signals[0].changes, [{ t: 0, v: "0" }, { t: 5, v: "1" }]);
  assert.equal(m.timeMax, 5);
});

test("converts vector buses to width-padded hex", () => {
  const m = parseVCD(vcd([
    "$timescale 1ns $end",
    "$scope module top $end",
    "$var reg 6 # leds [5:0] $end",
    "$upscope $end",
    "$enddefinitions $end",
    "#0", "b000000 #", "#10", "b111111 #", "#20", "b010101 #",
  ]));
  const leds = m.signals[0];
  assert.equal(leds.kind, "bus");
  assert.equal(leds.width, 6);
  assert.equal(leds.name, "leds[5:0]");
  assert.deepEqual(leds.changes.map((c) => c.v), ["00", "3F", "15"]);
});

test("represents x/z vector samples as unknown", () => {
  const m = parseVCD(vcd([
    "$timescale 1ns $end",
    "$scope module top $end",
    "$var reg 4 # bus [3:0] $end",
    "$upscope $end",
    "$enddefinitions $end",
    "#0", "bxxxx #", "#5", "b1z01 #",
  ]));
  assert.deepEqual(m.signals[0].changes.map((c) => c.v), ["x", "x"]);
});

test("aliased vars (same id, different scopes) share one value history", () => {
  // iverilog gives connected nets a single id across scopes.
  const m = parseVCD(vcd([
    "$timescale 1ns $end",
    "$scope module tb $end",
    "$var wire 1 ! clk $end",
    "$scope module dut $end",
    "$var wire 1 ! clk $end",
    "$upscope $end",
    "$upscope $end",
    "$enddefinitions $end",
    "#0", "0!", "#5", "1!", "#10", "0!",
  ]));
  assert.equal(m.signals.length, 2);
  const [tb, dut] = m.signals;
  assert.equal(tb.path, "tb.clk");
  assert.equal(dut.path, "tb.dut.clk");
  assert.equal(tb.depth, 1);
  assert.equal(dut.depth, 2);
  // Both see all three transitions.
  assert.equal(tb.changes.length, 3);
  assert.equal(dut.changes.length, 3);
});

test("tracks hierarchical scope paths and depth", () => {
  const m = parseVCD(vcd([
    "$timescale 1ns $end",
    "$scope module tb $end",
    "$var reg 8 a x $end",
    "$scope module dut $end",
    "$var reg 8 b y $end",
    "$upscope $end",
    "$upscope $end",
    "$enddefinitions $end",
    "#0", "b0 a", "b0 b",
  ]));
  assert.deepEqual(m.signals.map((s) => [s.path, s.depth]), [
    ["tb.x", 1],
    ["tb.dut.y", 2],
  ]);
});

test("collapses multiple writes at the same timestamp", () => {
  const m = parseVCD(vcd([
    "$timescale 1ns $end",
    "$scope module top $end",
    "$var wire 1 ! s $end",
    "$upscope $end",
    "$enddefinitions $end",
    "#0", "0!", "#5", "1!", "0!", "1!",
  ]));
  // The three writes at #5 collapse to the final value.
  assert.deepEqual(m.signals[0].changes, [{ t: 0, v: "0" }, { t: 5, v: "1" }]);
});

test("toModel accepts strings, models, and bare signal arrays", () => {
  const asString = toModel("$timescale 1ns $end\n$scope module top $end\n$var wire 1 ! c $end\n$upscope $end\n$enddefinitions $end\n#0\n1!");
  assert.equal(asString.signals.length, 1);

  const passthrough = { timescale: { value: 1, unit: "ns" }, timeMax: 7, signals: [] };
  assert.equal(toModel(passthrough), passthrough);

  const fromArray = toModel([{ id: "x", name: "a", kind: "bit", width: 1, changes: [{ t: 3, v: "1" }] }]);
  assert.equal(fromArray.timeMax, 3);
  assert.equal(fromArray.signals.length, 1);
});

test("handles an empty / header-only VCD without throwing", () => {
  const m = parseVCD("$timescale 1ns $end\n$enddefinitions $end\n");
  assert.deepEqual(m.signals, []);
  assert.equal(m.timeMax, 0);
});
