# FPGA Problem — Button-Debounced Up/Down Counter

**Simulator:** `/tools/fpga` (fpgasim · Tang Nano 9K)
**Difficulty:** Easy–Medium · **Topics:** Sequential logic, metastability, debounce
**Source theme:** GPIO debouncing + up/down counting (classic digital-design interview)

## Problem

The Tang Nano 9K has two on-board push-buttons (`btn1`, `btn2`, both **active-low**)
and six user LEDs (`leds[5:0]`). Build a counter that a human can drive by pressing the
buttons:

- A **press of `btn1`** increments a 6-bit value by exactly **one**.
- A **press of `btn2`** decrements it by exactly **one**.
- The value is shown in binary on `leds[5:0]` and wraps modulo 64.

The catch: mechanical buttons **bounce** — a single press produces many fast electrical
transitions over a few milliseconds. A naïve `always @(negedge btn1)` would count 5–20
times per press. Your design must register **exactly one** step per physical press, and
must safely bring the asynchronous button signals into the clock domain.

## Requirements

1. Synchronise each button through a 2-flip-flop synchroniser (buttons are asynchronous
   to `clk`).
2. Debounce: only accept a new button level after it has been stable for
   `DEBOUNCE_CYCLES` clock samples (≈10 ms at the 27 MHz board clock).
3. Detect the **press** edge (falling, since active-low) and step the counter once.
4. Keep the module name `top` and the port list unchanged — the `.cst` pin map (`clk` →
   27 MHz osc, `btn1`/`btn2`, `leds[5:0]`) depends on them.

## Files

| File | Role |
|---|---|
| `starter.v` | Skeleton with the correct ports — paste into the **Design** tab and implement. |
| `solution.v` | Reference solution (synchroniser + debouncer + up/down counter). |
| `testbench.v` | Self-checking testbench — paste into the **Testbench** tab. |

## How to run it in the simulator

1. Open **`/tools/fpga`**.
2. Paste `solution.v` (or your own attempt from `starter.v`) into the **Design** tab.
3. Paste `testbench.v` into the **Testbench** tab and click **Run**.
4. Watch the **Waveforms** tab: `leds` should step `0 → 1 → 2 → 1` as the testbench
   issues a bouncy up-press, a clean up-press, and a down-press. The console prints
   `RESULT: PASS`.

## Verify locally (same toolchain the sandbox uses)

```bash
cd examples/up-down-counter
iverilog -g2012 -o a.out solution.v testbench.v && vvp a.out
# expect: four "ok:" lines and "RESULT: PASS"
```

## Acceptance

The testbench drives a deliberately bouncy press and asserts the count advances by
**one** each press. It passes only if the bounce was correctly filtered.
