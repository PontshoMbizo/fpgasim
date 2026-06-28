# Tang Nano 9K Board Emulation

nikaVSimulator can emulate the **Sipeed Tang Nano 9K** (Gowin GW1NR-9) so you write
Verilog exactly as you would for the real chip — a top module plus authentic Gowin
constraint files — and the simulator wires your design to the board's real pins and
peripherals, validates the constraints, runs it, and shows the result on the board view,
the waveforms, and the peripheral panes.

It is a **batch + scrub** model: press **Run**, a full simulation is produced, and you
scrub a time cursor across it. Button/peripheral inputs are pre-scripted stimulus, not
live clicks.

> Scope: this is *functional* simulation (Icarus Verilog). Pin mapping, IO-attribute
> checks, peripheral behaviour and a clock summary are emulated. Real static timing
> analysis (setup/hold) is **not** — see [Limitations](#limitations).

---

## Basic vs. Advanced mode

The UI starts **basic**: the editor shows only the **Design** tab + **Run**, and the
bottom view shows **Hardware** + **Waveforms**. Out of the box this already runs the full
board emulation, because the default constraints (`.cst`/`.sdc`) ship pre-filled.

Click **Advanced** (the slider button next to Run) to reveal everything else. The toggle
controls both panes at once:

- **Editor**: the **Testbench**, **Constraints (.cst)** and **Timing (.sdc)** tabs, plus
  the **simulation-duration** dropdown.
- **Bottom view**: the **HDMI** and **UART Console** tabs.

Hidden tabs keep their content and still apply on Run — Advanced only controls
visibility. (So a `.cst` you wrote stays in effect even after you hide the tab.)

## The editor tabs

| Tab | File | Mode | Purpose |
|-----|------|------|---------|
| **Design** | `design.v` | basic | Your top module and submodules. |
| **Testbench** | `testbench.v` | advanced | Optional. When non-empty it is used verbatim (bypasses the board harness). |
| **Constraints** | `design.cst` | advanced | Gowin **physical** constraints — pin mapping + IO attributes. |
| **Timing** | `design.sdc` | advanced | Gowin **timing** constraints — `create_clock`. |

The **simulation duration** dropdown (advanced) bounds the run: 100 µs … 33 ms (one
640×480 frame). Longer runs capture more but take longer to simulate.

**Run precedence** (highest first):

1. a non-empty **Testbench** → compiled as-is;
2. a non-empty **Constraints (.cst)** → the **board harness** is generated (clock,
   buttons, peripheral models) from your ports + constraints;
3. an inline `$dumpvars` in the Design → compiled as-is;
4. otherwise → the generic auto-clock stimulus.

To use the board emulation, write your design **and** a `.cst`. The shipped defaults
already map a 6-LED / 2-button counter — press Run to see it.

---

## Constraints: `.cst` (physical)

Authentic Gowin syntax (`SUG935`). One line per port; bus bits are individual ports.

```tcl
// pin mapping
IO_LOC "clk"     63;
IO_LOC "btn1"     3;
IO_LOC "leds[0]" 10;

// IO attributes (optional)
IO_PORT "clk"     IO_TYPE=LVCMOS33 PULL_MODE=NONE;
IO_PORT "btn1"    IO_TYPE=LVCMOS33 PULL_MODE=UP;
IO_PORT "leds[0]" IO_TYPE=LVCMOS33 PULL_MODE=UP DRIVE=8;
```

Supported: `IO_LOC "port" pin [exclusive];` and
`IO_PORT "port" IO_TYPE=… PULL_MODE=… DRIVE=… SLEW_RATE=…;`. `//` and `/* */` comments
are ignored.

## Constraints: `.sdc` (timing)

```tcl
create_clock -name clk -period 37.037 -waveform {0 18.518} [get_ports {clk}]
```

`-period` is in ns (27 MHz ≈ 37.037 ns). The harness drives the matched clock port at
this period; without an `.sdc` it defaults to the 27 MHz board oscillator.

---

## The board pinout

Pin numbers are the GW1NR-9 QN88 package (Sipeed schematic, 2022-10-23). The canonical
map lives in [`src/boards/tangnano9k.js`](../src/boards/tangnano9k.js).

| Peripheral | Net(s) | Pin(s) | Notes |
|-----------|--------|--------|-------|
| Clock | `clk` | 63 | 27 MHz crystal (IOR5A) |
| LEDs ×6 | `leds[0..5]` | 10, 11, 13, 14, 15, 16 | **active-LOW** (on when driven 0) |
| Buttons | `btn1`, `btn2` | 3, 4 | S1, S2 — **active-LOW** (pulled up) |
| UART | `uart_tx`, `uart_rx` | 17, 18 | via the BL702 USB-serial bridge |
| SPI Flash | `flash_cs/clk/mosi/miso` | 60, 59, 61, 62 | W25Q32 (32 Mbit) |
| SD (SPI) | `sd_cs/clk/mosi/miso` | 38, 36, 37, 39 | TF card slot |
| HDMI | `hdmi_clk_p/n`, `hdmi_d{0,1,2}_p/n` | 69/68, 71/70, 73/72, 75/74 | TMDS pairs |

You do not have to use these names, but the harness recognises peripherals **by port
name** (see below), so matching them is the easy path.

---

## Peripherals

When you Run with a `.cst`, the harness attaches behavioural models to your design based
on the **port names** it finds (and the peripherals enabled by the UI). Models live in
[`sim/models/`](../sim/models).

| Peripheral | Triggered by a port matching | Model behaviour |
|-----------|------------------------------|-----------------|
| **Clock** | `clk` / `clock` | Driven at the `.sdc` period (or 27 MHz). |
| **Buttons** | `btn*` | Held released (1); pulsed low twice during the run. |
| **LEDs** | mapped `leds[*]` | Read out and shown on the board view (active-low). |
| **UART** | output containing `tx` | `uart_monitor` decodes 8N1 at the baud rate and prints each byte to the **UART console**. |
| **SPI Flash** | `flash*` / `*cs/clk/mosi/miso` | `spi_flash` answers SPI reads / JEDEC-ID. |
| **SD card** | `sd*` / `tf*` | `sd_spi` answers the SPI-mode init/read sequence. |
| **HDMI** | `hsync`/`vsync`(+`rgb`) | `hdmi_sink` captures one frame → **HDMI preview** pane. |

A model that drives one of your inputs (e.g. flash `miso`) is wired as a net
automatically — you declare it as a normal `input` and read it.

### UART example

```verilog
module top(input clk, output reg uart_tx);
  // ... 8N1 transmitter at 115200 baud @ 27 MHz ...
endmodule
```
```tcl
IO_LOC "clk" 63;  IO_LOC "uart_tx" 17;
```
Run → the bytes appear in the **UART console**. (See
[`test/fixtures/uart_tx.v`](../test/fixtures/uart_tx.v) for a complete transmitter.)

### HDMI note

The HDMI sink captures from parallel video (`hsync`/`vsync`/`rgb`). Full TMDS
deserialisation is **not** implemented; expose your pre-TMDS video to get a preview
frame. One frame is captured and written as a PPM, surfaced in the HDMI pane.

---

## Validation diagnostics

When a `.cst`/`.sdc` is present the constraints are checked against the board before the
sim runs. **Errors block the run**; **warnings** are shown but the sim proceeds.

| Diagnostic | Severity | Meaning |
|-----------|----------|---------|
| `UNKNOWN_PIN` | error | `IO_LOC` points at a pin not on this board. |
| `ILLEGAL_IO_TYPE` | error | `IO_TYPE` not valid for the pin's (3.3 V) bank. |
| `INVALID_PULL_MODE` | error | `PULL_MODE` not one of NONE/UP/DOWN/KEEPER. |
| `UNMAPPED_PORT` | warning | A design port has no `IO_LOC`. |
| `PULL_ON_OUTPUT` | warning | `PULL_MODE` on an output port (no effect). |
| `CLOCK_NOT_CAPABLE` | warning | `create_clock` on a non-clock-capable pin. |
| `PERIOD_MISMATCH` | warning | Clock on the 27 MHz osc pin with a >5% different period. |

Diagnostics list the offending port/pin and are rendered in the editor.

---

## How it fits together

```
Editor (Design + .cst + .sdc)
   │  POST /api/simulate { code, cst, sdc, peripherals }
   ▼
parseCst / parseSdc ──► checkConstraints ──► (errors? stop & report)
   │                                              src/lib/{constraints,sdc,constraintCheck}.js
   ▼
generateBoardHarness(code, cst, sdc, peripherals)  + sim/models/*.v
   │   src/lib/testbench.js                         (uart_monitor, spi_flash, sd_spi, hdmi_sink)
   ▼
runSimulation  ──►  iverilog + vvp in the locked-down sandbox  ──►  VCD (+ stderr log)
   │   src/lib/sandbox.js, sim/entrypoint.sh
   ▼
VCD ─► waveforms + board pin states     log ─► UART console / HDMI frame
```

Everything downstream of the VCD is the shared model (`src/lib/vcd.js`,
`src/lib/simState.js`); see [simulation-backend.md](simulation-backend.md) for the
sandbox internals and `/api/simulate` contract.

---

## Limitations

- **Functional only** — no real STA. The `.sdc` sets the clock period and a sanity
  summary; it does not verify setup/hold against a timed netlist.
- **Pre-scripted stimulus** — buttons pulse on a fixed schedule; there are no live
  clicks (batch + scrub model).
- **HDMI** captures parallel video, not deserialised TMDS; one frame, size-capped.
- **Sim duration vs. real time** — a 27 MHz design needs many ns to do anything visible.
  The default board run is 2 ms (~54k cycles); override per run if needed.
- A few peripheral pin numbers carry `// verify` notes in the board file pending a final
  schematic cross-check.

---

## Testing

| Suite | Command | Needs |
|-------|---------|-------|
| Unit (parsers, board data, rules, harness) | `npm run test:unit` | node only |
| Everything incl. sandbox + board e2e | `npm test` | docker + the `nika-sim` image |

Relevant test files: `test/constraints.test.mjs`, `test/board.test.mjs`,
`test/boardRules.test.mjs`, `test/boardHarness.test.mjs`,
`test/board.integration.test.mjs`. Build the sandbox image once with:

```
docker build -t nika-sim -f Dockerfile.sim sim/
```
