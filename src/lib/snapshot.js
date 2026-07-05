// Snapshot save/load for the nikaVSimulator board canvas state.
// Pure — no Node APIs — safe to import from both client components and route handlers.
//
// Format: { "format": "nikav-snapshot", "version": 1, "board": "tang-nano-9k", … }

import { MAX_COMPONENTS, MAX_WIRES } from './componentSchema.js';
import { MAX_STIMULI, MAX_SAMPLES_PER_STIMULUS } from './stimulusSchema.js';

export const SNAPSHOT_FORMAT = 'nikav-snapshot';
export const SNAPSHOT_VERSION = 1;

/**
 * Build a snapshot object from the current editor/board state.
 * Returns a plain JSON-serialisable object — call JSON.stringify on the result.
 *
 * @param {object} state
 * @param {string}   [state.design]       - Design Verilog source
 * @param {string}   [state.testbench]    - Custom testbench source (or empty)
 * @param {string}   [state.cst]          - .cst constraints source
 * @param {string}   [state.sdc]          - .sdc constraints source
 * @param {number}   [state.durationNs]   - Simulation duration in nanoseconds
 * @param {string[]} [state.peripherals]  - Peripheral IDs wired in
 * @param {object[]} [state.stimuli]      - Wire-format stimulus block descriptors
 * @param {object[]} [state.components]   - External component descriptors
 * @param {object[]} [state.wires]        - Wire descriptors
 * @param {string}   [state.board]        - Board identifier; defaults to 'tang-nano-9k'
 * @returns {object} Snapshot object (ready for JSON.stringify)
 */
export function buildSnapshot(state = {}) {
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    board: state.board ?? 'tang-nano-9k',
    design: state.design ?? '',
    testbench: state.testbench ?? '',
    cst: state.cst ?? '',
    sdc: state.sdc ?? '',
    durationNs: typeof state.durationNs === 'number' ? state.durationNs : null,
    peripherals: Array.isArray(state.peripherals) ? [...state.peripherals] : [],
    stimuli: Array.isArray(state.stimuli) ? [...state.stimuli] : [],
    components: Array.isArray(state.components) ? [...state.components] : [],
    wires: Array.isArray(state.wires) ? [...state.wires] : [],
  };
}

/**
 * Parse and validate a snapshot from a JSON string or already-parsed object.
 * Never throws on user input — all errors are captured in `errors`.
 *
 * @param {string|object} json - Raw JSON string or already-parsed object
 * @returns {{ ok: boolean, snapshot?: object, errors?: string[] }}
 */
export function parseSnapshot(json) {
  let raw;
  if (typeof json === 'string') {
    try {
      raw = JSON.parse(json);
    } catch (e) {
      return { ok: false, errors: [`Invalid JSON: ${e.message}`] };
    }
  } else if (json && typeof json === 'object') {
    raw = json;
  } else {
    return { ok: false, errors: ['Snapshot must be a JSON string or object.'] };
  }

  const errors = [];

  // Format / version gate
  if (raw.format !== SNAPSHOT_FORMAT) {
    errors.push(`Unrecognised snapshot format "${raw.format}". Expected "${SNAPSHOT_FORMAT}".`);
  }
  if (raw.version !== SNAPSHOT_VERSION) {
    errors.push(`Unsupported snapshot version ${raw.version}. Expected ${SNAPSHOT_VERSION}.`);
  }
  if (errors.length) return { ok: false, errors };

  // Cap enforcement
  const components = Array.isArray(raw.components) ? raw.components : [];
  const wires = Array.isArray(raw.wires) ? raw.wires : [];
  const stimuli = Array.isArray(raw.stimuli) ? raw.stimuli : [];

  if (components.length > MAX_COMPONENTS) {
    errors.push(`Snapshot components count ${components.length} exceeds cap ${MAX_COMPONENTS}.`);
  }
  if (wires.length > MAX_WIRES) {
    errors.push(`Snapshot wires count ${wires.length} exceeds cap ${MAX_WIRES}.`);
  }
  if (stimuli.length > MAX_STIMULI) {
    errors.push(`Snapshot stimuli count ${stimuli.length} exceeds cap ${MAX_STIMULI}.`);
  }
  // Per-stimulus sample cap
  for (const s of stimuli) {
    if (s?.kind === 'samples' && Array.isArray(s?.samples?.values)) {
      if (s.samples.values.length > MAX_SAMPLES_PER_STIMULUS) {
        errors.push(`Snapshot stimulus "${s.id}" sample count ${s.samples.values.length} exceeds cap ${MAX_SAMPLES_PER_STIMULUS}.`);
      }
    }
  }

  if (errors.length) return { ok: false, errors };

  // Sanitise into the canonical shape (drop unknown top-level keys, coerce types)
  const snapshot = {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    board: typeof raw.board === 'string' ? raw.board : 'tang-nano-9k',
    design: typeof raw.design === 'string' ? raw.design : '',
    testbench: typeof raw.testbench === 'string' ? raw.testbench : '',
    cst: typeof raw.cst === 'string' ? raw.cst : '',
    sdc: typeof raw.sdc === 'string' ? raw.sdc : '',
    durationNs: typeof raw.durationNs === 'number' ? raw.durationNs : null,
    peripherals: Array.isArray(raw.peripherals)
      ? raw.peripherals.filter((p) => typeof p === 'string')
      : [],
    stimuli,
    components,
    wires,
  };

  return { ok: true, snapshot };
}

/**
 * Parse a per-block waveform JSON import (CircuitJS DataInputElm-style).
 *
 * Accepted shapes:
 *  - `{ "format": "nikav-stimulus", "version": 1, "kind": "samples",
 *       "stepNs": 100, "values": [0,1,…], "target": "clk" }`
 *  - Bare numeric array `[0, 1, 0, …]` (stepNs must be supplied separately by the caller)
 *
 * @param {string|object|number[]} text - Raw JSON string, already-parsed object, or array
 * @returns {{ ok: boolean, values?: number[], stepNs?: number, target?: string, errors?: string[] }}
 */
export function parseStimulusWaveformJson(text) {
  let raw;
  if (typeof text === 'string') {
    try {
      raw = JSON.parse(text);
    } catch (e) {
      return { ok: false, errors: [`Invalid JSON: ${e.message}`] };
    }
  } else if (Array.isArray(text) || (text && typeof text === 'object')) {
    raw = text;
  } else {
    return { ok: false, errors: ['Waveform input must be a JSON string, array, or object.'] };
  }

  // Bare array
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return { ok: false, errors: ['Waveform array is empty.'] };
    }
    if (raw.length > MAX_SAMPLES_PER_STIMULUS) {
      return { ok: false, errors: [`Waveform has ${raw.length} samples; maximum is ${MAX_SAMPLES_PER_STIMULUS}.`] };
    }
    if (!raw.every((v) => typeof v === 'number')) {
      return { ok: false, errors: ['Waveform array must contain only numbers.'] };
    }
    return { ok: true, values: raw };
  }

  // Object form
  const errors = [];
  if (raw.format !== 'nikav-stimulus') {
    errors.push(`Unrecognised waveform format "${raw.format}". Expected "nikav-stimulus".`);
  }
  if (raw.version !== 1) {
    errors.push(`Unsupported waveform version ${raw.version}. Expected 1.`);
  }
  if (raw.kind !== 'samples') {
    errors.push(`Unsupported waveform kind "${raw.kind}". Expected "samples".`);
  }
  if (errors.length) return { ok: false, errors };

  if (!Array.isArray(raw.values) || raw.values.length === 0) {
    return { ok: false, errors: ['Waveform object has no `values` array.'] };
  }
  if (raw.values.length > MAX_SAMPLES_PER_STIMULUS) {
    return { ok: false, errors: [`Waveform has ${raw.values.length} samples; maximum is ${MAX_SAMPLES_PER_STIMULUS}.`] };
  }
  if (!raw.values.every((v) => typeof v === 'number')) {
    return { ok: false, errors: ['Waveform `values` must contain only numbers.'] };
  }
  if (typeof raw.stepNs !== 'number' || raw.stepNs <= 0) {
    return { ok: false, errors: ['Waveform `stepNs` must be a positive number.'] };
  }

  return {
    ok: true,
    values: raw.values,
    stepNs: raw.stepNs,
    target: typeof raw.target === 'string' ? raw.target : undefined,
  };
}
