// Generates a Verilog testbench for the "auto clock + default inputs" stimulus model,
// used when the user's source has no testbench of its own. Best-effort parsing of the
// ANSI module header (the shape the editor's default design uses). Users who need full
// control write their own testbench (detected via $dumpvars) which bypasses this.

const DEFAULT_DURATION_NS = 2000;

// Strip comments so they don't confuse the lightweight regex parsing.
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

// True if the source already dumps a VCD — meaning it carries its own testbench.
export function hasTestbench(code) {
  return /\$dumpvars/.test(stripComments(code));
}

// All `module <name>` declarations, in order.
function moduleNames(code) {
  const names = [];
  const re = /\bmodule\s+([A-Za-z_]\w*)/g;
  let m;
  while ((m = re.exec(code))) names.push(m[1]);
  return names;
}

// Pick the top module: prefer one literally named `top`; else the module not
// instantiated by any other; else the first declared.
function pickTop(code, names) {
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
function parsePorts(code, topName) {
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

/**
 * Generates a constraint-aware testbench that emulates the Tang Nano 9K board.
 *
 * Unlike generateTestbench (which is a generic auto-stimulus), this harness:
 *  - drives the clock at 27 MHz (or the period from the SDC if provided)
 *  - initialises all buttons active-HIGH (released / not pressed, active-LOW hardware)
 *  - pulses each button active-LOW twice during the simulation for stimulus coverage
 *  - wires peripheral models (uart_monitor, spi_flash, sd_spi, hdmi_sink) when requested
 *  - dumps all harness nets and DUT ports into the VCD
 *
 * @param {string} code           Verilog source (design under test)
 * @param {object} [cstResult]    Parsed CST ({ioPins, ioAttrs}) — may be null
 * @param {object} [sdcResult]    Parsed SDC ({clocks}) — may be null
 * @param {string[]} [peripherals] Peripheral IDs to wire: 'uart'|'flash'|'sd'|'hdmi'
 * @param {object} [opts]
 * @param {number} [opts.durationNs]  Simulation wall-time in ns. Default: 2 000 000 (2 ms)
 * @param {number} [opts.baudRate]    UART baud rate. Default: 115200
 * @returns {string} Verilog testbench source to concatenate after the design
 */
export function generateBoardHarness(code, cstResult = null, sdcResult = null, peripherals = [], opts = {}) {
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

  // ---- Classify ports ----
  const inputs  = ports.filter(p => p.dir === 'input');
  const outputs = ports.filter(p => p.dir === 'output' || p.dir === 'inout');

  // Identify well-known port roles by name heuristic
  const clockPort  = inputs.find(p => isClock(p.name));
  const btnPorts   = inputs.filter(p => /^btn/.test(p.name));
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
  // initialise them (iverilog: "Unable to assign to unresolved wires").
  const drivenInputs = new Set();
  if (wantFlash && flashPorts.miso) drivenInputs.add(flashPorts.miso);
  if (wantSd && sdPorts.miso) drivenInputs.add(sdPorts.miso);

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

  // Remaining input initialisation (non-clock, non-button, not model-driven)
  const otherInits = inputs
    .filter(p => p !== clockPort && !btnPorts.includes(p) && !drivenInputs.has(p))
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
    '',
    `  ${top} dut (${conns.join(', ')});`,
    '',
    peripheralInst.join('\n'),
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
    'endmodule',
    '',
  ].join('\n');
}
