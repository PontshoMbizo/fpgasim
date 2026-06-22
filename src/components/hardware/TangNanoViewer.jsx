"use client";
import React, { useState, useMemo } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

// Data
import PINS from "../../data/pins.json";
import COMPONENTS from "../../data/components.json";

// Components
import BoardImage from "./BoardImage";
import ComponentOverlay from "./ComponentOverlay";
import PinOverlay from "./PinOverlay";
import SearchPanel from "./SearchPanel";
import FloatingInspector from "./FloatingInspector";

const BOARD_WIDTH = 1200;
const BOARD_HEIGHT = 700;

export default function TangNanoViewer() {
  const [search, setSearch] = useState("");
  const [hoveredPin, setHoveredPin] = useState(null);
  const [hoveredComponent, setHoveredComponent] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [layer, setLayer] = useState("ALL");

  const filteredPins = useMemo(() => {
    return PINS.filter((pin) => {
      const searchMatch =
        search === "" ||
        pin.id.toLowerCase().includes(search.toLowerCase()) ||
        pin.bank.toLowerCase().includes(search.toLowerCase()) ||
        pin.special.some((s) => s.toLowerCase().includes(search.toLowerCase()));

      const layerMatch = layer === "ALL" || pin.layer === layer;

      return searchMatch && layerMatch;
    });
  }, [search, layer]);

  const highlightedNet = hoveredPin ? hoveredPin.special : [];

  return (
    <div className="w-full h-full bg-[#1e1e1e] flex flex-col font-sans relative">
      
      {/* Background Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none z-0" 
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} 
      />

      <SearchPanel 
        search={search} 
        setSearch={setSearch} 
        layer={layer} 
        setLayer={setLayer} 
      />

      <div
        className="flex-1 overflow-hidden relative z-10"
        onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
      >
        <TransformWrapper minScale={0.5} maxScale={8} centerOnInit>
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
                  pin.special.some((s) => highlightedNet.includes(s));

                return (
                  <PinOverlay
                    key={pin.id}
                    pin={pin}
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
      </div>

      <FloatingInspector 
        hoveredPin={hoveredPin} 
        hoveredComponent={hoveredComponent} 
        mousePos={mousePos} 
      />
      
    </div>
  );
}
