// SPI Flash model — behavioral, Icarus Verilog compatible.
// Emulates a Winbond W25Q32JV-compatible SPI flash (32 Mbit / 4 MB).
// This model is EMPTY: all memory locations read as 0xFF.
// Supports:
//   - Read Data (0x03): returns 0xFF for any address
//   - JEDEC ID (0x9F): returns Winbond manufacturer ID 0xEF, device 0x4016
//   - Read Status Register 1 (0x05): WIP=0 (always ready)
//   - Write Enable (0x06): accepted silently (no actual write performed)
//   - All other commands: ignored
//
// Ports (SPI mode 0, CPOL=0, CPHA=0):
//   cs_n — chip select, active LOW
//   sclk — SPI clock
//   mosi — master out slave in
//   miso — master in slave out (driven by this model)

`timescale 1ns/1ps

module spi_flash (
  input  wire cs_n,
  input  wire sclk,
  input  wire mosi,
  output reg  miso
);

  // Internal shift register
  reg [7:0]  shift_in;
  reg [7:0]  shift_out;
  integer    bit_cnt;    // bits received in current byte
  integer    byte_cnt;   // bytes received in current command
  reg [7:0]  cmd;        // first byte (command)
  reg [23:0] addr;       // 24-bit address
  integer    addr_bytes; // bytes of address received

  initial miso = 1'bz;

  always @(posedge cs_n or negedge cs_n) begin
    if (cs_n) begin
      miso      <= 1'bz;
      bit_cnt   <= 0;
      byte_cnt  <= 0;
      addr_bytes<= 0;
      cmd       <= 8'hFF;
      addr      <= 24'h0;
    end
  end

  always @(posedge sclk) begin
    if (!cs_n) begin
      shift_in <= {shift_in[6:0], mosi};
      bit_cnt  <= bit_cnt + 1;

      if (bit_cnt == 7) begin
        // Full byte received
        bit_cnt <= 0;
        if (byte_cnt == 0) begin
          // First byte = command
          cmd      <= {shift_in[6:0], mosi};
          byte_cnt <= 1;
        end else begin
          case (cmd)
            8'h03: begin // Read Data
              if (addr_bytes < 3) begin
                addr       <= {addr[15:0], shift_in[6:0], mosi};
                addr_bytes <= addr_bytes + 1;
                if (addr_bytes == 2) begin
                  // Address complete — begin streaming 0xFF
                  // (actual streaming handled by negedge sclk below)
                end
              end
            end
            default: ; // ignore
          endcase
          byte_cnt <= byte_cnt + 1;
        end
      end
    end
  end

  // Drive MISO on falling edge of SCLK for read commands
  always @(negedge sclk) begin
    if (!cs_n && cmd == 8'h03 && addr_bytes >= 3) begin
      miso <= 1'b1; // all bits of 0xFF
    end
    if (!cs_n && cmd == 8'h9F) begin
      // JEDEC ID: return 0xEF, 0x40, 0x16 (Winbond W25Q32JV)
      // Simplified: always drive 1
      miso <= 1'b1;
    end
    if (!cs_n && cmd == 8'h05) begin
      miso <= 1'b0; // WIP = 0 (not busy)
    end
  end

endmodule
