// chipGeometry.js — pure geometry for external chip (DIP) rendering.
// No React, no browser APIs — safe to import from tests and server code.
//
// Coordinate system: SVG board-canvas space (same as pins.json x/y).
// A "chip box" is placed at (component.x, component.y) = top-left corner.

// ---- Layout constants -------------------------------------------------------

/** Vertical spacing between adjacent pins on the same side (px). */
export const CHIP_PIN_SPACING = 20;

/** Length of the stub line that extends outside the chip body to the pad (px). */
export const CHIP_PIN_STUB = 14;

/** Radius of the circular pad at the end of each pin stub (px). */
export const CHIP_PAD_RADIUS = 4;

/** Minimum chip width (px) — enforced even with short pin labels. */
export const CHIP_MIN_WIDTH = 80;

/** Horizontal padding inside the box (each side) reserved for pin labels. */
export const CHIP_LABEL_PADDING = 8;

/** Height padding above/below the topmost/bottommost pin inside the box. */
export const CHIP_V_PADDING = 14;

/** Approximate character width in px at the default label font size. */
const CHAR_WIDTH_EST = 6.5;

/** Default label font size (px). Auto-shrink reduces this if labels overflow. */
export const CHIP_LABEL_FONT_SIZE = 11;

/** Minimum font size the auto-shrink is allowed to reach. */
export const CHIP_LABEL_MIN_FONT_SIZE = 7;

// ---- Helpers ----------------------------------------------------------------

/**
 * Format a pin label, appending /width for bus pins (width > 1).
 * @param {{ name: string, width: number }} pin
 * @returns {string}
 */
export function pinLabel(pin) {
  if (!pin) return "";
  return pin.width > 1 ? `${pin.name}/${pin.width}` : pin.name;
}

/**
 * Split a component's pins into west (inputs) and east (outputs/inout).
 * Returns { west: Pin[], east: Pin[] }.
 * @param {{ pins: Array<{ dir: string }> }} component
 */
export function splitPins(component) {
  const pins = component.pins || [];
  const west = pins.filter((p) => p.dir === "input");
  const east = pins.filter((p) => p.dir !== "input");
  return { west, east };
}

// ---- chipBox ----------------------------------------------------------------

/**
 * Compute the width and height of the chip box in board-SVG px.
 *
 * Width is driven by the longest pin label on either side;
 * height is driven by the larger of the two pin-count sides.
 *
 * @param {{ pins: Array<{ name: string, width: number, dir: string }> }} component
 * @returns {{ w: number, h: number, westPins: Pin[], eastPins: Pin[] }}
 */
export function chipBox(component) {
  const { west, east } = splitPins(component);
  const pinCount = Math.max(west.length, east.length, 1);

  // Estimate label pixel widths to determine required interior width
  const maxLabelChars = Math.max(
    ...[...west, ...east].map((p) => pinLabel(p).length),
    3 // minimum
  );
  const labelWidthEach = maxLabelChars * CHAR_WIDTH_EST + CHIP_LABEL_PADDING * 2;

  // Both sides' labels must fit within half the interior width each
  const interiorMinWidth = labelWidthEach * 2 + 8; // 8px gap in the centre
  const w = Math.max(CHIP_MIN_WIDTH, Math.ceil(interiorMinWidth / 10) * 10);
  const h = pinCount * CHIP_PIN_SPACING + CHIP_V_PADDING * 2;

  return { w, h, westPins: west, eastPins: east };
}

// ---- pinAnchor --------------------------------------------------------------

/**
 * Return the SVG-canvas position of a chip pin's PAD (the circular endpoint),
 * plus which side it's on.
 *
 * @param {{ x: number, y: number, pins: Pin[] }} component
 * @param {string} pinName
 * @returns {{ x: number, y: number, side: "west"|"east" } | null}
 */
export function pinAnchor(component, pinName) {
  const { w, h, westPins, eastPins } = chipBox(component);
  const cx = component.x;
  const cy = component.y;

  const wi = westPins.findIndex((p) => p.name === pinName);
  if (wi !== -1) {
    const y = cy + CHIP_V_PADDING + wi * CHIP_PIN_SPACING;
    return { x: cx - CHIP_PIN_STUB, y, side: "west" };
  }

  const ei = eastPins.findIndex((p) => p.name === pinName);
  if (ei !== -1) {
    const y = cy + CHIP_V_PADDING + ei * CHIP_PIN_SPACING;
    return { x: cx + w + CHIP_PIN_STUB, y, side: "east" };
  }

  return null;
}

// ---- nextChipPosition -------------------------------------------------------

/**
 * Find a free position for a new chip, preferring the space to the right of
 * the board image and falling back to below it.
 *
 * The strategy: start 24px to the right of boardWidth, stack chips vertically
 * with 20px gaps. If that would push below boardHeight, start a new column.
 *
 * @param {Array<{ x: number, y: number, pins: Pin[] }>} components  Existing chips.
 * @param {number} boardWidth   SVG canvas width (e.g. 1200).
 * @param {number} boardHeight  SVG canvas height (e.g. 700).
 * @returns {{ x: number, y: number }}
 */
export function nextChipPosition(components, boardWidth, boardHeight) {
  const GAP = 20;
  const START_X = boardWidth + 24;
  const START_Y = 40;
  const COL_WIDTH = CHIP_MIN_WIDTH + CHIP_PIN_STUB * 2 + GAP;

  if (components.length === 0) {
    return { x: START_X, y: START_Y };
  }

  // Try each column slot greedily
  let col = 0;
  for (;;) {
    const x = START_X + col * COL_WIDTH;
    let y = START_Y;
    let fits = true;

    for (const c of components) {
      const { h } = chipBox(c);
      if (Math.abs(c.x - x) < COL_WIDTH * 0.8) {
        // Same column — need to clear this chip's vertical extent
        const bottom = c.y + h + GAP;
        if (y < bottom) y = bottom;
      }
    }

    if (y < boardHeight + 200) {
      return { x, y };
    }
    col++;
    if (col > 10) {
      // Absolute fallback — place below the last chip
      break;
    }
  }

  // Fallback: just place at an offset from the last component
  const last = components[components.length - 1];
  const { h } = chipBox(last);
  return { x: last.x, y: last.y + h + GAP };
}

// ---- wirePath ---------------------------------------------------------------

/**
 * Generate an L-routed polyline between two SVG-canvas points.
 * Returns an array of {x,y} waypoints (including both endpoints).
 *
 * Routing rule: horizontal first, then vertical (matches CircuitJS style).
 * When both endpoints are on the same horizontal level, a single straight
 * segment is returned.
 *
 * @param {{ x: number, y: number }} a  Start point.
 * @param {{ x: number, y: number }} b  End point.
 * @returns {Array<{ x: number, y: number }>}
 */
export function wirePath(a, b) {
  if (a.y === b.y) {
    // Horizontal straight line
    return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
  }
  if (a.x === b.x) {
    // Vertical straight line
    return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
  }
  // L-route: horizontal to mid-x, then vertical
  const midX = Math.round((a.x + b.x) / 2);
  return [
    { x: a.x, y: a.y },
    { x: midX, y: a.y },
    { x: midX, y: b.y },
    { x: b.x, y: b.y },
  ];
}
