// Shared shape/bounds for user-authored "stimulus" blocks — visual signal sources that
// drive a single top-level input port of the design under test. Pure data + validation,
// no Node APIs, so it's safe to import from both client components and route handlers.
//
// A stimulus descriptor as authored in the UI has 4 kinds: 'preset' | 'samples' |
// 'function' | 'verilog'. Only 'preset' | 'samples' | 'verilog' are ever sent over the
// wire — 'function' blocks are reduced to 'samples' client-side (see
// src/lib/stimulusSampling.js) before the POST to /api/simulate, so the server-side
// schema/codegen never has to run arbitrary user math.

export const MAX_STIMULI = 16;
export const MAX_SAMPLES_PER_STIMULUS = 4096;
export const MAX_SAMPLES_TOTAL = 8192;

export const PRESET_IDS = ['clock', 'pwm', 'button', 'uart', 'sine', 'square', 'ramp', 'step', 'prbs'];
export const WIRE_KINDS = ['preset', 'samples', 'verilog'];
export const AUTHOR_KINDS = ['preset', 'samples', 'function', 'verilog'];

// Validate a single already-reduced (wire-format) stimulus descriptor's shape. Returns
// an array of error strings (empty = valid). Does not check `target` against a port
// list — callers with access to the parsed design's ports should also call
// validateStimulusTarget().
export function validateStimulusShape(s) {
  const errors = [];
  if (!s || typeof s !== 'object') return ['Stimulus must be an object.'];
  if (typeof s.id !== 'string' || !s.id) errors.push('Stimulus missing `id`.');
  // The id is interpolated into generated Verilog identifiers (stim_<id>_net etc.), so
  // it must be identifier-safe. UI-generated ids ("stim_<base36>") always pass; this
  // guards direct API callers from producing uncompilable or misleading harness text.
  else if (!/^[A-Za-z_]\w*$/.test(s.id)) errors.push(`Stimulus id "${s.id}" must be a valid identifier ([A-Za-z_]\\w*).`);
  if (typeof s.target !== 'string' || !s.target) errors.push('Stimulus missing `target`.');
  if (!WIRE_KINDS.includes(s.kind)) {
    errors.push(`Stimulus "${s.id || '?'}" has unknown kind "${s.kind}".`);
    return errors;
  }
  if (s.kind === 'preset') {
    if (!s.preset || !PRESET_IDS.includes(s.preset.id)) {
      errors.push(`Stimulus "${s.id}" has unknown preset id "${s.preset?.id}".`);
    }
  } else if (s.kind === 'samples') {
    const values = s.samples?.values;
    if (!Array.isArray(values) || values.length === 0) {
      errors.push(`Stimulus "${s.id}" has no sample values.`);
    } else if (values.length > MAX_SAMPLES_PER_STIMULUS) {
      errors.push(`Stimulus "${s.id}" exceeds ${MAX_SAMPLES_PER_STIMULUS} samples.`);
    }
    if (typeof s.samples?.stepNs !== 'number' || s.samples.stepNs <= 0) {
      errors.push(`Stimulus "${s.id}" has an invalid sample step.`);
    }
  } else if (s.kind === 'verilog') {
    if (typeof s.verilog?.code !== 'string' || !s.verilog.code.trim()) {
      errors.push(`Stimulus "${s.id}" has empty verilog code.`);
    }
    if (!['procedural', 'instance'].includes(s.verilog?.mode)) {
      errors.push(`Stimulus "${s.id}" has unknown verilog mode "${s.verilog?.mode}".`);
    }
  }
  return errors;
}

// Validate an array of stimuli as a whole: per-block shape, total sample budget, and
// (given `ports`, the result of testbench.js's parsePorts()) target existence/direction
// and no two blocks targeting the same port. Returns an array of
// { severity: 'error', message, port? } diagnostics, matching the shape
// src/lib/constraintCheck.js already produces.
//
// When `components` (external chip descriptors) are provided, targets of the form
// "<compId>.<pinName>" are validated against chip input pins — mirroring exactly what
// generateStimulusDrivers accepts (src/lib/testbench.js), so nothing passes validation
// only to be silently skipped at codegen time (or vice versa).
export function validateStimuli(stimuli, ports = [], components = []) {
  const diagnostics = [];
  if (!Array.isArray(stimuli)) {
    return [{ severity: 'error', message: '`stimuli` must be an array.' }];
  }
  if (stimuli.length > MAX_STIMULI) {
    diagnostics.push({ severity: 'error', message: `Too many stimulus blocks (max ${MAX_STIMULI}).` });
  }

  const portsByName = new Map(ports.map((p) => [p.name, p]));
  // compId → Map<pinName, {dir,width}> for "<compId>.<pinName>" targets.
  const compPinMap = new Map();
  for (const c of components || []) {
    if (!c || typeof c.id !== 'string') continue;
    compPinMap.set(c.id, new Map((c.pins || []).map((p) => [p.name, p])));
  }
  const claimed = new Set();
  let totalSamples = 0;

  for (const s of stimuli) {
    const shapeErrors = validateStimulusShape(s);
    for (const message of shapeErrors) diagnostics.push({ severity: 'error', message, port: s?.target });
    if (shapeErrors.length) continue;

    if (s.target.includes('.')) {
      // Chip-pin target — same acceptance rules as generateStimulusDrivers.
      const [compId, pinName] = s.target.split('.');
      const compPins = compPinMap.get(compId);
      const pin = compPins?.get(pinName);
      if (!compPins) {
        diagnostics.push({ severity: 'error', message: `Stimulus target "${s.target}" references unknown component "${compId}".`, port: s.target });
      } else if (!pin) {
        diagnostics.push({ severity: 'error', message: `Stimulus target "${s.target}" references unknown pin "${pinName}" on "${compId}".`, port: s.target });
      } else if (pin.dir !== 'input') {
        diagnostics.push({ severity: 'error', message: `Stimulus target "${s.target}" is not an input pin.`, port: s.target });
      } else if (claimed.has(s.target)) {
        diagnostics.push({ severity: 'error', message: `Multiple stimulus blocks target "${s.target}".`, port: s.target });
      } else {
        claimed.add(s.target);
      }
    } else {
      const port = portsByName.get(s.target);
      if (!port) {
        diagnostics.push({ severity: 'error', message: `Stimulus target "${s.target}" is not a port on the design.`, port: s.target });
      } else if (port.dir !== 'input') {
        diagnostics.push({ severity: 'error', message: `Stimulus target "${s.target}" is not an input port.`, port: s.target });
      } else if (claimed.has(s.target)) {
        diagnostics.push({ severity: 'error', message: `Multiple stimulus blocks target "${s.target}".`, port: s.target });
      } else {
        claimed.add(s.target);
      }
    }

    if (s.kind === 'samples') totalSamples += s.samples.values.length;
  }

  if (totalSamples > MAX_SAMPLES_TOTAL) {
    diagnostics.push({ severity: 'error', message: `Total stimulus samples exceed ${MAX_SAMPLES_TOTAL}.` });
  }

  return diagnostics;
}
