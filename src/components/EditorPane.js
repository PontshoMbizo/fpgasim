"use client";
import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Code2, Maximize2, List, SlidersHorizontal, Play, Loader, Send } from 'lucide-react';
import PaneHeader from './ui/PaneHeader';
import { useSim } from '../lib/simState';
import { DEFAULT_DESIGN, DEFAULT_TESTBENCH } from '../lib/templateDefaults';
import { sendResult, extractChanges } from '../lib/scopeioBridge';

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

  const { setModel, setDiagnostics, setPeripheralOutputs, advanced, setAdvanced } = useSim();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(null); // { ok, text }

  const tabs = advanced ? ADVANCED_TABS : BASIC_TABS;
  // Effective tab: if Advanced is off, hidden tabs fall back to Design (derived, so no
  // state-sync effect is needed).
  const currentTab = tabs.includes(activeTab) ? activeTab : 'design';

  // Seed the editors from the embed's starter/testbench exactly once, the first
  // time a scopeio:init arrives — not on every embedMode reference change, so it
  // doesn't clobber edits if the parent re-renders.
  const seededEmbed = useRef(false);
  useEffect(() => {
    if (!embedMode || seededEmbed.current) return;
    seededEmbed.current = true;
    if (embedMode.starterCode != null) setCode(embedMode.starterCode);
    if (embedMode.testbench != null) setTestbench(embedMode.testbench);
    if (embedMode.duration != null) setDurationNs(embedMode.duration);
  }, [embedMode]);

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
      peripherals: ['uart', 'flash', 'sd', 'hdmi']
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
