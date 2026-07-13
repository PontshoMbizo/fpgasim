// Container line-protocol codec for lockstep sessions (bridge-protocol v1).
// Shared vocabulary between the bridge server and tests. The same format is used by
// mcusim's bridge (kept as a deliberate copy there — the repos stay standalone).
//
//   host → sim :  T <quantum_ns> <in_hex>
//   sim → host :  E <t_ns> <out_hex>     intra-quantum output snapshot (capped)
//                 O <t_ns> <out_hex>     quantum boundary reply
//                 X <reason>             simulation ended

/** pins: created-order array [{name, dir}] — LSB of the hex vectors is index 0
 *  within each direction group. */
export function pinsByDir(pins, dir) {
  return pins.filter((p) => p.dir === dir);
}

/** {PIN: 0|1} → lowercase hex string for the T line (missing pins read as 0). */
export function inputsToHex(pins, inputs = {}) {
  const ins = pinsByDir(pins, "in");
  let v = 0n;
  ins.forEach((p, i) => {
    if (inputs[p.name]) v |= 1n << BigInt(i);
  });
  return v.toString(16);
}

/** hex string → {PIN: 0|1} over the "out" pins. */
export function hexToOutputs(pins, hex) {
  const outs = pinsByDir(pins, "out");
  let v;
  try {
    v = BigInt("0x" + String(hex).replace(/^0x/i, ""));
  } catch {
    return null;
  }
  const o = {};
  outs.forEach((p, i) => {
    o[p.name] = Number((v >> BigInt(i)) & 1n);
  });
  return o;
}

export function formatT(quantumNs, inHex) {
  return `T ${quantumNs} ${inHex === "" ? "0" : inHex}\n`;
}

/** Parse one stdout line from the sim. Returns
 *  {kind:"E"|"O", tNs, outHex} | {kind:"X", reason} | {kind:"log", line} */
export function parseSimLine(line) {
  const s = line.trim();
  if (s === "") return { kind: "log", line };
  const m = /^([EOX])\s+(.*)$/.exec(s);
  if (!m) return { kind: "log", line: s };
  if (m[1] === "X") return { kind: "X", reason: m[2] };
  const parts = m[2].split(/\s+/);
  const tNs = Number(parts[0]);
  const outHex = parts[1];
  if (!Number.isFinite(tNs) || outHex === undefined) return { kind: "log", line: s };
  return { kind: m[1], tNs, outHex };
}

/** Diff two out-hex snapshots into per-pin ws events: [[tNs, PIN, v], ...] */
export function eventsFromSnapshots(pins, prevHex, snaps) {
  const outs = pinsByDir(pins, "out");
  const events = [];
  let prev = BigInt("0x" + (prevHex || "0"));
  for (const s of snaps) {
    const cur = BigInt("0x" + s.outHex);
    const changed = prev ^ cur;
    outs.forEach((p, i) => {
      if ((changed >> BigInt(i)) & 1n) {
        events.push([s.tNs, p.name, Number((cur >> BigInt(i)) & 1n)]);
      }
    });
    prev = cur;
  }
  return events;
}
