// Minimal UART transmitter for the board-integration test. Sends one byte ('K',
// 0x4B) once at 115200 baud assuming the 27 MHz board clock, then idles high.
// The board harness wires uart_monitor to `uart_tx`, which decodes and logs the byte.
module top(input clk, output reg uart_tx);
  localparam integer DIV = 234;        // round(27_000_000 / 115200)
  localparam [7:0]   CH  = 8'h4B;      // 'K'

  reg [9:0] shifter = 10'h3FF;         // 10-bit frame, idles high
  reg [3:0] bitcnt  = 4'd0;
  integer   div     = 0;
  reg       started = 1'b0;

  initial uart_tx = 1'b1;

  always @(posedge clk) begin
    if (!started) begin
      // Load {stop=1, data[7:0], start=0}; sent LSB (start) first.
      shifter <= {1'b1, CH, 1'b0};
      bitcnt  <= 4'd10;
      div     <= 0;
      started <= 1'b1;
      uart_tx <= 1'b1;
    end else if (bitcnt != 0) begin
      if (div == DIV - 1) begin
        div     <= 0;
        uart_tx <= shifter[0];
        shifter <= {1'b1, shifter[9:1]};
        bitcnt  <= bitcnt - 1'b1;
      end else begin
        div <= div + 1;
      end
    end else begin
      uart_tx <= 1'b1;                  // idle / mark
    end
  end
endmodule
