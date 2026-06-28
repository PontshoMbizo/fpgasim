// Starter — Button-Debounced Up/Down Counter (Tang Nano 9K)
//
// Fill in the logic so that:
//   * a press of btn1 (active-low) increments the 6-bit count by exactly one,
//   * a press of btn2 (active-low) decrements it by exactly one,
//   * contact bounce never produces more than one step per physical press.
//
// Keep the port list and module name `top` unchanged (the .cst pin map depends on them).
// Tip: synchronise each async button through 2 flip-flops, debounce by requiring the
// level to stay stable for DEBOUNCE_CYCLES samples, then detect the falling edge.

module top #(
    parameter integer DEBOUNCE_CYCLES = 270000   // ~10 ms @ 27 MHz
)(
    input  wire       clk,
    input  wire       btn1,
    input  wire       btn2,
    output reg  [5:0] leds
);
  initial leds = 6'd0;

  // TODO: synchronise + debounce btn1/btn2, detect presses, and update `leds`.
  always @(posedge clk) begin
    leds <= leds;   // placeholder: count never changes yet
  end
endmodule
