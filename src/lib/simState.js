"use client";
import React, { createContext, useContext, useMemo, useState } from "react";
import PINS from "../data/pins.json";

// Single source of truth for the mock simulation, shared by the Hardware and
// Waveforms tabs. When real iverilog WASM lands, only this seed + the worker
// change — the UI keeps reading `signals` and `pinStates` the same way.

export const TIME_MAX = 820; // ns shown on the timeline
const CLK_PERIOD = 30; // ns

// Mirrors the example design in EditorPane.js (clk, btn1, btn2, leds, counter).
export const SIGNALS = [
  { id: 1, name: "clk", type: "wire", dir: "I", kind: "clock", period: CLK_PERIOD },
  {
    id: 2,
    name: "btn1",
    type: "wire",
    dir: "I",
    kind: "bit",
    changes: [{ x: 0, v: "1" }, { x: 200, v: "0" }, { x: 280, v: "1" }],
  },
  {
    id: 3,
    name: "btn2",
    type: "wire",
    dir: "I",
    kind: "bit",
    changes: [{ x: 0, v: "1" }, { x: 520, v: "0" }, { x: 600, v: "1" }],
  },
  {
    id: 4,
    name: "leds[5:0]",
    type: "reg",
    dir: "O",
    kind: "bus",
    width: 6,
    changes: [
      { x: 0, v: "00" },
      { x: 200, v: "3F" },
      { x: 400, v: "15" },
      { x: 520, v: "00" },
      { x: 680, v: "2A" },
    ],
  },
  {
    id: 5,
    name: "counter[24:19]",
    type: "reg",
    dir: "",
    kind: "bus",
    width: 6,
    changes: [
      { x: 0, v: "01" },
      { x: 120, v: "08" },
      { x: 300, v: "1F" },
      { x: 520, v: "2A" },
      { x: 700, v: "15" },
    ],
  },
];

// Net -> physical pin id, derived from each pin's `special` tags in pins.json so
// the pin-mapper tool fully controls the mapping. Tags: CLK, BTN1, BTN2, LED0..N.
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

// Returns the raw value string of a signal at time `t`.
function valueAt(sig, t) {
  if (sig.kind === "clock") {
    return t % sig.period >= sig.period / 2 ? "1" : "0";
  }
  let v = sig.changes[0].v;
  for (const c of sig.changes) {
    if (c.x <= t) v = c.v;
    else break;
  }
  return v;
}

// Extracts bit `index` (0 = LSB) from a hex value string.
function bitOf(hex, index) {
  const n = parseInt(hex, 16);
  if (Number.isNaN(n)) return "X";
  return (n >> index) & 1 ? "HIGH" : "LOW";
}

// Builds the { pinId: 'HIGH'|'LOW'|'X'|'Z' } map for a given time cursor.
export function computePinStates(t) {
  const byName = Object.fromEntries(SIGNALS.map((s) => [s.name, s]));
  const states = {};

  const setBit = (sigName, bit, pinId) => {
    const sig = byName[sigName];
    if (!sig || !pinId) return;
    states[pinId] = bitOf(valueAt(sig, t), bit);
  };

  setBit("leds[5:0]", 0, PIN_ASSIGNMENTS["leds[0]"]);
  setBit("leds[5:0]", 1, PIN_ASSIGNMENTS["leds[1]"]);
  setBit("leds[5:0]", 2, PIN_ASSIGNMENTS["leds[2]"]);
  setBit("leds[5:0]", 3, PIN_ASSIGNMENTS["leds[3]"]);
  setBit("leds[5:0]", 4, PIN_ASSIGNMENTS["leds[4]"]);
  setBit("leds[5:0]", 5, PIN_ASSIGNMENTS["leds[5]"]);

  states[PIN_ASSIGNMENTS.clk] = valueAt(byName.clk, t) === "1" ? "HIGH" : "LOW";
  states[PIN_ASSIGNMENTS.btn1] = valueAt(byName.btn1, t) === "1" ? "HIGH" : "LOW";
  states[PIN_ASSIGNMENTS.btn2] = valueAt(byName.btn2, t) === "1" ? "HIGH" : "LOW";

  return states;
}

const SimContext = createContext(null);

export function SimProvider({ children }) {
  const [timeCursor, setTimeCursor] = useState(550);
  const pinStates = useMemo(() => computePinStates(timeCursor), [timeCursor]);
  const value = useMemo(
    () => ({ signals: SIGNALS, timeCursor, setTimeCursor, pinStates, timeMax: TIME_MAX }),
    [timeCursor, pinStates]
  );
  return <SimContext.Provider value={value}>{children}</SimContext.Provider>;
}

export function useSim() {
  const ctx = useContext(SimContext);
  if (!ctx) throw new Error("useSim must be used within a SimProvider");
  return ctx;
}
