`timescale 1ns/1ps
// Self-checking testbench for the up/down counter.
// Drives a *bouncy* press on each button and verifies the count moves by exactly one
// per press (i.e. the debouncer swallowed the bounce). DEBOUNCE_CYCLES is overridden
// to a small value so the run is short.
module tb;
  reg clk = 0;
  reg btn1 = 1;        // active-low, released
  reg btn2 = 1;
  wire [5:0] leds;

  localparam integer DB = 4;   // tiny debounce window for simulation

  top #(.DEBOUNCE_CYCLES(DB)) dut (
    .clk(clk), .btn1(btn1), .btn2(btn2), .leds(leds)
  );

  always #5 clk = ~clk;   // 100 MHz

  integer errors = 0;

  // Hold a button level for enough clocks that the debouncer accepts it.
  task settle; input level1; input level2; integer i;
  begin
    btn1 = level1; btn2 = level2;
    for (i = 0; i < (DB + 4); i = i + 1) @(posedge clk);
  end
  endtask

  // Simulate contact bounce: rapidly toggle btn1 around `final_level` before settling.
  task bounce_btn1; input final_level; integer i;
  begin
    for (i = 0; i < 6; i = i + 1) begin btn1 = ~btn1; @(posedge clk); end
    settle(final_level, 1'b1);
  end
  endtask

  task check; input [5:0] got; input [5:0] exp; input [8*48-1:0] name;
  begin
    if (got !== exp) begin
      $display("FAIL: %0s — leds=%0d expected=%0d", name, got, exp);
      errors = errors + 1;
    end else begin
      $display("ok:   %0s — leds=%0d", name, got);
    end
  end
  endtask

  initial begin
    $dumpfile("out.vcd");
    $dumpvars(0, tb);

    settle(1'b1, 1'b1);
    check(leds, 6'd0, "initial");

    bounce_btn1(1'b0); settle(1'b1, 1'b1);   // one bouncy press+release of btn1
    check(leds, 6'd1, "after one up press (bouncy)");

    settle(1'b0, 1'b1); settle(1'b1, 1'b1);   // second up press
    check(leds, 6'd2, "after second up press");

    settle(1'b1, 1'b0); settle(1'b1, 1'b1);   // one down press on btn2
    check(leds, 6'd1, "after one down press");

    if (errors == 0) $display("RESULT: PASS");
    else             $display("RESULT: FAIL (%0d errors)", errors);
    $finish;
  end
endmodule
