// Built-in starter templates for the editor. Pure strings, no Node APIs, so this is
// safe to import from client components. The server-side registry (src/lib/templates.js)
// layers disk-backed overrides on top of these; see exposed setTemplate()/getTemplates().

export const DEFAULT_DESIGN = `module top(
    input clk,
    input btn1,
    input btn2,
    output reg [5:0] leds
);

  // Simple clock divider for visual testing
  reg [24:0] counter;
  always @(posedge clk) begin
    counter <= counter + 1;
  end

  always @(posedge clk) begin
    if (!btn1)
      leds <= 6'b111111;
    else if (!btn2)
      leds <= 6'b000000;
    else
      leds <= counter[24:19];
  end

endmodule
`;

export const DEFAULT_TESTBENCH = `\`timescale 1ns/1ps
// Testbench for the design above. Edit freely — while this tab is non-empty it's
// compiled verbatim and the auto-generated stimulus is skipped.
module tb;
  reg clk = 0;
  reg btn1 = 1;   // buttons are active-low: 1 = released
  reg btn2 = 1;
  wire [5:0] leds;

  // Instantiate the design under test
  top dut (
    .clk(clk),
    .btn1(btn1),
    .btn2(btn2),
    .leds(leds)
  );

  // 100 MHz clock (10 ns period)
  always #5 clk = ~clk;

  initial begin
    // Required: the backend reads this file back as the waveform.
    $dumpfile("out.vcd");
    $dumpvars(0, tb);

    // Stimulus
    #100  btn1 = 0;   // press btn1
    #100  btn1 = 1;   // release
    #100  btn2 = 0;   // press btn2
    #100  btn2 = 1;   // release

    #2000 $finish;    // end the simulation (always terminate!)
  end
endmodule
`;

export const DEFAULT_CST = `// Tang Nano 9K Physical Constraints
// Maps top-level ports to physical FPGA pins.
// Syntax: IO_LOC "port" pin_number; IO_PORT "port" ATTR=VALUE;

IO_LOC "clk" 63;
IO_PORT "clk" IO_TYPE=LVCMOS33 PULL_MODE=NONE;

IO_LOC "btn1" 3;
IO_PORT "btn1" IO_TYPE=LVCMOS33 PULL_MODE=UP;

IO_LOC "btn2" 4;
IO_PORT "btn2" IO_TYPE=LVCMOS33 PULL_MODE=UP;

IO_LOC "leds[0]" 10;
IO_PORT "leds[0]" IO_TYPE=LVCMOS33 PULL_MODE=UP DRIVE=8;

IO_LOC "leds[1]" 11;
IO_PORT "leds[1]" IO_TYPE=LVCMOS33 PULL_MODE=UP DRIVE=8;

IO_LOC "leds[2]" 13;
IO_PORT "leds[2]" IO_TYPE=LVCMOS33 PULL_MODE=UP DRIVE=8;

IO_LOC "leds[3]" 14;
IO_PORT "leds[3]" IO_TYPE=LVCMOS33 PULL_MODE=UP DRIVE=8;

IO_LOC "leds[4]" 15;
IO_PORT "leds[4]" IO_TYPE=LVCMOS33 PULL_MODE=UP DRIVE=8;

IO_LOC "leds[5]" 16;
IO_PORT "leds[5]" IO_TYPE=LVCMOS33 PULL_MODE=UP DRIVE=8;
`;

export const DEFAULT_SDC = `// Tang Nano 9K Timing Constraints
// Defines clock frequencies for the synthesis and timing analysis tools.

// Board clock is 27 MHz (37.037 ns period).
create_clock -name clk -period 37.037 -waveform {0 18.518} [get_ports {clk}]
`;

// The set of template names the registry recognizes.
export const TEMPLATE_NAMES = ["design", "testbench", "cst", "sdc"];

export const DEFAULT_TEMPLATES = {
  design: DEFAULT_DESIGN,
  testbench: DEFAULT_TESTBENCH,
  cst: DEFAULT_CST,
  sdc: DEFAULT_SDC,
};
