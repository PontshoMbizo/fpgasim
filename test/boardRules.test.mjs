import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BANK_VOLTAGES,
  ALLOWED_IO_TYPES_3V3,
  allowedIoTypesForBank,
  CLOCK_CAPABLE_PINS,
  BOARD_CLOCK,
  VALID_PULL_MODES,
  VALID_DRIVE_VALUES,
} from "../src/boards/boardRules.js";

// boardRules.js encodes the Tang Nano 9K electrical facts the constraint validator
// relies on. These tests pin down the values that diagnostics are computed against.

test("all broken-out IO banks are 3.3 V", () => {
  for (const v of Object.values(BANK_VOLTAGES)) assert.equal(v, "3.3V");
});

test("the 3.3 V allow-list covers the standards used by the default constraints", () => {
  for (const t of ["LVCMOS33", "LVTTL33", "TMDS33"]) {
    assert.ok(ALLOWED_IO_TYPES_3V3.has(t), `${t} should be allowed`);
  }
  // Every bank on this board returns the same 3.3 V set.
  assert.equal(allowedIoTypesForBank("IOL"), ALLOWED_IO_TYPES_3V3);
  assert.equal(allowedIoTypesForBank("IOT"), ALLOWED_IO_TYPES_3V3);
});

test("the 27 MHz oscillator pin is clock-capable", () => {
  assert.ok(CLOCK_CAPABLE_PINS.has(BOARD_CLOCK.pinNum));
  assert.equal(BOARD_CLOCK.pinNum, 63);
  assert.equal(BOARD_CLOCK.freqMHz, 27);
});

test("the board clock period is ~37.037 ns", () => {
  assert.ok(Math.abs(BOARD_CLOCK.periodNs - 1000 / 27) < 1e-6);
  assert.ok(BOARD_CLOCK.periodNs > 37 && BOARD_CLOCK.periodNs < 37.1);
});

test("pull modes and drive strengths match the Gowin attribute vocabulary", () => {
  for (const p of ["NONE", "UP", "DOWN", "KEEPER"]) assert.ok(VALID_PULL_MODES.has(p));
  for (const d of [4, 8, 12, 16, 24]) assert.ok(VALID_DRIVE_VALUES.has(d));
});
