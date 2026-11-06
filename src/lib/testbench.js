// Generates a Verilog testbench for the "auto clock + default inputs" stimulus model,
// used when the user's source has no testbench of its own. Best-effort parsing of the
// ANSI module header (the shape the editor's default design uses). Users who need full
// control write their own testbench (detected via $dumpvars) which bypasses this.

const DEFAULT_DURATION_NS = 2000;

// Strip comments so they don't confuse the lightweight regex parsing.
export function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

// True if the source already dumps a VCD — meaning it carries its own testbench.
export function hasTestbench(code) {
  return /\$dumpvars/.test(stripComments(code));
}

// All `module <name>` declarations, in order.
export function moduleNames(code) {
  const names = [];
  const re = /\bmodule\s+([A-Za-z_]\w*)/g;
  let m;
  while ((m = re.exec(code))) names.push(m[1]);
  return names;
}

// Pick the top module: prefer one literally named `top`; else the module not
// instantiated by any other; else the first declared.
export function pickTop(code, names) {
  if (names.includes("top")) return "top";
  const instantiated = new Set();
  for (const n of names) {
    // crude instance detection: `<name> <inst> (` somewhere not preceded by `module`
    const re = new RegExp(`(?<!module\\s)\\b${n}\\s+[A-Za-z_]\\w*\\s*\\(`, "g");
    if (re.test(code)) instantiated.add(n);
  }
  const roots = names.filter((n) => !instantiated.has(n));
  return roots[0] || names[0];
}

// Parse the ANSI port header of `topName`: returns [{dir,width,name}].
export function parsePorts(code, topName) {
  const re = new RegExp(`\\bmodule\\s+${topName}\\s*(?:#\\s*\\([\\s\\S]*?\\))?\\s*\\(([\\s\\S]*?)\\)\\s*;`);
  const m = re.exec(code);
  if (!m) return [];
  const body = m[1];
  const ports = [];
  // Split on commas at the top level (port headers here have no nested parens).
  for (const raw of body.split(",")) {
    const seg = raw.trim();
    if (!seg) continue;
    const dm = /\b(input|output|inout)\b/.exec(seg);
    if (!dm) continue; // non-ANSI header (ports declared in the body) — unsupported
    const dir = dm[1];
    const rangeM = /\[\s*(\d+)\s*:\s*(\d+)\s*\]/.exec(seg);
    const width = rangeM ? Math.abs(+rangeM[1] - +rangeM[2]) + 1 : 1;
    const nameM = /(\w+)\s*$/.exec(seg);
    if (!nameM) continue;
    ports.push({ dir, width, name: nameM[1], range: rangeM ? rangeM[0] : "" });
  }
  return ports;
}

const isClock = (name) => /^(clk|clock)$/i.test(name);

/**
 * Build a testbench string that instantiates the top module, drives a clock, holds
 * other inputs at a default, and dumps a VCD.
 * @returns {string} testbench Verilog (to be appended to the user's source)
 */
export function generateTestbench(code, { duration = DEFAULT_DURATION_NS } = {}) {
  const clean = stripComments(code);
  const names = moduleNames(clean);
  if (names.length === 0) return ""; // nothing to drive; let the compiler report it
  const top = pickTop(clean, names);
  const ports = parsePorts(clean, top);

  const decls = [];
  const inits = [];
  const conns = [];
  let clockPort = null;

  for (const p of ports) {
    const range = p.range ? `${p.range} ` : "";
    if (p.dir === "input") {
      decls.push(`  reg ${range}${p.name};`);
      if (isClock(p.name)) clockPort = p.name;
      else inits.push(`    ${p.name} = ${p.width}'b${"1".repeat(p.width)}; // default (active-low released)`);
    } else {
      decls.push(`  wire ${range}${p.name};`);
    }
    conns.push(`.${p.name}(${p.name})`);
  }

  const clockBlock = clockPort
    ? `  initial ${clockPort} = 0;\n  always #5 ${clockPort} = ~${clockPort};\n`
    : "";

  return [
    "",
    "// ---- auto-generated testbench (no $dumpvars found in source) ----",
    "`timescale 1ns/1ps",
    "module tb;",
    decls.join("\n"),
    `  ${top} dut (${conns.join(", ")});`,
    clockBlock + "  initial begin",
    inits.join("\n"),
    '    $dumpfile("out.vcd");',
    "    $dumpvars(0, tb);",
    `    #${duration} $finish;`,
    "  end",
    "endmodule",
    "",
  ].join("\n");
}

// ============================================================
// BOARD HARNESS (Tang Nano 9K specific)
// ============================================================

// Default simulation duration in nanoseconds (= 2000 µs).
export const DEFAULT_BOARD_DURATION_NS = 2_000_000;

// The 27 MHz board clock period.
export const BOARD_CLOCK_PERIOD_NS = 1000 / 27; // ≈ 37.037 ns

// ============================================================
// STIMULUS BLOCKS (visual signal sources driving a DUT input port)
// ============================================================
//
// Wire-format stimulus descriptors (kind: 'preset' | 'samples' | 'verilog' — 'function'
// blocks are reduced to 'samples' client-side before reaching here, see
// src/lib/stimulusSampling.js). Callers are expected to have already validated
// descriptors against the port list (src/lib/stimulusSchema.js's validateStimuli) —
// this function defensively skips anything that doesn't resolve rather than throwing,
// so a bad block degrades to "not applied" instead of breaking the whole harness.

// Formats an unsigned numeric value as a sized Verilog hex literal, e.g. (8, 255) -> "8'hff".
function hexLiteral(width, value) {
  const digits = Math.ceil(width / 4);
  const masked = width > 32
    ? (BigInt(Math.trunc(value)) & ((1n << BigInt(width)) - 1n)).toString(16)
    : ((Math.trunc(value) >>> 0) & (width === 32 ? 0xffffffff : (2 ** width - 1))).toString(16);
  return `${width}'h${masked.padStart(digits, '0')}`;
}

function stimClockTemplate(id, target, { periodNs = 20, dutyPct = 50 } = {}) {
  const onNs = (periodNs * dutyPct / 100).toFixed(4);
  const offNs = (periodNs * (100 - dutyPct) / 100).toFixed(4);
  return {
    decls: [],
    block: [
      `  // stimulus ${id}: clock/pwm on ${target} (period=${periodNs}ns duty=${dutyPct}%)`,
      `  initial begin`,
      `    ${target} = 1'b0;`,
      `    forever begin`,
      `      #${onNs} ${target} = 1'b1;`,
      `      #${offNs} ${target} = 1'b0;`,
      `    end`,
      `  end`,
    ].join('\n'),
  };
}

function stimButtonTemplate(id, target, { pressAtNs = 200, holdNs = 50, repeatCount = 2, activeLow = true } = {}) {
  const released = activeLow ? "1'b1" : "1'b0";
  const pressed = activeLow ? "1'b0" : "1'b1";
  return {
    decls: [],
    block: [
      `  // stimulus ${id}: button pulse on ${target}`,
      `  initial begin`,
      `    ${target} = ${released}; // released`,
      `    repeat (${repeatCount}) begin`,
      `      #${pressAtNs} ${target} = ${pressed}; // press`,
      `      #${holdNs} ${target} = ${released}; // release`,
      `    end`,
      `  end`,
    ].join('\n'),
  };
}

// Bit-bangs an 8N1 UART byte stream onto `target` (idle high, LSB-first data, one stop bit).
function stimUartTemplate(id, target, { bytes = [], baudRate = 115200, startDelayNs = 100 } = {}) {
  const bitNs = (1e9 / baudRate).toFixed(4);
  const lines = [];
  for (const byte of bytes.slice(0, 64)) {
    lines.push(`    ${target} = 1'b0; #${bitNs}; // start`);
    for (let bit = 0; bit < 8; bit++) {
      const v = (byte >> bit) & 1;
      lines.push(`    ${target} = 1'b${v}; #${bitNs}; // bit${bit}`);
    }
    lines.push(`    ${target} = 1'b1; #${bitNs}; // stop`);
  }
  return {
    decls: [],
    block: [
      `  // stimulus ${id}: uart byte stream on ${target} (${baudRate} baud)`,
      `  initial begin`,
      `    ${target} = 1'b1; // idle`,
      `    #${startDelayNs};`,
      lines.join('\n'),
      `  end`,
    ].join('\n'),
  };
}

// Continuous analog-style waveforms driven by a `real` phase accumulator. `shape`
// selects the waveform expression; `width` sizes the target so the rtoi'd sample fits.
function stimAnalogTemplate(id, target, width, shape, { amplitude = 100, offset = 128, freqHz = 1000, updateStepNs = 10 } = {}) {
  const omegaPerStep = (2 * Math.PI * freqHz * updateStepNs * 1e-9).toFixed(8);
  const thetaVar = `stim_${id}_theta`;
  const valueExpr = shape === 'square'
    ? `($sin(${thetaVar}) >= 0.0) ? (${offset} + ${amplitude}) : (${offset} - ${amplitude})`
    : `${offset} + ${amplitude} * $sin(${thetaVar})`;
  return {
    decls: [`  real ${thetaVar};`],
    block: [
      `  // stimulus ${id}: ${shape} on ${target}`,
      `  initial ${thetaVar} = 0;`,
      `  always #${updateStepNs} begin`,
      `    ${thetaVar} = ${thetaVar} + ${omegaPerStep};`,
      `    ${target} = $rtoi(${valueExpr});`,
      `  end`,
    ].join('\n'),
  };
}

// Linear ramp/sawtooth: accumulates by a fixed step each tick and wraps at the top.
function stimRampTemplate(id, target, width, { minVal = 0, maxVal = 2 ** Math.min(width, 16) - 1, stepPerTick = 1, updateStepNs = 10 } = {}) {
  const valVar = `stim_${id}_val`;
  return {
    decls: [`  integer ${valVar};`],
    block: [
      `  // stimulus ${id}: ramp on ${target}`,
      `  initial ${valVar} = ${minVal};`,
      `  always #${updateStepNs} begin`,
      `    ${valVar} = ${valVar} + ${stepPerTick};`,
      `    if (${valVar} > ${maxVal}) ${valVar} = ${minVal};`,
      `    ${target} = ${valVar};`,
      `  end`,
    ].join('\n'),
  };
}

// One-shot level transition at a fixed time.
function stimStepTemplate(id, target, width, { lowVal = 0, highVal = 1, stepAtNs = 500 } = {}) {
  return {
    decls: [],
    block: [
      `  // stimulus ${id}: step on ${target}`,
      `  initial begin`,
      `    ${target} = ${hexLiteral(width, lowVal)};`,
      `    #${stepAtNs} ${target} = ${hexLiteral(width, highVal)};`,
      `  end`,
    ].join('\n'),
  };
}

// Pseudo-random bit stream via an 8-bit Fibonacci LFSR; only the LSB drives `target`.
function stimPrbsTemplate(id, target, { seed = 0xac, updateStepNs = 20 } = {}) {
  const lfsrVar = `stim_${id}_lfsr`;
  return {
    decls: [`  reg [7:0] ${lfsrVar};`],
    block: [
      `  // stimulus ${id}: prbs on ${target}`,
      `  initial ${lfsrVar} = 8'h${seed.toString(16).padStart(2, '0')};`,
      `  always #${updateStepNs} ${lfsrVar} = {${lfsrVar}[6:0], ${lfsrVar}[7] ^ ${lfsrVar}[5] ^ ${lfsrVar}[4] ^ ${lfsrVar}[3]};`,
      `  assign ${target} = ${lfsrVar}[0];`,
    ].join('\n'),
  };
}

// Fixed-rate sample list, packed into one flattened concatenation constant and stepped
// through with an indexed part-select — far more compact than a memory array with a
// per-element assignment (see plan rationale: this keeps a 4096-sample block well under
// the combined-source size cap) and avoids relying on SystemVerilog unpacked-array
// literal assignment, which this project's Icarus build does not support.
function stimSamplesTemplate(id, target, width, { values = [], stepNs = 100, startNs = 0, hold = 'last' } = {}) {
  const n = values.length;
  const romVar = `stim_${id}_rom`;
  const idxVar = `stim_${id}_i`;
  const concat = values.map((v) => hexLiteral(width, v)).join(', ');
  const holdStmt = hold === 'last' ? '' : `    ${target} = ${hexLiteral(width, hold)};\n`;
  return {
    decls: [
      `  localparam stim_${id}_n = ${n};`,
      `  reg [stim_${id}_n*${width}-1:0] ${romVar} = {${concat}};`,
      `  integer ${idxVar};`,
    ],
    block: [
      `  // stimulus ${id}: ${n} samples @ ${stepNs}ns on ${target}`,
      `  initial begin`,
      `    #${startNs};`,
      `    for (${idxVar} = 0; ${idxVar} < stim_${id}_n; ${idxVar} = ${idxVar} + 1) begin`,
      `      ${target} = ${romVar}[(stim_${id}_n-1-${idxVar})*${width} +: ${width}];`,
      `      #${stepNs};`,
      `    end`,
      holdStmt.trimEnd(),
      `  end`,
    ].filter(Boolean).join('\n'),
  };
}

/**
 * Turns validated stimulus block descriptors into Verilog fragments that drive DUT
 * input ports. Reuses the same "declare it wire, skip default init" treatment
 * generateBoardHarness already gives peripheral-model-driven inputs (e.g. flash miso).
 *
 * @param {object[]} stimuli  wire-format descriptors (kind: preset|samples|verilog)
 * @param {object[]} ports    result of parsePorts() for the same design
 * @returns {{decls:string[], blocks:string[], instances:string[],
 *            drivenPorts:Set<string>, wireDrivenPorts:Set<string>, errors:string[]}}
 */
export function generateStimulusDrivers(stimuli = [], ports = []) {
  const portsByName = new Map(ports.map((p) => [p.name, p]));
  const decls = [];
  const blocks = [];
  const instances = [];
  const drivenPorts = new Set();
  const wireDrivenPorts = new Set();
  const errors = [];

  for (const s of stimuli) {
    if (!s || s.enabled === false) continue;
    const port = portsByName.get(s.target);
    if (!port || port.dir !== 'input') {
      errors.push(`Stimulus "${s.id}" target "${s.target}" is not an input port; skipped.`);
      continue;
    }
    if (drivenPorts.has(s.target)) {
      errors.push(`Stimulus "${s.id}" target "${s.target}" already driven by another block; skipped.`);
      continue;
    }
    const width = port.width;
    const target = s.target;

    if (s.kind === 'preset') {
      const p = s.preset || {};
      let result;
      switch (p.id) {
        case 'clock':
        case 'pwm':
          result = stimClockTemplate(s.id, target, p.params);
          break;
        case 'button':
          result = stimButtonTemplate(s.id, target, p.params);
          break;
        case 'uart':
          result = stimUartTemplate(s.id, target, p.params);
          break;
        case 'sine':
        case 'square':
          result = stimAnalogTemplate(s.id, target, width, p.id, p.params);
          break;
        case 'ramp':
          result = stimRampTemplate(s.id, target, width, p.params);
          break;
        case 'step':
          result = stimStepTemplate(s.id, target, width, p.params);
          break;
        case 'prbs':
          result = stimPrbsTemplate(s.id, target, p.params);
          break;
        default:
          errors.push(`Stimulus "${s.id}" has unknown preset "${p.id}"; skipped.`);
          continue;
      }
      decls.push(...result.decls);
      blocks.push(result.block);
      drivenPorts.add(target);
      if (p.id === 'prbs') wireDrivenPorts.add(target); // driven via continuous assign
    } else if (s.kind === 'samples') {
      const result = stimSamplesTemplate(s.id, target, width, s.samples);
      decls.push(...result.decls);
      blocks.push(result.block);
      drivenPorts.add(target);
    } else if (s.kind === 'verilog') {
      if (s.verilog?.mode === 'instance') {
        instances.push(`  // stimulus ${s.id}: custom verilog instance driving ${target}\n${s.verilog.code}`);
        drivenPorts.add(target);
        wireDrivenPorts.add(target);
      } else {
        blocks.push(`  // stimulus ${s.id}: custom verilog on ${target}\n${s.verilog?.code || ''}`);
        drivenPorts.add(target);
      }
    } else {
      errors.push(`Stimulus "${s.id}" has unknown kind "${s.kind}"; skipped.`);
    }
  }

  return { decls, blocks, instances, drivenPorts, wireDrivenPorts, errors };
}

/**
 * Generates a constraint-aware testbench that emulates the Tang Nano 9K board.
 *
 * Unlike generateTestbench (which is a generic auto-stimulus), this harness:
 *  - drives the clock at 27 MHz (or the period from the SDC if provided)
 *  - initialises all buttons active-HIGH (released / not pressed, active-LOW hardware)
 *  - pulses each button active-LOW twice during the simulation for stimulus coverage
 *  - wires peripheral models (uart_monitor, spi_flash, sd_spi, hdmi_sink) when requested
 *  - wires visual stimulus blocks (see generateStimulusDrivers) that override the default
 *    clock/button behaviour for their target port
 *  - dumps all harness nets and DUT ports into the VCD
 *
 * @param {string} code           Verilog source (design under test)
 * @param {object} [cstResult]    Parsed CST ({ioPins, ioAttrs}) — may be null
 * @param {object} [sdcResult]    Parsed SDC ({clocks}) — may be null
 * @param {string[]} [peripherals] Peripheral IDs to wire: 'uart'|'flash'|'sd'|'hdmi'
 * @param {object} [opts]
 * @param {number} [opts.durationNs]  Simulation wall-time in ns. Default: 2 000 000 (2 ms)
 * @param {number} [opts.baudRate]    UART baud rate. Default: 115200
 * @param {object[]} [stimuli]    Visual stimulus block descriptors, see generateStimulusDrivers
 * @returns {string} Verilog testbench source to concatenate after the design
 */
export function generateBoardHarness(code, cstResult = null, sdcResult = null, peripherals = [], opts = {}, stimuli = []) {
  const durationNs = opts.durationNs ?? DEFAULT_BOARD_DURATION_NS;
  const baudRate   = opts.baudRate   ?? 115200;

  const clean = stripComments(code);
  const names = moduleNames(clean);
  if (names.length === 0) return ''; // nothing to instantiate
  const top   = pickTop(clean, names);
  const ports  = parsePorts(clean, top);

  // ---- Determine clock period from SDC or fall back to board default ----
  let clockPeriodNs = BOARD_CLOCK_PERIOD_NS;
  if (sdcResult?.clocks) {
    // Use the first clock whose port is a clock port in the design
    for (const p of ports) {
      if (isClock(p.name) && sdcResult.clocks.has(p.name)) {
        clockPeriodNs = sdcResult.clocks.get(p.name).periodNs;
        break;
      }
    }
  }
  const halfPeriod = (clockPeriodNs / 2).toFixed(4);

  // ---- Stimulus blocks (visual signal sources targeting a DUT input port) ----
  const stim = generateStimulusDrivers(stimuli, ports);

  // ---- Classify ports ----
  const inputs  = ports.filter(p => p.dir === 'input');
  const outputs = ports.filter(p => p.dir === 'output' || p.dir === 'inout');

  // Identify well-known port roles by name heuristic. A port claimed by a stimulus
  // block is excluded from the default clock/button heuristics — the stimulus fully
  // replaces that port's default drive behaviour.
  const clockPort  = inputs.find(p => isClock(p.name) && !stim.drivenPorts.has(p.name));
  const btnPorts   = inputs.filter(p => /^btn/.test(p.name) && !stim.drivenPorts.has(p.name));
  const uartTxPort = outputs.find(p => /tx/i.test(p.name));
  const uartRxPort = inputs.find(p => /rx/i.test(p.name));
  const flashPorts = {
    cs:   outputs.find(p => /flash.*cs|cs.*flash/i.test(p.name)),
    clk:  outputs.find(p => /flash.*clk|spi.*clk/i.test(p.name)),
    mosi: outputs.find(p => /mosi/i.test(p.name)),
    miso: inputs.find(p => /miso/i.test(p.name)),
  };
  const sdPorts = {
    cs:   outputs.find(p => /sd.*cs|tf.*cs/i.test(p.name)),
    clk:  outputs.find(p => /sd.*clk|tf.*clk/i.test(p.name)),
    mosi: outputs.find(p => /sd.*mosi|tf.*mosi/i.test(p.name)),
    miso: inputs.find(p => /sd.*miso|tf.*miso/i.test(p.name)),
  };
  const wantUart  = peripherals.includes('uart')  && uartTxPort;
  const wantFlash = peripherals.includes('flash') && Object.values(flashPorts).some(Boolean);
  const wantSd    = peripherals.includes('sd')    && Object.values(sdPorts).some(Boolean);
  const wantHdmi  = peripherals.includes('hdmi');

  // Inputs that a peripheral MODEL drives (e.g. flash/SD MISO) must be nets, not regs:
  // the model output connects to them, so the harness must not declare them `reg` or
  // initialise them (iverilog: "Unable to assign to unresolved wires"). A stimulus
  // block driven via a module instance (kind: verilog/instance, or the PRBS preset's
  // continuous assign) needs the exact same treatment.
  const drivenInputs = new Set();
  if (wantFlash && flashPorts.miso) drivenInputs.add(flashPorts.miso);
  if (wantSd && sdPorts.miso) drivenInputs.add(sdPorts.miso);
  for (const p of ports) {
    if (stim.wireDrivenPorts.has(p.name)) drivenInputs.add(p);
  }

  // ---- Build reg/wire declarations ----
  const decls = [];
  const conns = [];

  for (const p of ports) {
    const range = p.range ? `${p.range} ` : '';
    if (p.dir === 'input' && !drivenInputs.has(p)) {
      decls.push(`  reg ${range}${p.name};`);
    } else {
      decls.push(`  wire ${range}${p.name};`);
    }
    conns.push(`.${p.name}(${p.name})`);
  }

  // ---- Clock driver ----
  const clockBlock = clockPort
    ? `  initial ${clockPort.name} = 0;\n  always #${halfPeriod} ${clockPort.name} = ~${clockPort.name};\n`
    : '';

  // ---- Button pulses (active-LOW: normal = 1, pressed = 0) ----
  const btnInits = btnPorts.map(p => `    ${p.name} = 1'b1; // released (active-LOW)`);
  const btnPulse1Ns = Math.round(durationNs * 0.10); // 10% into the sim
  const btnPulse2Ns = Math.round(durationNs * 0.35); // 35% into the sim
  const btnStimulus = btnPorts.flatMap(p => [
    `    #${btnPulse1Ns} ${p.name} = 1'b0; // press ${p.name}`,
    `    #500         ${p.name} = 1'b1; // release ${p.name}`,
    `    #${Math.round(btnPulse2Ns - btnPulse1Ns - 500)} ${p.name} = 1'b0; // press ${p.name} again`,
    `    #500         ${p.name} = 1'b1; // release ${p.name}`,
  ]);

  // Remaining input initialisation (non-clock, non-button, not model-driven, not
  // claimed by a stimulus block)
  const otherInits = inputs
    .filter(p => p !== clockPort && !btnPorts.includes(p) && !drivenInputs.has(p) && !stim.drivenPorts.has(p.name))
    .map(p => `    ${p.name} = ${p.width}'b${'0'.repeat(p.width)}; // default low`);

  // ---- Peripheral instantiation blocks ----
  const peripheralDecls = [];
  const peripheralInst  = [];

  if (wantUart && uartTxPort) {
    peripheralDecls.push(`  // UART monitor — samples DUT TX, prints decoded bytes to log`);
    peripheralInst.push([
      `  uart_monitor #(.BAUD_RATE(${baudRate}), .CLK_PERIOD_NS(${clockPeriodNs.toFixed(4)})) uart_mon (`,
      `    .tx(${uartTxPort.name})`,
      `  );`,
    ].join('\n'));
  }

  if (wantFlash) {
    const cs   = flashPorts.cs?.name   || '1\'b1';
    const fclk = flashPorts.clk?.name  || '1\'b0';
    const mosi = flashPorts.mosi?.name || '1\'b0';
    const miso = flashPorts.miso?.name;
    peripheralInst.push([
      `  spi_flash flash_model (`,
      `    .cs_n(${cs}),`,
      `    .sclk(${fclk}),`,
      `    .mosi(${mosi})${miso ? `,` : ''}`,
      miso ? `    .miso(${miso})` : '',
      `  );`,
    ].filter(Boolean).join('\n'));
  }

  if (wantSd) {
    const cs   = sdPorts.cs?.name   || '1\'b1';
    const sclk = sdPorts.clk?.name  || '1\'b0';
    const mosi = sdPorts.mosi?.name || '1\'b0';
    const miso = sdPorts.miso?.name;
    peripheralInst.push([
      `  sd_spi sd_model (`,
      `    .cs_n(${cs}),`,
      `    .sclk(${sclk}),`,
      `    .mosi(${mosi})${miso ? `,` : ''}`,
      miso ? `    .miso(${miso})` : '',
      `  );`,
    ].filter(Boolean).join('\n'));
  }

  if (wantHdmi) {
    // HDMI sink monitors h/v sync + RGB bus ports by name
    const hsync = outputs.find(p => /hsync/i.test(p.name));
    const vsync = outputs.find(p => /vsync/i.test(p.name));
    const rgb   = outputs.find(p => /\brgb\b|\bpixel\b/i.test(p.name));
    if (hsync || vsync) {
      peripheralInst.push([
        `  hdmi_sink hdmi_model (`,
        hsync ? `    .hsync(${hsync.name}),` : '    .hsync(1\'b0),',
        vsync ? `    .vsync(${vsync.name}),` : '    .vsync(1\'b0),',
        rgb   ? `    .rgb(${rgb.name}),`     : '    .rgb(24\'h0),',
        `    .pclk(${clockPort?.name || '1\'b0'})`,
        `  );`,
      ].join('\n'));
    }
  }

  // ---- Assemble the testbench ----
  return [
    '',
    '// ---- board harness (Tang Nano 9K auto-generated) ----',
    '`timescale 1ns/1ps',
    'module tb;',
    decls.join('\n'),
    peripheralDecls.join('\n'),
    stim.decls.join('\n'),
    '',
    `  ${top} dut (${conns.join(', ')});`,
    '',
    peripheralInst.join('\n'),
    stim.instances.join('\n\n'),
    '',
    clockBlock,
    '  initial begin',
    btnInits.join('\n'),
    otherInits.join('\n'),
    '    $dumpfile("out.vcd");',
    '    $dumpvars(0, tb);',
    btnStimulus.join('\n'),
    `    #${durationNs} $finish;`,
    '  end',
    stim.blocks.join('\n\n'),
    'endmodule',
    '',
  ].join('\n');
}
