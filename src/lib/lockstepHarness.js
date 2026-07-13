// Generates the *lockstep harness* for bridge sessions (fulgurlab co-simulation).
// Unlike testbench.js (batch: run N ns, dump a VCD), this harness advances simulated
// time one externally-commanded quantum at a time over stdio, per
// fulgurlab/docs/bridge-protocol.md ("container line protocol"):
//
//   stdin :  T <quantum_ns> <in_hex>\n      advance one quantum with these inputs
//   stdout:  E <t_ns> <out_hex>\n           intra-quantum output change (capped)
//   stdout:  O <t_ns> <out_hex>\n           quantum boundary reply
//   stdout:  X <reason>\n                   simulation ended
//
// Pure Verilog-2012 — no VPI, so the stock iverilog/vvp sandbox image runs it as-is.
// Reuses testbench.js's source parsing so top/port detection matches batch behaviour.

import {
  stripComments,
  moduleNames,
  pickTop,
  parsePorts,
  BOARD_CLOCK_PERIOD_NS,
} from "./testbench.js";

const isClock = (name) => /^(clk|clock)$/i.test(name);

/** Max E lines emitted per quantum before suppression (flood guard). */
export const MAX_EDGE_EVENTS_PER_QUANTUM = 256;

/**
 * Discover the bridge-visible pins of the design.
 * Clock-named inputs are driven internally at the 27 MHz board clock and are NOT
 * exposed over the bridge (a 1 ms quantum cannot carry a 27 MHz clock).
 *
 * @returns {{ top: string, pins: Array<{name:string, dir:"in"|"out", width:number}>,
 *             clockPort: string|null } | { error: string }}
 */
export function describePins(code) {
  const clean = stripComments(code);
  const names = moduleNames(clean);
  if (names.length === 0) return { error: "no module found in source" };
  const top = pickTop(clean, names);
  const ports = parsePorts(clean, top);
  if (ports.length === 0) return { error: `no ANSI port header found on top module \`${top}\`` };

  const pins = [];
  let clockPort = null;
  for (const p of ports) {
    if (p.dir === "inout") return { error: `inout port \`${p.name}\` is not supported over the bridge` };
    if (p.dir === "input" && isClock(p.name)) {
      clockPort = p.name;
      continue;
    }
    // Multi-bit ports become one bridge pin per bit: name[i]
    for (let i = 0; i < p.width; i++) {
      pins.push({
        name: p.width === 1 ? p.name : `${p.name}[${i}]`,
        dir: p.dir === "input" ? "in" : "out",
        port: p.name,
        bit: i,
      });
    }
  }
  return { top, pins, clockPort, ports };
}

/**
 * Build the harness module (appended to the user's source).
 * Bitvector convention (must match the server): LSB (bit 0) of in_hex/out_hex is the
 * FIRST "in"/"out" pin of describePins().pins, respectively.
 */
export function generateLockstepHarness(code, opts = {}) {
  const d = describePins(code);
  if (d.error) return d;
  const { top, pins, clockPort, ports } = d;

  const inPins = pins.filter((p) => p.dir === "in");
  const outPins = pins.filter((p) => p.dir === "out");
  const inW = Math.max(inPins.length, 1);
  const outW = Math.max(outPins.length, 1);
  const clockPeriod = opts.clockPeriodNs ?? BOARD_CLOCK_PERIOD_NS;
  const maxEvents = opts.maxEdgeEvents ?? MAX_EDGE_EVENTS_PER_QUANTUM;

  const decls = [];
  const conns = [];
  for (const p of ports) {
    const range = p.range ? `${p.range} ` : "";
    // Non-clock inputs are wires under continuous assign from __fl_in (X-free from t=0
    // — an event-triggered assign would leave them X until the first *change*).
    const kind = p.dir === "input" && isClock(p.name) ? "reg" : p.dir === "input" ? "wire" : "wire";
    decls.push(`  ${kind} ${range}${p.name};`);
    conns.push(`.${p.name}(${p.name})`);
  }

  // Drive input port bits from __fl_in, and gather the output vector from output bits.
  const inAssigns = inPins.map(
    (p, i) => `  assign ${p.port}${widthSel(p)} = __fl_in[${i}];`
  );
  const outConcat = outPins.length
    ? outPins.map((p) => `${p.port}${widthSel(p)}`).reverse().join(", ")
    : "1'b0";

  const clockBlock = clockPort
    ? `  initial ${clockPort} = 1'b0;\n  always #${fmtNs(clockPeriod / 2)} ${clockPort} = ~${clockPort};`
    : "  // (no clock-named input; design is event-driven from bridge inputs)";

  const text = `
// ---- fulgurlab lockstep harness (auto-generated; bridge-protocol v1) ----
\`timescale 1ns/1ps
module __fl_harness;
${decls.join("\n")}
  reg  [${inW - 1}:0] __fl_in = {${inW}{1'b0}};
  wire [${outW - 1}:0] __fl_out;
  integer __fl_rc, __fl_q, __fl_ev;
  reg [${inW - 1}:0] __fl_in_next;
  // LRM pre-opened stdin descriptor — $fopen("/dev/stdin") is not portable across
  // vvp environments (fails under some sandboxes), this constant always works.
  localparam __FL_STDIN = 32'h8000_0000;

  ${top} __fl_dut (${conns.join(", ")});
  assign __fl_out = {${outConcat}};
${inAssigns.join("\n")}
${clockBlock}

  // Intra-quantum output edges, capped per quantum (flood guard).
  always @(__fl_out) begin
    if (__fl_ev < ${maxEvents}) begin
      $display("E %0d %h", $time, __fl_out);
      $fflush(32'h8000_0001);
    end
    __fl_ev = __fl_ev + 1;
  end

  initial begin
    __fl_ev = 0;
    forever begin
      __fl_rc = $fscanf(__FL_STDIN, " T %d %h", __fl_q, __fl_in_next);
      if (__fl_rc != 2) begin
        $display("X eof");
        $fflush;
        $finish;
      end
      __fl_in = __fl_in_next;
      __fl_ev = 0;
      #(__fl_q);
      $display("O %0d %h", $time, __fl_out);
      $fflush(32'h8000_0001);
    end
  end
endmodule
`;
  return { text, top, pins, clockPort };
}

function widthSel(p) {
  // p.bit selects within multi-bit ports; single-bit ports need no select.
  return p.name.includes("[") ? `[${p.bit}]` : "";
}

function fmtNs(v) {
  // #delay literals: keep sub-ns precision without float noise (37.037/2 → 18.519).
  return Number.isInteger(v) ? String(v) : v.toFixed(3);
}
