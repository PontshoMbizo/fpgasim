import { test } from "node:test";
import assert from "node:assert/strict";

import {
  chipBox,
  pinAnchor,
  nextChipPosition,
  wirePath,
  pinLabel,
  splitPins,
  CHIP_PIN_SPACING,
  CHIP_PIN_STUB,
  CHIP_PAD_RADIUS,
  CHIP_V_PADDING,
  CHIP_MIN_WIDTH,
} from "../src/components/hardware/chipGeometry.js";

// ---- Fixtures ---------------------------------------------------------------

const NAND2 = {
  id: "c1",
  name: "nand2",
  x: 100,
  y: 50,
  pins: [
    { name: "A", dir: "input",  width: 1 },
    { name: "B", dir: "input",  width: 1 },
    { name: "Y", dir: "output", width: 1 },
  ],
};

const BUS_CHIP = {
  id: "c2",
  name: "bus_chip",
  x: 200,
  y: 60,
  pins: [
    { name: "DIN",  dir: "input",  width: 8 },
    { name: "DOUT", dir: "output", width: 8 },
  ],
};

const NO_PINS = {
  id: "c3",
  name: "empty",
  x: 0,
  y: 0,
  pins: [],
};

// ---- pinLabel ---------------------------------------------------------------

test("pinLabel returns name for width-1 pin", () => {
  assert.equal(pinLabel({ name: "A", width: 1 }), "A");
});

test("pinLabel appends /width for bus pins", () => {
  assert.equal(pinLabel({ name: "DIN", width: 8 }), "DIN/8");
});

test("pinLabel handles null gracefully", () => {
  assert.equal(pinLabel(null), "");
});

// ---- splitPins --------------------------------------------------------------

test("splitPins separates inputs (west) from outputs (east)", () => {
  const { west, east } = splitPins(NAND2);
  assert.equal(west.length, 2);
  assert.equal(east.length, 1);
  assert.equal(west[0].name, "A");
  assert.equal(east[0].name, "Y");
});

test("splitPins handles component with no pins", () => {
  const { west, east } = splitPins(NO_PINS);
  assert.equal(west.length, 0);
  assert.equal(east.length, 0);
});

// ---- chipBox ----------------------------------------------------------------

test("chipBox returns positive dimensions for a normal chip", () => {
  const { w, h } = chipBox(NAND2);
  assert.ok(w > 0, "width should be positive");
  assert.ok(h > 0, "height should be positive");
});

test("chipBox width is at least CHIP_MIN_WIDTH", () => {
  const { w } = chipBox(NO_PINS);
  assert.ok(w >= CHIP_MIN_WIDTH, `width ${w} should be >= ${CHIP_MIN_WIDTH}`);
});

test("chipBox height grows with pin count", () => {
  const { h: h2 } = chipBox(NAND2); // 2 west pins, 1 east pin => 2 rows
  const { h: h1 } = chipBox(BUS_CHIP); // 1 west pin, 1 east pin => 1 row
  assert.ok(h2 > h1, "more pins should produce taller chip");
});

test("chipBox height accounts for V_PADDING", () => {
  const { h } = chipBox(NAND2);
  const expectedMin = CHIP_V_PADDING * 2 + CHIP_PIN_SPACING;
  assert.ok(h >= expectedMin, `height ${h} should be >= ${expectedMin}`);
});

test("chipBox exposes westPins and eastPins", () => {
  const { westPins, eastPins } = chipBox(NAND2);
  assert.equal(westPins.length, 2);
  assert.equal(eastPins.length, 1);
});

// ---- pinAnchor --------------------------------------------------------------

test("pinAnchor returns west-side coords for an input pin", () => {
  const anchor = pinAnchor(NAND2, "A");
  assert.ok(anchor !== null, "should find pin A");
  assert.equal(anchor.side, "west");
  // Pad is CHIP_PIN_STUB to the left of the chip box x
  assert.equal(anchor.x, NAND2.x - CHIP_PIN_STUB);
});

test("pinAnchor returns east-side coords for an output pin", () => {
  const { w } = chipBox(NAND2);
  const anchor = pinAnchor(NAND2, "Y");
  assert.ok(anchor !== null, "should find pin Y");
  assert.equal(anchor.side, "east");
  assert.equal(anchor.x, NAND2.x + w + CHIP_PIN_STUB);
});

test("pinAnchor returns null for unknown pin", () => {
  const anchor = pinAnchor(NAND2, "NONEXISTENT");
  assert.equal(anchor, null);
});

test("pinAnchor y increases with pin index", () => {
  const aA = pinAnchor(NAND2, "A");
  const aB = pinAnchor(NAND2, "B");
  assert.ok(aA !== null && aB !== null);
  assert.equal(aB.y - aA.y, CHIP_PIN_SPACING, "pins should be CHIP_PIN_SPACING apart vertically");
});

test("pinAnchor bus pin label works correctly", () => {
  const anchor = pinAnchor(BUS_CHIP, "DIN");
  assert.ok(anchor !== null);
  assert.equal(anchor.side, "west");
});

// ---- nextChipPosition -------------------------------------------------------

test("nextChipPosition with no components returns a position right of the board", () => {
  const pos = nextChipPosition([], 1200, 700);
  assert.ok(pos.x >= 1200, "should be at or beyond board right edge");
  assert.ok(pos.y >= 0);
});

test("nextChipPosition with one existing chip stacks below it", () => {
  const existing = [{ ...NAND2, x: 1224, y: 40 }];
  const pos = nextChipPosition(existing, 1200, 700);
  const { h } = chipBox(existing[0]);
  // New position should be below the first chip
  assert.ok(pos.y > existing[0].y + h - 1, "should stack below existing chip");
});

test("nextChipPosition returns an object with x and y", () => {
  const pos = nextChipPosition([], 1200, 700);
  assert.ok(typeof pos.x === "number" && typeof pos.y === "number");
});

// ---- wirePath ---------------------------------------------------------------

test("wirePath horizontal straight line when y values match", () => {
  const pts = wirePath({ x: 0, y: 10 }, { x: 100, y: 10 });
  assert.equal(pts.length, 2);
  assert.equal(pts[0].y, 10);
  assert.equal(pts[1].y, 10);
});

test("wirePath vertical straight line when x values match", () => {
  const pts = wirePath({ x: 50, y: 0 }, { x: 50, y: 80 });
  assert.equal(pts.length, 2);
  assert.equal(pts[0].x, 50);
  assert.equal(pts[1].x, 50);
});

test("wirePath L-route has 4 points for diagonal endpoints", () => {
  const pts = wirePath({ x: 0, y: 0 }, { x: 100, y: 80 });
  assert.equal(pts.length, 4, "L-route should have 4 waypoints");
});

test("wirePath L-route first segment is horizontal", () => {
  const pts = wirePath({ x: 10, y: 20 }, { x: 90, y: 60 });
  // pts[0] and pts[1] should share the same y
  assert.equal(pts[0].y, pts[1].y, "first segment should be horizontal");
});

test("wirePath L-route vertical segment shares x at the turn point", () => {
  const pts = wirePath({ x: 10, y: 20 }, { x: 90, y: 60 });
  // L-route: [a, {midX, a.y}, {midX, b.y}, b]
  // The vertical segment is pts[1] -> pts[2]; both share midX
  assert.equal(pts[1].x, pts[2].x, "vertical segment should share the turn x");
});

test("wirePath endpoints match input coordinates", () => {
  const a = { x: 5, y: 15 };
  const b = { x: 75, y: 55 };
  const pts = wirePath(a, b);
  assert.deepEqual(pts[0], a);
  assert.deepEqual(pts[pts.length - 1], b);
});
