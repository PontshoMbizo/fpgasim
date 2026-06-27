"use client";
import React, { useState, useEffect } from 'react';
import { Cpu, Activity, Monitor } from 'lucide-react';
import HardwareViewer from './hardware/HardwareViewer';
import SignalGeneratorPane from './SignalGeneratorPane';
import PaneHeader, { TabButton } from './ui/PaneHeader';

import UartConsole from './ui/UartConsole';
import HdmiPreview from './ui/HdmiPreview';
import { useSim } from '../lib/simState';

export default function SimulationPane({ board, isFullscreen, onFullscreen, isCollapsed, onCollapse }) {
  const [activeTab, setActiveTab] = useState('hardware');
  const { peripheralOutputs, advanced } = useSim();

  // HDMI/UART are Advanced-only views; fall back to Hardware when Advanced is off.
  useEffect(() => {
    if (!advanced && (activeTab === 'hdmi' || activeTab === 'uart')) setActiveTab('hardware');
  }, [advanced, activeTab]);

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
        {advanced && (
          <>
            <div className="w-[1px] h-4 bg-edge mx-1" />
            <TabButton icon={Monitor} label="HDMI" active={activeTab === 'hdmi'} onClick={() => setActiveTab('hdmi')} />
            <div className="w-[1px] h-4 bg-edge mx-1" />
            <TabButton icon={Activity} label="UART Console" active={activeTab === 'uart'} onClick={() => setActiveTab('uart')} />
          </>
        )}
      </PaneHeader>

      {/* Content Area */}
      <div className="flex-1 min-h-0 relative bg-panel flex flex-col overflow-hidden">
        {activeTab === 'hardware' ? (
          <div className="flex-1 overflow-hidden relative">
            <HardwareViewer board={board} />
          </div>
        ) : activeTab === 'waveforms' ? (
          <div className="flex-1 overflow-auto p-4">
            <SignalGeneratorPane />
          </div>
        ) : activeTab === 'hdmi' ? (
          <HdmiPreview ppmBase64={peripheralOutputs?.ppm} />
        ) : (
          <UartConsole logs={peripheralOutputs?.uart} />
        )}
      </div>

    </div>
  );
}
