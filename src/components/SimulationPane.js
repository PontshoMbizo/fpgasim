"use client";
import React, { useState } from 'react';
import { Cpu, Activity } from 'lucide-react';
import TangNanoViewer from './hardware/TangNanoViewer';
import SignalGeneratorPane from './SignalGeneratorPane';
import PaneHeader, { TabButton } from './ui/PaneHeader';

export default function SimulationPane({ isFullscreen, onFullscreen, isCollapsed, onCollapse }) {
  const [activeTab, setActiveTab] = useState('hardware');

  return (
    <div className="w-full h-full flex flex-col bg-panel rounded-lg border border-edge overflow-hidden font-sans shadow-xl">

      <PaneHeader
        isFullscreen={isFullscreen}
        onFullscreen={onFullscreen}
        isCollapsed={isCollapsed}
        onCollapse={onCollapse}
      >
        <TabButton icon={Cpu} label="Hardware" active={activeTab === 'hardware'} onClick={() => setActiveTab('hardware')} />
        <div className="w-[1px] h-4 bg-edge mx-1" />
        <TabButton icon={Activity} label="Waveforms" active={activeTab === 'waveforms'} onClick={() => setActiveTab('waveforms')} />
      </PaneHeader>

      {/* Content Area */}
      <div className="flex-1 min-h-0 relative bg-panel flex flex-col overflow-hidden">
        {activeTab === 'hardware' ? (
          <div className="flex-1 overflow-hidden relative">
            <TangNanoViewer />
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4">
            <SignalGeneratorPane />
          </div>
        )}
      </div>

    </div>
  );
}
