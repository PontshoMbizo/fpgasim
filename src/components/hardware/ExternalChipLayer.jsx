"use client";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { COLORS } from "../../lib/theme";
import {
  chipBox,
  pinAnchor,
  pinLabel,
  splitPins,
  wirePath,
  nextRotation,
  CHIP_PIN_STUB,
  CHIP_PAD_RADIUS,
  CHIP_PIN_SPACING,
  CHIP_V_PADDING,
  CHIP_LABEL_FONT_SIZE,
  CHIP_LABEL_MIN_FONT_SIZE,
} from "./chipGeometry";
import { clientToSVG } from "./svgCoords";
import { MAX_WAYPOINTS_PER_WIRE } from "../../lib/componentSchema";
import { useSim } from "../../lib/simState";

// ---- colour constants (per spec: near-black body, thick light-gray border) --
const CHIP_BODY_FILL    = "#111418";
const CHIP_BORDER_COLOR = "#9ca3af"; // light-gray
const CHIP_BORDER_WIDTH = 2;
const CHIP_LABEL_COLOR  = COLORS.textPrimary;  // white
const CHIP_NAME_COLOR   = COLORS.textSecondary;
const CHIP_STUB_COLOR   = CHIP_BORDER_COLOR;
const CHIP_PAD_FILL     = CHIP_BORDER_COLOR;
const CHIP_PAD_SELECTED = COLORS.accent;
const CHIP_PAD_WIRING   = COLORS.info;
const SNAP_GRID         = 10;

// Neutral wire colour (chip-only wire, no board-pin state)
const WIRE_COLOR_NEUTRAL = "#6b7280";
// Rubber-band in-progress wire
const RUBBER_BAND_COLOR  = COLORS.info;

// ---- Utilities --------------------------------------------------------------

/** Snap a value to the nearest multiple of SNAP_GRID. */
function snap(v) {
  return Math.round(v / SNAP_GRID) * SNAP_GRID;
}

/** Determine auto-shrink font size so label text fits within maxWidth. */
function labelFontSize(label, maxWidth) {
  // Estimate: each char is ~0.62 * fontSize px wide
  let fs = CHIP_LABEL_FONT_SIZE;
  while (fs > CHIP_LABEL_MIN_FONT_SIZE) {
    const estimatedWidth = label.length * 0.62 * fs;
    if (estimatedWidth <= maxWidth) break;
    fs -= 0.5;
  }
  return fs;
}

// ---- ChipBody ---------------------------------------------------------------

/**
 * Renders a single chip: body rect, pin stubs, circular pads, pin labels,
 * and the chip display name.
 *
 * Props:
 *   component        — component object from simState
 *   isSelected       — bool; highlights border
 *   wiringFromPin    — {comp,pin} | null; highlights that pad in wiring-source colour
 *   wiringActive     — bool; if true, pads are highlighted as wiring targets
 *   onBodyMouseDown  — (e, componentId) => void  (drag starts here)
 *   onPadClick       — (e, {comp, pin, x, y}) => void  (wiring pad click)
 *   onBodyClick      — (e, componentId) => void  (select)
 *   onBodyDblClick   — (e, componentId) => void  (edit)
 */
function ChipBody({
  component,
  isSelected,
  wiringFromPin,
  wiringActive,
  onBodyMouseDown,
  onPadClick,
  onBodyClick,
  onBodyDblClick,
}) {
  const { w, h, westPins, eastPins } = chipBox(component);
  const cx = component.x;
  const cy = component.y;
  const rotation = component.rotation || 0;

  // Interior label area width = half box minus a bit of centre gap
  const labelAreaW = w / 2 - 6;

  const borderColor = isSelected ? COLORS.accent : CHIP_BORDER_COLOR;

  // Helper: render one side's pins
  const renderPins = (pins, side) => {
    return pins.map((pin, idx) => {
      const padY   = cy + CHIP_V_PADDING + idx * CHIP_PIN_SPACING;
      const isWest = side === "west";
      const stubX0 = isWest ? cx : cx + w;
      const stubX1 = isWest ? cx - CHIP_PIN_STUB : cx + w + CHIP_PIN_STUB;
      const padX   = stubX1;

      const isWiringSource =
        wiringFromPin && wiringFromPin.comp === component.id && wiringFromPin.pin === pin.name;
      const padFill = isWiringSource
        ? CHIP_PAD_WIRING
        : wiringActive
          ? CHIP_PAD_WIRING
          : CHIP_PAD_FILL;

      // Label: placed inside the chip body next to the stub
      const labelX     = isWest ? cx + 5 : cx + w - 5;
      const labelAnchor = isWest ? "start" : "end";
      const label      = pinLabel(pin);
      const fs         = labelFontSize(label, labelAreaW);

      // Click payloads (wiring source/rubber-band) need the ABSOLUTE post-rotation
      // position, since the rubber band and committed wires render in the outer,
      // unrotated layer — not inside this chip's own rotated <g>. pinAnchor()
      // already applies the same rotation this body is drawn with, so reuse it
      // rather than re-deriving the rotated point here.
      const anchor = pinAnchor(component, pin.name);
      const padClickPayload = {
        comp: component.id,
        pin: pin.name,
        x: anchor ? anchor.x : padX,
        y: anchor ? anchor.y : padY,
      };

      return (
        <g key={pin.name}>
          {/* Stub line from body edge to pad */}
          <line
            x1={stubX0}
            y1={padY}
            x2={stubX1}
            y2={padY}
            stroke={CHIP_STUB_COLOR}
            strokeWidth="1.5"
          />
          {/* Pin label inside the body */}
          <text
            x={labelX}
            y={padY}
            textAnchor={labelAnchor}
            dominantBaseline="central"
            fontSize={fs}
            fill={CHIP_LABEL_COLOR}
            className="select-none pointer-events-none"
            style={{ fontFamily: "serif, Georgia, 'Times New Roman'" }}
          >
            {label}
          </text>
          {/* Circular pad — hit target + visual */}
          <circle
            cx={padX}
            cy={padY}
            r={CHIP_PAD_RADIUS + 4}
            fill="transparent"
            className="cursor-crosshair"
            onClick={(e) => onPadClick(e, padClickPayload)}
          />
          <circle
            cx={padX}
            cy={padY}
            r={CHIP_PAD_RADIUS}
            fill={padFill}
            stroke={isWiringSource ? COLORS.accent : "none"}
            strokeWidth="1.5"
            className="pointer-events-none"
          />
        </g>
      );
    });
  };

  return (
    <g transform={rotation ? `rotate(${rotation} ${cx + w / 2} ${cy + h / 2})` : undefined}>
      {/* Body rectangle */}
      <rect
        x={cx}
        y={cy}
        width={w}
        height={h}
        fill={CHIP_BODY_FILL}
        stroke={borderColor}
        strokeWidth={CHIP_BORDER_WIDTH}
        rx="3"
        className="cursor-move"
        onMouseDown={(e) => onBodyMouseDown(e, component.id)}
        onClick={(e) => onBodyClick(e, component.id)}
        onDoubleClick={(e) => onBodyDblClick(e, component.id)}
      />
      {/* Enlarged transparent drag hit-target over the whole body */}
      <rect
        x={cx}
        y={cy}
        width={w}
        height={h}
        fill="transparent"
        className="cursor-move"
        onMouseDown={(e) => onBodyMouseDown(e, component.id)}
        onClick={(e) => onBodyClick(e, component.id)}
        onDoubleClick={(e) => onBodyDblClick(e, component.id)}
      />

      {/* Pin stubs + labels + pads */}
      {renderPins(westPins, "west")}
      {renderPins(eastPins, "east")}

      {/* Chip display name, centred at the bottom of the box */}
      <text
        x={cx + w / 2}
        y={cy + h - 4}
        textAnchor="middle"
        dominantBaseline="auto"
        fontSize="9"
        fill={CHIP_NAME_COLOR}
        className="select-none pointer-events-none"
        style={{ fontFamily: "monospace" }}
      >
        {component.name}
      </text>
    </g>
  );
}

// ---- ExternalChipLayer (main export) ----------------------------------------

/**
 * Renders all custom chips inside the board SVG and manages interactive state
 * for dragging, wiring mode, selection, and deletion.
 *
 * --- Prop contract ---
 *
 * svgRef        React ref to the parent <svg> element; required for correct
 *               coordinate conversion under zoom/pan.
 *
 * onEditChip    (componentId: string) => void
 *               Called on double-click of a chip body. HardwareViewer stores
 *               the id and passes it to ComponentsPanel (TODO — see below).
 *
 * onWiringBoardPinRef  React ref ({ current: fn }) that the layer populates
 *               with its board-pin commit function on each render.
 *               HardwareViewer stores the ref and calls current(pin) when a
 *               board pin is clicked while in wiring mode.
 *               If null, board-pin wiring is disabled.
 *
 * NOTE: wiring mode state is kept here. HardwareViewer passes
 *   wiringActive and wiringFromPin down to PinOverlay (via a prop) so that
 *   board pins show the "wiring target" affordance during wiring.
 *
 * --- Hooks for the panel agent ---
 *
 * selectedChipId  — lifted to HardwareViewer via onSelectionChange(id|null)
 *                   so ComponentsPanel can highlight the selected chip.
 *
 * wiringActive    — exposed via onWiringStateChange(bool) so HardwareViewer
 *                   can pass the flag into PinOverlay for visual affordance.
 *
 * editingChipId   — exposed via onEditChip(id); HardwareViewer should call
 *                   setComponentsPanelOpen(true) and setPendingEditId(id).
 *                   Currently stored as local state with a TODO comment.
 */
export default function ExternalChipLayer({
  svgRef,
  onEditChip,
  onWiringBoardPinRef,
  onWiringStateChange,
  onSelectionChange,
}) {
  const { components, setComponents, wires, setWires } = useSim();

  // Which chip is selected (null = none)
  const [selectedId, setSelectedId] = useState(null);

  // Drag state — kept in a ref so mousemove handlers don't cause re-renders
  const dragRef = useRef(null);
  // SVG position of the chip being dragged (updated during drag, committed on mouseup)
  const [dragPos, setDragPos] = useState(null);

  // Wiring mode: { comp, pin, x, y } of the source pad, or null
  const [wiringFrom, setWiringFrom] = useState(null);
  // Rubber-band cursor position in SVG coords
  const [cursorSVG, setCursorSVG] = useState(null);

  // ---- Selection side-effect --------------------------------------------------
  useEffect(() => {
    onSelectionChange && onSelectionChange(selectedId);
  }, [selectedId, onSelectionChange]);

  // ---- Wiring state side-effect -----------------------------------------------
  useEffect(() => {
    onWiringStateChange && onWiringStateChange(!!wiringFrom);
  }, [wiringFrom, onWiringStateChange]);

  // ---- Board-pin wiring commit ------------------------------------------------
  // Called by HardwareViewer when user clicks a board pin during wiring mode.
  // We expose this as an imperative handle via a stable callback ref so
  // HardwareViewer can call it without re-subscribing on every render.
  const commitWireToBoardPin = useCallback(
    (boardPin) => {
      if (!wiringFrom) return;
      const newWire = {
        id: `w${Date.now()}`,
        a: { comp: wiringFrom.comp, pin: wiringFrom.pin },
        b: { pin: boardPin.id },
        ...(wiringFrom.waypoints?.length ? { waypoints: wiringFrom.waypoints } : {}),
      };
      setWires((prev) => [...prev, newWire]);
      setWiringFrom(null);
      setCursorSVG(null);
    },
    [wiringFrom, setWires]
  );

  // Expose the board-pin commit so HardwareViewer can wire it up.
  // HardwareViewer passes onWiringBoardPinRef (a React ref object) which the layer
  // populates on each render so it always holds the latest commit function.
  useEffect(() => {
    if (onWiringBoardPinRef) {
      onWiringBoardPinRef.current = commitWireToBoardPin;
    }
  }, [commitWireToBoardPin, onWiringBoardPinRef]);

  // ---- Global keyboard handler -------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't fire while user is typing in an input/textarea
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;

      if (e.key === "Escape") {
        setWiringFrom(null);
        setCursorSVG(null);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selectedId) return;
        // Remove selected chip AND its wires
        setComponents((prev) => prev.filter((c) => c.id !== selectedId));
        // setComponents already calls pruneWires, but wires referencing the removed
        // chip will survive if the chip is gone before pruneWires runs on the new
        // components array.  pruneWires inside setComponents handles this correctly.
        setSelectedId(null);
        return;
      }

      if ((e.key === "r" || e.key === "R") && selectedId && !wiringFrom) {
        setComponents((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, rotation: nextRotation(c.rotation) } : c))
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, wiringFrom, setComponents]);

  // ---- Global mouse-move for drag + rubber-band -------------------------------
  useEffect(() => {
    const handleMouseMove = (e) => {
      const svg = svgRef && svgRef.current;
      if (!svg) return;
      const svgPt = clientToSVG(svg, e.clientX, e.clientY);

      // Rubber-band line cursor update
      if (wiringFrom) {
        setCursorSVG(svgPt);
      }

      // Drag update
      if (dragRef.current) {
        const { compId, offsetX, offsetY } = dragRef.current;
        const newX = snap(svgPt.x - offsetX);
        const newY = snap(svgPt.y - offsetY);
        setDragPos({ id: compId, x: newX, y: newY });
      }
    };

    const handleMouseUp = () => {
      if (dragRef.current && dragPos) {
        const { compId } = dragRef.current;
        setComponents((prev) =>
          prev.map((c) =>
            c.id === compId ? { ...c, x: dragPos.x, y: dragPos.y } : c
          )
        );
      }
      dragRef.current = null;
      setDragPos(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [wiringFrom, dragPos, svgRef, setComponents]);

  // ---- Manual routing: click empty canvas during wiring to drop a bend point --
  // Pad clicks (handlePadClick) and board-pin clicks (PinOverlay) both call
  // e.stopPropagation() on mousedown/click, so this window-level listener only
  // ever sees clicks that landed on genuinely empty canvas — i.e. a deliberate
  // "place a bend here" click, never a wire-committing click.
  useEffect(() => {
    if (!wiringFrom) return;

    const handleCanvasClick = (e) => {
      const svg = svgRef && svgRef.current;
      if (!svg) return;
      const pt = clientToSVG(svg, e.clientX, e.clientY);
      setWiringFrom((prev) => {
        if (!prev) return prev;
        const waypoints = prev.waypoints || [];
        if (waypoints.length >= MAX_WAYPOINTS_PER_WIRE) return prev;
        return { ...prev, waypoints: [...waypoints, pt] };
      });
    };

    window.addEventListener("click", handleCanvasClick);
    return () => window.removeEventListener("click", handleCanvasClick);
  }, [wiringFrom, svgRef]);

  // ---- Handlers ---------------------------------------------------------------

  const handleBodyMouseDown = useCallback(
    (e, compId) => {
      if (wiringFrom) return; // don't start drag during wiring
      e.stopPropagation();
      // Left button only
      if (e.button !== 0) return;

      const svg = svgRef && svgRef.current;
      if (!svg) return;
      const svgPt = clientToSVG(svg, e.clientX, e.clientY);
      const comp  = components.find((c) => c.id === compId);
      if (!comp) return;

      dragRef.current = {
        compId,
        offsetX: svgPt.x - comp.x,
        offsetY: svgPt.y - comp.y,
      };

      // Prevent react-zoom-pan-pinch from panning while we're dragging.
      // Strategy: stop propagation of the mousedown so the library never sees it.
      // The library attaches its pan handler to the wrapper div, not window,
      // so stopPropagation on the SVG child element is sufficient.
      // (react-zoom-pan-pinch v4 also supports panning.excluded class names,
      //  but stopPropagation is cleaner here since ExternalChipLayer manages
      //  the full drag lifecycle on window and doesn't need the library at all.)
    },
    [wiringFrom, svgRef, components]
  );

  const handleBodyClick = useCallback((e, compId) => {
    e.stopPropagation();
    setSelectedId((prev) => (prev === compId ? null : compId));
  }, []);

  const handleBodyDblClick = useCallback(
    (e, compId) => {
      e.stopPropagation();
      setSelectedId(compId);
      // TODO(panel-agent): HardwareViewer should open ComponentsPanel here.
      // When ComponentsPanel is implemented, wire:
      //   onEditChip(compId)  →  setPendingEditId(compId); setComponentsPanelOpen(true)
      onEditChip && onEditChip(compId);
    },
    [onEditChip]
  );

  const handlePadClick = useCallback(
    (e, padInfo) => {
      e.stopPropagation();
      if (!wiringFrom) {
        // Start wiring from this pad
        const svg = svgRef && svgRef.current;
        const svgPt = svg ? clientToSVG(svg, e.clientX, e.clientY) : { x: padInfo.x, y: padInfo.y };
        setWiringFrom({ comp: padInfo.comp, pin: padInfo.pin, x: padInfo.x, y: padInfo.y, waypoints: [] });
        setCursorSVG(svgPt);
      } else {
        // Commit wire to this pad (second click = destination)
        // Don't allow wiring to the same pin or the same chip's own output
        if (wiringFrom.comp === padInfo.comp && wiringFrom.pin === padInfo.pin) {
          // Clicking same pad cancels
          setWiringFrom(null);
          setCursorSVG(null);
          return;
        }
        const newWire = {
          id: `w${Date.now()}`,
          a: { comp: wiringFrom.comp, pin: wiringFrom.pin },
          b: { comp: padInfo.comp, pin: padInfo.pin },
          ...(wiringFrom.waypoints?.length ? { waypoints: wiringFrom.waypoints } : {}),
        };
        setWires((prev) => [...prev, newWire]);
        setWiringFrom(null);
        setCursorSVG(null);
      }
    },
    [wiringFrom, svgRef, setWires]
  );

  // ---- Rubber-band polyline path ----------------------------------------------

  let rubberBandPoints = null;
  if (wiringFrom && cursorSVG) {
    const srcPts = wirePath(
      { x: wiringFrom.x, y: wiringFrom.y },
      cursorSVG,
      wiringFrom.waypoints
    );
    rubberBandPoints = srcPts.map((p) => `${p.x},${p.y}`).join(" ");
  }

  // ---- Render -----------------------------------------------------------------

  return (
    <g>
      {components.map((comp) => {
        // During drag, override the visual position of the dragged chip
        const displayComp =
          dragPos && dragPos.id === comp.id
            ? { ...comp, x: dragPos.x, y: dragPos.y }
            : comp;

        return (
          <ChipBody
            key={comp.id}
            component={displayComp}
            isSelected={selectedId === comp.id}
            wiringFromPin={wiringFrom}
            wiringActive={!!wiringFrom}
            onBodyMouseDown={handleBodyMouseDown}
            onPadClick={handlePadClick}
            onBodyClick={handleBodyClick}
            onBodyDblClick={handleBodyDblClick}
          />
        );
      })}

      {/* Rubber-band wire during wiring mode */}
      {rubberBandPoints && (
        <polyline
          points={rubberBandPoints}
          fill="none"
          stroke={RUBBER_BAND_COLOR}
          strokeWidth="1.5"
          strokeDasharray="5,3"
          className="pointer-events-none"
          opacity="0.8"
        />
      )}

      {/* Bend points already placed for the in-progress wire (click empty canvas to add more) */}
      {wiringFrom?.waypoints?.map((wp, i) => (
        <circle
          key={i}
          cx={wp.x}
          cy={wp.y}
          r={3}
          fill={RUBBER_BAND_COLOR}
          className="pointer-events-none"
          opacity="0.9"
        />
      ))}
    </g>
  );
}
