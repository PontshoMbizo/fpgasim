// Server-only. Runs ONE untrusted Verilog simulation inside an ephemeral, locked-down
// container and returns its VCD. Every limit is enforced twice: by the container
// runtime (resource caps + its own timeout) and by a host-side SIGKILL — defense in
// depth, since the input HDL is fully untrusted.
//
// Contract with sim/entrypoint.sh: source in via stdin, VCD out via stdout, logs via
// stderr, exit code names the failing stage (2 compile, 3 runtime, 4 no-vcd).

import { spawn } from "node:child_process";

const ENV = process.env;
const RUNTIME = ENV.SIM_RUNTIME || "podman";
const IMAGE = ENV.SIM_IMAGE || "localhost/nika-sim:latest";
const PODMAN_URL = ENV.SIM_PODMAN_URL || ""; // remote rootless socket, when app is containerized
const TIMEOUT_S = Number(ENV.SIM_TIMEOUT_S || 12); // wall-clock per simulation
const MAX_VCD_BYTES = Number(ENV.SIM_MAX_VCD_BYTES || 16 * 1024 * 1024);
const MEMORY = ENV.SIM_MEMORY || "256m";
const CPUS = ENV.SIM_CPUS || "1";

// The full hardening flag set. Rationale per flag lives in docs/simulation-backend.md.
function runArgs() {
  const args = [];
  if (RUNTIME === "podman" && PODMAN_URL) args.push("--remote", "--url", PODMAN_URL);
  args.push(
    "run", "--rm", "-i",
    "--network", "none",
    "--read-only",
    "--tmpfs", "/work:rw,size=64m,noexec,nosuid,nodev",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--pids-limit", "64",
    "--memory", MEMORY,
    "--memory-swap", MEMORY,
    "--cpus", CPUS,
    "--user", "1000:1000",
    "--workdir", "/work"
  );
  // Podman self-enforces a max runtime as a BACKSTOP (cleans up the container if the
  // host process can't). It's deliberately longer than the host timeout below, which
  // is the primary stop so runs get classified as `timeout` rather than a generic exit.
  if (RUNTIME === "podman") args.push("--timeout", String(TIMEOUT_S + 5));
  args.push(IMAGE);
  return args;
}

function stageFromExit(code) {
  if (code === 2) return "compile";
  if (code === 3 || code === 4) return "runtime";
  return "error";
}

/**
 * @param {string} source combined Verilog (design + testbench)
 * @returns {Promise<{ok:boolean, vcd?:string, log:string, stage?:string}>}
 */
export function runSimulation(source) {
  return new Promise((resolve) => {
    const child = spawn(RUNTIME, runArgs(), { stdio: ["pipe", "pipe", "pipe"] });

    const out = [];
    let outLen = 0;
    const errChunks = [];
    let settled = false;
    let timedOut = false;
    let overflow = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    // Host-side hard stop — the primary timeout. Fires before the runtime's backstop
    // so a runaway run is reported as `timeout`.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_S * 1000);

    child.stdout.on("data", (d) => {
      outLen += d.length;
      if (outLen > MAX_VCD_BYTES) {
        overflow = true;
        child.kill("SIGKILL");
        return;
      }
      out.push(d);
    });
    child.stderr.on("data", (d) => errChunks.push(d));

    child.on("error", (e) => {
      // e.g. runtime binary missing — surface clearly rather than hanging.
      finish({ ok: false, stage: "error", log: `sandbox launch failed: ${e.message}` });
    });

    child.on("close", (code) => {
      const log = Buffer.concat(errChunks).toString("utf8");
      if (overflow) {
        return finish({ ok: false, stage: "output", log: `VCD exceeded ${MAX_VCD_BYTES} bytes; aborted.` });
      }
      if (timedOut) {
        return finish({ ok: false, stage: "timeout", log: `Simulation exceeded ${TIMEOUT_S}s and was terminated.\n${log}` });
      }
      if (code === 0) {
        return finish({ ok: true, vcd: Buffer.concat(out).toString("utf8"), log });
      }
      finish({ ok: false, stage: stageFromExit(code), log: log || `exited with code ${code}` });
    });

    child.stdin.on("error", () => {}); // ignore EPIPE if the child dies early
    child.stdin.end(source);
  });
}
