import { test } from "node:test";
import assert from "node:assert/strict";
import { generateBoardHarness, BOARD_CLOCK_PERIOD_NS } from "../src/lib/testbench.js";
import { parseSdc } from "../src/lib/sdc.js";

// generateBoardHarness builds the Tang Nano 9K board testbench that wraps the user's
// design: real 27 MHz clock, active-low button stimulus, and peripheral models wired
// only when the matching ports exist. These tests assert that contract on the emitted
// Verilog text (the harness is later compiled in board.integration.test.mjs).

const LED_DESIGN = `module top(
  input clk, input btn1, input btn2, output reg [5:0] leds
);
  always @(posedge clk) leds <= leds + 1;
endmodule`;

test("instantiates the top module and dumps a finite VCD", () => {
  const tb = generateBoardHarness(LED_DESIGN);
  assert.match(tb, /module tb;/);
  assert.match(tb, /top dut \(/);
  assert.match(tb, /\$dumpfile\("out\.vcd"\);/);
  assert.match(tb, /\$dumpvars\(0, tb\);/);
  assert.match(tb, /#\d+ \$finish;/);
});

test("drives the clock at the 27 MHz board period by default", () => {
  const tb = generateBoardHarness(LED_DESIGN);
  const half = (BOARD_CLOCK_PERIOD_NS / 2).toFixed(4); // 18.5185
  assert.match(tb, new RegExp(`always #${half.replace(".", "\\.")} clk = ~clk;`));
});

test("uses the SDC create_clock period when provided", () => {
  const sdc = parseSdc(`create_clock -name clk -period 20 [get_ports {clk}]`);
  const tb = generateBoardHarness(LED_DESIGN, null, sdc);
  assert.match(tb, /always #10\.0000 clk = ~clk;/); // 20ns period -> 10ns half
});

test("buttons are released high and pulsed low (active-low stimulus)", () => {
  const tb = generateBoardHarness(LED_DESIGN);
  assert.match(tb, /btn1 = 1'b1; \/\/ released/);
  assert.match(tb, /btn2 = 1'b1; \/\/ released/);
  assert.match(tb, /btn1 = 1'b0; \/\/ press btn1/);
});

test("the UART monitor is wired only when a tx port and the peripheral are present", () => {
  const uartDesign = `module top(input clk, output uart_tx); assign uart_tx = 1'b1; endmodule`;
  assert.match(generateBoardHarness(uartDesign, null, null, ["uart"]), /uart_monitor/);
  // present port but peripheral not requested -> not wired
  assert.doesNotMatch(generateBoardHarness(uartDesign, null, null, []), /uart_monitor/);
  // requested but no tx port -> not wired
  assert.doesNotMatch(generateBoardHarness(LED_DESIGN, null, null, ["uart"]), /uart_monitor/);
});

test("the SPI flash model is wired when flash ports + peripheral are present", () => {
  const flashDesign = `module top(
    input clk, output flash_cs, output flash_clk, output flash_mosi, input flash_miso
  ); endmodule`;
  assert.match(generateBoardHarness(flashDesign, null, null, ["flash"]), /spi_flash/);
});

test("the UART monitor baud rate can be overridden via opts", () => {
  const uartDesign = `module top(input clk, output uart_tx); endmodule`;
  const tb = generateBoardHarness(uartDesign, null, null, ["uart"], { baudRate: 9600 });
  assert.match(tb, /BAUD_RATE\(9600\)/);
});

test("returns an empty string when the source has no modules", () => {
  assert.equal(generateBoardHarness("// just a comment"), "");
});
