// Server-only. Runs ONE untrusted Verilog simulation inside an ephemeral, locked-down
// container and returns its VCD. Every limit is enforced twice: by the container
// runtime's resource caps and by a host-side SIGKILL + explicit `docker kill` of the
// named container — defense in depth, since the input HDL is fully untrusted.
//
// Contract with sim/entrypoint.sh: source in via stdin, VCD out via stdout, logs via
// stderr, exit code names the failing stage (2 compile, 3 runtime, 4 no-vcd).

import { randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";

const ENV = process.env;
const RUNTIME = ENV.SIM_RUNTIME || "docker";
const IMAGE = ENV.SIM_IMAGE || "nika-sim:latest";
const TIMEOUT_S = Number(ENV.SIM_TIMEOUT_S || 12); // wall-clock per simulation
const MAX_VCD_BYTES = Number(ENV.SIM_MAX_VCD_BYTES || 16 * 1024 * 1024);
const MEMORY = ENV.SIM_MEMORY || "256m";
const CPUS = ENV.SIM_CPUS || "1";
// Remote rootless-Podman socket (VM-local hardening change, 2026-07-01): when set, every
// invocation is prefixed with `--remote --url ...` so the CLI never tries to manage local
// storage/namespaces itself (which fails anyway inside an unprivileged container) and
// instead purely speaks the API to the host's rootless socket. Mirrors stmVSimulator's
// sandbox.js PODMAN_URL handling. No-op when unset (plain local docker, as before).
const PODMAN_URL = ENV.SIM_PODMAN_URL || "";

function remotePrefix() {
  return RUNTIME === "podman" && PODMAN_URL ? ["--remote", "--url", PODMAN_URL] : [];
}

// The full hardening flag set. Rationale per flag lives in docs/simulation-backend.md.
function runArgs(name) {
  return [
    ...remotePrefix(),
    "run", "--rm", "-i",
    "--name", name,
    "--network", "none",
    "--read-only",
    // uid=/gid= tmpfs mount opts dropped (VM-local, 2026-07-01): unsupported by the
    // host's podman 3.4.2 ("unknown mount option"). Default tmpfs perms (1777,
    // root:root, world-writable sticky) still let --user 1000:1000 write to /work.
    "--tmpfs", "/work:rw,size=64m,noexec,nosuid,nodev",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--pids-limit", "64",
    "--memory", MEMORY,
    "--memory-swap", MEMORY,
    "--cpus", CPUS,
    "--user", "1000:1000",
    "--workdir", "/work",
    "--env", "TMPDIR=/work",
    IMAGE,
  ];
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
    const name = `nika-sim-${randomUUID()}`;
    const child = spawn(RUNTIME, runArgs(name), { stdio: ["pipe", "pipe", "pipe"] });

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

    // Killing the CLI client only drops the connection — it doesn't guarantee the
    // container stops (Docker has no run-side self-timeout flag like Podman did), so
    // also kill it by name directly. Best-effort: --rm may have already removed it.
    const forceKillContainer = () => {
      execFile(RUNTIME, [...remotePrefix(), "kill", name], () => {});
    };

    // Host-side hard stop — the primary timeout. Fires before the container backstop
    // so a runaway run is reported as `timeout`.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      forceKillContainer();
    }, TIMEOUT_S * 1000);

    child.stdout.on("data", (d) => {
      outLen += d.length;
      if (outLen > MAX_VCD_BYTES) {
        overflow = true;
        child.kill("SIGKILL");
        forceKillContainer();
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
