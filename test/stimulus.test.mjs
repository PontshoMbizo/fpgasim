import { test } from "node:test";
import assert from "node:assert/strict";
import { generateStimulusDrivers, generateBoardHarness } from "../src/lib/testbench.js";
import { validateStimuli, validateStimulusShape } from "../src/lib/stimulusSchema.js";

// generateStimulusDrivers turns wire-format stimulus descriptors into Verilog fragments
// that drive a DUT input port, and generateBoardHarness splices them into the compiled
// board testbench in place of (or alongside) its own default clock/button heuristics.

const PORTS = [
  { dir: "input", width: 1, name: "clk", range: "" },
  { dir: "input", width: 1, name: "btn1", range: "" },
  { dir: "input", width: 8, name: "antenna_in", range: "[7:0]" },
  { dir: "output", width: 6, name: "leds", range: "[5:0]" },
];

const LED_DESIGN = `module top(
  input clk, input btn1, input [7:0] antenna_in, output reg [5:0] leds
);
  always @(posedge clk) leds <= leds + antenna_in;
endmodule`;

test("clock/pwm preset generates a forever toggle block", () => {
  const stimuli = [{ id: "s1", target: "btn1", enabled: true, kind: "preset", preset: { id: "clock", params: { periodNs: 20, dutyPct: 50 } } }];
  const { blocks, drivenPorts, errors } = generateStimulusDrivers(stimuli, PORTS);
  assert.equal(errors.length, 0);
  assert.ok(drivenPorts.has("btn1"));
  assert.match(blocks.join("\n"), /forever begin/);
  assert.match(blocks.join("\n"), /#10\.0000 btn1 = 1'b1;/);
});

test("button preset generates a repeat pulse block", () => {
  const stimuli = [{ id: "s1", target: "btn1", enabled: true, kind: "preset", preset: { id: "button", params: { pressAtNs: 300, holdNs: 60, repeatCount: 3 } } }];
  const { blocks } = generateStimulusDrivers(stimuli, PORTS);
  assert.match(blocks.join("\n"), /repeat \(3\) begin/);
  assert.match(blocks.join("\n"), /#300 btn1 = 1'b0; \/\/ press/);
});

test("sine preset uses a real phase accumulator and $sin", () => {
  const stimuli = [{ id: "s1", target: "antenna_in", enabled: true, kind: "preset", preset: { id: "sine", params: { amplitude: 50, offset: 100, freqHz: 1000 } } }];
  const { decls, blocks } = generateStimulusDrivers(stimuli, PORTS);
  assert.match(decls.join("\n"), /real stim_s1_theta;/);
  assert.match(blocks.join("\n"), /\$sin\(stim_s1_theta\)/);
});

test("prbs preset is continuously assigned and marked wire-driven", () => {
  const stimuli = [{ id: "s1", target: "antenna_in", enabled: true, kind: "preset", preset: { id: "prbs", params: {} } }];
  const { blocks, wireDrivenPorts } = generateStimulusDrivers(stimuli, PORTS);
  assert.ok(wireDrivenPorts.has("antenna_in"));
  assert.match(blocks.join("\n"), /assign antenna_in = stim_s1_lfsr\[0\];/);
});

test("samples kind packs values into a flattened ROM with indexed part-select", () => {
  const stimuli = [{ id: "s1", target: "antenna_in", enabled: true, kind: "samples", samples: { width: 8, stepNs: 100, startNs: 0, values: [1, 2, 255], hold: "last" } }];
  const { decls, blocks, drivenPorts } = generateStimulusDrivers(stimuli, PORTS);
  assert.ok(drivenPorts.has("antenna_in"));
  assert.match(decls.join("\n"), /reg \[stim_s1_n\*8-1:0\] stim_s1_rom = \{8'h01, 8'h02, 8'hff\};/);
  assert.match(blocks.join("\n"), /for \(stim_s1_i = 0; stim_s1_i < stim_s1_n; stim_s1_i = stim_s1_i \+ 1\)/);
});

test("verilog/procedural kind splices raw code as its own block", () => {
  const stimuli = [{ id: "s1", target: "antenna_in", enabled: true, kind: "verilog", verilog: { mode: "procedural", code: "  initial antenna_in = 8'hAA;" } }];
  const { blocks, drivenPorts, wireDrivenPorts } = generateStimulusDrivers(stimuli, PORTS);
  assert.ok(drivenPorts.has("antenna_in"));
  assert.ok(!wireDrivenPorts.has("antenna_in"));
  assert.match(blocks.join("\n"), /initial antenna_in = 8'hAA;/);
});

test("verilog/instance kind splices as an instance and marks the target wire-driven", () => {
  const stimuli = [{
    id: "s1", target: "antenna_in", enabled: true, kind: "verilog",
    verilog: { mode: "instance", code: "  my_source src(.out(antenna_in));" },
  }];
  const { instances, wireDrivenPorts } = generateStimulusDrivers(stimuli, PORTS);
  assert.ok(wireDrivenPorts.has("antenna_in"));
  assert.match(instances.join("\n"), /my_source src\(\.out\(antenna_in\)\);/);
});

test("skips (with an error) a target that isn't an input port", () => {
  const stimuli = [{ id: "s1", target: "leds", enabled: true, kind: "preset", preset: { id: "clock", params: {} } }];
  const { blocks, errors } = generateStimulusDrivers(stimuli, PORTS);
  assert.equal(blocks.length, 0);
  assert.match(errors.join("\n"), /not an input port/);
});

test("skips a second stimulus that collides with an already-claimed target", () => {
  const stimuli = [
    { id: "s1", target: "btn1", enabled: true, kind: "preset", preset: { id: "clock", params: {} } },
    { id: "s2", target: "btn1", enabled: true, kind: "preset", preset: { id: "button", params: {} } },
  ];
  const { blocks, errors } = generateStimulusDrivers(stimuli, PORTS);
  assert.equal(blocks.length, 1);
  assert.match(errors.join("\n"), /already driven/);
});

test("disabled stimulus blocks are ignored", () => {
  const stimuli = [{ id: "s1", target: "btn1", enabled: false, kind: "preset", preset: { id: "clock", params: {} } }];
  const { blocks, drivenPorts } = generateStimulusDrivers(stimuli, PORTS);
  assert.equal(blocks.length, 0);
  assert.equal(drivenPorts.size, 0);
});

// ---- Integration into generateBoardHarness ----

test("a stimulus on btn1 suppresses the default button-pulse block for btn1", () => {
  const stimuli = [{ id: "s1", target: "btn1", enabled: true, kind: "preset", preset: { id: "button", params: { pressAtNs: 999, holdNs: 10, repeatCount: 1 } } }];
  const tb = generateBoardHarness(LED_DESIGN, null, null, [], {}, stimuli);
  assert.doesNotMatch(tb, /\/\/ press btn1/); // default template's comment marker
  assert.match(tb, /stimulus s1: button pulse on btn1/);
  assert.match(tb, /#999 btn1 = 1'b0; \/\/ press/);
});

test("a stimulus on the clock port suppresses the default 27MHz driver", () => {
  const stimuli = [{ id: "s1", target: "clk", enabled: true, kind: "preset", preset: { id: "clock", params: { periodNs: 100, dutyPct: 50 } } }];
  const tb = generateBoardHarness(LED_DESIGN, null, null, [], {}, stimuli);
  assert.doesNotMatch(tb, /always #18\.5185 clk = ~clk;/);
  assert.match(tb, /stimulus s1: clock\/pwm on clk/);
});

test("a samples-kind stimulus on a non-heuristic port declares its ROM and drives it", () => {
  const stimuli = [{ id: "s1", target: "antenna_in", enabled: true, kind: "samples", samples: { width: 8, stepNs: 50, startNs: 0, values: [10, 20, 30], hold: "last" } }];
  const tb = generateBoardHarness(LED_DESIGN, null, null, [], {}, stimuli);
  assert.match(tb, /stim_s1_rom/);
  assert.doesNotMatch(tb, /antenna_in = 8'b00000000; \/\/ default low/);
});

// ---- Schema validation ----

test("validateStimulusShape rejects an unknown kind", () => {
  const errors = validateStimulusShape({ id: "s1", target: "btn1", kind: "bogus" });
  assert.match(errors.join("\n"), /unknown kind/);
});

test("validateStimuli flags an unknown target and a direction mismatch", () => {
  const diagnostics = validateStimuli(
    [
      { id: "s1", target: "does_not_exist", kind: "preset", preset: { id: "clock" } },
      { id: "s2", target: "leds", kind: "preset", preset: { id: "clock" } },
    ],
    PORTS
  );
  assert.ok(diagnostics.some((d) => /not a port on the design/.test(d.message)));
  assert.ok(diagnostics.some((d) => /not an input port/.test(d.message)));
});

test("validateStimuli flags duplicate targets and an oversized sample budget", () => {
  const bigValues = new Array(9000).fill(0);
  const diagnostics = validateStimuli(
    [
      { id: "s1", target: "btn1", kind: "preset", preset: { id: "clock" } },
      { id: "s2", target: "btn1", kind: "preset", preset: { id: "button" } },
      { id: "s3", target: "antenna_in", kind: "samples", samples: { values: bigValues.slice(0, 4096), stepNs: 10 } },
    ],
    PORTS
  );
  assert.ok(diagnostics.some((d) => /Multiple stimulus blocks target/.test(d.message)));
});
