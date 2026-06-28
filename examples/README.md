# nikaVSimulator — Example Problems

Self-contained worked problems for the FPGA/Verilog simulator. Each folder has a
`PROBLEM.md` (statement + how to run), a `starter.v` skeleton, a reference `solution.v`,
and a self-checking `testbench.v`. Paste the design + testbench into the editor at
`/tools/fpga` (in scope.io) or run them locally with `iverilog`.

| Problem | Folder | Concepts |
|---|---|---|
| Button-Debounced Up/Down Counter | [`up-down-counter/`](up-down-counter/) | synchroniser, debounce, edge detect, up/down counter |

Run any example locally with the same toolchain the sandbox uses:

```bash
cd up-down-counter
iverilog -g2012 -o a.out solution.v testbench.v && vvp a.out   # -> RESULT: PASS
```
