"use client";
import React, { useState } from 'react';
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

  // HDMI/UART are Advanced-only views; when Advanced is off they fall back to Hardware.
  // Derived (not an effect) to avoid a state-sync render pass.
  const currentTab = !advanced && (activeTab === 'hdmi' || activeTab === 'uart') ? 'hardware' : activeTab;

  return (
    <div className="w-full h-full flex flex-col bg-panel rounded-lg border border-edge overflow-hidden font-sans shadow-xl">

      <PaneHeader
        isFullscreen={isFullscreen}
        onFullscreen={onFullscreen}
        isCollapsed={isCollapsed}
        onCollapse={onCollapse}
      >
        <TabButton icon={Cpu} label="Hardware" active={currentTab === 'hardware'} onClick={() => setActiveTab('hardware')} />
        <div className="w-[1px] h-4 bg-edge mx-1" />
        <TabButton icon={Activity} label="Waveforms" active={currentTab === 'waveforms'} onClick={() => setActiveTab('waveforms')} />
        {advanced && (
          <>
            <div className="w-[1px] h-4 bg-edge mx-1" />
            <TabButton icon={Monitor} label="HDMI" active={currentTab === 'hdmi'} onClick={() => setActiveTab('hdmi')} />
            <div className="w-[1px] h-4 bg-edge mx-1" />
            <TabButton icon={Activity} label="UART Console" active={currentTab === 'uart'} onClick={() => setActiveTab('uart')} />
          </>
        )}
      </PaneHeader>

      {/* Content Area */}
      <div className="flex-1 min-h-0 relative bg-panel flex flex-col overflow-hidden">
        {currentTab === 'hardware' ? (
          <div className="flex-1 overflow-hidden relative">
            <HardwareViewer board={board} />
          </div>
        ) : currentTab === 'waveforms' ? (
          <div className="flex-1 overflow-auto p-4">
            <SignalGeneratorPane />
          </div>
        ) : currentTab === 'hdmi' ? (
          <HdmiPreview ppmBase64={peripheralOutputs?.ppm} />
        ) : (
          <UartConsole logs={peripheralOutputs?.uart} />
        )}
      </div>

    </div>
  );
}
