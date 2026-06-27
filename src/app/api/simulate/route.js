// POST /api/simulate — compile + run untrusted Verilog in an ephemeral sandbox and
// return the resulting VCD. Heavy lifting is in src/lib/sandbox.js (isolation) and
// src/lib/testbench.js (auto stimulus). See docs/simulation-backend.md.

import fs from 'fs';
import path from 'path';
import { runSimulation } from "@/lib/sandbox";
import { generateTestbench, generateBoardHarness, hasTestbench } from "@/lib/testbench";
import { parseCst } from "@/lib/constraints";
import { parseSdc } from "@/lib/sdc";
import { checkConstraints } from "@/lib/constraintCheck";
import { TangNano9kBoard } from "@/boards/tangnano9k";

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

// Lazy load models
let modelsStr = null;
function getModels() {
  if (modelsStr) return modelsStr;
  try {
    const modelsDir = path.join(process.cwd(), 'sim', 'models');
    modelsStr = [
      fs.readFileSync(path.join(modelsDir, 'uart_monitor.v'), 'utf8'),
      fs.readFileSync(path.join(modelsDir, 'spi_flash.v'), 'utf8'),
      fs.readFileSync(path.join(modelsDir, 'sd_spi.v'), 'utf8'),
      fs.readFileSync(path.join(modelsDir, 'hdmi_sink.v'), 'utf8'),
    ].join('\n\n');
  } catch (err) {
    console.warn("Could not load peripheral models (are we building or running outside next dev?):", err.message);
    modelsStr = "";
  }
  return modelsStr;
}

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return Response.json({ ok: false, stage: "rate", log: "Too many requests; slow down." }, { status: 429 });
  }
  if (inFlight >= MAX_CONCURRENT) {
    return Response.json({ ok: false, stage: "busy", log: "Simulator busy; try again shortly." }, { status: 429 });
  }

  let code, testbench, cst, sdc, peripherals, opts;
  try {
    const body = await request.json();
    code = body.code;
    testbench = body.testbench;
    cst = body.cst;
    sdc = body.sdc;
    peripherals = body.peripherals || [];
    opts = body.opts || {};
  } catch {
    return Response.json({ ok: false, stage: "input", log: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof code !== "string" || !code.trim()) {
    return Response.json({ ok: false, stage: "input", log: "Missing `code`." }, { status: 400 });
  }
  const hasOwnTb = typeof testbench === "string" && testbench.trim();
  if (testbench != null && typeof testbench !== "string") {
    return Response.json({ ok: false, stage: "input", log: "`testbench` must be a string." }, { status: 400 });
  }
  if (Buffer.byteLength(code, "utf8") + Buffer.byteLength(hasOwnTb ? testbench : "", "utf8") > MAX_CODE_BYTES) {
    return Response.json({ ok: false, stage: "input", log: "Source too large." }, { status: 413 });
  }

  let cstResult = null;
  let sdcResult = null;
  let diagnostics = [];

  // Parse constraints if provided
  if (cst) {
    cstResult = parseCst(cst);
    if (cstResult.errors.length) {
      return Response.json({ ok: false, stage: "input", log: `CST parse error:\n${cstResult.errors.join('\n')}` }, { status: 400 });
    }
  }

  if (sdc) {
    sdcResult = parseSdc(sdc);
    if (sdcResult.errors.length) {
      return Response.json({ ok: false, stage: "input", log: `SDC parse error:\n${sdcResult.errors.join('\n')}` }, { status: 400 });
    }
  }

  // Validate board logic if cst or sdc is provided
  if (cst || sdc) {
    const cstArg = cstResult || { ioPins: new Map(), ioAttrs: new Map() };
    const sdcArg = sdcResult || { clocks: new Map() };
    diagnostics = checkConstraints(cstArg, sdcArg, code, TangNano9kBoard.pins);
    const hasError = diagnostics.some((d) => d.severity === 'error');
    if (hasError) {
      return Response.json({ ok: false, stage: "validation", diagnostics, log: "Board constraint validation failed." });
    }
  }

  // Precedence: explicit custom testbench -> explicit CST harness -> inline $dumpvars -> default auto-clock
  let source;
  if (hasOwnTb) {
    source = code + "\n" + testbench;
  } else if (cst) {
    source = code + "\n" + generateBoardHarness(code, cstResult, sdcResult, peripherals, opts) + "\n" + getModels();
  } else {
    source = hasTestbench(code) ? code : code + "\n" + generateTestbench(code, opts);
  }

  inFlight++;
  try {
    const r = await runSimulation(source);

    // Extract peripheral outputs from the stderr log
    const peripheralOutputs = { uart: '', ppm: null };
    const cleanLogLines = [];

    for (const line of (r.log || '').split('\n')) {
      if (line.startsWith('UART: ')) {
        // Strip prefix and unescape \n \r
        let val = line.substring(6).replace(/\\n/g, '\n').replace(/\\r/g, '\r');
        peripheralOutputs.uart += val;
      } else if (line.startsWith('PPM_FRAME_B64:')) {
        peripheralOutputs.ppm = line.substring(14);
      } else {
        cleanLogLines.push(line);
      }
    }
    
    r.log = cleanLogLines.join('\n');

    if (r.ok) {
      return Response.json({ ok: true, vcd: r.vcd, log: r.log, diagnostics, peripheralOutputs });
    }
    return Response.json({ ok: false, stage: r.stage, log: r.log, diagnostics });
  } finally {
    inFlight--;
  }
}
