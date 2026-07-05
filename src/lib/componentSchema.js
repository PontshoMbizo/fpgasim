// Data model, caps, and validation for external components (custom chips).
// Pure data + validation — no Node APIs — safe to import from client components and
// server route handlers alike.
//
// A "component" is a user-authored Verilog module instantiated alongside the DUT in
// the generated testbench, wired to DUT port nets and/or other chips via "wires".

import { parsePorts, moduleNames } from './testbench.js';

// ---- Caps ----------------------------------------------------------------

export const MAX_COMPONENTS = 8;
export const MAX_WIRES = 64;
export const MAX_COMPONENT_CODE_BYTES = 32 * 1024; // 32 KiB per component
export const MAX_WAYPOINTS_PER_WIRE = 12; // manual bend points, purely cosmetic

// ---- Identifier helpers --------------------------------------------------

/** True if s is a valid Verilog simple identifier. */
function isVerilogIdent(s) {
  return typeof s === 'string' && /^[A-Za-z_]\w*$/.test(s);
}

// UTF-8 byte length without Node's Buffer, so this module stays client-safe
// (TextEncoder exists in every browser and in Node >= 11).
const utf8Bytes = (s) => new TextEncoder().encode(s).length;

// ---- Public helpers -------------------------------------------------------

/**
 * Parse the pins of a component's Verilog module using testbench.js's parsePorts.
 * Returns the same [{dir,width,name,range}] shape parsePorts() produces.
 *
 * @param {string} verilog  - Full Verilog source for the component's module
 * @param {string} name     - Module name to look for
 * @returns {{ dir: string, width: number, name: string, range: string }[]}
 */
export function parseComponentPins(verilog, name) {
  if (typeof verilog !== 'string' || !name) return [];
  return parsePorts(verilog, name);
}

/**
 * Generate a stub Verilog module for quick-create (CircuitJS-style dialog).
 * Produces an ANSI-port module with a `// TODO: behaviour` comment body.
 *
 * @param {string}   name     - Module name (must be a valid Verilog identifier)
 * @param {string[]} inputs   - Input port names
 * @param {string[]} outputs  - Output port names
 * @returns {string} Verilog source string
 */
export function makeStubVerilog(name, inputs = [], outputs = []) {
  const portList = [
    ...inputs.map((n) => `input ${n}`),
    ...outputs.map((n) => `output ${n}`),
  ];
  return [
    `module ${name}(${portList.join(', ')});`,
    '  // TODO: behaviour',
    'endmodule',
  ].join('\n');
}

// ---- Validation -----------------------------------------------------------

/**
 * Validate an array of components and wires against the current design.
 *
 * @param {object[]} components         - Component descriptors (id, name, verilog, pins, …)
 * @param {object[]} wires              - Wire descriptors ({id, a, b} — each endpoint has
 *                                        {comp?,pin?} for chip pins or {pin} for board pins)
 * @param {string[]} designModuleNames  - Module names already in the user's design source
 *                                        (from testbench.js moduleNames())
 * @param {object|null} cstResult       - Parsed CST ({ioPins: Map, ioAttrs: Map, errors: []})
 *                                        or null when no .cst is loaded
 * @param {object[]} [stimuli]          - Wire-format stimulus blocks; used to detect
 *                                        stimulus–driver conflicts on chip pins
 * @param {object[]} [designPorts]      - Parsed top-module ports ({dir,width,name}[], from
 *                                        testbench.js parsePorts()). Optional; when given,
 *                                        DUT-output vs chip-output and stimulus-vs-chip
 *                                        driver conflicts on board nets are detected too.
 * @returns {{ severity: 'error'|'warning'|'info', message: string, port?: string }[]}
 */
export function validateComponents(components = [], wires = [], designModuleNames = [], cstResult = null, stimuli = [], designPorts = []) {
  const diags = [];

  if (!Array.isArray(components)) {
    return [{ severity: 'error', message: '`components` must be an array.' }];
  }
  if (!Array.isArray(wires)) {
    return [{ severity: 'error', message: '`wires` must be an array.' }];
  }

  // --- Cap checks ---
  if (components.length > MAX_COMPONENTS) {
    diags.push({ severity: 'error', message: `Too many components (max ${MAX_COMPONENTS}).` });
  }
  if (wires.length > MAX_WIRES) {
    diags.push({ severity: 'error', message: `Too many wires (max ${MAX_WIRES}).` });
  }

  // --- Per-component validation ---
  const seenIds = new Set();
  const seenNames = new Set();
  // Map compId → {component, pins[]}
  const compMap = new Map();

  for (const c of components) {
    if (!c || typeof c !== 'object') {
      diags.push({ severity: 'error', message: 'Component entry must be an object.' });
      continue;
    }

    // Duplicate id
    if (!c.id || typeof c.id !== 'string') {
      diags.push({ severity: 'error', message: 'Component missing `id`.' });
    } else if (seenIds.has(c.id)) {
      diags.push({ severity: 'error', message: `Duplicate component id "${c.id}".`, port: c.id });
    } else {
      seenIds.add(c.id);
    }

    // Name validity
    if (!c.name || typeof c.name !== 'string') {
      diags.push({ severity: 'error', message: `Component "${c.id || '?'}" missing \`name\`.` });
    } else if (!isVerilogIdent(c.name)) {
      diags.push({ severity: 'error', message: `Component "${c.id}" name "${c.name}" is not a valid Verilog identifier.`, port: c.id });
    } else if (seenNames.has(c.name)) {
      diags.push({ severity: 'error', message: `Duplicate component name "${c.name}".`, port: c.id });
    } else {
      seenNames.add(c.name);
    }

    // Name collision with design modules
    if (c.name && isVerilogIdent(c.name) && designModuleNames.includes(c.name)) {
      diags.push({
        severity: 'error',
        message: `Component name "${c.name}" collides with a module already defined in the design (MODULE_NAME_COLLISION).`,
        port: c.id,
      });
    }

    // Verilog presence and parseability
    if (typeof c.verilog !== 'string' || !c.verilog.trim()) {
      diags.push({ severity: 'error', message: `Component "${c.id}" has no Verilog source.`, port: c.id });
      compMap.set(c.id, { component: c, pins: [] });
      continue;
    }

    // Size cap
    if (utf8Bytes(c.verilog) > MAX_COMPONENT_CODE_BYTES) {
      diags.push({ severity: 'error', message: `Component "${c.id}" Verilog exceeds ${MAX_COMPONENT_CODE_BYTES / 1024} KiB.`, port: c.id });
    }

    // module <name> must be present with parseable ANSI ports
    if (c.name && isVerilogIdent(c.name)) {
      const modNames = moduleNames(c.verilog);
      if (!modNames.includes(c.name)) {
        diags.push({
          severity: 'error',
          message: `Component "${c.id}" Verilog does not contain a module named "${c.name}".`,
          port: c.id,
        });
        compMap.set(c.id, { component: c, pins: [] });
        continue;
      }
      const pins = parsePorts(c.verilog, c.name);
      if (pins.length === 0) {
        diags.push({
          severity: 'error',
          message: `Component "${c.id}" module "${c.name}" has no parseable ANSI ports.`,
          port: c.id,
        });
      }
      // inout rejection (v1)
      for (const pin of pins) {
        if (pin.dir === 'inout') {
          diags.push({
            severity: 'error',
            message: `Component "${c.id}" pin "${pin.name}" is inout — tri-state nets are not supported in v1 (INOUT_UNSUPPORTED).`,
            port: c.id,
          });
        }
      }
      compMap.set(c.id, { component: c, pins });
    } else {
      compMap.set(c.id, { component: c, pins: [] });
    }
  }

  // --- Build reverse map: physical board pin → DUT port name ---
  // cstResult.ioPins: Map<portName, string[]>  (port → [pinNum, ...])
  const pinToPort = new Map(); // pinNum (string) → portName
  if (cstResult?.ioPins) {
    for (const [portName, pinNums] of cstResult.ioPins) {
      for (const pinNum of pinNums) {
        pinToPort.set(String(pinNum), portName);
      }
    }
  }

  // --- Per-wire validation + net-level driver analysis ---
  //
  // Endpoints are grouped into electrical nets with the same union-find scheme codegen
  // uses (generateComponentLayer in src/lib/testbench.js), so validation sees exactly
  // the nets codegen will build — including transitive ones (A–B, B–C ⇒ {A,B,C}).
  //
  // Driver sources on a net:
  //   - a chip output pin
  //   - the DUT driving a board pin whose .cst port is a design *output* (needs designPorts)
  //   - a stimulus block (on a chip input pin, or on the DUT port a board pin maps to)
  // Sinks: chip input pins. A DUT *input* port is neither — the harness's default
  // clock/button/init drivers yield to whichever chip/stimulus takes the port over.

  const stimulusDrivenChipPins = new Set(); // "<compId>.<pinName>"
  const stimulusDrivenPorts = new Set();    // DUT port names
  for (const s of (stimuli || [])) {
    if (!s || typeof s.target !== 'string') continue;
    if (s.target.includes('.')) stimulusDrivenChipPins.add(s.target);
    else stimulusDrivenPorts.add(s.target);
  }

  const portByName = new Map((designPorts || []).map((p) => [p.name, p]));
  const baseName = (n) => n.replace(/\[\d+\]$/, '');

  const parent = new Map();
  const find = (k) => {
    if (!parent.has(k)) parent.set(k, k);
    if (parent.get(k) !== k) parent.set(k, find(parent.get(k)));
    return parent.get(k);
  };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  const boardKeyPort = new Map();   // "board:<pin>" → portName from cst (or null)
  const chipOutputKeys = new Map(); // "comp:<id>:<pin>" → human label "id.pin"
  const chipInputKeys = new Map();  // "comp:<id>:<pin>" → human label "id.pin"
  const seenWireIds = new Set();

  for (const w of wires) {
    if (!w || typeof w !== 'object') {
      diags.push({ severity: 'error', message: 'Wire entry must be an object.' });
      continue;
    }
    if (!w.id || typeof w.id !== 'string') {
      diags.push({ severity: 'error', message: 'Wire missing `id`.' });
    } else if (seenWireIds.has(w.id)) {
      diags.push({ severity: 'error', message: `Duplicate wire id "${w.id}".` });
    } else {
      seenWireIds.add(w.id);
    }

    // Manual routing bend points — purely cosmetic (codegen only cares about
    // endpoints), but still capped so a malformed/huge snapshot can't balloon
    // the rendered path.
    if (w.waypoints != null) {
      if (!Array.isArray(w.waypoints)) {
        diags.push({ severity: 'error', message: `Wire "${w.id}" \`waypoints\` must be an array.` });
      } else if (w.waypoints.length > MAX_WAYPOINTS_PER_WIRE) {
        diags.push({ severity: 'error', message: `Wire "${w.id}" has ${w.waypoints.length} waypoints (max ${MAX_WAYPOINTS_PER_WIRE}).` });
      }
    }

    const endpointKeys = [];  // net key per endpoint (null when invalid)
    const endpointDirs = [];  // 'output' | 'input' | null (chip pins only)

    for (const ep of [w.a, w.b]) {
      if (!ep || typeof ep !== 'object') {
        diags.push({ severity: 'error', message: `Wire "${w.id}" has a malformed endpoint.` });
        endpointKeys.push(null);
        endpointDirs.push(null);
        continue;
      }

      if (ep.comp != null) {
        // Chip pin endpoint
        const info = compMap.get(ep.comp);
        if (!info) {
          diags.push({
            severity: 'error',
            message: `Wire "${w.id}" references unknown component "${ep.comp}" (WIRE_BAD_ENDPOINT).`,
          });
          endpointKeys.push(null);
          endpointDirs.push(null);
          continue;
        }
        const pin = info.pins.find((p) => p.name === ep.pin);
        if (!pin) {
          diags.push({
            severity: 'error',
            message: `Wire "${w.id}" references unknown pin "${ep.pin}" on component "${ep.comp}" (WIRE_BAD_ENDPOINT).`,
          });
          endpointKeys.push(null);
          endpointDirs.push(null);
          continue;
        }
        const key = `comp:${ep.comp}:${ep.pin}`;
        const label = `${ep.comp}.${ep.pin}`;
        if (pin.dir === 'output') chipOutputKeys.set(key, label);
        else chipInputKeys.set(key, label);
        endpointKeys.push(key);
        endpointDirs.push(pin.dir);
      } else if (ep.pin != null) {
        // Board (physical pin) endpoint
        const pinStr = String(ep.pin);
        const portName = pinToPort.get(pinStr);
        if (!portName && cstResult) {
          diags.push({
            severity: 'error',
            message: `Wire "${w.id}" board endpoint pin "${ep.pin}" is not mapped in the .cst (WIRE_UNMAPPED_PIN).`,
          });
          endpointKeys.push(null);
          endpointDirs.push(null);
          continue;
        }
        const key = `board:${pinStr}`;
        boardKeyPort.set(key, portName || null);
        endpointKeys.push(key);
        endpointDirs.push(null);
      } else {
        diags.push({
          severity: 'error',
          message: `Wire "${w.id}" has an endpoint with no \`comp\` or \`pin\` field (WIRE_BAD_ENDPOINT).`,
        });
        endpointKeys.push(null);
        endpointDirs.push(null);
      }
    }

    // Per-wire fast path: both endpoints are chip outputs (clearer message than the
    // net-level report, and still correct — the net-level pass would flag it too).
    if (endpointDirs[0] === 'output' && endpointDirs[1] === 'output') {
      diags.push({
        severity: 'error',
        message: `Wire "${w.id}" connects two output-driver endpoints (WIRE_DRIVER_CONFLICT). At most one driver per net.`,
      });
    }

    if (endpointKeys[0] && endpointKeys[1]) union(endpointKeys[0], endpointKeys[1]);
  }

  // --- Net-level single-driver check (transitive, mirrors codegen nets) ---
  const netInfo = new Map(); // root → { drivers: string[], chipInputs: string[], hasBoard: bool }
  const infoFor = (root) => {
    if (!netInfo.has(root)) netInfo.set(root, { drivers: [], chipInputs: [], hasBoard: false });
    return netInfo.get(root);
  };

  for (const [key, label] of chipOutputKeys) infoFor(find(key)).drivers.push(`chip output "${label}"`);
  for (const [key, label] of chipInputKeys) infoFor(find(key)).chipInputs.push(`"${label}"`);
  for (const [key, portName] of boardKeyPort) {
    const info = infoFor(find(key));
    info.hasBoard = true;
    if (!portName) continue;
    const dutPort = portByName.get(baseName(portName));
    if (dutPort && (dutPort.dir === 'output' || dutPort.dir === 'inout')) {
      info.drivers.push(`DUT output "${portName}"`);
    }
    if (stimulusDrivenPorts.has(portName) || stimulusDrivenPorts.has(baseName(portName))) {
      info.drivers.push(`stimulus on "${portName}"`);
    }
  }
  for (const target of stimulusDrivenChipPins) {
    const [compId, pinName] = target.split('.');
    const key = `comp:${compId}:${pinName}`;
    // Only relevant when the pin is on a wired net; the plain wire+stimulus-on-one-pin
    // conflict is flagged separately below.
    if (parent.has(key)) infoFor(find(key)).drivers.push(`stimulus on "${target}"`);
  }

  for (const [, info] of netInfo) {
    if (info.drivers.length > 1) {
      diags.push({
        severity: 'error',
        message: `Net has ${info.drivers.length} drivers: ${info.drivers.join(', ')} (WIRE_DRIVER_CONFLICT). At most one driver per net.`,
      });
    } else if (info.drivers.length === 0 && info.chipInputs.length > 0 && !info.hasBoard) {
      diags.push({
        severity: 'warning',
        message: `Net feeding chip input(s) ${info.chipInputs.join(', ')} has no driver (WIRE_NO_DRIVER) — it will read 'z'.`,
      });
    }
  }

  // --- Floating chip input warnings ---
  // A chip input with no wire and no stimulus → info/warning (reads z)
  for (const [compId, info] of compMap) {
    for (const pin of info.pins) {
      if (pin.dir !== 'input') continue;
      const key = `comp:${compId}:${pin.name}`;
      const hasWire = wires.some(
        (w) =>
          (w?.a?.comp === compId && w?.a?.pin === pin.name) ||
          (w?.b?.comp === compId && w?.b?.pin === pin.name)
      );
      const hasStimulus = stimulusDrivenChipPins.has(`${compId}.${pin.name}`);
      if (!hasWire && !hasStimulus) {
        diags.push({
          severity: 'warning',
          message: `Component "${compId}" input pin "${pin.name}" has no wire and no stimulus — it will read 'z' (floating).`,
          port: compId,
        });
      }
    }
  }

  // --- Stimulus-on-chip-pin: wire + stimulus conflict (driver conflict) ---
  for (const target of stimulusDrivenChipPins) {
    const [compId, pinName] = target.split('.');
    const hasWire = wires.some(
      (w) =>
        (w?.a?.comp === compId && w?.a?.pin === pinName) ||
        (w?.b?.comp === compId && w?.b?.pin === pinName)
    );
    if (hasWire) {
      diags.push({
        severity: 'error',
        message: `Stimulus target "${target}" also has a wire — only one driver allowed (WIRE_DRIVER_CONFLICT).`,
        port: compId,
      });
    }
  }

  return diags;
}
