# AGENTS.md — fpgasim

## What this is

An in-browser simulator for the **Tang Nano 9K FPGA**: the user writes Verilog in a Monaco
editor, it runs through `iverilog`/`vvp` in a locked-down sandbox, and the resulting VCD
drives a waveform pane plus a live interactive board view.

This project is the **template mcusim was built from** — the two share their shape
deliberately (Next.js app, `src/app/api/simulate/route.js` contract, board data files,
sandbox posture). See `../mcusim/CLAUDE.md` for that shared shape; keep the two
aligned when changing anything structural.

## Definition of done

- `npm run test:unit` and `npm run lint` pass.
- Simulate-path changes: run one example end-to-end
  (compile → vvp → VCD → waveform + board view) and sanity-check the output.
- Sandbox posture unchanged — ephemeral, no network, read-only FS, non-root,
  resource-capped, auto-killed.
- Structural changes are checked against mcusim: either mirrored there or the
  divergence is deliberate and noted.

## Pointers

- Project notes and decisions: `~/Workspace/second brain/10 - Projects/` (nikaV dashboard).
- Embedded into scope.io's `/tools` area via iframe (`NEXT_PUBLIC_NIKA_URL`).
