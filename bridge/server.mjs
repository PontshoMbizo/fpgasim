// fpgasim bridge server — WebSocket endpoint implementing fulgurlab's bridge-protocol
// v1 (see fulgurlab/docs/bridge-protocol.md). One ws connection may hold multiple
// sessions; each session is one hardened vvp container driven in lockstep.
//
//   node bridge/server.mjs            (port: BRIDGE_PORT, default 3100)
//
// Sessions die with their ws connection. All limits of lockstepSession.js apply.

import { WebSocketServer } from "ws";
import { generateLockstepHarness } from "../src/lib/lockstepHarness.js";
import { LockstepSession } from "../src/lib/lockstepSession.js";
import { inputsToHex, hexToOutputs, eventsFromSnapshots, pinsByDir } from "../src/lib/lockstepCodec.js";

export const PROTO = 1;
export const BACKEND = "fpgasim";
const VERSION = "1.0.0";
const MAX_SOURCE_BYTES = 512 * 1024;
const MAX_SESSIONS_PER_CONN = 4;
const DEFAULT_QUANTUM_NS = 1_000_000;

const send = (ws, obj) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
};
const err = (ws, stage, log, session) =>
  send(ws, { type: "error", stage, log, ...(session ? { session } : {}) });

/** Wire up one ws connection. Exported for tests (server-less harness). */
export function handleConnection(ws, makeSession = defaultMakeSession) {
  const sessions = new Map(); // id -> {sess, pins, quantumNs, lastOutHex, busy}

  ws.on("message", async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return err(ws, "proto", "not JSON");
    }
    try {
      await handleMessage(ws, msg, sessions, makeSession);
    } catch (e) {
      err(ws, "runtime", String(e?.message || e), msg?.session);
    }
  });

  ws.on("close", () => {
    for (const s of sessions.values()) s.sess.dispose("ws closed");
    sessions.clear();
  });
}

async function handleMessage(ws, msg, sessions, makeSession) {
  switch (msg.type) {
    case "hello": {
      if (msg.proto !== PROTO) return err(ws, "proto", `unsupported proto ${msg.proto}, want ${PROTO}`);
      return send(ws, { type: "welcome", proto: PROTO, backend: BACKEND, version: VERSION });
    }

    case "create": {
      if (typeof msg.source !== "string" || !msg.source.trim())
        return err(ws, "compile", "missing Verilog source");
      if (Buffer.byteLength(msg.source, "utf8") > MAX_SOURCE_BYTES)
        return err(ws, "compile", `source exceeds ${MAX_SOURCE_BYTES} bytes`);
      if (sessions.size >= MAX_SESSIONS_PER_CONN)
        return err(ws, "proto", `session limit (${MAX_SESSIONS_PER_CONN}) reached`);

      const quantumNs = clampQuantum(msg.config?.quantum_ns);
      const h = generateLockstepHarness(msg.source, msg.config ?? {});
      if (h.error) return err(ws, "compile", h.error);

      const rec = { pins: h.pins, quantumNs, lastOutHex: "0", busy: false };
      const sess = makeSession(msg.source + h.text, {
        onEnd: (reason) => {
          if (!rec.closedNotified) {
            rec.closedNotified = true;
            send(ws, { type: "ended", session: rec.id, reason });
          }
        },
      });
      rec.sess = sess;
      rec.id = sess.id;
      sessions.set(sess.id, rec);
      return send(ws, {
        type: "created",
        session: sess.id,
        pins: h.pins.map(({ name, dir }) => ({ name, dir })),
        quantum_ns: quantumNs,
      });
    }

    case "step": {
      const rec = sessions.get(msg.session);
      if (!rec) return err(ws, "proto", "unknown session", msg.session);
      if (rec.busy) return err(ws, "proto", "step already in flight", msg.session);
      rec.busy = true;
      try {
        const inHex = inputsToHex(rec.pins, msg.inputs ?? {});
        const r = await rec.sess.step(rec.quantumNs, inHex);
        const events = eventsFromSnapshots(rec.pins, rec.lastOutHex, r.snaps);
        rec.lastOutHex = r.outHex;
        return send(ws, {
          type: "stepped",
          session: msg.session,
          t_ns: r.tNs,
          outputs: hexToOutputs(rec.pins, r.outHex),
          events,
        });
      } catch (e) {
        const reason = String(e?.message || e);
        if (!reason.startsWith("ended:")) {
          // hard failure — surface the sandbox log tail to the client
          err(ws, reason.includes("timeout") ? "timeout" : "runtime",
              `${reason}\n${rec.sess.log().slice(-2000)}`, msg.session);
        }
        sessions.delete(msg.session);
        return;
      } finally {
        rec.busy = false;
      }
    }

    case "reset": {
      const rec = sessions.get(msg.session);
      if (!rec) return err(ws, "proto", "unknown session", msg.session);
      return err(ws, "proto", "reset not supported in v1 — dispose and create", msg.session);
    }

    case "dispose": {
      const rec = sessions.get(msg.session);
      if (!rec) return err(ws, "proto", "unknown session", msg.session);
      rec.closedNotified = true; // suppress the ended event; dispose is explicit
      rec.sess.dispose();
      sessions.delete(msg.session);
      return send(ws, { type: "disposed", session: msg.session });
    }

    default:
      return err(ws, "proto", `unknown message type ${String(msg.type)}`);
  }
}

function clampQuantum(q) {
  const v = Number(q ?? DEFAULT_QUANTUM_NS);
  if (!Number.isFinite(v)) return DEFAULT_QUANTUM_NS;
  return Math.min(Math.max(Math.round(v), 1_000), 100_000_000); // 1 µs .. 100 ms
}

function defaultMakeSession(source, hooks) {
  return new LockstepSession(source, hooks);
}

/** Start listening (skipped under `node --test` importers). */
export function startServer(port = Number(process.env.BRIDGE_PORT || 3100)) {
  const wss = new WebSocketServer({ port });
  wss.on("connection", (ws) => handleConnection(ws));
  console.error(`[fpgasim-bridge] listening on :${port} (proto v${PROTO})`);
  return wss;
}

if (import.meta.url === `file://${process.argv[1]}`) startServer();
