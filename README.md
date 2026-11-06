# fpgasim

**Write Verilog for the Sipeed Tang Nano 9K (Gowin GW1NR-9) in your browser and watch it run on a virtual board.**
No toolchain install, no hardware needed.

Live demo: **https://nika.pontsho-mbizo.co.za**

<!-- TODO: add a screenshot or short GIF of the editor + board view + waveforms here -->

## What it does

- **Real constraint files.** Write a top module plus authentic Gowin `.cst` (pin mapping and IO attributes) and `.sdc` (clock) files. The simulator validates them against the board's real pins and rules.
- **Board emulation.** Your design is wired to the Tang Nano 9K's pins and peripherals (LEDs, buttons, UART, HDMI) and the result shows on a board view, waveforms and peripheral panes.
- **Stimulus blocks.** Drive inputs from visual signal sources (presets, sample tables, or Verilog) instead of hand-writing a testbench.
- **Basic and Advanced modes.** Basic is just the editor and a Run button. Advanced exposes the testbench, constraints, timing, HDMI and UART console tabs.

## How it works

```
Browser (Monaco editor)
   │  POST /api/simulate { code, constraints, stimuli }
   ▼
Next.js API route ── rate limit, concurrency cap, size cap, constraint validation
   ▼
Ephemeral container per run ── Icarus Verilog (iverilog → vvp) → VCD
   │  no network, read-only filesystem, non-root, resource-capped, auto-killed
   ▼
VCD parser → shared signal model → waveforms + board pin states
```

Untrusted Verilog from anyone on the internet runs in a locked-down container, one per simulation: no network, read-only filesystem, all capabilities dropped, non-root user, memory and PID limits, and a hard timeout. See [docs/simulation-backend.md](docs/simulation-backend.md) for the threat model and flags.

## Design decisions

| Decision | Why |
|---|---|
| Batch-and-scrub model (run once, scrub a time cursor) | Keeps the backend stateless and the sandbox simple. No long-lived sessions to secure |
| Icarus Verilog in an Alpine container | Small attack surface, fast start, and enough for functional simulation |
| Authentic Gowin constraint syntax | What you learn here transfers directly to the real Gowin toolchain |
| VCD as the only interface between backend and UI | The parser and data model are shared, so the backend can change without touching the UI |

## Limitations

- Functional simulation only. There is no static timing analysis; the `.sdc` sets the clock and a sanity summary, not setup/hold checks.
- Button and peripheral inputs are pre-scripted, not live clicks.
- HDMI captures parallel video (one frame, size-capped), not deserialised TMDS.
- A few peripheral pin numbers are marked `// verify` in the board file pending a schematic cross-check.

## Run it locally

Requires Node 20+ and Docker or Podman.

```bash
npm install
docker build -t nika-sim -f Dockerfile.sim sim/   # sandbox image, once
npm run dev                                       # http://localhost:3000
```

## Tests

```bash
npm run test:unit   # parsers, board data, rules, harness (Node only)
npm test            # everything, including sandbox and board end-to-end (needs the nika-sim image)
```

CI runs the test suite on Node 20 and 22.

## Docs

- [Board emulation](docs/board-emulation.md)
- [Simulation backend](docs/simulation-backend.md)
- [API](docs/API.md)

## Related

[stmVSimulator](https://github.com/PontshoMbizo/stmVSimulator): the same idea for the STM32 "Blue Pill", using QEMU and bare-metal C.

## Licence

TODO: add a licence file (MIT suggested).
