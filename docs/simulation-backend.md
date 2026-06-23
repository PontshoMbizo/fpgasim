# Simulation Backend

How nikaVSimulator turns Verilog in the editor into real waveforms and live board
pins, and how it does so safely with untrusted code from anyone on the internet.

## Architecture

```
  EditorPane ("Run")                                         Browser
      │  POST /api/simulate { code }
      ▼
  src/app/api/simulate/route.js          ── rate limit + concurrency cap + size cap
      │  source = code + generateTestbench(code)   (unless code has its own $dumpvars)
      ▼
  src/lib/sandbox.js  runSimulation(source)        ── Node server
      │  spawn podman run … (locked-down flags)
      ▼
  ┌──────────────────────────────────────────────┐
  │ ephemeral container  (localhost/nika-sim)     │  one per run, no network,
  │   sim/entrypoint.sh:                          │  read-only FS, non-root,
  │     stdin → iverilog → vvp → out.vcd → stdout │  resource-capped, auto-killed
  └──────────────────────────────────────────────┘
      │  VCD text (stdout)            logs (stderr)
      ▼
  parseVCD(vcd)  →  setModel(model)                ── src/lib/vcd.js, src/lib/simState.js
      │
      ├─► SignalGeneratorPane  (waveforms)
      └─► TangNanoViewer       (board pins via computePinStates)
```

The data model and parser are shared with the rest of the app — the backend only has
to produce a standard VCD; everything downstream is unchanged from Phases 1–3.

## `/api/simulate` contract

`POST /api/simulate`

Request: `{ "code": "<verilog source>" }`

Response (always HTTP 200 on a completed run; 4xx for bad input / limits):

| field   | type    | meaning                                                        |
|---------|---------|---------------------------------------------------------------|
| `ok`    | boolean | whether a VCD was produced                                    |
| `vcd`   | string  | VCD text (when `ok`)                                           |
| `log`   | string  | compile/runtime output (`$display`, errors)                   |
| `stage` | string  | on failure: `compile` \| `runtime` \| `timeout` \| `output` \| `busy` \| `rate` \| `input` |

The client feeds `vcd` straight into `setModel`, and shows the first line of `log` in
the editor footer (green on success, red on failure).

## Sandbox contract

`sim/entrypoint.sh` is deliberately tiny — **stdin → VCD on stdout, logs on stderr**:

1. `cat > /work/top.v` — read the combined source.
2. `iverilog -g2012 -o /work/a.out /work/top.v` — compile; failure → exit **2**.
3. `vvp /work/a.out 1>&2` — run; `$display`/errors go to stderr; failure → exit **3**.
4. `cat /work/out.vcd` — emit the dump; missing dump → exit **4**.

`a.out` is vvp *bytecode* (interpreted, never natively executed), so `/work` can stay
`noexec`.

## Hardening (src/lib/sandbox.js)

Every simulation runs in a throwaway container with the full flag set below. Rationale:

| flag | why |
|------|-----|
| `--rm -i` | one-shot; source piped in, container discarded |
| `--network none` | no exfiltration / no callbacks / no SSRF |
| `--read-only` | root FS immutable |
| `--tmpfs /work:size=64m,noexec,nosuid,nodev` | only writable area; bounded, can't exec or escalate |
| `--cap-drop ALL` | no Linux capabilities |
| `--security-opt no-new-privileges` | can't gain privileges via setuid |
| `--user 1000:1000` | non-root inside the container |
| `--pids-limit 64` | fork-bomb protection |
| `--memory / --memory-swap 256m` | memory bound (swap = memory ⇒ no swap) |
| `--cpus 1` | CPU bound |
| `--timeout 12` (podman) + host `SIGKILL` | runaway-sim protection, enforced twice |

Output is also capped (`SIM_MAX_VCD_BYTES`, default 16 MB) and the child is killed if a
dump grows past it. As an extra layer, Icarus disables `$system` by default, so even the
classic `$system("…")` RCE path is inert before the sandbox flags matter.

### Tunables (env)

`SIM_RUNTIME` (podman|docker) · `SIM_IMAGE` · `SIM_PODMAN_URL` (remote socket) ·
`SIM_TIMEOUT_S` · `SIM_MEMORY` · `SIM_CPUS` · `SIM_MAX_VCD_BYTES` ·
`SIM_MAX_CONCURRENT` · `SIM_RATE_PER_MIN`.

## Stimulus model (auto testbench)

The editor holds only the design under test, so `src/lib/testbench.js` synthesizes a
testbench when the source has no `$dumpvars`:

- picks the top module (named `top`, else the un-instantiated one, else the first);
- parses its ANSI port header;
- drives a clock on any `clk`/`clock` input (`always #5`), holds other inputs at their
  default (`1` — the demo's buttons are active-low), and dumps `$dumpvars(0, tb)` for a
  bounded duration.

To take full control — testbenches, `initial`, `#delay`, multiple clocks, custom
stimulus — **include your own `$dumpvars`** in the source; generation is then skipped and
your code is compiled verbatim.

> Note: an uninitialized `reg` simulates as `X` (e.g. the demo `counter`), which is
> faithful real-hardware behavior, not a bug — initialize it or drive the buttons to see
> defined values.

## Self-hosting

1. Build the sim image on the host (once):
   ```
   podman build -t nika-sim -f Dockerfile.sim sim/
   ```
2. Enable the rootless Podman socket:
   ```
   systemctl --user enable --now podman.socket
   ```
3. Start the app:
   ```
   podman compose up --build      # or: docker compose up --build
   ```

The app container ships the Podman *client* and launches sandbox containers on the host
through the mounted rootless socket (`SIM_PODMAN_URL`). Because each sandbox is
`--network none`, there is no long-running sim service to isolate — the only published
surface is the app on `:3000`.

## Threat model & residual risks

**Stopped:** network access, host filesystem access, privilege escalation, persistence,
fork bombs, memory/CPU exhaustion, runaway/infinite simulations, oversized dumps, and
(separately) `$system`.

**Residual / future work:**

- **Podman socket = control of that rootless instance.** It is *not* host root (rootless),
  and sandboxes are fully constrained, but an attacker who reached the app process could
  launch other rootless containers. Stronger options: a dedicated low-privilege runner
  user, socket-activation with a restricted policy, or nested/rootless DinD.
- **Shared kernel.** Containers are not VMs; a kernel exploit could escape. For higher
  assurance run the sim image under gVisor (`runsc`) or a microVM (Firecracker/Kata).
- **Abuse controls are in-process** (per-instance rate limit + concurrency cap). Behind
  multiple replicas, move these to a shared store and consider auth + a job queue.
