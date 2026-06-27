"use client";
import React, { useEffect, useState } from 'react';
import EditorPane from '@/components/EditorPane';
import SimulationPane from '@/components/SimulationPane';
import { SimProvider } from '@/lib/simState';

import { TangNano9kBoard } from '@/boards/tangnano9k';

const DEFAULT_SPLIT = 60;

export default function HomeClient({ templates }) {
  const [topHeight, setTopHeight] = useState(DEFAULT_SPLIT); // % height of editor
  const [fullscreen, setFullscreen] = useState(null); // 'editor' | 'sim' | null

  // PostMessage communication skeleton
  useEffect(() => {
    const handleMessage = (event) => {
      // In production, verify event.origin to ensure it's from Scope.io
      if (event.data?.type === 'UPDATE_CODE') {
        console.log("Received code from Scope.io:", event.data.code);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleMouseDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = topHeight;

    const handleMouseMove = (moveEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeightPercent = startH + (deltaY / window.innerHeight) * 100;
      setTopHeight(Math.max(10, Math.min(newHeightPercent, 90)));
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

  // Collapse toggles the split toward one pane and restores on second click.
  const editorCollapsed = topHeight <= 12;
  const simCollapsed = topHeight >= 88;
  const toggleEditorCollapse = () =>
    setTopHeight(editorCollapsed ? DEFAULT_SPLIT : 10);
  const toggleSimCollapse = () =>
    setTopHeight(simCollapsed ? DEFAULT_SPLIT : 90);

  const toggleFullscreen = (pane) =>
    setFullscreen((cur) => (cur === pane ? null : pane));

  return (
    <SimProvider board={TangNano9kBoard}>
      <div className="h-screen w-full flex flex-col bg-base text-text-primary overflow-hidden font-sans selection:bg-focus/30">

        {/* Top Pane: Editor */}
        <div
          style={fullscreen === 'editor' ? undefined : { height: `${topHeight}%` }}
          className={`w-full p-2 pb-1 flex flex-col min-h-0 ${fullscreen === 'editor' ? 'fixed inset-0 z-[100] p-3 bg-base' : ''}`}
          hidden={fullscreen === 'sim'}
        >
          <EditorPane
            templates={templates}
            isFullscreen={fullscreen === 'editor'}
            onFullscreen={() => toggleFullscreen('editor')}
            isCollapsed={editorCollapsed}
            onCollapse={toggleEditorCollapse}
          />
        </div>

        {/* Resizer Handle */}
        {!fullscreen && (
          <div
            className="h-2 w-full flex items-center justify-center cursor-row-resize shrink-0 group z-50 relative"
            onMouseDown={handleMouseDown}
          >
            {/* Invisible larger hit area for easier grabbing */}
            <div className="absolute inset-y-[-4px] inset-x-0" />
            <div className="w-12 h-1 bg-edge rounded-full group-hover:bg-text-muted transition-colors" />
          </div>
        )}

        {/* Bottom Pane: Simulation (Hardware / Waveforms) */}
        <div
          style={fullscreen === 'sim' ? undefined : { height: `${100 - topHeight}%` }}
          className={`w-full p-2 pt-1 flex flex-col min-h-0 ${fullscreen === 'sim' ? 'fixed inset-0 z-[100] p-3 bg-base' : ''}`}
          hidden={fullscreen === 'editor'}
        >
          <SimulationPane
            board={TangNano9kBoard}
            isFullscreen={fullscreen === 'sim'}
            onFullscreen={() => toggleFullscreen('sim')}
            isCollapsed={simCollapsed}
            onCollapse={toggleSimCollapse}
          />
        </div>

      </div>
    </SimProvider>
  );
}
