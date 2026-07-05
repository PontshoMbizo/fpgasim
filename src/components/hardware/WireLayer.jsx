"use client";
import React, { useState, useCallback, useEffect } from "react";
import { COLORS, STATE_COLORS } from "../../lib/theme";
import { pinAnchor, wirePath } from "./chipGeometry";
import { useSim } from "../../lib/simState";

// Neutral wire colour for chip-only wires (no board state)
const WIRE_NEUTRAL  = "#6b7280";
const WIRE_HOVER    = COLORS.info;
const WIRE_SELECTED = COLORS.accent;
const PAD_NORMAL    = "#6b7280";
const PAD_HOVER     = COLORS.info;
const PAD_SELECTED  = COLORS.accent;
const PAD_RADIUS    = 4;

/**
 * Resolve the SVG-canvas anchor point for a wire endpoint.
 *
 * @param {object}   ep          Wire endpoint: { comp?, pin? } or { pin: boardPinId }
 * @param {object[]} components  Full component array from simState
 * @param {object[]} boardPins   Board pins array (with x, y, id)
 * @returns {{ x: number, y: number } | null}
 */
function resolveEndpoint(ep, components, boardPins) {
  if (!ep) return null;

  if (ep.comp != null) {
    // Chip pin endpoint
    const comp = components.find((c) => c.id === ep.comp);
    if (!comp) return null;
    return pinAnchor(comp, ep.pin);
  }

  if (ep.pin != null) {
    // Board (physical) pin endpoint — look up in boardPins
    const bpin = boardPins.find((p) => String(p.id) === String(ep.pin));
    if (!bpin) return null;
    return { x: bpin.x, y: bpin.y };
  }

  return null;
}

/**
 * Determine the colour of a wire based on whether either endpoint touches a
 * board pin with a live signal state, matching PinOverlay's palette.
 *
 * @param {object}   wire       Wire descriptor
 * @param {object}   pinStates  { [pinId]: 'HIGH'|'LOW'|'X'|'Z' }
 * @param {object[]} boardPins  Board pins array
 * @returns {string}  CSS colour string
 */
function wireColor(wire, pinStates, boardPins) {
  for (const ep of [wire.a, wire.b]) {
    if (!ep || ep.comp != null) continue;  // skip chip-pin endpoints
    const bpin = boardPins.find((p) => String(p.id) === String(ep.pin));
    if (!bpin) continue;
    const state = pinStates[bpin.id];
    if (state && STATE_COLORS[state]) return STATE_COLORS[state];
  }
  return WIRE_NEUTRAL;
}

/**
 * WireLayer — renders committed wires as L-routed SVG polylines.
 *
 * Rendered below ExternalChipLayer (wires beneath chips) and above PinOverlay.
 *
 * Interactions:
 *   - Hover highlights the wire + both endpoint pads.
 *   - Click selects the wire.
 *   - Delete/Backspace removes the selected wire (guarded against input focus).
 *
 * Props:
 *   boardPins  — the full board pins array (same as what HardwareViewer passes to PinOverlay)
 */
export default function WireLayer({ boardPins = [] }) {
  const { components, wires, setWires, pinStates } = useSim();

  const [hoveredId,  setHoveredId]  = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // ---- Keyboard: Delete removes selected wire ---------------------------------
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        setWires((prev) => prev.filter((w) => w.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, setWires]);

  const handleWireClick = useCallback((e, wireId) => {
    e.stopPropagation();
    setSelectedId((prev) => (prev === wireId ? null : wireId));
  }, []);

  return (
    <g>
      {wires.map((wire) => {
        const ptA = resolveEndpoint(wire.a, components, boardPins);
        const ptB = resolveEndpoint(wire.b, components, boardPins);

        // Skip wires where either endpoint can't be resolved (dangling)
        if (!ptA || !ptB) return null;

        const path   = wirePath(ptA, ptB);
        const points = path.map((p) => `${p.x},${p.y}`).join(" ");

        const isHovered  = hoveredId  === wire.id;
        const isSelected = selectedId === wire.id;

        const baseColor = wireColor(wire, pinStates, boardPins);
        const strokeColor = isSelected
          ? WIRE_SELECTED
          : isHovered
            ? WIRE_HOVER
            : baseColor;

        const padColor = isSelected
          ? PAD_SELECTED
          : isHovered
            ? PAD_HOVER
            : PAD_NORMAL;

        return (
          <g
            key={wire.id}
            onMouseEnter={() => setHoveredId(wire.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={(e) => handleWireClick(e, wire.id)}
            className="cursor-pointer"
          >
            {/* Thick transparent hit target so thin wires are easy to click */}
            <polyline
              points={points}
              fill="none"
              stroke="transparent"
              strokeWidth="12"
            />
            {/* Visible wire */}
            <polyline
              points={points}
              fill="none"
              stroke={strokeColor}
              strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="pointer-events-none"
            />
            {/* Endpoint pads */}
            <circle
              cx={ptA.x}
              cy={ptA.y}
              r={PAD_RADIUS}
              fill={padColor}
              className="pointer-events-none"
            />
            <circle
              cx={ptB.x}
              cy={ptB.y}
              r={PAD_RADIUS}
              fill={padColor}
              className="pointer-events-none"
            />
          </g>
        );
      })}
    </g>
  );
}
