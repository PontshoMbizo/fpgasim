import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTestbench, hasTestbench } from "../src/lib/testbench.js";

const DESIGN = `module top(
  input clk, input btn1, input btn2, output reg [5:0] leds
);
  reg [24:0] counter;
  always @(posedge clk) counter <= counter + 1;
  always @(posedge clk) leds <= counter[24:19];
endmodule`;

test("hasTestbench detects $dumpvars (ignoring comments)", () => {
  assert.equal(hasTestbench(DESIGN), false);
  assert.equal(hasTestbench(DESIGN + "\ninitial $dumpvars(0, x);"), true);
  assert.equal(hasTestbench("// $dumpvars in a comment\n" + DESIGN), false);
});

test("generates a driving testbench for an ANSI-header design", () => {
  const tb = generateTestbench(DESIGN);
  assert.match(tb, /`timescale 1ns\/1ps/);
  assert.match(tb, /module tb;/);
  assert.match(tb, /top dut \(/);
  // clock generator on clk
  assert.match(tb, /initial clk = 0;/);
  assert.match(tb, /always #5 clk = ~clk;/);
  // dump + finite duration
  assert.match(tb, /\$dumpfile\("out\.vcd"\);/);
  assert.match(tb, /\$dumpvars\(0, tb\);/);
  assert.match(tb, /#\d+ \$finish;/);
});

test("declares reg inputs and wire outputs with correct widths", () => {
  const tb = generateTestbench(DESIGN);
  assert.match(tb, /reg clk;/);
  assert.match(tb, /reg btn1;/);
  assert.match(tb, /wire \[5:0\] leds;/); // output bus keeps its range
  // non-clock inputs get a default assignment
  assert.match(tb, /btn1 = 1'b1;/);
});

test("respects a custom duration", () => {
  const tb = generateTestbench(DESIGN, { duration: 12345 });
  assert.match(tb, /#12345 \$finish;/);
});

test("picks the un-instantiated module when none is named 'top'", () => {
  const code = `
    module leaf(input a, output b); assign b = a; endmodule
    module wrapper(input x, output y);
      leaf u0(.a(x), .b(y));
    endmodule`;
  const tb = generateTestbench(code);
  assert.match(tb, /wrapper dut \(/); // wrapper is the root, not leaf
});

test("returns empty string when there are no modules", () => {
  assert.equal(generateTestbench("// just a comment"), "");
});
