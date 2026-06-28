# Simulation Backend

How nikaVSimulator turns Verilog in the editor into real waveforms and live board
pins, and how it does so safely with untrusted code from anyone on the internet.

## Architecture

```
  EditorPane ("Run")                                         Browser
      │  POST /api/simulate { code, testbench? }
      ▼
  src/app/api/simulate/route.js          ── rate limit + concurrency cap + size cap
      │  source = code + (testbench || generateTestbench(code))   (see precedence below)
      ▼
  src/lib/sandbox.js  runSimulation(source)        ── Node server
      │  spawn docker run … (locked-down flags)
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

Request: `{ "code": "<verilog source>", "testbench"?: "<verilog testbench>" }`

`testbench` is optional. When present and non-empty it is appended to `code` and used
verbatim (auto stimulus is skipped). The combined size is bounded by the same cap.

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
| `--tmpfs /work:size=64m,noexec,nosuid,nodev,uid=1000,gid=1000` | only writable area; bounded, can't exec or escalate |
| `--cap-drop ALL` | no Linux capabilities |
| `--security-opt no-new-privileges` | can't gain privileges via setuid |
| `--user 1000:1000` | non-root inside the container |
| `--pids-limit 64` | fork-bomb protection |
| `--memory / --memory-swap 256m` | memory bound (swap = memory ⇒ no swap) |
| `--cpus 1` | CPU bound |
| `--name <unique>` + host `SIGKILL` + explicit `docker kill` | runaway-sim protection, enforced twice |
| `--env TMPDIR=/work` | iverilog writes compiler scratch files via `TMPDIR`/`TMP`; with no compensating tmpfs on `/tmp` (see below), it must be told to use the one writable, already-bounded mount |

Output is also capped (`SIM_MAX_VCD_BYTES`, default 16 MB) and the child is killed if a
dump grows past it. As an extra layer, Icarus disables `$system` by default, so even the
classic `$system("…")` RCE path is inert before the sandbox flags matter.

The tmpfs's `uid=1000,gid=1000` is required, not cosmetic: Docker (unlike Podman) mounts
anonymous `--tmpfs` volumes as `root:root 0755` by default, which the non-root `--user
1000:1000` sim process can't write into without it.

`--env TMPDIR=/work` is required for the same reason from a different angle: Podman's
`--read-only` auto-mounts a writable tmpfs over `/tmp` (and `/run`, `/var/tmp`) for app
compatibility unless you opt out. Docker's `--read-only` has no such convenience — `/tmp`
is genuinely immutable, so `iverilog`'s own scratch files (independent of `/work`) need
`TMPDIR` redirected explicitly or compilation fails with `Error opening temporary file`.

Docker has no `run`-side self-timeout flag (unlike Podman's old `--timeout`), so the
second enforcement layer is application-level: each run gets a unique `--name`, and on
timeout/overflow `sandbox.js` both `SIGKILL`s the CLI client *and* issues `docker kill
<name>` directly — killing the client alone only drops the connection, it doesn't
guarantee the container on the daemon side actually stops.

### Tunables (env)

`SIM_RUNTIME` (default `docker`) · `SIM_IMAGE` · `SIM_TIMEOUT_S` · `SIM_MEMORY` ·
`SIM_CPUS` · `SIM_MAX_VCD_BYTES` · `SIM_MAX_CONCURRENT` · `SIM_RATE_PER_MIN`.

## Stimulus model (auto testbench)

The editor's **Testbench** tab lets you write a separate testbench; when it's non-empty
it's sent as the `testbench` field and used as-is. The backend resolves stimulus in this
order:

1. explicit `testbench` field (the Testbench tab) → appended and used verbatim;
2. else an inline `$dumpvars` in the design → compiled verbatim;
3. else `src/lib/testbench.js` synthesizes a default clock testbench.

For case 3, when the source has no `$dumpvars`, generation:

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

## Editor templates (operator-settable)

The starter Design and Testbench shown in the editor come from a small server-side
registry, `src/lib/templates.js`, layered over the built-in defaults in
`src/lib/templateDefaults.js`. The page is a server component that calls `getTemplates()`
and seeds the client editor, so changes take effect on the next page load — no rebuild.

```js
// server code only (touches the filesystem)
import { setTemplate, setTemplates, getTemplates, resetTemplates } from "@/lib/templates";
// or the convenience entry:  import { setTemplate } from "nikaVSimulator/server"

setTemplate("testbench", "`timescale 1ns/1ps\nmodule tb; ... endmodule\n");
setTemplates({ design, testbench });   // set several at once
setTemplate("testbench", null);        // clear one override (back to default)
resetTemplates();                       // clear all overrides
getTemplates();                         // -> { design, testbench }
```

Overrides persist as JSON at `NIKA_TEMPLATES_FILE` (default `./data/templates.json`).
Names are limited to `design` and `testbench`; bodies are capped at 200 KB (the same
ceiling `/api/simulate` enforces). Client code must import the constants from
`src/lib/templateDefaults.js`, never the registry — the registry uses `node:fs`.

## Self-hosting

1. Build the sim image on the host (once):
   ```
   docker build -t nika-sim -f Dockerfile.sim sim/
   ```
2. Make sure the Docker daemon is running:
   ```
   systemctl enable --now docker     # most Linux distros; Docker Desktop handles this on macOS/Windows
   ```
3. Start the app:
   ```
   docker compose up --build
   ```

The app container ships the Docker *client* and launches sandbox containers on the host
through the mounted Docker socket (`/var/run/docker.sock`). Because each sandbox is
`--network none`, there is no long-running sim service to isolate — the only published
surface is the app on `:3000`.

## Threat model & residual risks

**Stopped:** network access, host filesystem access, privilege escalation, persistence,
fork bombs, memory/CPU exhaustion, runaway/infinite simulations, oversized dumps, and
(separately) `$system`.

**Residual / future work:**

- **Docker socket = root-equivalent host access.** This is a standard Docker caveat, not
  specific to this app: the daemon runs as root by default, so anything that can reach
  the socket can do anything root can — there's no rootless containment the way there
  was under the previous Podman setup. Sandboxes themselves stay fully constrained, but
  an attacker who reached the app process now has the blast radius of host root, not a
  confined rootless instance. Stronger options, roughly in order of effort: **rootless
  Docker** (restores a "socket ≠ host root" boundary), a **socket proxy**
  (e.g. `docker-socket-proxy`) in front of the socket that allow-lists only the
  `create`/`start`/`kill`/`wait` calls `sandbox.js` actually needs, or a dedicated
  low-privilege runner host entirely separate from the app.
- **Shared kernel.** Containers are not VMs; a kernel exploit could escape. For higher
  assurance run the sim image under gVisor (`runsc`) or a microVM (Firecracker/Kata).
- **Abuse controls are in-process** (per-instance rate limit + concurrency cap). Behind
  multiple replicas, move these to a shared store and consider auth + a job queue.
