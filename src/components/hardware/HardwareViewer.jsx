"use client";
import React, { useState, useMemo } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

// Components
import BoardImage from "./BoardImage";
import ComponentOverlay from "./ComponentOverlay";
import PinOverlay from "./PinOverlay";
import SearchPanel from "./SearchPanel";
import FloatingInspector from "./FloatingInspector";
import Legend from "./Legend";

import { useSim } from "../../lib/simState";

export default function HardwareViewer({ board }) {
  const [search, setSearch] = useState("");
  const [hoveredPin, setHoveredPin] = useState(null);
  const [hoveredComponent, setHoveredComponent] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [layer, setLayer] = useState("ALL");

  const { pinStates } = useSim();

  const PINS = board?.pins || [];
  const COMPONENTS = board?.components || [];
  const BOARD_WIDTH = board?.width || 1200;
  const BOARD_HEIGHT = board?.height || 700;

  // Distinct layers present in the data drive the filter dropdown.
  const layers = useMemo(
    () => ["ALL", ...Array.from(new Set(PINS.map((p) => p.layer))).sort()],
    [PINS]
  );

  const filteredPins = useMemo(() => {
    const q = search.toLowerCase();
    return PINS.filter((pin) => {
      const searchMatch =
        search === "" ||
        pin.id.toLowerCase().includes(q) ||
        pin.bank.toLowerCase().includes(q) ||
        pin.special.some((s) => s.toLowerCase().includes(q));
      const layerMatch = layer === "ALL" || pin.layer === layer;
      return searchMatch && layerMatch;
    });
  }, [search, layer, PINS]);

  const highlightedNet = hoveredPin ? hoveredPin.special : [];

  return (
    <div className="w-full h-full bg-panel flex flex-col font-sans relative">

      {/* Background Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none z-0"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}
      />

      <div
        className="flex-1 overflow-hidden relative z-10"
        onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
      >
        <SearchPanel
          search={search}
          setSearch={setSearch}
          layer={layer}
          setLayer={setLayer}
          layers={layers}
          count={filteredPins.length}
        />

        {/* smooth=false → each wheel tick adds a fixed `step` (scale + ±1*step)
            instead of step*deltaY, which jumped straight to maxScale on one tick. */}
        <TransformWrapper minScale={0.5} maxScale={8} centerOnInit smooth={false} wheel={{ step: 0.3 }}>
          <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
            <svg
              viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
              width={BOARD_WIDTH}
              height={BOARD_HEIGHT}
              className="drop-shadow-[0_28px_60px_rgba(0,0,0,0.65)]"
            >
              <BoardImage width={BOARD_WIDTH} height={BOARD_HEIGHT} />

              {COMPONENTS.map((component) => (
                <ComponentOverlay
                  key={component.name}
                  component={component}
                  isHovered={hoveredComponent?.name === component.name}
                  onHover={() => setHoveredComponent(component)}
                  onLeave={() => setHoveredComponent(null)}
                />
              ))}

              {filteredPins.map((pin) => {
                const isHighlighted =
                  highlightedNet.length > 0 &&
                  pin.id !== hoveredPin?.id &&
                  pin.special.some((s) => highlightedNet.includes(s));

                return (
                  <PinOverlay
                    key={pin.id}
                    pin={pin}
                    state={pinStates[pin.id]}
                    isHovered={hoveredPin?.id === pin.id}
                    isHighlighted={isHighlighted}
                    onHover={() => setHoveredPin(pin)}
                    onLeave={() => setHoveredPin(null)}
                  />
                );
              })}
            </svg>
          </TransformComponent>
        </TransformWrapper>

        <Legend />
      </div>

      <FloatingInspector
        hoveredPin={hoveredPin}
        hoveredComponent={hoveredComponent}
        pinState={hoveredPin ? pinStates[hoveredPin.id] : undefined}
        mousePos={mousePos}
      />

    </div>
  );
}
