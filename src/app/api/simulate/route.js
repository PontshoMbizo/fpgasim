// POST /api/simulate — compile + run untrusted Verilog in an ephemeral sandbox and
// return the resulting VCD. Heavy lifting is in src/lib/sandbox.js (isolation) and
// src/lib/testbench.js (auto stimulus). See docs/simulation-backend.md.

import fs from 'fs';
import path from 'path';
import { runSimulation } from "@/lib/sandbox";
import { generateTestbench, generateBoardHarness, hasTestbench, parsePorts, pickTop, moduleNames, stripComments } from "@/lib/testbench";
import { parseCst } from "@/lib/constraints";
import { parseSdc } from "@/lib/sdc";
import { checkConstraints } from "@/lib/constraintCheck";
import { TangNano9kBoard } from "@/boards/tangnano9k";
import { validateStimuli, MAX_STIMULI } from "@/lib/stimulusSchema";
import { validateComponents, MAX_COMPONENTS, MAX_WIRES, MAX_COMPONENT_CODE_BYTES } from "@/lib/componentSchema";

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

// Best-effort top-module port list, for validating stimulus targets before compiling.
// Mirrors generateBoardHarness's own top-picking logic (src/lib/testbench.js).
function getTopPorts(code) {
  const clean = stripComments(code);
  const names = moduleNames(clean);
  if (names.length === 0) return [];
  const top = pickTop(clean, names);
  return parsePorts(clean, top);
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

  let code, testbench, cst, sdc, peripherals, opts, stimuli, components, wires;
  try {
    const body = await request.json();
    code = body.code;
    testbench = body.testbench;
    cst = body.cst;
    sdc = body.sdc;
    peripherals = body.peripherals || [];
    opts = body.opts || {};
    stimuli = body.stimuli || [];
    components = body.components || [];
    wires = body.wires || [];
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

  if (!Array.isArray(stimuli)) {
    return Response.json({ ok: false, stage: "input", log: "`stimuli` must be an array." }, { status: 400 });
  }
  if (stimuli.length > MAX_STIMULI) {
    return Response.json({ ok: false, stage: "input", log: `Too many stimulus blocks (max ${MAX_STIMULI}).` }, { status: 400 });
  }
  if (stimuli.length && hasOwnTb) {
    return Response.json({ ok: false, stage: "input", log: "`stimuli` has no effect alongside an explicit `testbench` — remove one." }, { status: 400 });
  }
  if (stimuli.length && !cst) {
    return Response.json({ ok: false, stage: "input", log: "`stimuli` requires board constraints (`cst`) — the board harness is what wires stimulus blocks in." }, { status: 400 });
  }

  // Validate components/wires inputs
  if (!Array.isArray(components)) {
    return Response.json({ ok: false, stage: "input", log: "`components` must be an array." }, { status: 400 });
  }
  if (!Array.isArray(wires)) {
    return Response.json({ ok: false, stage: "input", log: "`wires` must be an array." }, { status: 400 });
  }
  if ((components.length || wires.length) && hasOwnTb) {
    return Response.json({ ok: false, stage: "input", log: "`components` has no effect alongside an explicit `testbench` — remove one." }, { status: 400 });
  }
  if ((components.length || wires.length) && !cst) {
    return Response.json({ ok: false, stage: "input", log: "`components` requires board constraints (`cst`)." }, { status: 400 });
  }
  if (components.length > MAX_COMPONENTS) {
    return Response.json({ ok: false, stage: "input", log: `Too many components (max ${MAX_COMPONENTS}).` }, { status: 400 });
  }
  if (wires.length > MAX_WIRES) {
    return Response.json({ ok: false, stage: "input", log: `Too many wires (max ${MAX_WIRES}).` }, { status: 400 });
  }
  // Per-component size cap
  for (const c of components) {
    if (c && typeof c.verilog === 'string' && Buffer.byteLength(c.verilog, 'utf8') > MAX_COMPONENT_CODE_BYTES) {
      return Response.json({ ok: false, stage: "input", log: `Component "${c.id || '?'}" Verilog exceeds ${MAX_COMPONENT_CODE_BYTES / 1024} KiB.` }, { status: 400 });
    }
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
    const topPorts = (stimuli.length || components.length || wires.length) ? getTopPorts(code) : [];
    if (stimuli.length) {
      // Pass components so "<compId>.<pinName>" stimulus targets validate against
      // chip input pins instead of being rejected as unknown design ports.
      diagnostics = diagnostics.concat(validateStimuli(stimuli, topPorts, components));
    }
    if (components.length || wires.length) {
      const designModNames = moduleNames(stripComments(code));
      // topPorts enables DUT-output-vs-chip-output and stimulus-vs-chip driver
      // conflict detection on board nets (net-level single-driver rule).
      diagnostics = diagnostics.concat(
        validateComponents(components, wires, designModNames, cstResult, stimuli, topPorts)
      );
    }
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
    // Append each component's Verilog between the user design and the harness,
    // so the harness can instantiate them as co-simulated modules in the same run.
    const componentVerilog = components
      .filter((c) => c && typeof c.verilog === 'string' && c.verilog.trim())
      .map((c) => c.verilog)
      .join('\n\n');
    const harness = generateBoardHarness(code, cstResult, sdcResult, peripherals, opts, stimuli, components, wires);
    source = [code, componentVerilog, harness, getModels()].filter(Boolean).join('\n');
  } else {
    source = hasTestbench(code) ? code : code + "\n" + generateTestbench(code, opts);
  }

  // Late safety check: the early MAX_CODE_BYTES check above only covers raw
  // code+testbench, not the generated harness/models/stimuli text.
  if (Buffer.byteLength(source, "utf8") > MAX_CODE_BYTES) {
    return Response.json({ ok: false, stage: "input", log: "Generated source too large." }, { status: 413 });
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
