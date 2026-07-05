import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSnapshot,
  parseSnapshot,
  parseStimulusWaveformJson,
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
} from "../src/lib/snapshot.js";
import { MAX_COMPONENTS, MAX_WIRES } from "../src/lib/componentSchema.js";
import { MAX_STIMULI, MAX_SAMPLES_PER_STIMULUS } from "../src/lib/stimulusSchema.js";

// ============================================================
// buildSnapshot
// ============================================================

test("buildSnapshot produces the required top-level fields", () => {
  const snap = buildSnapshot({ design: "module top; endmodule", durationNs: 5000 });
  assert.equal(snap.format, SNAPSHOT_FORMAT);
  assert.equal(snap.version, SNAPSHOT_VERSION);
  assert.equal(snap.board, 'tang-nano-9k');
  assert.equal(snap.design, "module top; endmodule");
  assert.equal(snap.durationNs, 5000);
  assert.ok(Array.isArray(snap.stimuli));
  assert.ok(Array.isArray(snap.components));
  assert.ok(Array.isArray(snap.wires));
});

test("buildSnapshot fills in defaults for missing fields", () => {
  const snap = buildSnapshot({});
  assert.equal(snap.design, '');
  assert.equal(snap.testbench, '');
  assert.equal(snap.cst, '');
  assert.equal(snap.sdc, '');
  assert.equal(snap.durationNs, null);
  assert.deepEqual(snap.peripherals, []);
  assert.deepEqual(snap.stimuli, []);
  assert.deepEqual(snap.components, []);
  assert.deepEqual(snap.wires, []);
});

test("buildSnapshot copies arrays by value (not by reference)", () => {
  const original = [{ id: 'c1' }];
  const snap = buildSnapshot({ components: original });
  original.push({ id: 'c2' });
  assert.equal(snap.components.length, 1); // not affected by push
});

// ============================================================
// parseSnapshot — round-trip
// ============================================================

test("parseSnapshot round-trips a buildSnapshot output", () => {
  const state = {
    design: "module top(input clk); endmodule",
    testbench: "",
    cst: "IO_LOC \"clk\" 35;",
    durationNs: 2_000_000,
    peripherals: ['uart'],
    stimuli: [{ id: 's1', target: 'clk', kind: 'preset', preset: { id: 'clock' } }],
    components: [{ id: 'c1', name: 'myChip', verilog: 'module myChip(input A); endmodule', pins: [] }],
    wires: [{ id: 'w1', a: { comp: 'c1', pin: 'A' }, b: { pin: '35' } }],
  };
  const json = JSON.stringify(buildSnapshot(state));
  const result = parseSnapshot(json);
  assert.ok(result.ok, `Expected ok, got errors: ${result.errors?.join(', ')}`);
  assert.equal(result.snapshot.design, state.design);
  assert.equal(result.snapshot.durationNs, state.durationNs);
  assert.deepEqual(result.snapshot.peripherals, ['uart']);
  assert.equal(result.snapshot.components.length, 1);
  assert.equal(result.snapshot.wires.length, 1);
});

test("parseSnapshot also accepts a pre-parsed object", () => {
  const snap = buildSnapshot({ design: "// hi" });
  const result = parseSnapshot(snap);
  assert.ok(result.ok);
  assert.equal(result.snapshot.design, "// hi");
});

// ============================================================
// parseSnapshot — format/version gate
// ============================================================

test("parseSnapshot errors on wrong format string", () => {
  const result = parseSnapshot(JSON.stringify({ format: 'other-tool', version: 1 }));
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /format/.test(e)));
});

test("parseSnapshot errors on wrong version number", () => {
  const result = parseSnapshot(JSON.stringify({ format: SNAPSHOT_FORMAT, version: 99 }));
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /version/.test(e)));
});

test("parseSnapshot errors on invalid JSON string", () => {
  const result = parseSnapshot("{ this is not json }");
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /Invalid JSON/.test(e)));
});

test("parseSnapshot errors on null input", () => {
  const result = parseSnapshot(null);
  assert.ok(!result.ok);
});

// ============================================================
// parseSnapshot — cap enforcement
// ============================================================

test("parseSnapshot errors when components count exceeds cap", () => {
  const snap = buildSnapshot({});
  snap.components = Array.from({ length: MAX_COMPONENTS + 1 }, (_, i) => ({ id: `c${i}` }));
  const result = parseSnapshot(snap);
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /components/.test(e) && /cap/.test(e)));
});

test("parseSnapshot errors when wires count exceeds cap", () => {
  const snap = buildSnapshot({});
  snap.wires = Array.from({ length: MAX_WIRES + 1 }, (_, i) => ({ id: `w${i}` }));
  const result = parseSnapshot(snap);
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /wires/.test(e) && /cap/.test(e)));
});

test("parseSnapshot errors when stimuli count exceeds cap", () => {
  const snap = buildSnapshot({});
  snap.stimuli = Array.from({ length: MAX_STIMULI + 1 }, (_, i) => ({ id: `s${i}` }));
  const result = parseSnapshot(snap);
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /stimuli/.test(e) && /cap/.test(e)));
});

test("parseSnapshot errors when a stimulus sample count exceeds cap", () => {
  const snap = buildSnapshot({});
  snap.stimuli = [{
    id: 's1', target: 'clk', kind: 'samples',
    samples: { values: new Array(MAX_SAMPLES_PER_STIMULUS + 1).fill(0), stepNs: 10 },
  }];
  const result = parseSnapshot(snap);
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /sample count/.test(e)));
});

// ============================================================
// parseSnapshot — sanitisation (unknown keys stripped, types coerced)
// ============================================================

test("parseSnapshot strips unknown top-level keys", () => {
  const snap = buildSnapshot({ design: "// test" });
  snap.injectedKey = "malicious";
  const result = parseSnapshot(snap);
  assert.ok(result.ok);
  assert.ok(!('injectedKey' in result.snapshot));
});

test("parseSnapshot coerces missing string fields to empty string", () => {
  const snap = buildSnapshot({});
  delete snap.design;
  delete snap.cst;
  const result = parseSnapshot(snap);
  assert.ok(result.ok);
  assert.equal(result.snapshot.design, '');
  assert.equal(result.snapshot.cst, '');
});

test("parseSnapshot coerces missing peripherals to empty array", () => {
  const snap = buildSnapshot({});
  snap.peripherals = "uart"; // wrong type
  const result = parseSnapshot(snap);
  assert.ok(result.ok);
  assert.deepEqual(result.snapshot.peripherals, []);
});

// ============================================================
// parseStimulusWaveformJson — object form
// ============================================================

test("parseStimulusWaveformJson accepts well-formed nikav-stimulus object", () => {
  const obj = {
    format: 'nikav-stimulus', version: 1, kind: 'samples',
    stepNs: 100, values: [0, 1, 0, 1], target: 'clk',
  };
  const result = parseStimulusWaveformJson(JSON.stringify(obj));
  assert.ok(result.ok, `Expected ok, got: ${result.errors?.join(', ')}`);
  assert.deepEqual(result.values, [0, 1, 0, 1]);
  assert.equal(result.stepNs, 100);
  assert.equal(result.target, 'clk');
});

test("parseStimulusWaveformJson errors on wrong format field", () => {
  const result = parseStimulusWaveformJson(JSON.stringify({ format: 'other', version: 1, kind: 'samples', stepNs: 10, values: [0] }));
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /format/.test(e)));
});

test("parseStimulusWaveformJson errors on wrong kind", () => {
  const result = parseStimulusWaveformJson({ format: 'nikav-stimulus', version: 1, kind: 'function', stepNs: 10, values: [0] });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /kind/.test(e)));
});

test("parseStimulusWaveformJson errors on oversized values in object form", () => {
  const result = parseStimulusWaveformJson({
    format: 'nikav-stimulus', version: 1, kind: 'samples',
    stepNs: 10, values: new Array(MAX_SAMPLES_PER_STIMULUS + 1).fill(0),
  });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /maximum/.test(e)));
});

test("parseStimulusWaveformJson errors on missing stepNs", () => {
  const result = parseStimulusWaveformJson({
    format: 'nikav-stimulus', version: 1, kind: 'samples', values: [1, 0],
  });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /stepNs/.test(e)));
});

test("parseStimulusWaveformJson errors on non-numeric values in object form", () => {
  const result = parseStimulusWaveformJson({
    format: 'nikav-stimulus', version: 1, kind: 'samples',
    stepNs: 10, values: [0, 'high', 1],
  });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /numbers/.test(e)));
});

// ============================================================
// parseStimulusWaveformJson — bare array form
// ============================================================

test("parseStimulusWaveformJson accepts a bare numeric array", () => {
  const result = parseStimulusWaveformJson([0, 1, 1, 0, 1]);
  assert.ok(result.ok);
  assert.deepEqual(result.values, [0, 1, 1, 0, 1]);
  assert.equal(result.stepNs, undefined); // caller provides stepNs separately
});

test("parseStimulusWaveformJson accepts a stringified bare array", () => {
  const result = parseStimulusWaveformJson(JSON.stringify([10, 20, 30]));
  assert.ok(result.ok);
  assert.equal(result.values.length, 3);
});

test("parseStimulusWaveformJson errors on empty bare array", () => {
  const result = parseStimulusWaveformJson([]);
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /empty/.test(e)));
});

test("parseStimulusWaveformJson errors on oversized bare array", () => {
  const result = parseStimulusWaveformJson(new Array(MAX_SAMPLES_PER_STIMULUS + 1).fill(0));
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /maximum/.test(e)));
});

test("parseStimulusWaveformJson errors on bare array with non-numeric values", () => {
  const result = parseStimulusWaveformJson([0, 'x', 1]);
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /numbers/.test(e)));
});

test("parseStimulusWaveformJson errors on invalid JSON string", () => {
  const result = parseStimulusWaveformJson("{not json}");
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => /Invalid JSON/.test(e)));
});

test("parseStimulusWaveformJson errors on null/non-object input", () => {
  const result = parseStimulusWaveformJson(42);
  assert.ok(!result.ok);
});
