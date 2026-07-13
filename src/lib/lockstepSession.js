// One lockstep co-simulation session: a hardened container (same posture as batch
// sandbox.js — network none, read-only FS, tmpfs /work, cap-drop ALL, caps on pids/mem/
// cpu, non-root) running sim/entrypoint-lockstep.sh, held open across quanta and driven
// over stdio per the container line protocol (see lockstepCodec.js / bridge-protocol.md).
//
// Source framing: first line `##SRC <bytes>`, then exactly that many bytes of Verilog
// (user design + generated harness); everything after belongs to the quantum stream.
//
// Server-side limits on top of the container's own caps:
//   - per-reply timeout  (REPLY_TIMEOUT_MS)   step sent, no O line back in time → kill
//   - idle timeout       (IDLE_TIMEOUT_MS)    no step() between quanta → kill
//   - wall cap           (WALL_CAP_MS)        absolute session lifetime → kill
//
// For tests and container-less dev, `opts.command` overrides the spawned argv (e.g. a
// fake sim script, or entrypoint-lockstep.sh run directly where iverilog exists).

import { randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { parseSimLine } from "./lockstepCodec.js";

const ENV = process.env;
const RUNTIME = ENV.SIM_RUNTIME || "docker";
const IMAGE = ENV.SIM_IMAGE || "nika-sim:latest";
const MEMORY = ENV.SIM_MEMORY || "256m";
const CPUS = ENV.SIM_CPUS || "1";
const PODMAN_URL = ENV.SIM_PODMAN_URL || "";

export const REPLY_TIMEOUT_MS = Number(ENV.SIM_REPLY_TIMEOUT_MS || 5000);
export const IDLE_TIMEOUT_MS = Number(ENV.SIM_IDLE_TIMEOUT_MS || 60_000);
export const WALL_CAP_MS = Number(ENV.SIM_WALL_CAP_MS || 600_000);
const MAX_EVENTS_PER_STEP = 256;

function remotePrefix() {
  return RUNTIME === "podman" && PODMAN_URL ? ["--remote", "--url", PODMAN_URL] : [];
}

function containerArgs(name) {
  return [
    ...remotePrefix(),
    "run", "--rm", "-i",
    "--name", name,
    "--network", "none",
    "--read-only",
    "--tmpfs", "/work:rw,size=64m,noexec,nosuid,nodev,mode=1777",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--pids-limit", "64",
    "--memory", MEMORY,
    "--memory-swap", MEMORY,
    "--cpus", CPUS,
    "--user", "1000:1000",
    "--workdir", "/work",
    "--env", "TMPDIR=/work",
    "--entrypoint", "/usr/local/bin/run-lockstep",
    IMAGE,
  ];
}

export class LockstepSession {
  /**
   * @param {string} source combined Verilog (user design + lockstep harness)
   * @param {{command?: string[], replyTimeoutMs?: number, idleTimeoutMs?: number,
   *          wallCapMs?: number, onEnd?: (reason:string)=>void}} opts
   */
  constructor(source, opts = {}) {
    this.id = randomUUID();
    this.name = `nika-lockstep-${this.id}`;
    this.opts = opts;
    this.replyTimeoutMs = opts.replyTimeoutMs ?? REPLY_TIMEOUT_MS;
    this.idleTimeoutMs = opts.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
    this.wallCapMs = opts.wallCapMs ?? WALL_CAP_MS;

    this.dead = false;
    this.endedReason = null;
    this.pendingStep = null; // {resolve, snaps, timer}
    this.stderrTail = [];
    this._lineBuf = "";

    const argv = opts.command ?? [RUNTIME, ...containerArgs(this.name)];
    this.child = spawn(argv[0], argv.slice(1), { stdio: ["pipe", "pipe", "pipe"] });

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (d) => this._onStdout(d));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (d) => {
      this.stderrTail.push(d);
      // keep only the last ~16 KB for error reporting
      let total = this.stderrTail.reduce((n, s) => n + s.length, 0);
      while (total > 16384 && this.stderrTail.length > 1) total -= this.stderrTail.shift().length;
    });
    this.child.on("exit", (code) => this._onExit(code));
    this.child.on("error", (err) => this._fail(`spawn: ${err.message}`));

    const src = Buffer.from(source, "utf8");
    this.child.stdin.write(`##SRC ${src.length}\n`);
    this.child.stdin.write(src);
    this.child.stdin.on("error", () => {}); // EPIPE after kill is expected

    this._armIdle();
    this.wallTimer = setTimeout(() => this._fail("wall-cap"), this.wallCapMs);
  }

  log() {
    return this.stderrTail.join("");
  }

  /**
   * Advance one quantum. Resolves {tNs, outHex, snaps:[{tNs,outHex}...]} or
   * rejects on death/timeout/end. One in flight at a time (protocol rule).
   */
  step(quantumNs, inHex) {
    if (this.dead) return Promise.reject(new Error(this.endedReason || "session dead"));
    if (this.pendingStep) return Promise.reject(new Error("step already in flight"));
    clearTimeout(this.idleTimer);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingStep = null;
        this._fail("reply-timeout");
        reject(new Error("reply-timeout"));
      }, this.replyTimeoutMs);
      this.pendingStep = { resolve, reject, timer, snaps: [] };
      this.child.stdin.write(`T ${quantumNs} ${inHex === "" ? "0" : inHex}\n`, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingStep = null;
          this._fail(`stdin: ${err.message}`);
          reject(err);
        }
      });
    });
  }

  dispose(reason = "disposed") {
    this._fail(reason, /*quiet*/ true);
  }

  _onStdout(data) {
    this._lineBuf += data;
    let idx;
    while ((idx = this._lineBuf.indexOf("\n")) >= 0) {
      const line = this._lineBuf.slice(0, idx);
      this._lineBuf = this._lineBuf.slice(idx + 1);
      this._onLine(line);
    }
  }

  _onLine(line) {
    const msg = parseSimLine(line);
    const p = this.pendingStep;
    if (msg.kind === "E") {
      if (p && p.snaps.length < MAX_EVENTS_PER_STEP) p.snaps.push({ tNs: msg.tNs, outHex: msg.outHex });
      return;
    }
    if (msg.kind === "O") {
      if (!p) return; // unsolicited reply — stale; ignore
      clearTimeout(p.timer);
      this.pendingStep = null;
      this._armIdle();
      p.resolve({ tNs: msg.tNs, outHex: msg.outHex, snaps: p.snaps });
      return;
    }
    if (msg.kind === "X") {
      this._end(msg.reason || "ended");
      return;
    }
    // anything else: sim chatter → keep with stderr tail for diagnostics
    this.stderrTail.push(line + "\n");
  }

  _armIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this._fail("idle-timeout"), this.idleTimeoutMs);
  }

  _end(reason) {
    // graceful end (X line / clean exit): pending step rejects, session dead
    if (this.dead) return;
    this.dead = true;
    this.endedReason = reason;
    this._cleanup();
    if (this.pendingStep) {
      clearTimeout(this.pendingStep.timer);
      this.pendingStep.reject(new Error(`ended: ${reason}`));
      this.pendingStep = null;
    }
    this.opts.onEnd?.(reason);
  }

  _fail(reason, quiet = false) {
    if (this.dead) return;
    this._end(reason);
    if (!quiet && this.opts.onError) this.opts.onError(reason);
  }

  _onExit() {
    if (!this.dead) this._end("exited");
  }

  _cleanup() {
    clearTimeout(this.idleTimer);
    clearTimeout(this.wallTimer);
    try { this.child.stdin.end(); } catch {}
    try { this.child.kill("SIGKILL"); } catch {}
    // belt & braces for the container runtime (mirrors sandbox.js)
    if (!this.opts.command) {
      execFile(RUNTIME, [...remotePrefix(), "kill", this.name], () => {});
    }
  }
}
