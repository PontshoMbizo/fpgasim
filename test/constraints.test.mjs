import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCst } from "../src/lib/constraints.js";
import { parseSdc } from "../src/lib/sdc.js";
import { checkConstraints } from "../src/lib/constraintCheck.js";
import { DEFAULT_CST, DEFAULT_SDC, DEFAULT_DESIGN } from "../src/lib/templateDefaults.js";

const PINS = JSON.parse(
  readFileSync(fileURLToPath(new URL("../src/data/pins.json", import.meta.url)), "utf8")
);

// ---------------------------------------------------------------------------
// parseCst
// ---------------------------------------------------------------------------
test("parseCst reads IO_LOC and IO_PORT, ignoring comments", () => {
  const { ioPins, ioAttrs, errors } = parseCst(`
    // comment line
    IO_LOC "clk" 63;
    IO_PORT "clk" IO_TYPE=LVCMOS33 PULL_MODE=NONE;
    /* block
       comment */
    IO_LOC "leds[0]" 10;
    IO_PORT "leds[0]" IO_TYPE=LVCMOS33 DRIVE=8;
  `);
  assert.deepEqual(errors, []);
  assert.deepEqual(ioPins.get("clk"), ["63"]);
  assert.deepEqual(ioPins.get("leds[0]"), ["10"]);
  assert.equal(ioAttrs.get("clk").ioType, "LVCMOS33");
  assert.equal(ioAttrs.get("clk").pullMode, "NONE");
  assert.equal(ioAttrs.get("leds[0]").drive, "8");
});

test("parseCst accepts the `exclusive` keyword and multiple locations", () => {
  const { ioPins } = parseCst(`IO_LOC "io" 5 exclusive;\nIO_LOC "bus" 1, 2, 3;`);
  assert.deepEqual(ioPins.get("io"), ["5"]);
  assert.deepEqual(ioPins.get("bus"), ["1", "2", "3"]);
});

test("parseCst reports an IO_LOC with no pin", () => {
  const { errors } = parseCst(`IO_LOC "io";`);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no pin location/);
});

// ---------------------------------------------------------------------------
// parseSdc
// ---------------------------------------------------------------------------
test("parseSdc reads create_clock with period, name, waveform and get_ports", () => {
  const { clocks, errors } = parseSdc(
    `create_clock -name sysclk -period 37.037 -waveform {0 18.518} [get_ports {clk}]`
  );
  assert.deepEqual(errors, []);
  const c = clocks.get("clk");
  assert.ok(c);
  assert.equal(c.name, "sysclk");
  assert.equal(c.periodNs, 37.037);
  assert.deepEqual(c.waveformNs, [0, 18.518]);
});

test("parseSdc handles # comments and a bare get_ports clock", () => {
  const { clocks } = parseSdc(`# a clock\ncreate_clock -period 20 [get_ports clk]`);
  const c = clocks.get("clk");
  assert.equal(c.periodNs, 20);
  assert.equal(c.waveformNs[1], 10); // default fall = period/2
});

// ---------------------------------------------------------------------------
// checkConstraints — the default board set must be clean
// ---------------------------------------------------------------------------
test("the shipped default .cst/.sdc validate with no errors", () => {
  const diags = checkConstraints(parseCst(DEFAULT_CST), parseSdc(DEFAULT_SDC), DEFAULT_DESIGN, PINS);
  assert.deepEqual(diags.filter((d) => d.severity === "error"), []);
});

test("UNKNOWN_PIN: IO_LOC to a pin not on the board is an error", () => {
  const diags = checkConstraints(
    parseCst(`IO_LOC "clk" 9999;`),
    { clocks: new Map() },
    `module top(input clk); endmodule`,
    PINS
  );
  const d = diags.find((x) => x.type === "UNKNOWN_PIN");
  assert.ok(d && d.severity === "error");
  assert.equal(d.pin, "9999");
});

test("UNMAPPED_PORT: a design port with no IO_LOC is a warning", () => {
  const diags = checkConstraints(
    parseCst(`IO_LOC "clk" 63;`),
    { clocks: new Map() },
    `module top(input clk, output led); endmodule`,
    PINS
  );
  const d = diags.find((x) => x.type === "UNMAPPED_PORT" && x.port === "led");
  assert.ok(d && d.severity === "warning");
});

test("ILLEGAL_IO_TYPE: an IO_TYPE not in the board's allow-list is an error", () => {
  // pin 25 is on the IOB bank; LVCMOS99 is not a recognised standard.
  const diags = checkConstraints(
    parseCst(`IO_LOC "o" 25;\nIO_PORT "o" IO_TYPE=LVCMOS99;`),
    { clocks: new Map() },
    `module top(output o); endmodule`,
    PINS
  );
  const d = diags.find((x) => x.type === "ILLEGAL_IO_TYPE");
  assert.ok(d && d.severity === "error");
});

test("PULL_ON_OUTPUT: a pull mode on an output port is a warning", () => {
  const diags = checkConstraints(
    parseCst(`IO_LOC "o" 25;\nIO_PORT "o" IO_TYPE=LVCMOS33 PULL_MODE=UP;`),
    { clocks: new Map() },
    `module top(output o); endmodule`,
    PINS
  );
  const d = diags.find((x) => x.type === "PULL_ON_OUTPUT");
  assert.ok(d && d.severity === "warning");
});

test("PERIOD_MISMATCH: a clock on the 27MHz osc pin with the wrong period warns", () => {
  const diags = checkConstraints(
    parseCst(`IO_LOC "clk" 63;`),
    parseSdc(`create_clock -name clk -period 10 [get_ports {clk}]`),
    `module top(input clk); endmodule`,
    PINS
  );
  const d = diags.find((x) => x.type === "PERIOD_MISMATCH");
  assert.ok(d && d.severity === "warning");
});
