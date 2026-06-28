// Reference solution — Button-Debounced Up/Down Counter (Tang Nano 9K)
//
// btn1 (active-low) press  -> count up by 1
// btn2 (active-low) press  -> count down by 1
// Each physical *press* changes the count by exactly one, no matter how long the
// button is held or how badly the contact bounces. The 6-bit count drives leds[5:0].
//
// DEBOUNCE_CYCLES is the number of stable clock samples required before a new button
// level is accepted. ~270000 ≈ 10 ms at the board's 27 MHz clock; the testbench
// overrides it to a small value so the simulation stays short.

module debouncer #(
    parameter integer N = 270000
)(
    input  wire clk,
    input  wire noisy,
    output reg  clean
);
  reg sync0 = 1'b1, sync1 = 1'b1;   // 2-FF synchroniser (buttons are async to clk)
  reg [31:0] cnt = 0;
  initial clean = 1'b1;             // buttons idle high (active-low, released)

  always @(posedge clk) begin
    sync0 <= noisy;
    sync1 <= sync0;
    if (sync1 == clean) begin
      cnt <= 0;                     // input matches accepted level -> no change pending
    end else if (cnt >= N - 1) begin
      clean <= sync1;              // input held its new level long enough -> accept it
      cnt   <= 0;
    end else begin
      cnt <= cnt + 1;             // counting up the stable window
    end
  end
endmodule

module top #(
    parameter integer DEBOUNCE_CYCLES = 270000
)(
    input  wire       clk,
    input  wire       btn1,        // active-low: press = up
    input  wire       btn2,        // active-low: press = down
    output reg  [5:0] leds
);
  wire clean1, clean2;
  reg  prev1 = 1'b1, prev2 = 1'b1;

  debouncer #(.N(DEBOUNCE_CYCLES)) db1 (.clk(clk), .noisy(btn1), .clean(clean1));
  debouncer #(.N(DEBOUNCE_CYCLES)) db2 (.clk(clk), .noisy(btn2), .clean(clean2));

  // A "press" is a falling edge on the debounced (active-low) line.
  wire press_up   = prev1 & ~clean1;
  wire press_down = prev2 & ~clean2;

  initial leds = 6'd0;

  always @(posedge clk) begin
    prev1 <= clean1;
    prev2 <= clean2;
    if (press_up & ~press_down)
      leds <= leds + 6'd1;
    else if (press_down & ~press_up)
      leds <= leds - 6'd1;
  end
endmodule
