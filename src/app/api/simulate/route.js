// POST /api/simulate — compile + run untrusted Verilog in an ephemeral sandbox and
// return the resulting VCD. Heavy lifting is in src/lib/sandbox.js (isolation) and
// src/lib/testbench.js (auto stimulus). See docs/simulation-backend.md.

import { runSimulation } from "@/lib/sandbox";
import { generateTestbench, hasTestbench } from "@/lib/testbench";

const MAX_CODE_BYTES = 200 * 1024; // reject oversized source outright
const MAX_CONCURRENT = Number(process.env.SIM_MAX_CONCURRENT || 4);
const RATE_PER_MIN = Number(process.env.SIM_RATE_PER_MIN || 30);

let inFlight = 0;
const hits = new Map(); // ip -> timestamps within the window

function rateLimited(ip) {
  const now = Date.now();
  const win = now - 60_000;
  const arr = (hits.get(ip) || []).filter((t) => t > win);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RATE_PER_MIN;
}

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return Response.json({ ok: false, stage: "rate", log: "Too many requests; slow down." }, { status: 429 });
  }
  if (inFlight >= MAX_CONCURRENT) {
    return Response.json({ ok: false, stage: "busy", log: "Simulator busy; try again shortly." }, { status: 429 });
  }

  let code;
  try {
    ({ code } = await request.json());
  } catch {
    return Response.json({ ok: false, stage: "input", log: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof code !== "string" || !code.trim()) {
    return Response.json({ ok: false, stage: "input", log: "Missing `code`." }, { status: 400 });
  }
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    return Response.json({ ok: false, stage: "input", log: "Source too large." }, { status: 413 });
  }

  // Append an auto-generated testbench only when the source doesn't dump its own VCD.
  const source = hasTestbench(code) ? code : code + "\n" + generateTestbench(code);

  inFlight++;
  try {
    const r = await runSimulation(source);
    if (r.ok) return Response.json({ ok: true, vcd: r.vcd, log: r.log });
    return Response.json({ ok: false, stage: r.stage, log: r.log });
  } finally {
    inFlight--;
  }
}
