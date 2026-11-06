# NikaVSimulator API Documentation

`fpgasim` is designed to be a plug-and-play, framework-agnostic simulation engine and UI library. The core components and hooks have been exported so that they can be seamlessly embedded into other applications, such as Scope.io.

## Installation / Usage
To use `fpgasim` as a local dependency in another project:
```bash
npm install /path/to/fpgasim
```

## Exports Overview

```javascript
import { 
  SimulationPane, 
  EditorPane, 
  SimProvider, 
  useSim, 
  parseVCD, 
  TangNano9kBoard 
} from 'nikavsimulator';
```

---

## 1. Components

### `SimProvider`
A React Context Provider that acts as the single source of truth for the entire simulation state. It maintains the VCD data model, the global time cursor, and dynamically derives the physical pin states based on the provided devboard configuration.

**Props:**
- `board` (`BoardConfig`): The physical board configuration object used to map logical signal names to physical pin IDs.
- `children` (`ReactNode`): The nested child components (typically `SimulationPane`).

**Example:**
```jsx
<SimProvider board={TangNano9kBoard}>
  <App />
</SimProvider>
```

### `SimulationPane`
The primary dual-tab UI component that renders both the Interactive Hardware Viewer and the Waveform Generator.

**Props:**
- `board` (`BoardConfig`): The physical board configuration to render. This dictatates the dimensions, the SVG overlay image, and the clickable peripheral zones.
- `isFullscreen` (`boolean`): Toggles the fullscreen UI state.
- `onFullscreen` (`function`): Callback fired when the fullscreen button is toggled.
- `isCollapsed` (`boolean`): Tracks if the pane is collapsed in a split-view layout.
- `onCollapse` (`function`): Callback fired to collapse/expand the pane.

### `EditorPane`
The Monaco-powered code editor pane customized for Verilog and `.cst` file authoring.

**Props:**
- `isFullscreen` (`boolean`): Toggles the fullscreen UI state.
- `onFullscreen` (`function`): Callback fired when the fullscreen button is toggled.
- `isCollapsed` (`boolean`): Tracks if the pane is collapsed.
- `onCollapse` (`function`): Callback fired to collapse/expand the pane.

---

## 2. State & Hooks

### `useSim()`
A React hook that exposes the current state of the simulator. Must be used within a component wrapped by `<SimProvider>`.

**Returns:**
An object containing:
- `model`: The current canonical JSON representation of the simulation data.
- `setModel(input)`: Function to inject new simulation data. `input` can be a raw VCD string, a bare signals array, or a fully parsed model object.
- `signals`: Array of all active signals and their historical changes.
- `timeCursor`: The current timestamp (in ns) of the scrubber.
- `setTimeCursor(t)`: Function to scrub the timeline horizontally.
- `timeMax`: The total duration of the current simulation trace.
- `pinStates`: An object mapping physical pin IDs to their current electrical state (`HIGH`, `LOW`, `X`, or `Z`) precisely at the `timeCursor` timestamp.
- `pxPerNs`: The current zoom scaling factor used by the waveform canvas.
- `board`: The currently active board configuration.

---

## 3. Core Libraries

### `parseVCD(text)`
A pure JavaScript utility function that parses a standard Value Change Dump (VCD) text payload and converts it into the canonical JSON model expected by `SimProvider`.

**Arguments:**
- `text` (`string`): The raw string contents of a `.vcd` file.

**Returns:**
- `Object`: The canonical `model` containing `timescale`, `timeMax`, and an array of `signals`.

---

## 4. Hardware Profiles

### `TangNano9kBoard`
A pre-built `BoardConfig` object providing the physical constraints, pin definitions, component metadata, and SVG parameters for the Gowin Tang Nano 9K development board.

**Schema:**
```javascript
{
  id: "tang-nano-9k",
  name: "Tang Nano 9K",
  image: "/images/tang-nano-9k.png",
  width: 1200,
  height: 700,
  pins: [ ... ],           // Extracted from pins.json
  components: [ ... ],     // Extracted from components.json
  // dynamic runtime property managed by the provider:
  // pinAssignments: { ... } 
}
```

## Adding Custom Devboards
To introduce a new FPGA devboard into Scope.io:
1. Create a new object adhering to the `BoardConfig` schema.
2. Provide the `width`, `height`, and an absolute URL to the top-down PNG graphic.
3. Define the physical `pins` array (each with `id`, `x`, `y`, and `special` constraint tags).
4. Pass the new object directly into `<SimProvider board={MyNewBoard}>` and `<SimulationPane board={MyNewBoard}>`.
