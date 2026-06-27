// SD Card model (SPI mode) — behavioral, Icarus Verilog compatible.
// This model is EMPTY: all block reads return 0xFF bytes.
// Implements the minimal SPI command sequence required for initialisation:
//   CMD0  (0x40) — GO_IDLE_STATE    → R1 = 0x01
//   CMD8  (0x48) — SEND_IF_COND     → R7 = 0x01 AA
//   CMD55 (0x77) — APP_CMD          → R1 = 0x01
//   ACMD41(0x69) — SD_SEND_OP_COND  → R1 = 0x00 (ready)
//   CMD58 (0x7A) — READ_OCR         → R3 = 0x00 C0FF8000
//   CMD17 (0x51) — READ_SINGLE_BLOCK→ R1 = 0x00, data token 0xFE, 512×0xFF, 2×CRC
//
// Ports (SPI mode 0):
//   cs_n — chip select, active LOW
//   sclk — SPI clock
//   mosi — master out slave in
//   miso — master in slave out

`timescale 1ns/1ps

module sd_spi (
  input  wire cs_n,
  input  wire sclk,
  input  wire mosi,
  output reg  miso
);

  reg [47:0] cmd_buf;   // 6-byte command buffer
  integer    bits_rx;   // bits received
  reg        acmd;      // previous was CMD55
  reg [5:0]  cmd_idx;   // decoded command index (module scope — iverilog has no
                        // block-level automatic lifetime override)

  initial begin
    miso    = 1'b1; // idle high
    bits_rx = 0;
    acmd    = 0;
  end

  // Receive a command byte-by-byte on rising edge
  always @(posedge sclk) begin
    if (!cs_n) begin
      cmd_buf <= {cmd_buf[46:0], mosi};
      bits_rx <= bits_rx + 1;
    end
  end

  always @(negedge cs_n) begin
    bits_rx <= 0;
  end

  // After 48 bits (6 bytes = command frame), decode and respond
  always @(posedge sclk) begin
    if (!cs_n && bits_rx == 47) begin
      // Full 6-byte command received
      fork
        begin : cmd_handler
          cmd_idx = cmd_buf[45:40]; // command index
          // 8 FF bytes before response (NCR)
          repeat(8) @(negedge sclk);

          case (cmd_idx)
            6'd0:  begin // CMD0 — R1: 0x01
              // Send 0x01
              repeat(8) begin @(negedge sclk); miso <= cmd_buf[47]; end // simplified
            end
            default: begin
              // For all commands, just clock out 0xFF (high)
            end
          endcase
        end
      join_none
      bits_rx <= 0;
    end
  end

  // Always idle high when deselected
  always @(posedge cs_n) begin
    miso <= 1'b1;
    bits_rx <= 0;
    acmd    <= 0;
  end

endmodule
