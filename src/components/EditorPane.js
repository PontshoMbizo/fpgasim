"use client";
import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Code2, Maximize2, List, SlidersHorizontal, Play, Loader, Send, Save, FolderOpen } from 'lucide-react';
import PaneHeader from './ui/PaneHeader';
import { useSim } from '../lib/simState';
import { DEFAULT_DESIGN, DEFAULT_TESTBENCH } from '../lib/templateDefaults';
import { sendResult, extractChanges } from '../lib/scopeioBridge';
import { functionToSamples } from '../lib/stimulusSampling';
import { parsePorts, pickTop, moduleNames, stripComments } from '../lib/testbench';
import { buildSnapshot, parseSnapshot } from '../lib/snapshot';

const MAX_LOAD_BYTES = 2 * 1024 * 1024; // 2 MB cap for snapshot files

// Editor tabs. "design" is always available; the rest are revealed by Advanced mode.
const BASIC_TABS = ['design'];
const ADVANCED_TABS = ['design', 'testbench', 'cst', 'sdc'];

const EMBED_ACTION_LABEL = { export: 'Save starter', capture: 'Capture golden', solve: 'Submit' };

// `templates` (optional) seeds the editors — supplied by the server from the
// disk-backed registry (src/lib/templates.js). Falls back to the built-in defaults so
// EditorPane still works when used standalone (e.g. the library export in src/index.js).
//
// `embedMode` (optional) — set by HomeClient once a scopeio:init message arrives.
// `{ mode: "export"|"capture"|"solve", starterCode, testbench?, duration? }`.
export default function EditorPane({ templates, embedMode, isFullscreen, onFullscreen, isCollapsed, onCollapse }) {
  const [code, setCode] = useState(templates?.design ?? DEFAULT_DESIGN);

  // Optional separate testbench. When non-empty it's sent alongside the design and
  // used verbatim by the backend (auto-stimulus generation is skipped). It MUST call
  // $dumpfile("out.vcd")/$dumpvars or the backend produces no waveform. Clear it to
  // fall back to the auto-generated clock stimulus.
  const [testbench, setTestbench] = useState(templates?.testbench ?? DEFAULT_TESTBENCH);
  const [cst, setCst] = useState(templates?.cst ?? '');
  const [sdc, setSdc] = useState(templates?.sdc ?? '');
  const [activeTab, setActiveTab] = useState('design'); // 'design' | 'testbench' | 'cst' | 'sdc'
  const [durationNs, setDurationNs] = useState(2000000); // 2ms default

  const { setModel, setDiagnostics, setPeripheralOutputs, advanced, setAdvanced, stimuli, setStimuli, setDesignPorts, components, setComponents, wires, setWires } = useSim();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(null); // { ok, text }

  const tabs = advanced ? ADVANCED_TABS : BASIC_TABS;
  // Effective tab: if Advanced is off, hidden tabs fall back to Design (derived, so no
  // state-sync effect is needed).
  const currentTab = tabs.includes(activeTab) ? activeTab : 'design';

  // Seed the editors from the embed's starter/testbench exactly once, the first
  // time a scopeio:init arrives — not on every embedMode reference change, so it
  // doesn't clobber edits if the parent re-renders.
  //
  // Tried moving this to a render-time ref-guard (React's usual alternative to an
  // effect + setState), but that trips react-hooks/refs instead: it only allows
  // the narrow `if (ref.current == null) { ref.current = value }` lazy-init shape,
  // not a boolean guard gating other setState calls. Genuinely a one-time sync
  // from an async external event (postMessage), which is what effects are for —
  // the ref guard already prevents the cascading-render case this rule targets.
  const seededEmbed = useRef(false);
  useEffect(() => {
    if (!embedMode || seededEmbed.current) return;
    seededEmbed.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time external sync, see comment above
    if (embedMode.starterCode != null) setCode(embedMode.starterCode);
    if (embedMode.testbench != null) setTestbench(embedMode.testbench);
    if (embedMode.duration != null) setDurationNs(embedMode.duration);
  }, [embedMode]);

  // Keep the shared designPorts list (SimProvider) in sync with the Design tab so the
  // Hardware view's stimulus config UI can offer a "target port" picker without
  // needing the raw Verilog source itself.
  useEffect(() => {
    const clean = stripComments(code);
    const names = moduleNames(clean);
    const top = names.length ? pickTop(clean, names) : null;
    setDesignPorts(top ? parsePorts(clean, top) : []);
  }, [code, setDesignPorts]);

  // Width of a top-level port by name, for sizing a `function`-kind stimulus's
  // reduced sample values (see resolveStimuli below). Best-effort — same regex-based
  // parsing testbench.js itself uses to build the board harness.
  const getPortWidth = (name) => {
    const clean = stripComments(code);
    const names = moduleNames(clean);
    if (names.length === 0) return 1;
    const top = pickTop(clean, names);
    const port = parsePorts(clean, top).find((p) => p.name === name);
    return port?.width ?? 1;
  };

  // Stimulus blocks only apply on the board-harness path (advanced mode + a non-empty
  // .cst — see docs/board-emulation.md's precedence chain) and only ever leave the
  // browser as wire-format kinds: 'function' blocks are reduced to 'samples' here so
  // no user-authored math ever has to be evaluated server-side.
  const resolveStimuli = () => {
    if (!advanced || !cst.trim() || !stimuli.length) return undefined;
    return stimuli
      .filter((s) => s.enabled !== false)
      .map((s) => (s.kind === 'function'
        ? { ...s, kind: 'samples', samples: functionToSamples(s.function, getPortWidth(s.target)) }
        : s));
  };

  // Components/wires only apply on the cst path (same rule as stimuli).
  // Do not send when the user's own testbench is set (route rejects it anyway).
  const resolveComponents = () => {
    if (!advanced || !cst.trim() || !components.length) return undefined;
    return components;
  };
  const resolveWires = () => {
    if (!advanced || !cst.trim() || !wires.length) return undefined;
    return wires;
  };

  // Shared by the Run button and the embed action button: sends the source to
  // the sandboxed Icarus Verilog backend and flows a successful VCD into the
  // shared model. Returns the raw /api/simulate response.
  const runSimulation = async () => {
    const payload = {
      code,
      testbench: testbench.trim() ? testbench : undefined,
      cst: cst.trim() ? cst : undefined,
      sdc: sdc.trim() ? sdc : undefined,
      opts: { durationNs },
      peripherals: ['uart', 'flash', 'sd', 'hdmi'],
      stimuli: resolveStimuli(),
      components: resolveComponents(),
      wires: resolveWires(),
    };

    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.diagnostics) setDiagnostics(data.diagnostics);
    if (data.peripheralOutputs) setPeripheralOutputs(data.peripheralOutputs);
    const model = data.ok ? setModel(data.vcd) : null;
    return { data, model };
  };

  // File input ref for Load snapshot — hidden input, triggered programmatically.
  const loadInputRef = useRef(null);

  const handleSave = () => {
    // Derive the top module name for the filename.
    const clean = stripComments(code);
    const names = moduleNames(clean);
    const top = names.length ? pickTop(clean, names) : null;
    const filename = (top || 'design') + '.nikav.json';

    const snapshot = buildSnapshot({
      design: code,
      testbench,
      cst,
      sdc,
      durationNs,
      peripherals: ['uart', 'flash', 'sd', 'hdmi'],
      stimuli,
      components,
      wires,
    });

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadFile = (e) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected after an error.
    if (loadInputRef.current) loadInputRef.current.value = '';
    if (!file) return;
    if (file.size > MAX_LOAD_BYTES) {
      setStatus({ ok: false, text: `Snapshot file too large (${(file.size / 1024).toFixed(0)} KB). Max 2 MB.` });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = parseSnapshot(ev.target.result);
      if (!result.ok) {
        // Non-destructive: report errors without touching state.
        setStatus({ ok: false, text: 'Snapshot load failed: ' + (result.errors || []).join('; ') });
        return;
      }
      const s = result.snapshot;
      // Hydrate all editor tabs.
      setCode(s.design ?? '');
      setTestbench(s.testbench ?? '');
      setCst(s.cst ?? '');
      setSdc(s.sdc ?? '');
      if (typeof s.durationNs === 'number') setDurationNs(s.durationNs);
      // Hydrate context: stimuli, components, wires.
      setStimuli(Array.isArray(s.stimuli) ? s.stimuli : []);
      setComponents(Array.isArray(s.components) ? s.components : []);
      setWires(Array.isArray(s.wires) ? s.wires : []);
      setStatus({ ok: true, text: 'Snapshot loaded.' });
    };
    reader.onerror = () => {
      setStatus({ ok: false, text: 'Could not read snapshot file.' });
    };
    reader.readAsText(file);
  };

  const handleRun = async () => {
    if (running) return;
    setRunning(true);
    setStatus(null);
    // Friendly pre-flight: if components exist but CST is empty, surface a clear
    // message instead of letting the route return a raw 400.
    if (advanced && components.length > 0 && !cst.trim()) {
      setStatus({ ok: false, text: 'Components require a board constraints file (.cst). Open the CST tab and add your pin assignments before running.' });
      setRunning(false);
      return;
    }
    try {
      const { data, model } = await runSimulation();
      if (data.ok) {
        const n = model?.signals?.length ?? 0;
        setStatus({ ok: true, text: `Compiled ✓ ${n} signal${n === 1 ? '' : 's'}` });
      } else {
        const firstLine = (data.log || 'Simulation failed').split('\n').find(Boolean) || 'Simulation failed';
        setStatus({ ok: false, text: `${data.stage || 'error'}: ${firstLine}` });
      }
    } catch (e) {
      setStatus({ ok: false, text: `Request failed: ${e.message}` });
    } finally {
      setRunning(false);
    }
  };

  // The embed-mode action button (Save starter / Capture golden / Submit).
  // "export" just hands the current code back to scope.io — there's no golden
  // signal configured yet at that stage, so no compile is needed. "capture"
  // and "solve" both compile and extract the configured signal's change-list,
  // which scope.io grades (capture: stores as golden; solve: grades against it).
  const handleEmbedAction = async () => {
    if (!embedMode || running) return;
    if (embedMode.mode === 'export') {
      sendResult({ code, ok: true, log: '', changes: [], raw: '' });
      return;
    }
    setRunning(true);
    setStatus(null);
    try {
      const { data, model } = await runSimulation();
      if (!data.ok) {
        const firstLine = (data.log || 'Simulation failed').split('\n').find(Boolean) || 'Simulation failed';
        setStatus({ ok: false, text: `${data.stage || 'error'}: ${firstLine}` });
        sendResult({ code, ok: false, log: data.log || firstLine, changes: [], raw: data.vcd || '' });
        return;
      }
      setStatus({ ok: true, text: 'Compiled ✓' });
      const changes = extractChanges(model, embedMode.signal);
      sendResult({ code, ok: true, log: '', changes, raw: data.vcd });
    } catch (e) {
      setStatus({ ok: false, text: `Request failed: ${e.message}` });
      sendResult({ code, ok: false, log: e.message, changes: [], raw: '' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-panel rounded-lg border border-edge overflow-hidden font-sans shadow-xl">

      <PaneHeader
        isFullscreen={isFullscreen}
        onFullscreen={onFullscreen}
        isCollapsed={isCollapsed}
        onCollapse={onCollapse}
      >
        <div className="flex items-center gap-2 text-text-secondary font-semibold text-[13px]">
          <Code2 size={16} className="text-accent" />
          Code
        </div>
      </PaneHeader>

      {/* Sub Toolbar */}
      <div className="h-10 bg-panel flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-1 text-[13px]">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2.5 py-1 rounded transition-colors capitalize ${currentTab === tab ? 'bg-edge text-text-primary' : 'text-text-secondary hover:bg-edge/60'}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-text-muted">
          {advanced && (
            <>
              <select
                value={durationNs}
                onChange={e => setDurationNs(Number(e.target.value))}
                className="bg-edge/50 border border-edge text-text-primary text-[12px] rounded px-1.5 py-1 outline-none"
                title="Simulation duration"
              >
                <option value={100000}>100 µs</option>
                <option value={500000}>500 µs</option>
                <option value={2000000}>2 ms</option>
                <option value={10000000}>10 ms</option>
                <option value={33333333}>33 ms (1 frame)</option>
              </select>
              {/* Save / Load snapshot */}
              <button
                onClick={handleSave}
                className="flex items-center gap-1 px-2 py-1 rounded text-[12px] text-text-secondary hover:bg-edge/60 transition-colors"
                title="Save snapshot (.nikav.json)"
              >
                <Save size={13} />
                Save
              </button>
              <button
                onClick={() => loadInputRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 rounded text-[12px] text-text-secondary hover:bg-edge/60 transition-colors"
                title="Load snapshot (.nikav.json)"
              >
                <FolderOpen size={13} />
                Load
              </button>
              <input
                ref={loadInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleLoadFile}
              />
            </>
          )}
          <button
            onClick={() => setAdvanced(!advanced)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium transition-colors ${advanced ? 'bg-edge text-text-primary' : 'text-text-secondary hover:bg-edge/60'}`}
            title="Advanced options — testbench, constraints (.cst/.sdc), simulation duration and the UART/HDMI views"
            aria-pressed={advanced}
          >
            <SlidersHorizontal size={13} />
            Advanced
          </button>
          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-1.5 bg-accent/90 hover:bg-accent text-white px-2.5 py-1 rounded text-[12px] font-medium transition-colors disabled:opacity-60"
            title="Run simulation"
          >
            {running ? <Loader size={13} className="animate-spin" /> : <Play size={13} />}
            {running ? 'Running' : 'Run'}
          </button>
          {embedMode && (
            <button
              onClick={handleEmbedAction}
              disabled={running}
              className="flex items-center gap-1.5 bg-emerald-600/90 hover:bg-emerald-600 text-white px-2.5 py-1 rounded text-[12px] font-medium transition-colors disabled:opacity-60"
              title={`Send to scope.io (${embedMode.mode})`}
            >
              <Send size={13} />
              {EMBED_ACTION_LABEL[embedMode.mode] || 'Send'}
            </button>
          )}
          <button className="hover:text-text-primary transition-colors" title="Format">
            <List size={15} />
          </button>
          <button onClick={onFullscreen} className="hover:text-text-primary transition-colors" title="Fullscreen">
            <Maximize2 size={15} />
          </button>
        </div>
      </div>

      {/* Editor Error / Diagnostics Banner */}
      {status?.ok === false && (
        <div className="bg-danger/10 text-danger border-y border-danger/20 p-2 text-xs font-mono max-h-32 overflow-auto whitespace-pre-wrap">
          {status.text}
        </div>
      )}

      {/* Monaco Editor Container */}
      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          path={currentTab + '.v'}
          defaultLanguage={currentTab === 'cst' || currentTab === 'sdc' ? 'tcl' : 'verilog'}
          theme="vs-dark"
          value={currentTab === 'design' ? code : currentTab === 'testbench' ? testbench : currentTab === 'cst' ? cst : sdc}
          onChange={(val) => {
            if (currentTab === 'design') setCode(val ?? '');
            else if (currentTab === 'testbench') setTestbench(val ?? '');
            else if (currentTab === 'cst') setCst(val ?? '');
            else setSdc(val ?? '');
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
            lineHeight: 24,
            padding: { top: 16 },
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            formatOnPaste: true,
            renderLineHighlight: "all"
          }}
        />
      </div>

      {/* Footer */}
      <div className="h-8 bg-panel border-t border-edge/50 flex items-center justify-between px-4 shrink-0 text-[12px] text-text-muted">
        <div className={`truncate font-mono ${status ? (status.ok ? 'text-accent' : 'text-danger') : ''}`} title={status?.text || ''}>
          {status ? status.text : 'Saved'}
        </div>
        <div className="shrink-0 pl-3">Ln 1, Col 1</div>
      </div>

    </div>
  );
}
