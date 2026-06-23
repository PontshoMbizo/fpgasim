"use client";
import React, { createContext, useContext, useMemo, useState } from "react";
import PINS from "../data/pins.json";
import { parseVCD, toModel } from "./vcd";

// Single source of truth for the simulation, shared by the Hardware and Waveforms
// tabs. Signals now live in a canonical model produced by the VCD parser, so when
// real iverilog WASM lands only the worker's VCD output changes — the UI keeps
// reading `signals` and `pinStates` the same way.

const CLK_PERIOD = 30; // ns
const SEED_END = 820; // ns of the demo timeline
export const PX_PER_NS = 1; // time -> pixel scale for the waveform canvas

// --- Seed design (mirrors EditorPane.js) expressed as a VCD string so the parser
// is exercised on the default path. Buses are given as hex per change. ----------
const hexToBits = (hex, width) =>
  parseInt(hex, 16).toString(2).padStart(width, "0");

function buildSeedVcd() {
  const vars = [
    { id: "!", type: "wire", width: 1, name: "clk", dir: "I" },
    { id: "#", type: "wire", width: 1, name: "btn1", dir: "I" },
    { id: "$", type: "wire", width: 1, name: "btn2", dir: "I" },
    { id: "%", type: "reg", width: 6, name: "leds[5:0]", dir: "O" },
    { id: "&", type: "reg", width: 6, name: "counter[24:19]", dir: "" },
  ];

  // Collect (t -> [token]) events.
  const events = {};
  const add = (t, token) => (events[t] = events[t] || []).push(token);

  // Clock toggles every half period.
  for (let t = 0, hi = 0; t <= SEED_END; t += CLK_PERIOD / 2, hi ^= 1) add(t, `${hi}!`);

  const bit = [
    { id: "#", changes: [[0, "1"], [200, "0"], [280, "1"]] },
    { id: "$", changes: [[0, "1"], [520, "0"], [600, "1"]] },
  ];
  for (const s of bit) for (const [t, v] of s.changes) add(t, `${v}${s.id}`);

  const bus = [
    { id: "%", changes: [[0, "00"], [200, "3F"], [400, "15"], [520, "00"], [680, "2A"]] },
    { id: "&", changes: [[0, "01"], [120, "08"], [300, "1F"], [520, "2A"], [700, "15"]] },
  ];
  for (const s of bus)
    for (const [t, hex] of s.changes) add(t, `b${hexToBits(hex, 6)} ${s.id}`);

  let vcd = "$timescale 1ns $end\n$scope module top $end\n";
  for (const v of vars) vcd += `$var ${v.type} ${v.width} ${v.id} ${v.name} $end\n`;
  vcd += "$upscope $end\n$enddefinitions $end\n";
  for (const t of Object.keys(events).map(Number).sort((a, b) => a - b)) {
    vcd += `#${t}\n${events[t].join("\n")}\n`;
  }
  return { vcd, dirByName: Object.fromEntries(vars.map((v) => [v.name, v.dir])) };
}

// Direction (I/O) isn't carried in VCD; re-apply it from the design metadata so the
// signal list keeps its Dir column.
function applyDirs(model, dirByName) {
  if (!dirByName) return model;
  for (const s of model.signals) if (dirByName[s.name] != null) s.dir = dirByName[s.name];
  return model;
}

const seed = buildSeedVcd();
export const DEFAULT_MODEL = applyDirs(parseVCD(seed.vcd), seed.dirByName);

// Net -> physical pin id, derived from each pin's `special` tags in pins.json so the
// pin-mapper tool fully controls the mapping. Tags: CLK, BTN1, BTN2, LED0..N.
export const PIN_ASSIGNMENTS = (() => {
  const map = {};
  for (const pin of PINS) {
    for (const tag of pin.special || []) {
      if (tag === "CLK") map.clk = pin.id;
      else if (tag === "BTN1") map.btn1 = pin.id;
      else if (tag === "BTN2") map.btn2 = pin.id;
      else {
        const led = /^LED(\d+)$/.exec(tag);
        if (led) map[`leds[${led[1]}]`] = pin.id;
      }
    }
  }
  return map;
})();

// Returns the raw value string of a signal at time `t` (ns).
function valueAt(sig, t) {
  let v = sig.changes[0].v;
  for (const c of sig.changes) {
    if (c.t <= t) v = c.v;
    else break;
  }
  return v;
}

// Extracts bit `index` (0 = LSB) from a hex value string.
function bitOf(hex, index) {
  if (/[^0-9a-f]/i.test(hex)) return "X"; // x/z or non-hex
  const n = parseInt(hex, 16);
  if (Number.isNaN(n)) return "X";
  return (n >> index) & 1 ? "HIGH" : "LOW";
}

// Map a scalar value char to a pin state.
function scalarState(v) {
  if (v === "1") return "HIGH";
  if (v === "0") return "LOW";
  if (v === "z") return "Z";
  return "X";
}

// Find the signal backing a net base name (scalar `clk` or bus `leds[5:0]`).
function findSignal(byName, base) {
  if (byName[base]) return byName[base];
  return Object.values(byName).find((s) => s.name.startsWith(base + "["));
}

// Builds the { pinId: 'HIGH'|'LOW'|'X'|'Z' } map for a given time cursor, driven
// entirely by PIN_ASSIGNMENTS + the current model so it works for any design.
export function computePinStates(model, t) {
  const byName = Object.fromEntries(model.signals.map((s) => [s.name, s]));
  const states = {};

  for (const [net, pinId] of Object.entries(PIN_ASSIGNMENTS)) {
    if (!pinId) continue;
    const m = /^(.+?)\[(\d+)\]$/.exec(net); // e.g. "leds[3]"
    const base = m ? m[1] : net;
    const sig = findSignal(byName, base);
    if (!sig) continue;
    const v = valueAt(sig, t);
    states[pinId] = m && sig.kind === "bus" ? bitOf(v, parseInt(m[2], 10)) : scalarState(v);
  }

  return states;
}

const SimContext = createContext(null);

export function SimProvider({ children }) {
  const [model, setModelState] = useState(DEFAULT_MODEL);
  const [timeCursor, setTimeCursor] = useState(550);

  // Accepts a raw VCD string, a full model, or a bare signals array.
  const setModel = (input) => setModelState(toModel(input));

  const pinStates = useMemo(() => computePinStates(model, timeCursor), [model, timeCursor]);
  const value = useMemo(
    () => ({
      model,
      setModel,
      signals: model.signals,
      timeCursor,
      setTimeCursor,
      pinStates,
      timeMax: model.timeMax,
      pxPerNs: PX_PER_NS,
    }),
    [model, timeCursor, pinStates]
  );
  return <SimContext.Provider value={value}>{children}</SimContext.Provider>;
}

export function useSim() {
  const ctx = useContext(SimContext);
  if (!ctx) throw new Error("useSim must be used within a SimProvider");
  return ctx;
}
