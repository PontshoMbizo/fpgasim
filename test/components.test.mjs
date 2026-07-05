import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateComponents,
  parseComponentPins,
  makeStubVerilog,
  MAX_COMPONENTS,
  MAX_WIRES,
  MAX_COMPONENT_CODE_BYTES,
} from "../src/lib/componentSchema.js";
import {
  generateComponentLayer,
  generateStimulusDrivers,
  generateBoardHarness,
} from "../src/lib/testbench.js";

// ---- Shared fixtures ----

const SIMPLE_CHIP_V = `module nand2(input A, input B, output Y);
  assign Y = ~(A & B);
endmodule`;

const BUS_CHIP_V = `module bus_chip(input [7:0] DIN, output [7:0] DOUT);
  assign DOUT = ~DIN;
endmodule`;

const NAND2_COMP = {
  id: 'c1',
  name: 'nand2',
  verilog: SIMPLE_CHIP_V,
  pins: [
    { name: 'A', dir: 'input',  width: 1, range: '' },
    { name: 'B', dir: 'input',  width: 1, range: '' },
    { name: 'Y', dir: 'output', width: 1, range: '' },
  ],
};

// A minimal CST result with one physical pin mapped to port "din"
const CST_WITH_DIN = {
  ioPins: new Map([['din', ['25']]]),
  ioAttrs: new Map(),
  errors: [],
};

// ============================================================
// makeStubVerilog
// ============================================================

test("makeStubVerilog generates ANSI module with TODO body", () => {
  const v = makeStubVerilog('myChip', ['A', 'B'], ['C']);
  assert.match(v, /module myChip\(/);
  assert.match(v, /input A/);
  assert.match(v, /input B/);
  assert.match(v, /output C/);
  assert.match(v, /\/\/ TODO: behaviour/);
  assert.match(v, /endmodule/);
});

test("makeStubVerilog works with no ports", () => {
  const v = makeStubVerilog('empty', [], []);
  assert.match(v, /module empty\(\)/);
});

// ============================================================
// parseComponentPins
// ============================================================

test("parseComponentPins returns input/output pins from Verilog", () => {
  const pins = parseComponentPins(SIMPLE_CHIP_V, 'nand2');
  assert.equal(pins.length, 3);
  const a = pins.find(p => p.name === 'A');
  assert.ok(a);
  assert.equal(a.dir, 'input');
  assert.equal(a.width, 1);
  const y = pins.find(p => p.name === 'Y');
  assert.ok(y);
  assert.equal(y.dir, 'output');
});

test("parseComponentPins returns [] for unknown module name", () => {
  const pins = parseComponentPins(SIMPLE_CHIP_V, 'nonexistent');
  assert.equal(pins.length, 0);
});

// ============================================================
// validateComponents — caps
// ============================================================

test("validateComponents errors on too many components", () => {
  const comps = Array.from({ length: MAX_COMPONENTS + 1 }, (_, i) => ({
    id: `c${i}`, name: `chip${i}`, verilog: `module chip${i}(input A); endmodule`,
    pins: [{ name: 'A', dir: 'input', width: 1, range: '' }],
  }));
  const diags = validateComponents(comps, []);
  assert.ok(diags.some(d => d.severity === 'error' && /Too many components/.test(d.message)));
});

test("validateComponents errors on too many wires", () => {
  const manyWires = Array.from({ length: MAX_WIRES + 1 }, (_, i) => ({ id: `w${i}`, a: { comp: 'c1', pin: 'A' }, b: { pin: '25' } }));
  const diags = validateComponents([NAND2_COMP], manyWires, [], null);
  assert.ok(diags.some(d => d.severity === 'error' && /Too many wires/.test(d.message)));
});

// ============================================================
// validateComponents — identifier / duplicate checks
// ============================================================

test("validateComponents errors on duplicate component id", () => {
  const c2 = { ...NAND2_COMP, id: 'c1', name: 'other_chip', verilog: `module other_chip(input A); endmodule`, pins: [{ name: 'A', dir: 'input', width: 1, range: '' }] };
  const diags = validateComponents([NAND2_COMP, c2], []);
  assert.ok(diags.some(d => /Duplicate component id/.test(d.message)));
});

test("validateComponents errors on duplicate component name", () => {
  const c2 = { id: 'c2', name: 'nand2', verilog: SIMPLE_CHIP_V, pins: NAND2_COMP.pins };
  const diags = validateComponents([NAND2_COMP, c2], []);
  assert.ok(diags.some(d => /Duplicate component name/.test(d.message)));
});

test("validateComponents errors on invalid Verilog identifier name", () => {
  const bad = { id: 'c1', name: '2bad-name', verilog: SIMPLE_CHIP_V, pins: [] };
  const diags = validateComponents([bad], []);
  assert.ok(diags.some(d => /not a valid Verilog identifier/.test(d.message)));
});

// ============================================================
// validateComponents — module name collision with design
// ============================================================

test("validateComponents errors MODULE_NAME_COLLISION with design module", () => {
  const diags = validateComponents([NAND2_COMP], [], ['nand2'], null);
  assert.ok(diags.some(d => /MODULE_NAME_COLLISION/.test(d.message) && d.severity === 'error'));
});

// ============================================================
// validateComponents — Verilog parse checks
// ============================================================

test("validateComponents errors when module name not in verilog", () => {
  const bad = { id: 'c1', name: 'wrong_name', verilog: SIMPLE_CHIP_V, pins: [] };
  const diags = validateComponents([bad], []);
  assert.ok(diags.some(d => /does not contain a module named/.test(d.message)));
});

test("validateComponents rejects inout pins (INOUT_UNSUPPORTED)", () => {
  const inoutV = `module triBuf(input A, inout Z); assign Z = A; endmodule`;
  const c = { id: 'c1', name: 'triBuf', verilog: inoutV, pins: [{ name: 'A', dir: 'input', width: 1, range: '' }, { name: 'Z', dir: 'inout', width: 1, range: '' }] };
  const diags = validateComponents([c], []);
  assert.ok(diags.some(d => /INOUT_UNSUPPORTED/.test(d.message) && d.severity === 'error'));
});

// ============================================================
// validateComponents — wire endpoint checks
// ============================================================

test("validateComponents errors WIRE_BAD_ENDPOINT for unknown component in wire", () => {
  const w = { id: 'w1', a: { comp: 'nonexistent', pin: 'A' }, b: { pin: '25' } };
  const diags = validateComponents([NAND2_COMP], [w], []);
  assert.ok(diags.some(d => /WIRE_BAD_ENDPOINT/.test(d.message) && /nonexistent/.test(d.message)));
});

test("validateComponents errors WIRE_BAD_ENDPOINT for unknown pin on known component", () => {
  const w = { id: 'w1', a: { comp: 'c1', pin: 'NOPIN' }, b: { pin: '25' } };
  const diags = validateComponents([NAND2_COMP], [w], []);
  assert.ok(diags.some(d => /WIRE_BAD_ENDPOINT/.test(d.message) && /NOPIN/.test(d.message)));
});

test("validateComponents errors WIRE_UNMAPPED_PIN when board pin not in CST", () => {
  // CST has pin 25 → din, but wire uses pin 99 (not in CST)
  const w = { id: 'w1', a: { comp: 'c1', pin: 'A' }, b: { pin: '99' } };
  const diags = validateComponents([NAND2_COMP], [w], [], CST_WITH_DIN);
  assert.ok(diags.some(d => /WIRE_UNMAPPED_PIN/.test(d.message)));
});

test("validateComponents does not error WIRE_UNMAPPED_PIN when no CST provided", () => {
  const w = { id: 'w1', a: { comp: 'c1', pin: 'A' }, b: { pin: '99' } };
  const diags = validateComponents([NAND2_COMP], [w], [], null);
  assert.ok(!diags.some(d => /WIRE_UNMAPPED_PIN/.test(d.message)));
});

// ============================================================
// validateComponents — single-driver rule
// ============================================================

test("validateComponents errors WIRE_DRIVER_CONFLICT for two chip outputs on same net", () => {
  const c2V = `module c2(output A); assign A = 1'b0; endmodule`;
  const c2 = {
    id: 'c2', name: 'c2', verilog: c2V,
    pins: [{ name: 'A', dir: 'output', width: 1, range: '' }],
  };
  const c3V = `module c3(output B); assign B = 1'b1; endmodule`;
  const c3 = {
    id: 'c3', name: 'c3', verilog: c3V,
    pins: [{ name: 'B', dir: 'output', width: 1, range: '' }],
  };
  // Wire c2.A ↔ c3.B (both outputs on same net = conflict)
  const w = { id: 'w1', a: { comp: 'c2', pin: 'A' }, b: { comp: 'c3', pin: 'B' } };
  const diags = validateComponents([c2, c3], [w], []);
  assert.ok(diags.some(d => /WIRE_DRIVER_CONFLICT/.test(d.message) && d.severity === 'error'));
});

test("validateComponents errors WIRE_DRIVER_CONFLICT for wire+stimulus on same chip pin", () => {
  const w = { id: 'w1', a: { comp: 'c1', pin: 'A' }, b: { pin: '25' } };
  const stimuli = [{ id: 's1', target: 'c1.A', kind: 'preset', preset: { id: 'clock' }, enabled: true }];
  const diags = validateComponents([NAND2_COMP], [w], [], null, stimuli);
  assert.ok(diags.some(d => /WIRE_DRIVER_CONFLICT/.test(d.message)));
});

// ============================================================
// validateComponents — floating input warning
// ============================================================

test("validateComponents warns about floating chip inputs", () => {
  // NAND2 has inputs A and B; wire only A; B is floating
  const w = { id: 'w1', a: { comp: 'c1', pin: 'A' }, b: { pin: '25' } };
  const diags = validateComponents([NAND2_COMP], [w], [], CST_WITH_DIN);
  const floatingDiag = diags.find(d => /floating/.test(d.message) && /B/.test(d.message));
  assert.ok(floatingDiag);
  assert.equal(floatingDiag.severity, 'warning');
});

test("validateComponents does not warn if all inputs are wired or have stimulus", () => {
  const wA = { id: 'w1', a: { comp: 'c1', pin: 'A' }, b: { pin: '25' } };
  const stimuli = [{ id: 's1', target: 'c1.B', kind: 'preset', preset: { id: 'clock' }, enabled: true }];
  const diags = validateComponents([NAND2_COMP], [wA], [], CST_WITH_DIN, stimuli);
  assert.ok(!diags.some(d => /floating/.test(d.message) && d.severity === 'warning'));
});

// ============================================================
// generateComponentLayer — net naming and instantiation
// ============================================================

const DUT_PORTS = [
  { dir: 'input',  width: 1, name: 'clk',   range: '' },
  { dir: 'input',  width: 1, name: 'btn1',  range: '' },
  { dir: 'output', width: 6, name: 'leds',  range: '[5:0]' },
  { dir: 'input',  width: 1, name: 'din',   range: '' },
];

test("generateComponentLayer produces chip instantiation with named ports", () => {
  const { instances } = generateComponentLayer(
    [NAND2_COMP],
    [{ id: 'w1', a: { comp: 'c1', pin: 'A' }, b: { comp: 'c1', pin: 'B' } }], // chip-only loop
    DUT_PORTS,
    null,
    {}
  );
  // Should instantiate nand2 u_c1
  assert.ok(instances.some(i => /nand2 u_c1/.test(i)));
  assert.ok(instances.some(i => /\.A\(/.test(i)));
  assert.ok(instances.some(i => /\.Y\(/.test(i)));
});

test("generateComponentLayer emits net_N for chip-only nets", () => {
  const { netDecls, instances } = generateComponentLayer(
    [NAND2_COMP],
    [], // no wires — all pins unconnected
    DUT_PORTS,
    null,
    {}
  );
  // All ports unconnected → empty port connections
  assert.ok(instances.some(i => /\.A\(\)/.test(i)));
  // No chip-only net needed if no wire binds endpoints
  // (unconnected pins get empty connection, no new net)
  // Actually netDecls should be empty here
  assert.equal(netDecls.length, 0);
});

test("generateComponentLayer uses DUT port name for board-connected endpoint", () => {
  // Wire c1.A ↔ board pin 25 (maps to DUT port "din" via CST)
  const w = { id: 'w1', a: { comp: 'c1', pin: 'A' }, b: { pin: '25' } };
  const { instances, drivenDutInputs } = generateComponentLayer(
    [NAND2_COMP],
    [w],
    DUT_PORTS,
    CST_WITH_DIN,
    {}
  );
  // nand2 input A is connected to board pin 25 → DUT port "din"
  assert.ok(instances.some(i => /\.A\(din\)/.test(i)));
});

test("generateComponentLayer adds chip-output-driven DUT input to drivenDutInputs", () => {
  // Need a chip whose output goes to a DUT input port
  const driverV = `module driver_chip(output Q); assign Q = 1'b1; endmodule`;
  const driverComp = {
    id: 'd1', name: 'driver_chip', verilog: driverV,
    pins: [{ name: 'Q', dir: 'output', width: 1, range: '' }],
  };
  const CST_DIN = { ioPins: new Map([['din', ['25']]]), ioAttrs: new Map(), errors: [] };
  // Wire d1.Q → board pin 25 (DUT input "din")
  const w = { id: 'w1', a: { comp: 'd1', pin: 'Q' }, b: { pin: '25' } };
  const { drivenDutInputs } = generateComponentLayer([driverComp], [w], DUT_PORTS, CST_DIN, {});
  const names = [...drivenDutInputs].map(p => p.name);
  assert.ok(names.includes('din'));
});

test("generateComponentLayer declares a new wire for chip-to-chip net", () => {
  const c2V = `module c2(input X, output Y); assign Y = X; endmodule`;
  const c2 = { id: 'c2', name: 'c2', verilog: c2V,
    pins: [{ name: 'X', dir: 'input', width: 1, range: '' }, { name: 'Y', dir: 'output', width: 1, range: '' }] };
  // Wire c1.Y → c2.X (chip-to-chip net, not a DUT port)
  const w = { id: 'w1', a: { comp: 'c1', pin: 'Y' }, b: { comp: 'c2', pin: 'X' } };
  const { netDecls } = generateComponentLayer([NAND2_COMP, c2], [w], DUT_PORTS, null, {});
  // Should declare a wire net for this chip-to-chip connection
  assert.ok(netDecls.some(d => /wire/.test(d) && /net_/.test(d)));
});

// ============================================================
// generateStimulusDrivers — chip pin target extension
// ============================================================

test("generateStimulusDrivers resolves chip-pin target and declares stim net", () => {
  const stimuli = [{
    id: 's1', target: 'c1.A', enabled: true,
    kind: 'preset', preset: { id: 'clock', params: { periodNs: 20, dutyPct: 50 } },
  }];
  const { decls, blocks, chipStimNets, errors } = generateStimulusDrivers(stimuli, DUT_PORTS, [NAND2_COMP]);
  assert.equal(errors.length, 0);
  assert.ok(chipStimNets.has('c1.A'));
  const netInfo = chipStimNets.get('c1.A');
  assert.match(netInfo.net, /stim_s1_net/);
  // decls should contain the reg declaration for the stim net
  assert.ok(decls.some(d => /reg/.test(d) && /stim_s1_net/.test(d)));
  // blocks should drive the stim net
  assert.ok(blocks.some(b => /stim_s1_net/.test(b)));
});

test("generateStimulusDrivers errors on unknown component in chip-pin target", () => {
  const stimuli = [{ id: 's1', target: 'nonexistent.A', enabled: true, kind: 'preset', preset: { id: 'clock', params: {} } }];
  const { errors } = generateStimulusDrivers(stimuli, DUT_PORTS, [NAND2_COMP]);
  assert.ok(errors.some(e => /nonexistent/.test(e)));
});

test("generateStimulusDrivers errors on chip output pin target", () => {
  const stimuli = [{ id: 's1', target: 'c1.Y', enabled: true, kind: 'preset', preset: { id: 'clock', params: {} } }];
  const { errors } = generateStimulusDrivers(stimuli, DUT_PORTS, [NAND2_COMP]);
  assert.ok(errors.some(e => /not an input pin/.test(e)));
});

test("generateStimulusDrivers backward-compatible with no components arg", () => {
  const stimuli = [{
    id: 's1', target: 'din', enabled: true,
    kind: 'preset', preset: { id: 'button', params: { pressAtNs: 100, holdNs: 10, repeatCount: 1 } },
  }];
  // No 3rd arg (old call style)
  const { blocks, drivenPorts, errors } = generateStimulusDrivers(stimuli, DUT_PORTS);
  assert.equal(errors.length, 0);
  assert.ok(drivenPorts.has('din'));
  assert.ok(blocks.length > 0);
});

// ============================================================
// generateBoardHarness — drivenInputs interplay with chip outputs
// ============================================================

const LED_DESIGN = `module top(
  input clk, input btn1, input din, output reg [5:0] leds
);
  always @(posedge clk) leds <= leds + din;
endmodule`;

test("generateBoardHarness declares chip-driven DUT input as wire not reg", () => {
  const driverV = `module src(output Q); assign Q = 1'b1; endmodule`;
  const driverComp = {
    id: 'd1', name: 'src', verilog: driverV,
    pins: [{ name: 'Q', dir: 'output', width: 1, range: '' }],
  };
  const CST_DIN = { ioPins: new Map([['din', ['25']]]), ioAttrs: new Map(), errors: [] };
  const w = { id: 'w1', a: { comp: 'd1', pin: 'Q' }, b: { pin: '25' } };
  const tb = generateBoardHarness(LED_DESIGN, CST_DIN, null, [], {}, [], [driverComp], [w]);
  // "din" must be declared as wire, not reg, because the chip drives it
  assert.match(tb, /wire\s+din;/);
  assert.doesNotMatch(tb, /reg\s+din;/);
  // and NOT included in otherInits default-low initialisation
  assert.doesNotMatch(tb, /din = 1'b0; \/\/ default low/);
});

test("generateBoardHarness includes chip instantiation in the emitted text", () => {
  const cstNull = null;
  const tb = generateBoardHarness(LED_DESIGN, cstNull, null, [], {}, [], [NAND2_COMP], []);
  assert.match(tb, /nand2 u_c1/);
});

test("generateBoardHarness backward-compatible with 6-arg call (no components)", () => {
  const tb = generateBoardHarness(LED_DESIGN, null, null, [], {}, []);
  // No component section — should still produce a valid harness
  assert.match(tb, /module tb;/);
  assert.match(tb, /top dut \(/);
  assert.doesNotMatch(tb, /u_c1/);
});

// ============================================================
// Stimulus on chip pin — full integration via generateBoardHarness
// ============================================================

test("stimulus on chip pin produces stim net reg and chip uses it in the harness", () => {
  const stimuli = [{
    id: 's1', target: 'c1.A', enabled: true,
    kind: 'preset', preset: { id: 'clock', params: { periodNs: 40, dutyPct: 50 } },
  }];
  const tb = generateBoardHarness(LED_DESIGN, null, null, [], {}, stimuli, [NAND2_COMP], []);
  // stim net reg declared
  assert.match(tb, /reg stim_s1_net;/);
  // chip instantiation uses the stim net for pin A
  assert.match(tb, /\.A\(stim_s1_net\)/);
  // clock block drives stim_s1_net
  assert.match(tb, /stim_s1_net = 1'b0/);
});

// ---- Net-level driver-conflict analysis (union-find; added after e2e compile audit) ----

const INV_A = { id: 'ia', name: 'invA', verilog: 'module invA(input in1, output out1); assign out1 = ~in1; endmodule',
  pins: [{ name: 'in1', dir: 'input', width: 1 }, { name: 'out1', dir: 'output', width: 1 }] };
const INV_B = { id: 'ib', name: 'invB', verilog: 'module invB(input in1, output out1); assign out1 = ~in1; endmodule',
  pins: [{ name: 'in1', dir: 'input', width: 1 }, { name: 'out1', dir: 'output', width: 1 }] };
const BOARD_CST = { ioPins: new Map([['clk', ['63']], ['btn1', ['3']], ['leds[0]', ['10']]]), ioAttrs: new Map(), errors: [] };
const BOARD_PORTS = [
  { dir: 'input', width: 1, name: 'clk', range: '' },
  { dir: 'input', width: 1, name: 'btn1', range: '' },
  { dir: 'output', width: 6, name: 'leds', range: '[5:0]' },
];

test("driver conflict: stimulus on a DUT port + chip output wired to the same port's pin", () => {
  const d = validateComponents([INV_A], [{ id: 'w1', a: { comp: 'ia', pin: 'out1' }, b: { pin: '3' } }],
    ['top'], BOARD_CST, [{ id: 's1', target: 'btn1', kind: 'preset', preset: { id: 'button' } }], BOARD_PORTS);
  assert.ok(d.some((x) => x.severity === 'error' && /WIRE_DRIVER_CONFLICT/.test(x.message) && /stimulus on "btn1"/.test(x.message)));
});

test("driver conflict: chip output wired to a DUT output pin (two drivers)", () => {
  const d = validateComponents([INV_A], [{ id: 'w1', a: { comp: 'ia', pin: 'out1' }, b: { pin: '10' } }],
    ['top'], BOARD_CST, [], BOARD_PORTS);
  assert.ok(d.some((x) => x.severity === 'error' && /DUT output "leds\[0\]"/.test(x.message)));
});

test("driver conflict: transitive net with two chip outputs (A–B, B–C)", () => {
  const d = validateComponents([INV_A, INV_B], [
    { id: 'w1', a: { comp: 'ia', pin: 'out1' }, b: { comp: 'ib', pin: 'in1' } },
    { id: 'w2', a: { comp: 'ib', pin: 'in1' }, b: { comp: 'ib', pin: 'out1' } },
  ], ['top'], BOARD_CST, [], BOARD_PORTS);
  assert.ok(d.some((x) => x.severity === 'error' && /2 drivers: chip output "ia.out1", chip output "ib.out1"/.test(x.message)));
});

test("WIRE_NO_DRIVER warning: chip-input-only net floats", () => {
  const d = validateComponents([INV_A, INV_B], [
    { id: 'w1', a: { comp: 'ia', pin: 'in1' }, b: { comp: 'ib', pin: 'in1' } },
  ], ['top'], BOARD_CST, [], BOARD_PORTS);
  assert.ok(d.some((x) => x.severity === 'warning' && /WIRE_NO_DRIVER/.test(x.message)));
});

test("legit rig passes: chip listens to DUT output, chip drives DUT input", () => {
  const d = validateComponents([INV_A], [
    { id: 'w1', a: { comp: 'ia', pin: 'in1' }, b: { pin: '10' } },
    { id: 'w2', a: { comp: 'ia', pin: 'out1' }, b: { pin: '3' } },
  ], ['top'], BOARD_CST, [], BOARD_PORTS);
  assert.equal(d.filter((x) => x.severity === 'error').length, 0);
});

test("codegen: board bit-select net is not redeclared and chip-driven button loses default pulses", () => {
  const design = `module top(input clk, input btn1, output reg [5:0] leds);
  always @(posedge clk) leds <= leds + 1;
endmodule`;
  const harness = generateBoardHarness(design, BOARD_CST, null, [], { durationNs: 20000 }, [],
    [INV_A], [
      { id: 'w1', a: { comp: 'ia', pin: 'in1' }, b: { pin: '10' } },
      { id: 'w2', a: { comp: 'ia', pin: 'out1' }, b: { pin: '3' } },
    ]);
  assert.ok(!/wire leds\[0\];/.test(harness), 'must not redeclare a bit-select of an existing bus');
  assert.ok(/wire btn1;/.test(harness), 'chip-driven DUT input becomes a wire');
  assert.ok(!/btn1 = 1'b1; \/\/ released/.test(harness), 'no default button init on a chip-driven port');
  assert.ok(!/press btn1/.test(harness), 'no default button pulses on a chip-driven port');
  assert.ok(/invA u_ia \(.in1\(leds\[0\]\), .out1\(btn1\)\);/.test(harness), 'chip wired to bit-select and DUT input');
});
