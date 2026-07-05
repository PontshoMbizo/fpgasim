# External Components — Implementation Plan

Custom chips (external Verilog components) wired to the Tang Nano 9K board, modelled on
CircuitJS's *custom chip* workflow. Studied from the local `projects/circuitjs1` clone:

| CircuitJS concept | What we borrow |
|---|---|
| `CustomLogicModel` | Quick-create with comma pin lists, defaults **inputs `A,B` / outputs `C,D`**; named, reusable definitions serialized with the circuit. |
| `ChipElm.drawChip()` | DIP-box rendering: rectangle, per-pin stub + post, pin label **inside** the box next to its pin, auto-shrinking label font, W-side inputs / E-side outputs. |
| `CustomCompositeElm` | A chip is a black box whose behaviour comes from a user-authored inner definition (ours: a Verilog module instead of a subcircuit). |
| `DataInputElm` | Driving a signal from an uploaded data file (ours: JSON waveform import into a stimulus block). |
| Circuit text dump | One save file restores everything (ours: full JSON snapshot). |

The behavioural definition is **Verilog, co-simulated in the same Icarus run** as the
design — no second engine. A chip is just another module instantiated in the generated
testbench, wired to the DUT's port nets and/or to other chips.

---

## 1. Data model (`src/lib/componentSchema.js`)

```js
// Component (custom chip)
{
  id: 'c1',                  // unique, [A-Za-z_]\w*
  name: 'sn74hc595',         // display name == Verilog module name (must be unique vs design modules)
  x: 940, y: 180,            // SVG board-canvas coords (top-left of chip box)
  pins: [                    // DERIVED from parsing `verilog` (parsePorts); cached for rendering
    { name: 'A', dir: 'input',  width: 1 },
    { name: 'B', dir: 'input',  width: 1 },
    { name: 'C', dir: 'output', width: 1 },
    { name: 'D', dir: 'output', width: 1 },
  ],
  verilog: 'module sn74hc595(input A, input B, output C, output D); … endmodule',
  testbench: '',             // optional; used only by standalone "Test chip" runs
}

// Wire — endpoints, order irrelevant
{ id: 'w1', a: { comp: 'c1', pin: 'A' }, b: { pin: '25' } }        // chip pin ↔ physical board pin
{ id: 'w2', a: { comp: 'c1', pin: 'C' }, b: { comp: 'c2', pin: 'B' } } // chip ↔ chip
```

Rules:
- Pin layout is derived: `input` pins on the **west** side top-to-bottom, `output`/`inout`
  on the **east** side (CircuitJS default). No manual side control in v1.
- Board endpoints use **physical pin ids** (the labelled pins the user sees). At codegen
  time a pin id resolves to a DUT port through the parsed `.cst` (`ioPins`: port → pin).
  Unmapped pin → error diagnostic (`WIRE_UNMAPPED_PIN`).
- Quick-create (CircuitJS-style): dialog takes name + `inputs: "A,B"` + `outputs: "C,D"`,
  generates a stub module with those ANSI ports and a `// TODO behaviour` body. Editing
  the Verilog afterwards re-parses ports (client-side `parsePorts`) and updates `pins`;
  wires whose pin name vanished are dropped with a toast.

### Caps (exported constants)
`MAX_COMPONENTS = 8`, `MAX_WIRES = 64`, `MAX_COMPONENT_CODE_BYTES = 32 * 1024`,
combined source still bounded by the route's existing `MAX_CODE_BYTES`.

### Validation (`validateComponents(components, wires, designModuleNames, cstResult)`)
Diagnostics in the same `{severity, message, port?}` shape as `constraintCheck.js`:
- duplicate component id/name; name not a valid Verilog identifier
- component `verilog` doesn't contain `module <name>` with parseable ANSI ports
- module name collides with a design module (`MODULE_NAME_COLLISION`, error)
- wire endpoint references missing component/pin (`WIRE_BAD_ENDPOINT`, error)
- board endpoint pin not present in `.cst` map (`WIRE_UNMAPPED_PIN`, error)
- **single-driver rule**: a net may have at most one driver — drivers are: chip `output`
  pin, DUT `output` port, or a stimulus block. Two drivers on one net →
  `WIRE_DRIVER_CONFLICT` error. A net with only inputs → `WIRE_NO_DRIVER` warning.
- chip `input` pin with no wire and no stimulus → info/warning (floating input reads `z`).
- `inout` chip pins: rejected in v1 (`INOUT_UNSUPPORTED`, error) — tri-state net
  resolution across chips is out of scope.

## 2. Codegen (`src/lib/testbench.js` — new `generateComponentLayer()`)

Called from `generateBoardHarness` (new 7th arg `components`, 8th `wires`). Emits:

1. **Net building.** Union-find over wire endpoints → electrical nets. A net containing a
   board endpoint uses the existing tb signal for that DUT port (bit-select for
   `leds[2]`-style bus bits). A chip-only net declares `wire [w-1:0] net_<n>;` (width =
   max endpoint width; mismatched widths → warning diagnostic, Verilog implicit
   truncation semantics apply).
2. **DUT inputs driven by a chip** join the existing `drivenInputs` set (declared `wire`,
   skip default init, skip button/clock heuristics) — same mechanism as flash `miso`.
3. **Instantiation.** Each chip: `<name> u_<id> (.A(net_or_sig), …);` Unwired input →
   leave port unconnected (`.A()`) so it reads `z` (matches the warning). Unwired
   output → unconnected.
4. **Stimulus on chip pins.** Stimulus `target` grammar extended: `"<compId>.<pinName>"`.
   `generateStimulusDrivers` resolves these against components (new optional arg),
   declares `reg [w-1:0] stim_<id>_net;`, drives it with the normal template, and the
   component layer connects that reg to the chip pin's net. A chip pin may have **either**
   a wire or a stimulus, not both (driver conflict above).
5. **Module source.** The route appends each component's `verilog` after the user design,
   before the harness. `$dumpvars(0, tb)` already dumps chip ports/instances → they show
   up in waveforms + are scrubbable, no VCD changes needed.

`generateStimulusDrivers`/`validateStimuli` signature changes stay backward compatible
(new args optional; existing tests must keep passing).

## 3. Snapshot save/load (`src/lib/snapshot.js`)

```json
{ "format": "nikav-snapshot", "version": 1, "board": "tang-nano-9k",
  "design": "…", "testbench": "…", "cst": "…", "sdc": "…",
  "durationNs": 2000000, "peripherals": ["uart"],
  "stimuli": [ … ], "components": [ … ], "wires": [ … ] }
```

- `buildSnapshot(state)` / `parseSnapshot(json)` — pure, no Node APIs (client-importable).
- `parseSnapshot` validates format/version/caps, sanitises with the same schema
  validators, returns `{ ok, snapshot?, errors? }` — never throws on user files.
- UI: **Save** downloads `<design-name>.nikav.json`; **Load** hydrates editor tabs,
  duration, peripherals, stimuli, components, wires in one shot.

### Stimulus waveform JSON import (per-block)
Accepted shapes, mirroring `DataInputElm`'s file-driven source:
```json
{ "format": "nikav-stimulus", "version": 1, "kind": "samples",
  "stepNs": 100, "values": [0,1,0,…], "target": "clk" }
```
or a bare JSON array `[0,1,0,…]` (stepNs from the form field). Enforced against
`MAX_SAMPLES_PER_STIMULUS` at import with a clear error.

## 4. API (`src/app/api/simulate/route.js`)

Request gains `components?: Component[]`, `wires?: Wire[]`. Rules (mirror `stimuli`):
- only meaningful on the `.cst` path; 400 if present with an explicit `testbench`
- validated via `validateComponents` → merged into the same `diagnostics` array
- per-component and total size caps checked **before** harness generation; the existing
  late `Buffer.byteLength(source)` check still guards the combined output
- component Verilog is untrusted user code — same trust boundary as `code` (sandbox), no
  server-side evaluation of anything.

**Standalone chip test needs no new endpoint:** the client POSTs
`{ code: chip.verilog, testbench: chip.testbench }` (no cst / stimuli / components). With
an empty testbench the existing auto-testbench path drives it. Results go through the
normal `setModel` → waveform pane flow, plus a "Testing <chip>" banner.

## 5. UI

New files under `src/components/hardware/`:
- **`ExternalChipLayer.jsx`** — renders each chip in board-SVG space, CircuitJS style
  (matches the reference picture): dark body, 2px light-gray border, white pin labels
  inside the box beside their pins, pin stubs ending in circular pads; bus pins render
  `name/width`. Drag body to move (snap 10 px). Click a pad → wiring mode with
  rubber-band line following the cursor; click a board pin overlay or another chip pad to
  commit the wire; `Esc` cancels. Double-click chip → opens its editor. `Del` removes
  selected chip (and its wires).
- **`WireLayer.jsx`** — L-routed polylines between endpoint anchors; live colour from the
  VCD value at the time cursor (reuse pin-state colours; gray when no model / no net).
  Click selects, `Del` deletes, hover highlights both endpoints.
- **`ComponentsPanel.jsx`** — right-side panel (visual twin of `StimulusConfigPanel`):
  chip list, **Add chip** quick-create (name, inputs `A,B`, outputs `C,D` prefilled),
  per-chip editor with **Verilog | Testbench** Monaco tabs, port re-parse on change with
  inline diagnostics, **Test chip** button (standalone run), delete.
- `HardwareViewer.jsx` — mounts the two layers + a "Components" toolbar button next to
  "Signal Sources" (advanced mode only, same pattern).
- `simState.js` — adds `components`, `wires`, setters; snapshot getter/setter plumbing so
  EditorPane content can be captured/hydrated (editor registers its tab contents via
  context callbacks).
- `EditorPane.js` — includes `components`/`wires` in the `/api/simulate` payload; Save /
  Load buttons in the toolbar (advanced mode).
- `StimulusConfigPanel.jsx` — "Import JSON" file button on the samples editor; target
  picker gains chip input pins (`c1.A`) when components exist.

## 6. Testing (`test/components.test.mjs` + extensions)

- schema: caps, collisions, driver conflicts, unmapped pins, inout rejection
- codegen: golden-ish assertions on generated harness text — net naming, `.pin(net)`
  connections, drivenInputs interplay with button/clock heuristics, stimulus-on-chip-pin
- snapshot: round-trip build→parse, malformed/oversized inputs, version gate
- route-level validation unit tests where feasible without Docker
- all existing suites must stay green (`npm run test:unit`); Docker e2e runs are not
  possible in this environment — flagged in the report for a local run.

## 7. Out of scope (v1)

`inout`/tri-state nets between chips, manual pin-side placement, reusable chip library
outside the snapshot (localStorage library is a natural v2), live interactive stimulus
(batch+scrub model unchanged), analog behaviour.
