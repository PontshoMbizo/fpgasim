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
