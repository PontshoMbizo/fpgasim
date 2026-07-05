// Pure-math reduction of a "function"-authored stimulus block into the same
// fixed-rate `samples` shape the `samples`-kind wire format uses (see
// src/lib/stimulusSchema.js). This is the ONLY place a user-authored generator turns
// into concrete numbers — it runs entirely client-side (or in any plain JS context,
// no DOM/Node APIs), so no user-supplied expression or code is ever evaluated on the
// server. Only named, fixed-shape generators are supported (no arbitrary formula
// text) to keep this a closed, safe set of math functions.
//
// Used both for the live preview sparkline in the stimulus config UI and for the
// actual pre-POST reduction in EditorPane.runSimulation().

import { MAX_SAMPLES_PER_STIMULUS } from "./stimulusSchema.js";

const TWO_PI = 2 * Math.PI;

function sampleCount(durationNs, sampleRateHz) {
  const n = Math.round((durationNs * 1e-9) * sampleRateHz);
  return Math.max(1, Math.min(n, MAX_SAMPLES_PER_STIMULUS));
}

function clampToWidth(value, width) {
  const max = 2 ** width - 1;
  return Math.max(0, Math.min(max, Math.round(value)));
}

/**
 * Reduces a { generator, params, durationNs, sampleRateHz } descriptor into a
 * `samples`-kind wire descriptor: { width, stepNs, startNs, values, hold }.
 *
 * @param {object} fn  the stimulus block's `function` field
 * @param {number} width  bit width of the target port (for value clamping)
 * @returns {{width:number, stepNs:number, startNs:number, values:number[], hold:'last'}}
 */
export function functionToSamples(fn, width) {
  const { generator, params = {}, durationNs = 1_000_000, sampleRateHz = 44_100 } = fn;
  const {
    amplitude = 2 ** (width - 1) - 1,
    offset = 2 ** (width - 1),
    freqHz = 1000,
    phaseDeg = 0,
    duty = 50,
  } = params;

  const n = sampleCount(durationNs, sampleRateHz);
  const stepNs = durationNs / n;
  const phaseRad = (phaseDeg / 360) * TWO_PI;
  const values = new Array(n);

  for (let i = 0; i < n; i++) {
    const t = (i * stepNs) * 1e-9; // seconds
    const theta = TWO_PI * freqHz * t + phaseRad;
    let v;
    switch (generator) {
      case "sine":
        v = offset + amplitude * Math.sin(theta);
        break;
      case "square": {
        const frac = ((theta / TWO_PI) % 1 + 1) % 1;
        v = offset + (frac < duty / 100 ? amplitude : -amplitude);
        break;
      }
      case "triangle": {
        const frac = ((theta / TWO_PI) % 1 + 1) % 1;
        const tri = frac < 0.5 ? frac * 4 - 1 : 3 - frac * 4;
        v = offset + amplitude * tri;
        break;
      }
      case "ramp":
      case "sawtooth": {
        const frac = ((theta / TWO_PI) % 1 + 1) % 1;
        v = offset + amplitude * (frac * 2 - 1);
        break;
      }
      case "noise":
        v = offset + amplitude * (Math.random() * 2 - 1);
        break;
      default:
        v = offset;
    }
    values[i] = clampToWidth(v, width);
  }

  return { width, stepNs, startNs: 0, values, hold: "last" };
}

export const FUNCTION_GENERATORS = ["sine", "square", "triangle", "ramp", "sawtooth", "noise"];
