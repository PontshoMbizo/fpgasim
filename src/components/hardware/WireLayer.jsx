"use client";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { COLORS, STATE_COLORS } from "../../lib/theme";
import { pinAnchor, wirePath } from "./chipGeometry";
import { clientToSVG } from "./svgCoords";
import { MAX_WAYPOINTS_PER_WIRE } from "../../lib/componentSchema";
import { useSim } from "../../lib/simState";

// Neutral wire colour for chip-only wires (no board state)
const WIRE_NEUTRAL  = "#6b7280";
const WIRE_HOVER    = COLORS.info;
const WIRE_SELECTED = COLORS.accent;
const PAD_NORMAL    = "#6b7280";
const PAD_HOVER     = COLORS.info;
const PAD_SELECTED  = COLORS.accent;
const PAD_RADIUS    = 4;
const WAYPOINT_SIZE = 6; // square handle side length, centred on the bend point

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
 * Manual routing: double-click a segment to insert a bend point there; drag a
 * bend point (small square handle, shown when the wire is hovered/selected) to
 * move it; double-click a bend point to remove it.
 *
 * Props:
 *   boardPins  — the full board pins array (same as what HardwareViewer passes to PinOverlay)
 *   svgRef     — ref to the parent <svg>, needed for click/drag coordinate conversion
 *                (only required for manual-routing edits; wire display works without it)
 */
export default function WireLayer({ boardPins = [], svgRef }) {
  const { components, wires, setWires, pinStates } = useSim();

  const [hoveredId,  setHoveredId]  = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // Waypoint drag state — { wireId, idx } in a ref (no re-render on move),
  // live preview position in state (mirrors ExternalChipLayer's chip-drag pattern).
  const dragRef = useRef(null);
  const [dragWp, setDragWp] = useState(null); // { wireId, idx, x, y }

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

  // ---- Waypoint drag lifecycle -------------------------------------------------
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragRef.current) return;
      const svg = svgRef && svgRef.current;
      if (!svg) return;
      const pt = clientToSVG(svg, e.clientX, e.clientY);
      setDragWp({ ...dragRef.current, x: pt.x, y: pt.y });
    };

    const handleMouseUp = () => {
      if (dragRef.current && dragWp) {
        const { wireId, idx } = dragRef.current;
        setWires((prev) =>
          prev.map((w) => {
            if (w.id !== wireId) return w;
            const wps = [...(w.waypoints || [])];
            wps[idx] = { x: dragWp.x, y: dragWp.y };
            return { ...w, waypoints: wps };
          })
        );
      }
      dragRef.current = null;
      setDragWp(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragWp, svgRef, setWires]);

  const handleWireClick = useCallback((e, wireId) => {
    e.stopPropagation();
    setSelectedId((prev) => (prev === wireId ? null : wireId));
  }, []);

  const handleSegmentDoubleClick = useCallback(
    (e, wireId, segIndex) => {
      e.stopPropagation();
      const svg = svgRef && svgRef.current;
      if (!svg) return;
      const pt = clientToSVG(svg, e.clientX, e.clientY);
      setWires((prev) =>
        prev.map((w) => {
          if (w.id !== wireId) return w;
          const wps = [...(w.waypoints || [])];
          if (wps.length >= MAX_WAYPOINTS_PER_WIRE) return w;
          wps.splice(segIndex, 0, pt);
          return { ...w, waypoints: wps };
        })
      );
    },
    [svgRef, setWires]
  );

  const handleWaypointMouseDown = useCallback((e, wireId, idx) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    dragRef.current = { wireId, idx };
  }, []);

  const handleWaypointDoubleClick = useCallback(
    (e, wireId, idx) => {
      e.stopPropagation();
      setWires((prev) =>
        prev.map((w) => {
          if (w.id !== wireId) return w;
          const wps = [...(w.waypoints || [])];
          wps.splice(idx, 1);
          if (wps.length) return { ...w, waypoints: wps };
          const { waypoints: _drop, ...rest } = w;
          return rest;
        })
      );
    },
    [setWires]
  );

  return (
    <g>
      {wires.map((wire) => {
        const ptA = resolveEndpoint(wire.a, components, boardPins);
        const ptB = resolveEndpoint(wire.b, components, boardPins);

        // Skip wires where either endpoint can't be resolved (dangling)
        if (!ptA || !ptB) return null;

        const isHovered  = hoveredId  === wire.id;
        const isSelected = selectedId === wire.id;

        // Live-preview the waypoint being dragged, if any
        const waypoints = (wire.waypoints || []).map((wp, i) =>
          dragWp && dragWp.wireId === wire.id && dragWp.idx === i ? { x: dragWp.x, y: dragWp.y } : wp
        );
        const atWaypointCap = waypoints.length >= MAX_WAYPOINTS_PER_WIRE;

        const path   = wirePath(ptA, ptB, waypoints);
        const points = path.map((p) => `${p.x},${p.y}`).join(" ");

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
          >
            {/* Per-segment hit targets: click selects the wire, double-click
                inserts a bend point at that spot on the segment. */}
            {path.slice(0, -1).map((p, i) => {
              const q = path[i + 1];
              return (
                <line
                  key={i}
                  x1={p.x}
                  y1={p.y}
                  x2={q.x}
                  y2={q.y}
                  stroke="transparent"
                  strokeWidth="12"
                  className="cursor-pointer"
                  onClick={(e) => handleWireClick(e, wire.id)}
                  onDoubleClick={(e) => !atWaypointCap && handleSegmentDoubleClick(e, wire.id, i)}
                />
              );
            })}
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
            {/* Bend-point handles — draggable, shown on hover/select */}
            {(isSelected || isHovered) &&
              waypoints.map((wp, idx) => (
                <rect
                  key={idx}
                  x={wp.x - WAYPOINT_SIZE / 2}
                  y={wp.y - WAYPOINT_SIZE / 2}
                  width={WAYPOINT_SIZE}
                  height={WAYPOINT_SIZE}
                  fill={isSelected ? PAD_SELECTED : PAD_HOVER}
                  className="cursor-move"
                  onMouseDown={(e) => handleWaypointMouseDown(e, wire.id, idx)}
                  onDoubleClick={(e) => handleWaypointDoubleClick(e, wire.id, idx)}
                />
              ))}
          </g>
        );
      })}
    </g>
  );
}
