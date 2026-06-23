"use client";
import React, { createContext, useContext, useMemo, useState } from "react";
import PINS from "../data/pins.json";
import { toModel } from "./vcd";

// Single source of truth for the simulation, shared by the Hardware and Waveforms
// tabs. Signals live in a canonical model produced by the VCD parser; clicking
// "Run" replaces it via setModel(). The UI reads `signals`/`pinStates` the same way
// regardless of source.

export const PX_PER_NS = 1; // time -> pixel scale for the waveform canvas

// The app starts with an empty waveform view — signals appear only after a run.
export const DEFAULT_MODEL = { timescale: { value: 1, unit: "ns" }, timeMax: 0, signals: [] };

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

// Leaf name of a signal, stripped of any bus range (e.g. "leds[5:0]" -> "leds").
const leafBase = (s) => s.name.replace(/\[.*$/, "");

// Find the signal backing a net base name (scalar `clk` or bus `leds[5:0]`). Real
// VCDs dump the same leaf name across scopes (tb.clk, tb.dut.clk); prefer the
// shallowest so pin mapping resolves to the top-level/testbench net.
function findSignal(signals, base) {
  const matches = signals.filter((s) => leafBase(s) === base);
  if (matches.length === 0) return undefined;
  return matches.reduce((a, b) => ((b.depth ?? 0) < (a.depth ?? 0) ? b : a));
}

// Builds the { pinId: 'HIGH'|'LOW'|'X'|'Z' } map for a given time cursor, driven
// entirely by PIN_ASSIGNMENTS + the current model so it works for any design.
export function computePinStates(model, t) {
  const states = {};

  for (const [net, pinId] of Object.entries(PIN_ASSIGNMENTS)) {
    if (!pinId) continue;
    const m = /^(.+?)\[(\d+)\]$/.exec(net); // e.g. "leds[3]"
    const base = m ? m[1] : net;
    const sig = findSignal(model.signals, base);
    if (!sig) continue;
    const v = valueAt(sig, t);
    states[pinId] = m && sig.kind === "bus" ? bitOf(v, parseInt(m[2], 10)) : scalarState(v);
  }

  return states;
}

const SimContext = createContext(null);

export function SimProvider({ children }) {
  const [model, setModelState] = useState(DEFAULT_MODEL);
  const [timeCursor, setTimeCursor] = useState(0);

  // Accepts a raw VCD string, a full model, or a bare signals array. Returns the
  // parsed model so callers can read e.g. signal count immediately.
  const setModel = (input) => {
    const m = toModel(input);
    setModelState(m);
    return m;
  };

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
