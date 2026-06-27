// HDMI behavioral sink — parallel RGB + H/V sync version.
// Captures one 640×480 video frame and dumps it as a PPM image to
// /work/frame.ppm at end of simulation.
//
// This model expects the DUT to drive a parallel RGB bus (not TMDS).
// The harness connects: hsync, vsync, pclk, and rgb[23:0] (R[7:0] G[7:0] B[7:0]).
//
// The parent sandbox script detects /work/frame.ppm after simulation and
// prepends it to stderr as: PPM_FRAME_B64:<base64-encoded-bytes>

`timescale 1ns/1ps

module hdmi_sink #(
  parameter integer H_ACTIVE = 640,
  parameter integer V_ACTIVE = 480
) (
  input wire        pclk,
  input wire        hsync,
  input wire        vsync,
  input wire [23:0] rgb      // {R[7:0], G[7:0], B[7:0]}
);

  // Frame buffer: store one full frame
  reg [7:0] red   [0:V_ACTIVE-1][0:H_ACTIVE-1];
  reg [7:0] green [0:V_ACTIVE-1][0:H_ACTIVE-1];
  reg [7:0] blue  [0:V_ACTIVE-1][0:H_ACTIVE-1];

  integer px, py;          // current pixel position
  integer frame_count;
  reg     vsync_prev;
  reg     hsync_prev;
  reg     frame_captured;

  initial begin
    px            = 0;
    py            = 0;
    frame_count   = 0;
    vsync_prev    = 1;
    hsync_prev    = 1;
    frame_captured= 0;
  end

  // Capture pixels on rising pclk during active region
  always @(posedge pclk) begin
    hsync_prev <= hsync;
    vsync_prev <= vsync;

    // Falling edge of vsync → new frame
    if (vsync_prev && !vsync) begin
      if (frame_count == 0 && py > 0) begin
        frame_captured <= 1;
      end
      py          <= 0;
      frame_count <= frame_count + 1;
    end

    // Falling edge of hsync → new line
    if (hsync_prev && !hsync) begin
      px <= 0;
      if (vsync) py <= py + 1;
    end

    // Active pixel (hsync and vsync both asserted / high = active)
    if (hsync && vsync && !frame_captured) begin
      if (px < H_ACTIVE && py < V_ACTIVE) begin
        red  [py][px] <= rgb[23:16];
        green[py][px] <= rgb[15:8];
        blue [py][px] <= rgb[7:0];
      end
      px <= px + 1;
    end
  end

  // At end of simulation, write the captured frame as a PPM file
  integer fd;
  integer r, c;

  initial begin
    @(frame_captured);
    // Wait one extra frame time for stable data
    #1000000;
    fd = $fopen("/work/frame.ppm", "wb");
    if (fd != 0) begin
      $fwrite(fd, "P6\n%0d %0d\n255\n", H_ACTIVE, V_ACTIVE);
      for (r = 0; r < V_ACTIVE; r = r + 1) begin
        for (c = 0; c < H_ACTIVE; c = c + 1) begin
          $fwrite(fd, "%c%c%c", red[r][c], green[r][c], blue[r][c]);
        end
      end
      $fclose(fd);
      $display("HDMI: frame captured (%0d x %0d)", H_ACTIVE, V_ACTIVE);
    end else begin
      $display("HDMI: could not open /work/frame.ppm");
    end
  end

endmodule
