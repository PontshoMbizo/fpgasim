`timescale 1ns/1ps
// Feature + stress exercise for the simulation backend and VCD parser.
// Covers: clock, wide buses, arithmetic, shift register, FSM, memory array,
// tri-state (z), uninitialized (x), and $display runtime output. It ships its own
// $dumpvars, so the backend compiles it verbatim (no auto testbench).

module stress;
  reg         clk = 0;
  reg         rst = 1;
  reg  [7:0]  din = 0;

  reg  [31:0] counter = 0;   // wide bus, monotonic
  reg  [15:0] accum   = 0;   // accumulates din
  reg  [7:0]  shifter = 8'hA5; // rotating shift register
  reg  [2:0]  state   = 0;   // small FSM
  reg  [7:0]  mem [0:7];     // memory array -> many signals
  reg  [3:0]  uninit;        // intentionally undriven for a while -> x

  // Tri-state net: high-Z unless driven.
  reg         drive_en = 0;
  reg         tri_val  = 1;
  wire        tri_w = drive_en ? tri_val : 1'bz;

  integer i;

  always #5 clk = ~clk;

  always @(posedge clk) begin
    if (rst) begin
      counter <= 0;
      accum   <= 0;
      state   <= 0;
    end else begin
      counter <= counter + 1;
      accum   <= accum + din;
      shifter <= {shifter[6:0], shifter[7]};
      state   <= (state == 3'd5) ? 3'd0 : state + 1;
    end
  end

  initial begin
    $dumpfile("out.vcd");
    $dumpvars(0, stress);

    for (i = 0; i < 8; i = i + 1) mem[i] = i * 9;

    #12 rst = 0;                       // release reset off a clock edge

    // Stress: drive many cycles of changing input.
    repeat (300) begin
      @(posedge clk);
      din <= din + 8'd7;
    end

    uninit  = 4'hC;                    // x -> defined transition
    drive_en = 1;  #20  drive_en = 0;  // z -> 1 -> z on tri_w

    $display("STRESS done: counter=%0d accum=%0d shifter=%02x state=%0d",
             counter, accum, shifter, state);

    #20 $finish;
  end
endmodule
