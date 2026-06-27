// Validates parsed .cst and .sdc constraints against Tang Nano 9K board rules.
// Returns an array of typed diagnostic objects that the UI renders and the API
// includes in its response.
//
// Diagnostic shape:
//   { type, severity, message, port?, pin?, ioType? }
//
// Severity: 'error' (blocks simulation) | 'warning' (shown but sim runs)

import { allowedIoTypesForBank, CLOCK_CAPABLE_PINS, BOARD_CLOCK, VALID_PULL_MODES } from '../boards/boardRules.js';

/**
 * Extract IO port names from a Verilog source string.
 * Best-effort: reads ANSI module header of the top module.
 * @param {string} code
 * @returns {Map<string, 'input'|'output'|'inout'>}
 */
function extractPorts(code) {
  const ports = new Map();
  // Strip comments
  const clean = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

  // Find the top module's port list
  const modRe = /\bmodule\s+\w+\s*(?:#\s*\([\s\S]*?\))?\s*\(([\s\S]*?)\)\s*;/;
  const mm = modRe.exec(clean);
  if (!mm) return ports;

  for (const seg of mm[1].split(',')) {
    const dm = /\b(input|output|inout)\b/.exec(seg);
    if (!dm) continue;
    const dir = dm[1];
    const nm = /(\w+)\s*$/.exec(seg);
    if (nm) ports.set(nm[1], dir);
  }
  return ports;
}

/**
 * Derive the bank prefix (IOR/IOB/IOT) from a pin object's name or bank field.
 */
function bankPrefix(pin) {
  if (!pin) return null;
  const m = /^(IOL|IOR|IOB|IOT)/.exec(pin.bank || pin.name || '');
  return m ? m[1] : null;
}

/**
 * Validate CST + SDC against the board pin map.
 *
 * @param {object} cstResult  - Output of parseCst()
 * @param {object} sdcResult  - Output of parseSdc()
 * @param {string} code       - Verilog source (to extract port names)
 * @param {object[]} pins     - The board's pins array (from pins.json)
 * @returns {Array<{type,severity,message,port?,pin?,ioType?}>}
 */
export function checkConstraints(cstResult, sdcResult, code, pins) {
  const diags = [];
  const { ioPins, ioAttrs } = cstResult;
  const { clocks } = sdcResult;

  // Build a lookup: pin id string → pin object
  const pinById = new Map();
  for (const p of pins) pinById.set(String(p.id), p);

  // Extract design ports
  const designPorts = extractPorts(code);

  // --- UNMAPPED_PORT: design output/inout has no IO_LOC ---
  for (const [portName, dir] of designPorts) {
    if (!ioPins.has(portName)) {
      diags.push({
        type: 'UNMAPPED_PORT',
        severity: 'warning',
        message: `Port "${portName}" (${dir}) has no IO_LOC constraint.`,
        port: portName,
      });
    }
  }

  // --- UNKNOWN_PIN: IO_LOC references a pin not in pins.json ---
  for (const [portName, pinNums] of ioPins) {
    for (const pinNum of pinNums) {
      if (!pinById.has(String(pinNum))) {
        diags.push({
          type: 'UNKNOWN_PIN',
          severity: 'error',
          message: `IO_LOC "${portName}" references pin ${pinNum} which does not exist on the Tang Nano 9K.`,
          port: portName,
          pin: pinNum,
        });
      }
    }
  }

  // --- IO type and pull checks for IO_PORT ---
  for (const [portName, attrs] of ioAttrs) {
    const pinNums = ioPins.get(portName);
    const firstPin = pinNums ? pinById.get(String(pinNums[0])) : null;
    const bank = bankPrefix(firstPin);
    const allowedTypes = bank ? allowedIoTypesForBank(bank) : null;

    // ILLEGAL_IO_TYPE
    if (attrs.ioType && allowedTypes && !allowedTypes.has(attrs.ioType.toUpperCase())) {
      diags.push({
        type: 'ILLEGAL_IO_TYPE',
        severity: 'error',
        message: `IO_TYPE "${attrs.ioType}" is not valid for bank ${bank} (3.3 V) on pin ${pinNums?.[0]}.`,
        port: portName,
        ioType: attrs.ioType,
      });
    }

    // PULL_ON_OUTPUT: pull mode set on a pure output port
    const dir = designPorts.get(portName);
    if (dir === 'output' && attrs.pullMode && attrs.pullMode.toUpperCase() !== 'NONE') {
      diags.push({
        type: 'PULL_ON_OUTPUT',
        severity: 'warning',
        message: `PULL_MODE "${attrs.pullMode}" set on output port "${portName}". Pull modes on outputs are generally not useful.`,
        port: portName,
      });
    }

    // INVALID_PULL_MODE
    if (attrs.pullMode && !VALID_PULL_MODES.has(attrs.pullMode.toUpperCase())) {
      diags.push({
        type: 'INVALID_PULL_MODE',
        severity: 'error',
        message: `PULL_MODE "${attrs.pullMode}" for port "${portName}" is not recognised. Valid values: NONE, UP, DOWN, KEEPER.`,
        port: portName,
      });
    }
  }

  // --- Clock checks from SDC ---
  for (const [portName, clockDef] of clocks) {
    const pinNums = ioPins.get(portName);
    if (!pinNums) {
      // No IO_LOC — can't validate clock-capable, but still check period
    } else {
      const pinNum = parseInt(pinNums[0], 10);

      // CLOCK_NOT_CAPABLE
      if (!CLOCK_CAPABLE_PINS.has(pinNum)) {
        diags.push({
          type: 'CLOCK_NOT_CAPABLE',
          severity: 'warning',
          message: `Port "${portName}" has a create_clock constraint but pin ${pinNum} is not a dedicated clock-capable IOB on the GW1NR-9.`,
          port: portName,
          pin: String(pinNum),
        });
      }

      // PERIOD_MISMATCH: if port is on the board's oscillator pin, check frequency matches
      if (pinNum === BOARD_CLOCK.pinNum) {
        const expected = BOARD_CLOCK.periodNs;
        const actual   = clockDef.periodNs;
        const diff     = Math.abs(actual - expected) / expected;
        if (diff > 0.05) { // >5% deviation
          diags.push({
            type: 'PERIOD_MISMATCH',
            severity: 'warning',
            message: `create_clock period ${actual.toFixed(3)} ns on pin ${pinNum} (27 MHz osc) deviates >5% from expected ${expected.toFixed(3)} ns. Did you mean -period ${expected.toFixed(3)}?`,
            port: portName,
          });
        }
      }
    }
  }

  return diags;
}
