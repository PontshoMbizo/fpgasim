"use client";
import React, { createContext, useContext, useMemo, useState } from "react";
import PINS from "../data/pins.json";
import { toModel } from "./vcd";

// ---- External component/wire helpers ----------------------------------------

/**
 * Remove wires that reference a component or pin that no longer exists.
 * Called whenever `components` changes so the wires array stays consistent.
 *
 * @param {object[]} wires       Current wire array.
 * @param {object[]} components  Current component array.
 * @returns {object[]}  Filtered wire array (may be the same reference if no
 *                      wires were dropped).
 */
export function pruneWires(wires, components) {
  const compPins = new Map();
  for (const c of components) {
    const pinNames = new Set((c.pins || []).map((p) => p.name));
    compPins.set(c.id, pinNames);
  }

  const pruned = wires.filter((w) => {
    for (const ep of [w.a, w.b]) {
      if (ep && ep.comp != null) {
        const pins = compPins.get(ep.comp);
        if (!pins) return false;          // component removed
        if (!pins.has(ep.pin)) return false; // pin removed (e.g. after re-parse)
      }
    }
    return true;
  });

  // Return same reference when nothing was pruned (avoids spurious re-renders)
  return pruned.length === wires.length ? wires : pruned;
}

// Single source of truth for the simulation, shared by the Hardware and Waveforms
// tabs. Signals live in a canonical model produced by the VCD parser; clicking
// "Run" replaces it via setModel(). The UI reads `signals`/`pinStates` the same way
// regardless of source.

export const PX_PER_NS = 1; // time -> pixel scale for the waveform canvas

// The app starts with an empty waveform view — signals appear only after a run.
export const DEFAULT_MODEL = { timescale: { value: 1, unit: "ns" }, timeMax: 0, signals: [] };

// Net -> physical pin id, derived from each pin's `special` tags so the
// pin-mapper tool fully controls the mapping. Tags: CLK, BTN1, BTN2, LED0..N.
export function computePinAssignments(pins = []) {
  const map = {};
  for (const pin of pins) {
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
}

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
export function computePinStates(model, t, pinAssignments = {}) {
  const states = {};

  for (const [net, pinId] of Object.entries(pinAssignments)) {
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

export function SimProvider({ children, board }) {
  const [model, setModelState] = useState(DEFAULT_MODEL);
  const [timeCursor, setTimeCursor] = useState(0);
  const [diagnostics, setDiagnostics] = useState([]);
  const [peripheralOutputs, setPeripheralOutputs] = useState({ uart: '', ppm: null });
  // "Advanced" reveals the constraint/testbench editors + sim-duration control and the
  // UART/HDMI peripheral views. Off by default so the basic flow is just Design + Run.
  const [advanced, setAdvanced] = useState(false);

  // Visual stimulus blocks (advanced-mode only) — lives here rather than in EditorPane
  // because both EditorPane (serializes into the /api/simulate payload) and the
  // hardware view (renders a marker per block) need read/write access.
  const [stimuli, setStimuli] = useState([]);

  // The current design's top-module port list ({dir,width,name,range}[]), kept in sync
  // by EditorPane on every code change. Lets the hardware view's stimulus config UI
  // populate a "target port" picker without needing the raw Verilog source itself.
  const [designPorts, setDesignPorts] = useState([]);

  // External custom chip components ({id,name,x,y,pins,verilog,testbench}[]) and
  // their wires ({id,a,b}[]). Advanced-mode only.  Whenever components change, any
  // wires that reference removed components or pins are automatically dropped so the
  // data invariant "no dangling wire endpoints" is always upheld.
  const [components, setComponentsRaw] = useState([]);
  const [wires, setWiresRaw] = useState([]);

  const setComponents = (next) => {
    // Resolve the next state first (handle functional updater pattern).
    // We must read the *current* components via the functional form of setComponentsRaw
    // so that rapid calls compose correctly without stale closure values.
    setComponentsRaw((prevComponents) => {
      const nextComponents = typeof next === "function" ? next(prevComponents) : next;
      // Schedule wire pruning in the same React batch.
      setWiresRaw((prevWires) => pruneWires(prevWires, nextComponents));
      return nextComponents;
    });
  };

  // Always use functional form of setWiresRaw so the closure doesn't capture a
  // stale `wires` value — this makes setWires itself a stable (non-dep) reference.
  const setWires = (next) => {
    if (typeof next === "function") {
      setWiresRaw(next);
    } else {
      setWiresRaw(() => next);
    }
  };

  // Accepts a raw VCD string, a full model, or a bare signals array. Returns the
  // parsed model so callers can read e.g. signal count immediately.
  const setModel = (input) => {
    const m = toModel(input);
    setModelState(m);
    return m;
  };

  const pinAssignments = useMemo(() => computePinAssignments(board?.pins), [board?.pins]);
  const pinStates = useMemo(() => computePinStates(model, timeCursor, pinAssignments), [model, timeCursor, pinAssignments]);
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
      board,
      diagnostics,
      setDiagnostics,
      peripheralOutputs,
      setPeripheralOutputs,
      advanced,
      setAdvanced,
      stimuli,
      setStimuli,
      designPorts,
      setDesignPorts,
      components,
      setComponents,
      wires,
      setWires,
    }),
    [model, timeCursor, pinStates, board, diagnostics, peripheralOutputs, advanced, stimuli, designPorts, components, wires]
  );
  return <SimContext.Provider value={value}>{children}</SimContext.Provider>;
}

export function useSim() {
  const ctx = useContext(SimContext);
  if (!ctx) throw new Error("useSim must be used within a SimProvider");
  return ctx;
}
