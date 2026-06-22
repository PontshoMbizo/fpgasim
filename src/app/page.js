"use client";
import React, { useEffect, useState } from 'react';
import EditorPane from '@/components/EditorPane';
import SimulationPane from '@/components/SimulationPane';

export default function Home() {
  const [topHeight, setTopHeight] = useState(60); // 60% default

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

  return (
    <div className="h-screen w-full flex flex-col bg-[#0a0a0a] text-white overflow-hidden font-sans selection:bg-blue-500/30">
      
      {/* Top Pane: Editor */}
      <div style={{ height: `${topHeight}%` }} className="w-full p-2 pb-1 flex flex-col min-h-0">
        <EditorPane />
      </div>

      {/* Resizer Handle */}
      <div 
        className="h-2 w-full flex items-center justify-center cursor-row-resize shrink-0 group z-50 relative"
        onMouseDown={handleMouseDown}
      >
        {/* Invisible larger hit area for easier grabbing */}
        <div className="absolute inset-y-[-4px] inset-x-0" />
        <div className="w-12 h-1 bg-[#3e3e42] rounded-full group-hover:bg-gray-400 transition-colors" />
      </div>

      {/* Bottom Pane: Simulation (Hardware / Waveforms) */}
      <div style={{ height: `${100 - topHeight}%` }} className="w-full p-2 pt-1 flex flex-col min-h-0">
        <SimulationPane />
      </div>

    </div>
  );
}
