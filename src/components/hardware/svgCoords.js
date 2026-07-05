"use client";
// Shared client-only SVG coordinate helper. Kept separate from chipGeometry.js,
// which is intentionally pure (no browser APIs) so it stays importable from
// Node tests and server code.

/**
 * Convert a client (screen) coordinate to the SVG canvas's own coordinate
 * space, correctly accounting for any zoom/pan transform applied above it
 * (e.g. react-zoom-pan-pinch).
 *
 * @param {SVGSVGElement} svgEl
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{ x: number, y: number }}
 */
export function clientToSVG(svgEl, clientX, clientY) {
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const inv = ctm.inverse();
  return {
    x: inv.a * clientX + inv.c * clientY + inv.e,
    y: inv.b * clientX + inv.d * clientY + inv.f,
  };
}
