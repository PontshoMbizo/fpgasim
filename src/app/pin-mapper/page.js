"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Save, RotateCcw, Trash2, Copy, Eraser, Cpu, MapPin, Tag, ZoomOut, AlignVerticalSpaceAround } from "lucide-react";
import { LAYER_COLORS, COLORS } from "@/lib/theme";

const BOARD_WIDTH = 1200;
const BOARD_HEIGHT = 700;
const LAYERS = ["IO", "SD", "HDMI", "POWER", "ONBOARD"];
const SIDES = ["TOP", "BOTTOM", "ONBOARD"];
const COMP_TYPES = ["FPGA", "FLASH", "USB", "REGULATOR", "LED", "BUTTON", "CONNECTOR", "OSC", "IC"];

// Special tags that bind a pin to a simulated net (see src/lib/simState.js).
const NET_TAGS = ["CLK", "BTN1", "BTN2", "LED0", "LED1", "LED2", "LED3", "LED4", "LED5"];

export default function PinMapper() {
  const [mode, setMode] = useState("pins"); // 'pins' | 'components'
  const [pins, setPins] = useState([]);
  const [components, setComponents] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedCompKey, setSelectedCompKey] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showLabels, setShowLabels] = useState(true);
  const [status, setStatus] = useState("Blank canvas — click the board to add and label a pin");
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const uidRef = useRef(1);

  const key = () => `k${uidRef.current++}`;

  // Reset zoom and pan (stable identity — only calls state setters).
  const resetZoom = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "r" || e.key === "R" || e.key === "Escape") {
        resetZoom();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [resetZoom]);

  // Loads the saved data so you can continue a previous mapping.
  const load = async () => {
    const [pp, cc] = await Promise.all([
      fetch("/api/pins").then((r) => r.json()),
      fetch("/api/components").then((r) => r.json()),
    ]);
    // Coerce coordinates to finite numbers so a malformed/legacy entry can't render
    // as NaN in the SVG.
    const num = (v) => (Number.isFinite(v) ? v : 0);
    setPins(pp.map((p) => ({ ...p, x: num(p.x), y: num(p.y), _key: key() })));
    setComponents(cc.map((c) => ({ ...c, x: num(c.x), y: num(c.y), _key: key() })));
    setStatus(`Loaded ${pp.length} pins, ${cc.length} components`);
  };

  const clearAll = () => {
    setPins([]);
    setComponents([]);
    setSelectedKey(null);
    setSelectedCompKey(null);
    setStatus("Cleared — click the board to add and label a pin");
  };

  // Screen coords -> board viewBox coords.
  const toSvg = (evt) => {
    const svg = svgRef.current;
    const ctm = svg && svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 }; // not laid out yet — avoid NaN coords
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    const x = Math.round(p.x), y = Math.round(p.y);
    return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
  };

  const handleWheel = (evt) => {
    evt.preventDefault();
    const delta = evt.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.5, Math.min(3, z * delta)));
  };

  // Focus on a point (x, y in board coords) with optional zoom level
  const focusOn = (x, y, targetZoom = 2) => {
    const containerWidth = window.innerWidth - 330; // minus sidebar
    const containerHeight = window.innerHeight - 60; // minus header
    const centerX = -(x * targetZoom - containerWidth / 2);
    const centerY = -(y * targetZoom - containerHeight / 2);
    setPanX(centerX);
    setPanY(centerY);
    setZoom(targetZoom);
  };

  const focusOnPin = (pin) => {
    focusOn(pin.x, pin.y, 2.5);
  };

  const focusOnComponent = (comp) => {
    const centerX = comp.x + comp.width / 2;
    const centerY = comp.y + comp.height / 2;
    focusOn(centerX, centerY, 2);
  };

  const updatePin = (k, patch) =>
    setPins((ps) => ps.map((p) => (p._key === k ? { ...p, ...patch } : p)));
  const updateComp = (compKey, patch) =>
    setComponents((cs) => cs.map((c) => (c._key === compKey ? { ...c, ...patch } : c)));

  // ---- Pins mode: tap empty board = add a pin; drag a pin = reposition ----
  const addPinAt = (x, y) => {
    const k = key();
    const pin = {
      _key: k, id: "", name: "", num: null, bank: "",
      side: y < BOARD_HEIGHT / 2 ? "TOP" : "BOTTOM",
      kind: "io", special: [], layer: "IO", x, y,
    };
    setPins((ps) => [...ps, pin]);
    setSelectedKey(k);
    setStatus(`Added pin #${pins.length + 1} — type its ball number / label`);
  };
  const deletePin = (k) => {
    setPins((ps) => ps.filter((x) => x._key !== k));
    if (selectedKey === k) setSelectedKey(null);
  };
  // Align every pin on a side to that side's average Y, so each row is straight.
  const straightenRows = () => {
    setPins((ps) => {
      const groups = {};
      ps.forEach((p) => (groups[p.side] ??= []).push(p));
      const meanY = {};
      for (const s in groups) meanY[s] = Math.round(groups[s].reduce((a, p) => a + p.y, 0) / groups[s].length);
      return ps.map((p) => ({ ...p, y: meanY[p.side] }));
    });
    setStatus("Straightened rows — each side aligned to its average Y");
  };
  const onPinPointerDown = (evt, p) => {
    if (mode !== "pins") return;
    evt.stopPropagation();
    setSelectedKey(p._key);
    const { x, y } = toSvg(evt);
    dragRef.current = { type: "pin", key: p._key, dx: x - p.x, dy: y - p.y, moved: false };
  };

  // ---- Board pointer down: draw a box (components) or start an add (pins) ----
  const onSvgPointerDown = (evt) => {
    // Middle mouse button (1) for panning
    if (evt.button === 1) {
      evt.preventDefault();
      dragRef.current = { type: "pan", startX: evt.clientX, startY: evt.clientY, startPanX: panX, startPanY: panY };
      return;
    }
    const { x, y } = toSvg(evt);
    if (mode === "components") {
      dragRef.current = { type: "draw", x0: x, y0: y };
      setDraft({ x, y, width: 0, height: 0 });
    } else {
      dragRef.current = { type: "addpin", x0: x, y0: y, moved: false };
    }
  };
  const onCompPointerDown = (evt, comp) => {
    if (mode !== "components") return;
    evt.stopPropagation();
    setSelectedCompKey(comp._key);
    const { x, y } = toSvg(evt);
    dragRef.current = { type: "move", key: comp._key, dx: x - comp.x, dy: y - comp.y };
  };
  const onPointerMove = (evt) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.type === "pan") {
      const deltaX = evt.clientX - d.startX;
      const deltaY = evt.clientY - d.startY;
      setPanX(d.startPanX + deltaX);
      setPanY(d.startPanY + deltaY);
      return;
    }
    const { x, y } = toSvg(evt);
    if (d.type === "draw") {
      setDraft({ x: Math.min(d.x0, x), y: Math.min(d.y0, y), width: Math.abs(x - d.x0), height: Math.abs(y - d.y0) });
    } else if (d.type === "move") {
      updateComp(d.key, { x: x - d.dx, y: y - d.dy });
    } else if (d.type === "pin") {
      updatePin(d.key, { x: Math.round(x - d.dx), y: Math.round(y - d.dy) });
      d.moved = true;
    } else if (d.type === "addpin") {
      if (Math.hypot(x - d.x0, y - d.y0) > 4) d.moved = true;
    }
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.type === "draw" && draft && draft.width > 12 && draft.height > 12) {
      let n = 1;
      while (components.some((c) => c.name === `IC${n}`)) n++;
      const comp = { _key: key(), name: `IC${n}`, type: "IC", description: "", ...rounded(draft) };
      setComponents((cs) => [...cs, comp]);
      setSelectedCompKey(comp._key);
    } else if (d?.type === "addpin" && !d.moved) {
      addPinAt(d.x0, d.y0); // a tap on empty board adds a new pin
    }
    setDraft(null);
  };
  const deleteComp = (compKey) => {
    setComponents((cs) => cs.filter((c) => c._key !== compKey));
    if (selectedCompKey === compKey) setSelectedCompKey(null);
  };

  const save = async () => {
    setStatus("Saving…");
    const cleanPins = pins.map(({ _key, ...rest }) => rest); // drop editor-only key
    const cleanComponents = components.map(({ _key, ...rest }) => rest); // drop editor-only key
    const [r1, r2] = await Promise.all([
      fetch("/api/pins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cleanPins) }),
      fetch("/api/components", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cleanComponents) }),
    ]);
    setStatus(r1.ok && r2.ok ? `Saved ${cleanPins.length} pins + ${cleanComponents.length} components` : "Save failed");
  };
  const copyJson = () => {
    const payload = mode === "pins" ? pins.map(({ _key, ...r }) => r) : components.map(({ _key, ...r }) => r);
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setStatus(`Copied ${mode} JSON`);
  };

  const selPin = pins.find((p) => p._key === selectedKey) || null;
  const selComp = components.find((c) => c._key === selectedCompKey) || null;
  const colorFor = (pin) => LAYER_COLORS[pin.layer] || LAYER_COLORS.IO;

  return (
    <div className="h-screen w-full flex bg-base text-text-secondary font-sans overflow-hidden">

      {/* Sidebar */}
      <div className="w-[330px] h-full flex flex-col border-r border-edge bg-panel shrink-0">
        <div className="h-12 px-4 flex items-center justify-between border-b border-edge">
          <span className="font-bold text-text-primary">Pin Mapper</span>
          <span className="text-[11px] text-text-muted">{pins.length} pins · {components.length} ICs</span>
        </div>

        {/* Mode switch */}
        <div className="flex border-b border-edge">
          <ModeBtn icon={MapPin} label="Pins" active={mode === "pins"} onClick={() => setMode("pins")} />
          <ModeBtn icon={Cpu} label="Components" active={mode === "components"} onClick={() => setMode("components")} />
        </div>

        {/* Toolbar */}
        <div className="p-3 flex flex-wrap gap-2 border-b border-edge">
          <ToolBtn icon={Save} label="Save" onClick={save} primary />
          <ToolBtn icon={RotateCcw} label="Load existing" onClick={load} />
          <ToolBtn icon={AlignVerticalSpaceAround} label="Straighten" onClick={straightenRows} />
          <ToolBtn icon={Eraser} label="Clear" onClick={clearAll} />
          <ToolBtn icon={Copy} label="Copy" onClick={copyJson} />
          <ToolBtn icon={ZoomOut} label="Reset zoom" onClick={resetZoom} />
        </div>

        {mode === "pins" ? (
          <>
            {selPin
              ? <PinEditor key={selPin._key} pin={selPin} updatePin={updatePin} onDelete={() => deletePin(selPin._key)} />
              : <div className="px-3 py-2 text-[12px] text-text-muted border-b border-edge">Tap empty board to add a pin · drag a pin to reposition · click a pin to edit its label.</div>}
            <div className="flex-1 overflow-y-auto">
              {pins.map((p) => (
                <button key={p._key} onClick={() => { setSelectedKey(p._key); focusOnPin(p); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left hover:bg-hover ${selectedKey === p._key ? "bg-hover" : ""}`}>
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorFor(p) }} />
                  <span className="font-mono text-text-primary w-12 shrink-0">{p.id || "—"}</span>
                  <span className="font-mono text-text-muted w-16 shrink-0">{p.name}</span>
                  <span className="text-accent text-[10px] truncate">{(p.special || []).join(",")}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="px-3 py-2 text-[12px] text-text-muted border-b border-edge">
              Drag on the board to draw an IC box. Click a box to select; drag it to move.
            </div>
            {selComp && <CompEditor comp={selComp} updateComp={updateComp} onDelete={() => deleteComp(selComp._key)} />}
            <div className="flex-1 overflow-y-auto">
              {components.map((c) => (
                <button key={c._key} onClick={() => { setSelectedCompKey(c._key); focusOnComponent(c); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left hover:bg-hover ${selectedCompKey === c._key ? "bg-hover" : ""}`}>
                  <Cpu size={13} className="text-info shrink-0" />
                  <span className="font-mono text-text-primary truncate flex-1">{c.name}</span>
                  <span className="text-text-muted text-[10px]">{c.type}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Board canvas */}
      <div className="flex-1 h-full flex flex-col min-w-0">
        <div className="h-12 px-4 flex items-center gap-4 border-b border-edge bg-elevated text-[12px]">
          <span className="font-semibold text-text-primary capitalize">{mode} mode</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Labels
          </label>
          <span className="text-text-muted ml-auto">{status}</span>
        </div>

        <div className="flex-1 overflow-hidden p-6 flex items-start justify-center" onWheel={handleWheel}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
              className={`w-full max-w-[1400px] border border-edge rounded-lg bg-panel select-none ${mode === "pins" ? "cursor-crosshair" : "cursor-default"}`}
              style={{
                transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`,
                transformOrigin: "top center",
                transition: "transform 0.2s ease-out",
              }}
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={onSvgPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
            <image href="/images/tang-nano-9k.png" x="0" y="0" width={BOARD_WIDTH} height={BOARD_HEIGHT} />

            {/* Component boxes */}
            {components.map((c) => {
              const isSel = c._key === selectedCompKey;
              return (
                <g key={c._key} onPointerDown={(e) => onCompPointerDown(e, c)} className={mode === "components" ? "cursor-move" : ""}>
                  <rect x={c.x} y={c.y} width={c.width} height={c.height} rx="6"
                    fill={COLORS.info} fillOpacity={isSel ? 0.18 : 0.08}
                    stroke={COLORS.info} strokeWidth={isSel ? 2.5 : 1.5} strokeDasharray={isSel ? "" : "4 3"} />
                  {showLabels && <text x={c.x + 6} y={c.y + 16} fontSize="13" fontFamily="monospace" fill={COLORS.info}>{c.name}</text>}
                </g>
              );
            })}

            {draft && (
              <rect x={draft.x} y={draft.y} width={draft.width} height={draft.height} rx="6"
                fill={COLORS.info} fillOpacity={0.12} stroke={COLORS.info} strokeWidth="2" strokeDasharray="6 4" />
            )}

            {/* Pins */}
            {pins.map((p) => {
              // Skip pins without valid coordinates so a malformed entry can't crash
              // the SVG (NaN x/y).
              if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
              const isSel = p._key === selectedKey;
              const color = colorFor(p);
              return (
                <g key={p._key} onPointerDown={(e) => onPinPointerDown(e, p)} className={mode === "pins" ? "cursor-move" : ""}>
                  <circle cx={p.x} cy={p.y} r={4} fill={color} fillOpacity={isSel ? 0.9 : 0.65} stroke={isSel ? "#fff" : color} strokeWidth={isSel ? 2 : 1} />
                  {showLabels && p.id && (
                    <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#fff" stroke="#000" strokeWidth="0.5" paintOrder="stroke">{p.id}</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

function rounded(r) {
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
}

function PinEditor({ pin, updatePin, onDelete }) {
  return (
    <div className="p-3 border-b border-edge space-y-2 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-text-primary">{pin.id ? `Pin ${pin.id}` : "New pin"}</span>
        <button onClick={onDelete} className="text-danger hover:opacity-80" title="Delete"><Trash2 size={14} /></button>
      </div>
      <Field label="Ball number / label" value={pin.id} autoFocus onChange={(v) => updatePin(pin._key, { id: v })} />
      <Field label="Name" value={pin.name || ""} onChange={(v) => updatePin(pin._key, { name: v, bank: v.substring(0, 5) })} />
      <div className="grid grid-cols-2 gap-2">
        <Select label="Layer" value={pin.layer} options={LAYERS} onChange={(v) => updatePin(pin._key, { layer: v })} />
        <Select label="Side" value={pin.side} options={SIDES} onChange={(v) => updatePin(pin._key, { side: v })} />
      </div>
      <Field label="Special / net tags" value={(pin.special || []).join(", ")} onChange={(v) => updatePin(pin._key, { special: splitTags(v) })} />
      <div className="flex flex-wrap gap-1">
        {NET_TAGS.map((t) => {
          const on = (pin.special || []).includes(t);
          return (
            <button key={t}
              onClick={() => {
                const cur = new Set(pin.special || []);
                on ? cur.delete(t) : cur.add(t);
                updatePin(pin._key, { special: [...cur] });
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] border ${on ? "bg-accent/20 border-accent text-accent" : "border-edge text-text-muted hover:text-text-secondary"}`}>
              <Tag size={9} className="inline mr-0.5" />{t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompEditor({ comp, updateComp, onDelete }) {
  return (
    <div className="p-3 border-b border-edge space-y-2 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-text-primary">{comp.name}</span>
        <button onClick={onDelete} className="text-danger hover:opacity-80" title="Delete"><Trash2 size={14} /></button>
      </div>
      <Field label="Name" value={comp.name} onChange={(v) => updateComp(comp._key, { name: v })} />
      <Select label="Type" value={comp.type} options={COMP_TYPES} onChange={(v) => updateComp(comp._key, { type: v })} />
      <Field label="Description" value={comp.description || ""} onChange={(v) => updateComp(comp._key, { description: v })} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="x" type="number" value={comp.x} onChange={(v) => updateComp(comp._key, { x: Number(v) })} />
        <Field label="y" type="number" value={comp.y} onChange={(v) => updateComp(comp._key, { y: Number(v) })} />
        <Field label="width" type="number" value={comp.width} onChange={(v) => updateComp(comp._key, { width: Number(v) })} />
        <Field label="height" type="number" value={comp.height} onChange={(v) => updateComp(comp._key, { height: Number(v) })} />
      </div>
    </div>
  );
}

const splitTags = (v) => v.split(",").map((s) => s.trim()).filter(Boolean);

function ModeBtn({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] transition-colors ${active ? "bg-elevated text-text-primary font-semibold" : "text-text-muted hover:text-text-secondary"}`}>
      <Icon size={13} /> {label}
    </button>
  );
}

function ToolBtn({ icon: Icon, label, onClick, primary }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] transition-colors ${primary ? "bg-accent/20 text-accent hover:bg-accent/30" : "bg-elevated text-text-secondary hover:bg-hover"}`}>
      <Icon size={13} /> {label}
    </button>
  );
}

function Field({ label, value, onChange, type = "text", autoFocus = false }) {
  return (
    <label className="block">
      <span className="text-text-muted text-[10px] uppercase tracking-wide">{label}</span>
      <input type={type} value={value} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)}
        className="w-full mt-0.5 bg-panel border border-edge rounded px-2 py-1 text-text-secondary focus:outline-none focus:border-focus font-mono" />
    </label>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="block">
      <span className="text-text-muted text-[10px] uppercase tracking-wide">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full mt-0.5 bg-panel border border-edge rounded px-2 py-1 text-text-secondary focus:outline-none focus:border-focus">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
