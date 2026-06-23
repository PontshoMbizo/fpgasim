// Pure VCD (Value Change Dump) parsing — no React. Turns standard VCD text into
// the canonical simulation model the UI reads. When real iverilog WASM lands, the
// worker emits VCD and everything downstream stays the same.
//
// Canonical model:
//   {
//     timescale: { value: 1, unit: "ns" },
//     timeMax,                                  // ns
//     signals: [
//       { id, name, type, width, dir, kind,     // kind: "bit" | "bus"
//         changes: [{ t, v }] }                 // t in ns; v = "0"/"1"/"x"/"z" or hex
//     ]
//   }

// Convert a binary bit-string (MSB first) to an uppercase hex string padded to the
// signal width. Any x/z bit makes the whole sample unknown ("x").
function bitsToHex(bits, width) {
  if (/[xz]/i.test(bits)) return "x";
  const n = parseInt(bits, 2);
  if (Number.isNaN(n)) return "x";
  const digits = Math.max(1, Math.ceil(width / 4));
  return n.toString(16).toUpperCase().padStart(digits, "0");
}

// Normalize a scalar value char to our canonical lowercase form.
function normScalar(c) {
  const v = c.toLowerCase();
  return v === "0" || v === "1" || v === "x" || v === "z" ? v : "x";
}

// Multiplier from a VCD timescale unit to nanoseconds, so downstream rendering
// (pxPerNs) is unit-independent regardless of the design's `timescale.
const UNIT_TO_NS = { s: 1e9, ms: 1e6, us: 1e3, ns: 1, ps: 1e-3, fs: 1e-6 };
function timescaleToNs(ts) {
  const unit = UNIT_TO_NS[ts.unit] ?? 1;
  return ts.value * unit;
}

export function parseVCD(text) {
  const tokens = String(text).split(/\s+/).filter(Boolean);

  const byId = {}; // vcd id symbol -> the first signal declared with that id
  const signals = []; // in declaration order
  const scope = []; // current $scope stack for hierarchical paths
  let timescale = { value: 1, unit: "ns" };
  let t = 0;
  let timeMax = 0;

  // Record a value change for a signal id at the current time. Aliased vars (the
  // same net dumped under multiple scopes) share one `changes` array, so a single
  // push updates them all.
  const record = (id, v) => {
    const sig = byId[id];
    if (!sig) return;
    const last = sig.changes[sig.changes.length - 1];
    if (last && last.t === t) last.v = v; // collapse same-time writes
    else sig.changes.push({ t, v });
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok === "$timescale") {
      // "$timescale 1ns $end" or "$timescale 1 ns $end"
      const parts = [];
      for (i++; i < tokens.length && tokens[i] !== "$end"; i++) parts.push(tokens[i]);
      const joined = parts.join("");
      const m = /^(\d+)([a-z]+)$/i.exec(joined);
      if (m) timescale = { value: parseInt(m[1], 10), unit: m[2] };
      continue;
    }

    if (tok === "$var") {
      // "$var <type> <width> <id> <name> [bitrange] $end"
      const type = tokens[++i];
      const width = parseInt(tokens[++i], 10);
      const id = tokens[++i];
      let name = tokens[++i];
      // Optional bit-range / index tokens before $end (e.g. "leds [5:0]").
      while (i + 1 < tokens.length && tokens[i + 1] !== "$end") name += tokens[++i];
      const sig = {
        id,
        name,
        path: [...scope, name].join("."),
        depth: scope.length,
        type,
        width: Number.isNaN(width) ? 1 : width,
        dir: "",
        kind: width > 1 ? "bus" : "bit",
        // Aliased nets reuse the first declaration's history array; record() then
        // updates every alias with one push.
        changes: byId[id] ? byId[id].changes : [],
      };
      if (!byId[id]) byId[id] = sig;
      signals.push(sig);
      while (i < tokens.length && tokens[i] !== "$end") i++;
      continue;
    }

    // "$scope <type> <name> $end" — track the name for hierarchical paths.
    if (tok === "$scope") {
      i++; // type (module/begin/...)
      scope.push(tokens[++i]);
      while (i < tokens.length && tokens[i] !== "$end") i++;
      continue;
    }
    if (tok === "$upscope") {
      scope.pop();
      continue;
    }

    // Skip the remaining header keywords up to their $end.
    if (tok === "$comment" || tok === "$date" || tok === "$version") {
      while (i < tokens.length && tokens[i] !== "$end") i++;
      continue;
    }
    if (tok === "$enddefinitions" || tok === "$dumpvars" ||
        tok === "$dumpall" || tok === "$dumpon" || tok === "$dumpoff" || tok === "$end") {
      continue;
    }

    // Time marker.
    if (tok[0] === "#") {
      t = parseInt(tok.slice(1), 10) || 0;
      if (t > timeMax) timeMax = t;
      continue;
    }

    // Scalar value change: "<0|1|x|z><id>" (no space).
    if (/^[01xzXZ]/.test(tok) && tok.length >= 2) {
      record(tok.slice(1), normScalar(tok[0]));
      continue;
    }

    // Vector value change: "b<bits> <id>" or "r<real> <id>".
    if (tok[0] === "b" || tok[0] === "B" || tok[0] === "r" || tok[0] === "R") {
      const id = tokens[++i];
      const sig = byId[id];
      if (!sig) continue;
      if (tok[0] === "r" || tok[0] === "R") record(id, tok.slice(1));
      else record(id, bitsToHex(tok.slice(1), sig.width));
      continue;
    }
  }

  // Convert all times from the design's timescale into nanoseconds so rendering is
  // unit-independent (a 1ps design and a 1ns design share one pxPerNs scale).
  // Post-process once per unique value history (aliased vars share an array).
  const uniques = Object.values(byId);

  const nsFactor = timescaleToNs(timescale);
  if (nsFactor !== 1) {
    for (const sig of uniques) for (const c of sig.changes) c.t *= nsFactor;
    timeMax *= nsFactor;
  }

  // Ensure every signal has an initial sample and starts at t=0 for clean rendering.
  for (const sig of uniques) {
    if (sig.changes.length === 0) {
      sig.changes.push({ t: 0, v: sig.kind === "bus" ? "0".repeat(Math.ceil(sig.width / 4)) : "x" });
    }
    if (sig.changes[0].t !== 0) sig.changes.unshift({ t: 0, v: sig.changes[0].v });
  }

  return { timescale, timeMax: timeMax || 0, signals };
}

// JSON interop — the "JSON signal arrays" form is just the signals list. Accepts a
// raw VCD string, a full model, or a bare signals array, and returns a model.
export function toModel(input) {
  if (typeof input === "string") return parseVCD(input);
  if (Array.isArray(input)) {
    const timeMax = input.reduce(
      (m, s) => Math.max(m, ...(s.changes || []).map((c) => c.t)),
      0
    );
    return { timescale: { value: 1, unit: "ns" }, timeMax, signals: input };
  }
  return input; // already a model
}
