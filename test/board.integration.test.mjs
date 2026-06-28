import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// End-to-end board emulation through the real sandbox: build source the way
// /api/simulate does (design + board harness + peripheral models), run it, and check
// the VCD + decoded peripheral output. Gated on the sandbox image, like
// sandbox.integration.test.mjs.

process.env.SIM_TIMEOUT_S = process.env.SIM_TIMEOUT_S || "15";
const IMAGE = process.env.SIM_IMAGE || "nika-sim:latest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

let reason = false;
try {
  execFileSync("docker", ["image", "inspect", IMAGE], { stdio: "ignore" });
} catch {
  reason = `sandbox image ${IMAGE} not available (build: docker build -t nika-sim -f Dockerfile.sim sim/)`;
}

const { runSimulation } = await import("../src/lib/sandbox.js");
const { generateBoardHarness } = await import("../src/lib/testbench.js");
const { parseCst } = await import("../src/lib/constraints.js");
const { parseSdc } = await import("../src/lib/sdc.js");
const { DEFAULT_CST, DEFAULT_SDC, DEFAULT_DESIGN } = await import("../src/lib/templateDefaults.js");

// Concatenate the peripheral models the same way the API route does.
function models() {
  const dir = join(root, "sim", "models");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".v"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n\n");
}

function buildSource(code, { cst, sdc, peripherals = [], opts = {} } = {}) {
  const cstR = cst ? parseCst(cst) : null;
  const sdcR = sdc ? parseSdc(sdc) : null;
  return code + "\n" + generateBoardHarness(code, cstR, sdcR, peripherals, opts) + "\n" + models();
}

test("the default design + constraints produce a board VCD", { skip: reason }, async () => {
  const source = buildSource(DEFAULT_DESIGN, {
    cst: DEFAULT_CST,
    sdc: DEFAULT_SDC,
    peripherals: ["uart", "flash", "sd", "hdmi"],
    opts: { durationNs: 20000 },
  });
  const r = await runSimulation(source);
  assert.equal(r.ok, true, `expected success, got: ${r.stage} ${r.log}`);
  assert.match(r.vcd, /\$var/);
  // The clk, btn and 6-bit leds nets are all dumped.
  assert.match(r.vcd, /leds/);
});

test("a UART transmitter is decoded by the uart_monitor model", { skip: reason }, async () => {
  const code = readFileSync(join(here, "fixtures", "uart_tx.v"), "utf8");
  const source = buildSource(code, { peripherals: ["uart"], opts: { durationNs: 120000 } });
  const r = await runSimulation(source);
  assert.equal(r.ok, true, `expected success, got: ${r.stage} ${r.log}`);
  // uart_monitor prints "UART: <char>" to the log channel; we sent 'K'.
  assert.match(r.log, /UART: K/);
});

test("an SPI flash read design runs with the flash model attached", { skip: reason }, async () => {
  // Pulse cs/clk so the flash model is exercised; we only assert it compiles + runs.
  const code = `module top(
    input clk, output reg flash_cs, output reg flash_clk,
    output reg flash_mosi, input flash_miso
  );
    integer i = 0;
    initial begin flash_cs = 1; flash_clk = 0; flash_mosi = 0; end
    always @(posedge clk) begin
      flash_cs  <= (i > 4);
      flash_clk <= ~flash_clk;
      flash_mosi <= i[0];
      i <= i + 1;
    end
  endmodule`;
  const source = buildSource(code, { peripherals: ["flash"], opts: { durationNs: 10000 } });
  const r = await runSimulation(source);
  assert.equal(r.ok, true, `expected success, got: ${r.stage} ${r.log}`);
});
