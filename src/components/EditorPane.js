"use client";
import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Code2, Maximize2, Minimize2, ChevronUp, ChevronDown, SlidersHorizontal, Play, Loader, Send, CircleCheck, CircleAlert } from 'lucide-react';
import { defineSuiteThemes, monoFontFamily, useSuiteMonacoTheme } from '../lib/monacoTheme';
import { useSim } from '../lib/simState';
import { DEFAULT_DESIGN, DEFAULT_TESTBENCH } from '../lib/templateDefaults';
import { sendResult, extractChanges } from '../lib/scopeioBridge';
import { functionToSamples } from '../lib/stimulusSampling';
import { parsePorts, pickTop, moduleNames, stripComments } from '../lib/testbench';

// Editor tabs. "design" is always available; the rest are revealed by Advanced mode.
const BASIC_TABS = ['design'];
const ADVANCED_TABS = ['design', 'testbench', 'cst', 'sdc'];

const EMBED_ACTION_LABEL = { export: 'Save starter', capture: 'Capture golden', solve: 'Submit' };
const TAB_LABEL = { design: 'Design', testbench: 'Testbench', cst: 'Cst', sdc: 'Sdc' };
const TAB_FILE = { design: 'design.v', testbench: 'testbench.v', cst: 'pins.cst', sdc: 'timing.sdc' };

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

  const { setModel, setDiagnostics, setPeripheralOutputs, advanced, setAdvanced, stimuli, setDesignPorts } = useSim();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(null); // { ok, text }
  const monacoTheme = useSuiteMonacoTheme();

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

  const handleRun = async () => {
    if (running) return;
    setRunning(true);
    setStatus(null);
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
    <div className="w-full h-full flex flex-col bg-panel overflow-hidden font-sans">

      {/* Toolbar: Run first, as across the suite; run settings on the right */}
      <div role="toolbar" aria-label="Code toolbar" className="min-h-[41px] bg-base border-b border-edge flex items-center flex-wrap gap-[5px] px-[9px] py-[6px] shrink-0">
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="inline-flex items-center gap-1.5 min-h-[28px] px-[11px] rounded-suite border border-run bg-run text-white text-[13px] font-medium hover:brightness-110 disabled:opacity-60 transition"
          title="Run simulation"
        >
          {running ? <Loader size={13} className="animate-spin" /> : <Play size={13} fill="currentColor" />}
          {running ? 'Running' : 'Run'}
        </button>
        {embedMode && (
          <button
            type="button"
            onClick={handleEmbedAction}
            disabled={running}
            className="inline-flex items-center gap-1.5 min-h-[28px] px-2.5 rounded-suite border border-accent bg-accent text-on-accent text-[13px] font-medium hover:brightness-110 disabled:opacity-60 transition"
            title={`Send to scope.io (${embedMode.mode})`}
          >
            <Send size={13} />
            {EMBED_ACTION_LABEL[embedMode.mode] || 'Send'}
          </button>
        )}
        <span className="w-px h-[18px] bg-edge mx-1" aria-hidden />
        <button
          type="button"
          onClick={() => setAdvanced(!advanced)}
          className={`inline-flex items-center gap-1.5 min-h-[28px] px-2 rounded-suite text-[13px] transition-colors ${advanced ? 'bg-accent-bg text-accent' : 'text-text-primary hover:bg-accent-bg'}`}
          title="Advanced options — testbench, constraints (.cst/.sdc), simulation duration and the UART/HDMI views"
          aria-pressed={advanced}
        >
          <SlidersHorizontal size={14} />
          Advanced
        </button>
        <div className="ml-auto flex items-center gap-[7px] text-text-muted text-[13px]">
          {advanced && (
            <label className="flex items-center gap-[5px]">
              Stop
              <select
                value={durationNs}
                onChange={e => setDurationNs(Number(e.target.value))}
                className="min-h-[28px] bg-panel border border-edge text-text-primary font-mono text-[11px] rounded-suite px-1.5 outline-none focus:border-accent"
                title="Simulation duration"
              >
                <option value={100000}>100 µs</option>
                <option value={500000}>500 µs</option>
                <option value={2000000}>2 ms</option>
                <option value={10000000}>10 ms</option>
                <option value={33333333}>33 ms (1 frame)</option>
              </select>
            </label>
          )}
          {onFullscreen && (
            <button type="button" onClick={onFullscreen} className="inline-flex items-center justify-center min-w-[27px] min-h-[27px] rounded-suite text-text-muted hover:bg-accent-bg hover:text-text-primary transition-colors" title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          )}
          {onCollapse && (
            <button type="button" onClick={onCollapse} className="inline-flex items-center justify-center min-w-[27px] min-h-[27px] rounded-suite text-text-muted hover:bg-accent-bg hover:text-text-primary transition-colors" title={isCollapsed ? 'Expand' : 'Collapse'} aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
              {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
          )}
        </div>
      </div>

      {/* File tabs */}
      <div role="tablist" aria-label="Source files" className="flex items-center flex-wrap gap-0.5 px-[5px] py-1 bg-elevated border-b border-rule shrink-0">
        <Code2 size={13} className="text-text-muted mx-1" aria-hidden />
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={currentTab === tab}
            onClick={() => setActiveTab(tab)}
            title={TAB_FILE[tab]}
            className={`min-h-[25px] px-2 rounded-suite border text-[12px] transition-colors ${currentTab === tab ? 'bg-panel border-edge text-text-primary font-medium' : 'border-transparent text-text-secondary hover:bg-accent-bg'}`}
          >
            {TAB_LABEL[tab]}
          </button>
        ))}
      </div>

      {/* Editor Error / Diagnostics Banner */}
      {status?.ok === false && (
        <div role="alert" className="m-2 mb-0 px-3 py-2 bg-danger-bg text-danger border-l-[3px] border-danger rounded-r-suite text-[11px] font-mono max-h-32 overflow-auto whitespace-pre-wrap">
          {status.text}
        </div>
      )}

      {/* Monaco Editor Container */}
      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          path={currentTab + '.v'}
          defaultLanguage={currentTab === 'cst' || currentTab === 'sdc' ? 'tcl' : 'verilog'}
          theme={monacoTheme}
          beforeMount={defineSuiteThemes}
          value={currentTab === 'design' ? code : currentTab === 'testbench' ? testbench : currentTab === 'cst' ? cst : sdc}
          onChange={(val) => {
            if (currentTab === 'design') setCode(val ?? '');
            else if (currentTab === 'testbench') setTestbench(val ?? '');
            else if (currentTab === 'cst') setCst(val ?? '');
            else setSdc(val ?? '');
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: monoFontFamily(),
            lineHeight: 22,
            padding: { top: 10 },
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

      {/* Status line */}
      <div className="min-h-[26px] bg-base border-t border-edge flex items-center gap-1.5 px-2.5 shrink-0 text-[11px] text-text-muted">
        {status && (status.ok ? <CircleCheck size={13} className="text-ok shrink-0" /> : <CircleAlert size={13} className="text-danger shrink-0" />)}
        <div className={`truncate font-mono ${status ? (status.ok ? 'text-text-primary' : 'text-danger') : ''}`} title={status?.text || ''}>
          {status ? status.text : 'Saved'}
        </div>
        <div className="ml-auto shrink-0 pl-3 font-mono">{TAB_FILE[currentTab]}</div>
      </div>

    </div>
  );
}
