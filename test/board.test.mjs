import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  TANG_NANO_9K,
  PERIPHERAL_PINS,
  PIN_FUNCTION,
  DEFAULT_PIN_MAP,
  TangNano9kBoard,
} from "../src/boards/tangnano9k.js";

// Board peripheral data must stay consistent with the physical pin list (pins.json)
// the hardware overlay and constraint validator both read from. These tests guard
// against typos / drift between the schematic-derived board map and pins.json.

const PINS = JSON.parse(
  readFileSync(fileURLToPath(new URL("../src/data/pins.json", import.meta.url)), "utf8")
);
const pinIds = new Set(PINS.map((p) => String(p.id)));

test("every pin in pins.json has finite x/y coordinates", () => {
  // Missing coords render as NaN in the SVG board/pin-mapper views.
  const bad = PINS.filter((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y));
  assert.deepEqual(bad.map((p) => p.id), [], "pins without numeric coordinates");
});

test("every peripheral pin exists in pins.json", () => {
  const missing = PERIPHERAL_PINS.filter((e) => !pinIds.has(String(e.pin)));
  assert.deepEqual(
    missing.map((e) => `${e.net}->${e.pin}`),
    [],
    "peripheral pins not present in pins.json (overlay + validation would break)"
  );
});

test("no two peripheral nets map to the same physical pin", () => {
  const seen = new Map();
  const dupes = [];
  for (const e of PERIPHERAL_PINS) {
    if (seen.has(e.pin)) dupes.push(`${e.pin}: ${seen.get(e.pin)} & ${e.net}`);
    else seen.set(e.pin, e.net);
  }
  assert.deepEqual(dupes, []);
});

test("DEFAULT_PIN_MAP and PIN_FUNCTION are derived consistently", () => {
  for (const e of PERIPHERAL_PINS) {
    assert.equal(DEFAULT_PIN_MAP[e.net], e.pin, `net ${e.net} pin mismatch`);
    assert.equal(PIN_FUNCTION[e.pin].net, e.net, `pin ${e.pin} function mismatch`);
  }
});

test("the board exposes 6 active-low LEDs and 2 active-low buttons", () => {
  assert.equal(TANG_NANO_9K.leds.bits.length, 6);
  assert.equal(TANG_NANO_9K.leds.activeLow, true);
  assert.equal(TANG_NANO_9K.buttons.items.length, 2);
  assert.equal(TANG_NANO_9K.buttons.activeLow, true);
  // The board's active-low set covers every LED + button net.
  for (const b of TANG_NANO_9K.leds.bits) assert.ok(TangNano9kBoard.activeLow.has(b.net));
  for (const b of TANG_NANO_9K.buttons.items) assert.ok(TangNano9kBoard.activeLow.has(b.net));
});

test("the clock is the 27 MHz oscillator on pin 63", () => {
  assert.equal(TANG_NANO_9K.clock.pin, "63");
  assert.equal(TANG_NANO_9K.clock.hz, 27_000_000);
  assert.ok(pinIds.has("63"));
});

test("HDMI exposes a TMDS clock pair plus three data pairs", () => {
  const h = TANG_NANO_9K.hdmi;
  assert.ok(h.clk.p.pin && h.clk.n.pin);
  assert.equal(h.data.length, 3);
  for (const d of h.data) {
    assert.ok(pinIds.has(d.p.pin) && pinIds.has(d.n.pin), "TMDS data pair pins must exist");
  }
});

test("LED/button/clock pins carry the special tags computePinAssignments reads", () => {
  // Net -> expected tag the runtime overlay mapping (simState) understands.
  const byId = new Map(PINS.map((p) => [String(p.id), p]));
  const expect = (pin, tag) =>
    assert.ok((byId.get(pin)?.special || []).includes(tag), `pin ${pin} should be tagged ${tag}`);
  expect(TANG_NANO_9K.clock.pin, "CLK");
  TANG_NANO_9K.leds.bits.forEach((b, i) => expect(b.pin, `LED${i}`));
  expect(TANG_NANO_9K.buttons.items[0].pin, "BTN1");
  expect(TANG_NANO_9K.buttons.items[1].pin, "BTN2");
});
