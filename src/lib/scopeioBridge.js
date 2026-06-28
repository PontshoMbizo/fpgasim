// Thin postMessage bridge so scope.io can drive this app from a cross-origin
// iframe (no direct contentWindow access, unlike the same-origin CircuitJS
// embed). Inert until a well-formed scopeio:init arrives, so running this app
// standalone or under the plain /tools iframe (no bridge) is unaffected.
//
// Protocol: scope.io -> sim on load: { type: "scopeio:init", mode, starterCode,
// testbench?, engine?, signal?, duration? }. sim -> scope.io on the embedded
// action button: { type: "scopeio:result", payload: { code, ok, log, changes, raw } }.

let parentOrigin = null;

export function listenForInit(onInit) {
  function handleMessage(event) {
    const data = event.data;
    if (!data || data.type !== "scopeio:init") return;
    parentOrigin = event.origin;
    onInit({
      mode: data.mode,
      starterCode: data.starterCode,
      testbench: data.testbench,
      engine: data.engine,
      signal: data.signal,
      duration: data.duration,
    });
  }
  window.addEventListener("message", handleMessage);
  return () => window.removeEventListener("message", handleMessage);
}

export function sendResult(payload) {
  if (!parentOrigin || window.parent === window) return;
  window.parent.postMessage({ type: "scopeio:result", payload }, parentOrigin);
}

// Pulls one named signal's value-change list out of a parsed VCD model
// (src/lib/vcd.js's `toModel()` shape), matching by leaf name with any bus
// range stripped (e.g. "leds[5:0]" -> "leds"). Mirrors simState.js's
// findSignal/leafBase so embed-mode capture resolves nets the same way the
// Hardware/Waveform tabs do. Returns [] when the signal isn't found.
export function extractChanges(model, signalName) {
  if (!model || !signalName) return [];
  const base = signalName.replace(/\[.*$/, "");
  const matches = (model.signals || []).filter((s) => s.name.replace(/\[.*$/, "") === base);
  if (matches.length === 0) return [];
  const sig = matches.reduce((a, b) => ((b.depth ?? 0) < (a.depth ?? 0) ? b : a));
  return sig.changes.map((c) => ({ t: c.t, v: c.v }));
}
