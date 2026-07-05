// UI catalog for the stimulus preset picker. Pure data — no Verilog here; the actual
// codegen templates live server-side in src/lib/testbench.js (generateStimulusDrivers)
// so the client and server never duplicate codegen logic. This module only drives the
// picker list and default parameter values shown in the config form.

export const STIMULUS_PRESETS = [
  {
    id: "clock",
    label: "Clock",
    description: "A periodic square wave at a fixed period/duty cycle.",
    params: [
      { key: "periodNs", label: "Period (ns)", type: "number", default: 37.037, min: 1 },
      { key: "dutyPct", label: "Duty (%)", type: "number", default: 50, min: 1, max: 99 },
    ],
  },
  {
    id: "pwm",
    label: "PWM",
    description: "Pulse-width modulation — same generator as Clock with an adjustable duty cycle.",
    params: [
      { key: "periodNs", label: "Period (ns)", type: "number", default: 1000, min: 1 },
      { key: "dutyPct", label: "Duty (%)", type: "number", default: 25, min: 1, max: 99 },
    ],
  },
  {
    id: "button",
    label: "Button press",
    description: "Active-low press/release pulses on a fixed schedule.",
    params: [
      { key: "pressAtNs", label: "Press after (ns)", type: "number", default: 200, min: 0 },
      { key: "holdNs", label: "Hold (ns)", type: "number", default: 50, min: 1 },
      { key: "repeatCount", label: "Repeat", type: "number", default: 2, min: 1, max: 20 },
    ],
  },
  {
    id: "uart",
    label: "UART byte stream",
    description: "Bit-bangs an 8N1 byte sequence onto the target (idle high).",
    params: [
      { key: "baudRate", label: "Baud rate", type: "number", default: 115200, min: 1 },
      { key: "bytes", label: "Bytes (hex, space-separated)", type: "bytes", default: [0x48, 0x69] },
    ],
  },
  {
    id: "sine",
    label: "Sine wave",
    description: "A continuous sine wave, e.g. for an audio-rate or antenna-style input.",
    params: [
      { key: "amplitude", label: "Amplitude", type: "number", default: 100 },
      { key: "offset", label: "Offset", type: "number", default: 128 },
      { key: "freqHz", label: "Frequency (Hz)", type: "number", default: 1000, min: 0 },
      { key: "updateStepNs", label: "Update step (ns)", type: "number", default: 10, min: 1 },
    ],
  },
  {
    id: "square",
    label: "Square wave",
    description: "A continuous two-level square wave.",
    params: [
      { key: "amplitude", label: "Amplitude", type: "number", default: 50 },
      { key: "offset", label: "Offset", type: "number", default: 128 },
      { key: "freqHz", label: "Frequency (Hz)", type: "number", default: 1000, min: 0 },
      { key: "updateStepNs", label: "Update step (ns)", type: "number", default: 10, min: 1 },
    ],
  },
  {
    id: "ramp",
    label: "Ramp / sawtooth",
    description: "A linearly increasing value that wraps at its maximum.",
    params: [
      { key: "minVal", label: "Min", type: "number", default: 0 },
      { key: "maxVal", label: "Max", type: "number", default: 255 },
      { key: "stepPerTick", label: "Step per tick", type: "number", default: 1 },
      { key: "updateStepNs", label: "Update step (ns)", type: "number", default: 10, min: 1 },
    ],
  },
  {
    id: "step",
    label: "Step",
    description: "A single one-shot level transition at a given time.",
    params: [
      { key: "lowVal", label: "Initial value", type: "number", default: 0 },
      { key: "highVal", label: "Stepped-to value", type: "number", default: 1 },
      { key: "stepAtNs", label: "Step at (ns)", type: "number", default: 500, min: 0 },
    ],
  },
  {
    id: "prbs",
    label: "PRBS / noise",
    description: "A pseudo-random bit stream from an 8-bit LFSR.",
    params: [
      { key: "seed", label: "Seed (0-255)", type: "number", default: 0xac, min: 1, max: 255 },
      { key: "updateStepNs", label: "Update step (ns)", type: "number", default: 20, min: 1 },
    ],
  },
];

export const STIMULUS_PRESETS_BY_ID = Object.fromEntries(STIMULUS_PRESETS.map((p) => [p.id, p]));

// Default numeric params for a preset id, e.g. for a newly-added block.
export function defaultParamsFor(presetId) {
  const preset = STIMULUS_PRESETS_BY_ID[presetId];
  if (!preset) return {};
  return Object.fromEntries(preset.params.map((p) => [p.key, p.default]));
}
