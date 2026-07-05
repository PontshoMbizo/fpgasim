import { test } from "node:test";
import assert from "node:assert/strict";
import { functionToSamples } from "../src/lib/stimulusSampling.js";
import { MAX_SAMPLES_PER_STIMULUS } from "../src/lib/stimulusSchema.js";

test("produces the expected sample count for a given duration/rate", () => {
  const s = functionToSamples({ generator: "sine", durationNs: 1_000_000, sampleRateHz: 1_000_000 }, 8);
  // 1ms at 1MHz -> 1000 samples, clamped under the per-stimulus cap
  assert.equal(s.values.length, 1000);
  assert.ok(s.stepNs > 0);
});

test("never exceeds MAX_SAMPLES_PER_STIMULUS even for a huge nominal rate", () => {
  const s = functionToSamples({ generator: "sine", durationNs: 33_000_000, sampleRateHz: 44_100 }, 8);
  assert.ok(s.values.length <= MAX_SAMPLES_PER_STIMULUS);
});

test("sine values stay within the clamped port-width range", () => {
  const width = 8;
  const s = functionToSamples({ generator: "sine", durationNs: 1000, sampleRateHz: 1e9, params: { amplitude: 127, offset: 128, freqHz: 1e6 } }, width);
  for (const v of s.values) {
    assert.ok(v >= 0 && v <= 255, `value ${v} out of range`);
  }
});

test("sine at phase 90deg starts at its peak (offset + amplitude)", () => {
  const width = 8;
  const s = functionToSamples({ generator: "sine", durationNs: 10, sampleRateHz: 1e9, params: { amplitude: 100, offset: 100, freqHz: 1e6, phaseDeg: 90 } }, width);
  assert.equal(s.values[0], 200); // clamp(100 + 100*sin(pi/2)) = clamp(200)
});

test("square wave alternates between offset+amplitude and offset-amplitude", () => {
  const width = 8;
  const s = functionToSamples({ generator: "square", durationNs: 1000, sampleRateHz: 1e9, params: { amplitude: 50, offset: 100, freqHz: 1e6, duty: 50 } }, width);
  const distinct = new Set(s.values);
  assert.ok([...distinct].every((v) => v === 150 || v === 50));
});

test("unknown generator falls back to a flat offset", () => {
  const s = functionToSamples({ generator: "bogus", durationNs: 100, sampleRateHz: 1e9, params: { offset: 42 } }, 8);
  assert.ok(s.values.every((v) => v === 42));
});
