"use client";
import React, { useEffect, useState } from 'react';
import { Cpu, CircuitBoard, Activity, Monitor, Terminal, CircleCheck } from 'lucide-react';
import EditorPane from '@/components/EditorPane';
import HardwareViewer from '@/components/hardware/HardwareViewer';
import SignalGeneratorPane from '@/components/SignalGeneratorPane';
import UartConsole from '@/components/ui/UartConsole';
import HdmiPreview from '@/components/ui/HdmiPreview';
import PaneHeader, { TabButton } from '@/components/ui/PaneHeader';
import { SimProvider, useSim } from '@/lib/simState';
import { listenForInit, announceReady } from '@/lib/scopeioBridge';

import { TangNano9kBoard } from '@/boards/tangnano9k';

// The suite's shared layout ("refined classic", see ../*-refined-classic.html):
//   brand bar
//   code (Run toolbar, file tabs, editor) | hardware preview (board)
//   results dock: Waveforms · HDMI · UART (the last two in Advanced mode)
//   status bar
const DEFAULT_DOCK = 36; // % of the window height

export default function HomeClient({ templates }) {
  // Set only when embedded under scope.io with a scopeio:init message — drives
  // the starter prefill + the extra Save/Capture/Submit button in EditorPane.
  // Plain standalone use or the /tools iframe (no bridge) leaves this null.
  const [embedMode, setEmbedMode] = useState(null);

  useEffect(() => {
    const unlisten = listenForInit(setEmbedMode);
    announceReady();
    return unlisten;
  }, []);

  return (
    <SimProvider board={TangNano9kBoard}>
      <Workspace templates={templates} embedMode={embedMode} />
    </SimProvider>
  );
}

function Workspace({ templates, embedMode }) {
  const { peripheralOutputs, advanced } = useSim();
  const [fullscreen, setFullscreen] = useState(null); // 'editor' | 'board' | 'dock' | null
  const [dockHeight, setDockHeight] = useState(DEFAULT_DOCK);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [dockTab, setDockTab] = useState('waveforms');

  // HDMI/UART are Advanced-only views; when Advanced is off they fall back to Waveforms.
  const currentDockTab = !advanced && (dockTab === 'hdmi' || dockTab === 'uart') ? 'waveforms' : dockTab;

  const toggleFullscreen = (pane) => setFullscreen((cur) => (cur === pane ? null : pane));

  // Drag the dock's top edge to resize it.
  const handleMouseDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = dockHeight;
    setDockCollapsed(false);

    const handleMouseMove = (moveEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const next = startH - (deltaY / window.innerHeight) * 100;
      setDockHeight(Math.max(15, Math.min(next, 75)));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
  };

  const full = 'fixed inset-0 z-[100] bg-panel';
  const board = TangNano9kBoard;

  return (
    <div className="h-screen w-full flex flex-col bg-base text-text-primary overflow-hidden font-sans selection:bg-focus/30">

      {/* Brand bar */}
      <header className="min-h-[37px] flex items-center flex-wrap gap-2 px-2.5 py-[5px] bg-panel border-b border-rule shrink-0">
        <span className="flex items-center gap-[7px] font-semibold text-[13px]">
          <Cpu size={15} className="text-accent" aria-hidden />
          fpgasim
        </span>
        <span className="text-[11px] text-text-muted truncate">{board.name} · GW1NR-9 · Verilog</span>
      </header>

      {/* Main row: code | hardware preview */}
      <div className="flex-1 min-h-0 flex max-[760px]:flex-col">
        <section
          aria-label="Code"
          className={fullscreen === 'editor' ? full : 'flex-[1.12] min-w-0 min-h-0 flex flex-col border-r border-edge max-[760px]:border-r-0 max-[760px]:border-b'}
          hidden={fullscreen !== null && fullscreen !== 'editor'}
        >
          <EditorPane
            templates={templates}
            embedMode={embedMode}
            isFullscreen={fullscreen === 'editor'}
            onFullscreen={() => toggleFullscreen('editor')}
          />
        </section>

        <section
          aria-label="Hardware preview"
          className={fullscreen === 'board' ? `${full} flex flex-col` : 'flex-1 min-w-0 min-h-0 flex flex-col bg-elevated'}
          hidden={fullscreen !== null && fullscreen !== 'board'}
        >
          <PaneHeader isFullscreen={fullscreen === 'board'} onFullscreen={() => toggleFullscreen('board')}>
            <span className="flex items-center gap-1.5 px-1 text-[13px] font-medium">
              <CircuitBoard size={14} className="text-text-muted" aria-hidden />
              Hardware preview
              <span className="text-[11px] font-normal text-text-muted">{board.name}</span>
            </span>
          </PaneHeader>
          <div className="flex-1 min-h-0 overflow-hidden relative">
            <HardwareViewer board={board} />
          </div>
        </section>
      </div>

      {/* Results dock */}
      <section
        aria-label="Results"
        style={fullscreen === 'dock' || dockCollapsed ? undefined : { height: `${dockHeight}%` }}
        className={fullscreen === 'dock' ? `${full} flex flex-col` : 'shrink-0 min-h-0 flex flex-col bg-panel border-t border-edge relative'}
        hidden={fullscreen !== null && fullscreen !== 'dock'}
      >
        {!fullscreen && (
          <div
            className="absolute -top-[3px] inset-x-0 h-[6px] cursor-row-resize z-10"
            onMouseDown={handleMouseDown}
            title="Drag to resize"
            aria-hidden
          />
        )}
        <PaneHeader
          isFullscreen={fullscreen === 'dock'}
          onFullscreen={() => toggleFullscreen('dock')}
          isCollapsed={dockCollapsed}
          onCollapse={fullscreen ? undefined : () => setDockCollapsed((c) => !c)}
        >
          <TabButton icon={Activity} label="Waveforms" active={currentDockTab === 'waveforms'} onClick={() => { setDockTab('waveforms'); setDockCollapsed(false); }} />
          {advanced && (
            <>
              <TabButton icon={Monitor} label="HDMI" active={currentDockTab === 'hdmi'} onClick={() => { setDockTab('hdmi'); setDockCollapsed(false); }} />
              <TabButton icon={Terminal} label="UART Console" active={currentDockTab === 'uart'} onClick={() => { setDockTab('uart'); setDockCollapsed(false); }} />
            </>
          )}
        </PaneHeader>
        {!dockCollapsed && (
          <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
            {currentDockTab === 'waveforms' ? (
              <SignalGeneratorPane />
            ) : currentDockTab === 'hdmi' ? (
              <HdmiPreview ppmBase64={peripheralOutputs?.ppm} />
            ) : (
              <UartConsole logs={peripheralOutputs?.uart} />
            )}
          </div>
        )}
      </section>

      <StatusBar board={board} />
    </div>
  );
}

// Bottom status bar: what the last run produced, plus the board and the engine.
function StatusBar({ board }) {
  const { signals, timeCursor } = useSim();
  const n = signals.length;
  return (
    <footer className="min-h-[26px] flex items-center flex-wrap gap-[7px] px-2.5 py-0.5 bg-base border-t border-edge text-[11px] text-text-muted shrink-0">
      <span className="flex items-center gap-[5px] text-text-primary min-w-0">
        <CircleCheck size={13} className="text-ok shrink-0" aria-hidden />
        <span className="truncate">{n ? `${n} signal${n === 1 ? '' : 's'} captured · cursor ${timeCursor} ns` : 'Ready'}</span>
      </span>
      <span className="ml-auto flex gap-3.5">
        <span className="max-[520px]:hidden">{board.name} · {board.pins.length} pins</span>
        <span className="text-accent">Icarus Verilog</span>
      </span>
    </footer>
  );
}
