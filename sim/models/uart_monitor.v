// UART RX monitor — purely behavioral, Icarus Verilog compatible.
// Samples the TX line from the DUT, decodes 8N1 frames at the configured
// baud rate, and prints each decoded byte prefixed with "UART: " so the
// API post-processor can extract UART output from the simulation log.
//
// Parameters:
//   BAUD_RATE     — baud rate in bps (default 115200)
//   CLK_PERIOD_NS — simulation clock period in ns (must match the harness clock)
//
// Ports:
//   tx — the DUT's UART TX output (1 = idle / mark)

`timescale 1ns/1ps

module uart_monitor #(
  parameter integer BAUD_RATE     = 115200,
  parameter real    CLK_PERIOD_NS = 37.037  // ≈ 27 MHz
) (
  input wire tx
);

  // Bit period in ns
  localparam real BIT_PERIOD_NS = 1_000_000_000.0 / BAUD_RATE;
  // Sample at mid-bit
  localparam real HALF_BIT_NS   = BIT_PERIOD_NS / 2.0;

  // UART frame decode task
  task automatic decode_frame;
    reg [7:0] byte_val;
    integer   bit_idx;
    begin
      // Wait for mid-point of start bit
      #(HALF_BIT_NS);
      if (tx !== 1'b0) disable decode_frame; // false start

      // Sample 8 data bits
      byte_val = 8'h00;
      for (bit_idx = 0; bit_idx < 8; bit_idx = bit_idx + 1) begin
        #(BIT_PERIOD_NS);
        byte_val[bit_idx] = tx;
      end

      // Stop bit
      #(BIT_PERIOD_NS);

      // Printable ASCII: display character; otherwise display hex
      if (byte_val >= 8'h20 && byte_val < 8'h7F) begin
        $display("UART: %s", byte_val);
      end else if (byte_val == 8'h0A) begin
        $display("UART: \\n");
      end else if (byte_val == 8'h0D) begin
        $display("UART: \\r");
      end else begin
        $display("UART: [0x%02X]", byte_val);
      end
    end
  endtask

  // Trigger on falling edge of TX (start bit detection)
  initial begin
    forever begin
      @(negedge tx);
      decode_frame;
    end
  end

endmodule
