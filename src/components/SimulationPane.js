"use client";
import React, { useState } from 'react';
import { Cpu, Activity, Maximize, ChevronUp } from 'lucide-react';
import TangNanoViewer from './hardware/TangNanoViewer';
import SignalGeneratorPane from './SignalGeneratorPane';

export default function SimulationPane() {
  const [activeTab, setActiveTab] = useState('hardware');

  return (
    <div className="w-full h-full flex flex-col bg-[#1e1e1e] rounded-lg border border-[#3e3e42] overflow-hidden font-sans shadow-xl">
      
      {/* Top Header / Tabs */}
      <div className="h-10 bg-[#262626] flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center h-full">
          <button 
            onClick={() => setActiveTab('hardware')}
            className={`flex items-center gap-2 h-full px-3 text-[13px] transition-colors ${activeTab === 'hardware' ? 'text-white font-bold' : 'text-gray-400 font-medium hover:text-gray-300'}`}
          >
            <Cpu size={15} strokeWidth={activeTab === 'hardware' ? 2.5 : 2} className={activeTab === 'hardware' ? "text-green-500" : "text-green-600/70"} />
            Hardware
          </button>
          
          <div className="w-[1px] h-4 bg-[#3e3e42] mx-1" />
          
          <button 
            onClick={() => setActiveTab('waveforms')}
            className={`flex items-center gap-2 h-full px-3 text-[13px] transition-colors ${activeTab === 'waveforms' ? 'text-white font-bold' : 'text-gray-400 font-medium hover:text-gray-300'}`}
          >
            <Activity size={15} strokeWidth={activeTab === 'waveforms' ? 2.5 : 2} className={activeTab === 'waveforms' ? "text-green-500" : "text-green-600/70"} />
            Waveforms
          </button>
        </div>
        
        <div className="flex items-center gap-3 text-gray-400">
          <button className="hover:text-white transition-colors" title="Fullscreen">
            <Maximize size={14} />
          </button>
          <button className="hover:text-white transition-colors" title="Collapse">
            <ChevronUp size={16} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 relative bg-[#1e1e1e] flex flex-col overflow-hidden">
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
