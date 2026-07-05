"use client";
import React, { useState, useMemo, useRef, useCallback } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Zap, Cpu } from "lucide-react";

// Components
import BoardImage from "./BoardImage";
import ComponentOverlay from "./ComponentOverlay";
import PinOverlay from "./PinOverlay";
import StimulusOverlay from "./StimulusOverlay";
import StimulusConfigPanel from "./StimulusConfigPanel";
import ComponentsPanel from "./ComponentsPanel";
import SearchPanel from "./SearchPanel";
import FloatingInspector from "./FloatingInspector";
import Legend from "./Legend";
import ExternalChipLayer from "./ExternalChipLayer";
import WireLayer from "./WireLayer";

import { useSim } from "../../lib/simState";

export default function HardwareViewer({ board }) {
  const [search, setSearch] = useState("");
  const [hoveredPin, setHoveredPin] = useState(null);
  const [hoveredComponent, setHoveredComponent] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [layer, setLayer] = useState("ALL");

  const { pinStates, advanced, stimuli, setStimuli, designPorts, components } = useSim();

  // Ref to the SVG element for coordinate conversion in ExternalChipLayer
  const svgRef = useRef(null);

  // Wiring mode state — lifted from ExternalChipLayer so PinOverlay can show the
  // "wiring target" affordance on board pins while the user is mid-wire.
  const [wiringActive, setWiringActive] = useState(false);
  // Stable ref that ExternalChipLayer populates with its board-pin commit handler.
  // HardwareViewer passes this ref object to ExternalChipLayer via onWiringBoardPin;
  // when a board pin is clicked in wiring mode, HardwareViewer calls the fn inside.
  const wiringCommitRef = useRef(null);

  // Selected chip id (lifted so ComponentsPanel can later highlight it)
  const [selectedChipId, setSelectedChipId] = useState(null);

  // TODO(panel-agent): When ComponentsPanel is implemented, wire these to open/focus it.
  // editingChipId stores the chip double-clicked for editor focus.
  const [editingChipId, setEditingChipId] = useState(null);
  const [componentsPanelOpen, setComponentsPanelOpen] = useState(false);

  const handleEditChip = useCallback((compId) => {
    setEditingChipId(compId);
    setComponentsPanelOpen(true);
  }, []);

  // Board-pin click handler during wiring mode: delegates to ExternalChipLayer's
  // commit function (stored in wiringCommitRef by the layer on each render).
  const handleBoardPinClickForWiring = useCallback((pin) => {
    if (wiringCommitRef.current) {
      wiringCommitRef.current(pin);
    }
  }, []);

  // Stimulus panel UI state — lives here (not in StimulusConfigPanel) so a click on
  // either a board pin's "+" affordance or an existing StimulusOverlay marker can open
  // the panel already focused on the right block.
  const [stimulusPanelOpen, setStimulusPanelOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState(null);
  const [pendingEditId, setPendingEditId] = useState(null);
  const [hoveredStimulusId, setHoveredStimulusId] = useState(null);

  // Memoize so a falsy board.pins/components doesn't create a new [] each render
  // (which would destabilize the useMemo deps below).
  const PINS = useMemo(() => board?.pins || [], [board?.pins]);
  const COMPONENTS = useMemo(() => board?.components || [], [board?.components]);
  const BOARD_WIDTH = board?.width || 1200;
  const BOARD_HEIGHT = board?.height || 700;
  // External chips are placed starting at BOARD_WIDTH + 24 (chipGeometry's
  // nextChipPosition) in the free space beside the board image. Without this, the
  // SVG's own viewBox clips at BOARD_WIDTH and every newly-created chip renders
  // completely outside the visible/interactive canvas. Only reserved in advanced
  // mode so the non-advanced board view is unaffected.
  const CHIP_WORKSPACE_WIDTH = 280;
  const CANVAS_WIDTH = advanced ? BOARD_WIDTH + CHIP_WORKSPACE_WIDTH : BOARD_WIDTH;

  // net (port name) -> pin id, from the board's default full pin map, and its inverse
  // for resolving "which port does this physical pin correspond to". Stimulus markers
  // only anchor to pins covered by this default map (the standard demo net names); a
  // stimulus on a custom port with no board mapping has no on-board anchor and is only
  // reachable/editable via the panel's own list.
  const pinToNet = useMemo(() => {
    const inv = {};
    for (const [net, pinId] of Object.entries(board?.pinAssignments || {})) inv[pinId] = net;
    return inv;
  }, [board?.pinAssignments]);

  const stimulusByTarget = useMemo(() => {
    const map = {};
    for (const s of stimuli) map[s.target] = s;
    return map;
  }, [stimuli]);

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
        <TransformWrapper
          minScale={0.5}
          maxScale={8}
          centerOnInit
          smooth={false}
          wheel={{ step: 0.3 }}
          panning={{
            // Exclude elements with the "chip-drag" class from initiating panning
            // so that dragging a chip body never fights the board pan gesture.
            // ExternalChipLayer additionally calls e.stopPropagation() on mousedown
            // for belt-and-suspenders coverage.
            excluded: ["chip-drag", "cursor-crosshair", "cursor-move"],
          }}
        >
          <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_WIDTH} ${BOARD_HEIGHT}`}
              width={CANVAS_WIDTH}
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

                const net = pinToNet[pin.id];
                const canAddStimulus = advanced && !!net && !stimulusByTarget[net];
                // In wiring mode, board pins become wiring targets; clicking them
                // commits the wire instead of opening a stimulus dialog.
                const isWiringTarget = advanced && wiringActive;

                return (
                  <PinOverlay
                    key={pin.id}
                    pin={pin}
                    state={pinStates[pin.id]}
                    pinFunction={board?.pinFunction?.[pin.id]}
                    isHovered={hoveredPin?.id === pin.id}
                    isHighlighted={isHighlighted}
                    onHover={() => setHoveredPin(pin)}
                    onLeave={() => setHoveredPin(null)}
                    canAddStimulus={canAddStimulus && !wiringActive}
                    onAddStimulus={() => {
                      setPendingTarget(net);
                      setStimulusPanelOpen(true);
                    }}
                    isWiringTarget={isWiringTarget}
                    onWiringTargetClick={isWiringTarget ? () => handleBoardPinClickForWiring(pin) : null}
                  />
                );
              })}

              {/* Markers for stimulus blocks whose target resolves to a physical pin
                  via the board's default net map. Blocks on custom/unmapped ports are
                  only reachable through the panel's list. */}
              {advanced && stimuli.map((s) => {
                const pinId = board?.pinAssignments?.[s.target];
                const pin = pinId ? PINS.find((p) => p.id === pinId) : null;
                if (!pin) return null;
                return (
                  <StimulusOverlay
                    key={s.id}
                    stimulus={s}
                    pin={pin}
                    isHovered={hoveredStimulusId === s.id}
                    onHover={() => setHoveredStimulusId(s.id)}
                    onLeave={() => setHoveredStimulusId(null)}
                    onClick={() => { setPendingEditId(s.id); setStimulusPanelOpen(true); }}
                  />
                );
              })}

              {/* External chip wires — rendered below chips, above board overlays */}
              {advanced && <WireLayer boardPins={PINS} />}

              {/* External chip bodies — topmost SVG layer */}
              {advanced && (
                <ExternalChipLayer
                  svgRef={svgRef}
                  onEditChip={handleEditChip}
                  onWiringBoardPinRef={wiringCommitRef}
                  onWiringStateChange={setWiringActive}
                  onSelectionChange={setSelectedChipId}
                />
              )}
            </svg>
          </TransformComponent>
        </TransformWrapper>

        {advanced && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
            {/* Components (custom chips) button — same pattern as Signal Sources */}
            <button
              onClick={() => {
                setComponentsPanelOpen((v) => !v);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                componentsPanelOpen ? "bg-accent text-white border-accent" : "bg-panel text-text-secondary border-edge hover:bg-hover"
              }`}
              title="External Components — custom chips wired to the board"
            >
              <Cpu size={13} />
              Components{components.length ? ` (${components.length})` : ""}
            </button>

            <button
              onClick={() => setStimulusPanelOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                stimulusPanelOpen ? "bg-accent text-white border-accent" : "bg-panel text-text-secondary border-edge hover:bg-hover"
              }`}
              title="Signal Sources — visual stimulus blocks"
            >
              <Zap size={13} />
              Signal Sources{stimuli.length ? ` (${stimuli.length})` : ""}
            </button>
          </div>
        )}

        {advanced && stimulusPanelOpen && (
          <StimulusConfigPanel
            stimuli={stimuli}
            setStimuli={setStimuli}
            ports={designPorts}
            onClose={() => setStimulusPanelOpen(false)}
            initialTarget={pendingTarget}
            onConsumeInitialTarget={() => setPendingTarget(null)}
            initialEditId={pendingEditId}
            onConsumeInitialEditId={() => setPendingEditId(null)}
          />
        )}

        {advanced && componentsPanelOpen && (
          <ComponentsPanel
            onClose={() => { setComponentsPanelOpen(false); setEditingChipId(null); }}
            focusChipId={editingChipId}
            selectedChipId={selectedChipId}
          />
        )}

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
