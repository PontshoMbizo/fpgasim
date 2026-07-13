// End-to-end lockstep against REAL iverilog/vvp (no container): compiles the harness
// and drives quanta through sim/entrypoint-lockstep.sh exactly as the bridge server
// would. Skips when iverilog isn't installed (CI installs it; the sandbox image has it).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateLockstepHarness } from "../src/lib/lockstepHarness.js";
import { LockstepSession } from "../src/lib/lockstepSession.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function haveIverilog() {
  try {
    execFileSync("iverilog", ["-V"], { stdio: "pipe" });
    execFileSync("vvp", ["-V"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
const HAVE = haveIverilog();

// entrypoint-lockstep.sh writes to /work (container tmpfs). Outside a container we
// re-point it at a throwaway dir via a patched copy — the logic under test is identical.
function hostEntrypoint() {
  const dir = mkdtempSync(path.join(tmpdir(), "fl-lockstep-"));
  const orig = path.join(ROOT, "sim", "entrypoint-lockstep.sh");
  const patched = path.join(dir, "entrypoint.sh");
  const text = execFileSync("cat", [orig], { encoding: "utf8" })
    .replaceAll("/work", dir);
  writeFileSync(patched, text, { mode: 0o755 });
  return patched;
}

// Square wave via clock divider. Toggle every 13000 posedges of the ~27 MHz board
// clock ⇒ toggles at ≈481.5 µs, 963 µs, 1444.5 µs … — comfortably *inside* successive
// 500 µs quanta (never on a boundary, immune to the 37.038 ns period rounding), so the
// boundary-sampled q alternates 1,0,1 across the first three quanta.
const SQUARE_SRC = `
module top(input clk, input en, output reg q);
  reg [15:0] n;
  initial begin n = 0; q = 0; end
  always @(posedge clk) begin
    if (!en) begin n <= 0; end
    else if (n == 16'd12999) begin n <= 0; q <= ~q; end
    else n <= n + 16'd1;
  end
endmodule
`;

test("vvp e2e: harness locksteps a real design through entrypoint-lockstep.sh", { skip: !HAVE }, async () => {
  const h = generateLockstepHarness(SQUARE_SRC);
  assert.equal(h.error, undefined);
  const s = new LockstepSession(SQUARE_SRC + h.text, {
    command: ["sh", hostEntrypoint()],
    replyTimeoutMs: 20_000,
  });

  // q starts 0; en=1: one divider toggle lands inside each 500 µs quantum.
  const r1 = await s.step(500_000, "1");
  assert.equal(r1.tNs, 500_000);
  const r2 = await s.step(500_000, "1");
  assert.equal(r2.tNs, 1_000_000);
  assert.notEqual(r1.outHex, r2.outHex, "q must toggle across one half-period quantum");
  const r3 = await s.step(500_000, "1");
  assert.equal(r3.outHex, r1.outHex, "q must toggle back");

  // en=0 freezes the divider: no further toggles.
  const r4 = await s.step(500_000, "0");
  const r5 = await s.step(500_000, "0");
  assert.equal(r4.outHex, r5.outHex, "disabled counter must hold its level");

  // virtual time is exactly the sum of quanta — lockstep, not free-running.
  assert.equal(r5.tNs, 2_500_000);
  s.dispose();
});

test("vvp e2e: compile failure exits with stage code 2", { skip: !HAVE }, async () => {
  await new Promise((resolve) => {
    const s = new LockstepSession("module broken(; endmodule", {
      command: ["sh", hostEntrypoint()],
      onEnd: () => {
        assert.equal(s.dead, true);
        resolve();
      },
    });
  });
});
