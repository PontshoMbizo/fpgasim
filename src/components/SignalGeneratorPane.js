"use client";
import React from 'react';

// GTKWave-esque Waveform Viewer
export default function SignalGeneratorPane() {
  const signals = [
    { id: 1, name: 'clk', type: 'wire', dir: '', val: '1', kind: 'clock' },
    { id: 2, name: 'b1x[1:6]', type: 'wire', dir: '', val: '3C', kind: 'bus', changes: [ {x:0, v:'1B'}, {x:40, v:'3C'} ] },
    { id: 3, name: 'b2x[1:6]', type: 'wire', dir: '', val: '0E', kind: 'bus', changes: [ {x:0, v:'31'}, {x:40, v:'0E'} ] },
    { id: 4, name: 'b3x[1:6]', type: 'wire', dir: '', val: '27', kind: 'bus', changes: [ {x:0, v:'1B'}, {x:40, v:'27'} ] },
    { id: 5, name: 'e[1:48]', type: 'wire', dir: '', val: '0F160A8A55A0', kind: 'bus', changes: [ {x:0, v:'6F+'}, {x:40, v:'F0E9F575AA5F'}, {x:550, v:'0F160A8A55A0'} ] },
    { id: 6, name: 'k[1:48]', type: 'wire', dir: '', val: 'FFFFFFFFFFFF', kind: 'bus', changes: [ {x:0, v:'000000000000'}, {x:550, v:'FFFFFFFFFFFF'} ] },
    { id: 7, name: 'li[1:32]', type: 'wire', dir: '', val: '27272443', kind: 'bus', changes: [ {x:0, v:'D8D8D88C'}, {x:550, v:'27272443'} ] },
    { id: 8, name: 'so1x[1:4]', type: 'wire', dir: '', val: '5', kind: 'bus', changes: [ {x:0, v:'E'}, {x:80, v:'5'} ] },
  ];

  const renderWaveform = (sig) => {
    if (sig.kind === 'clock') {
      return (
        <path d="M0,15 L15,15 L15,3 L30,3 L30,15 L45,15 L45,3 L60,3 L60,15 L75,15 L75,3 L90,3 L90,15 L105,15 L105,3 L120,3 L120,15 L135,15 L135,3 L150,3 L150,15 L165,15 L165,3 L180,3 L180,15 L195,15 L195,3 L210,3 L210,15 L225,15 L225,3 L240,3 L240,15 L255,15 L255,3 L270,3 L270,15 L285,15 L285,3 L300,3 L300,15 L315,15 L315,3 L330,3 L330,15 L345,15 L345,3 L360,3 L360,15 L375,15 L375,3 L390,3 L390,15 L405,15 L405,3 L420,3 L420,15 L435,15 L435,3 L450,3 L450,15 L465,15 L465,3 L480,3 L480,15 L495,15 L495,3 L510,3 L510,15 L525,15 L525,3 L540,3 L540,15 L555,15 L555,3 L570,3 L570,15 L585,15 L585,3 L600,3 L600,15 L615,15 L615,3 L630,3 L630,15 L645,15 L645,3 L660,3 L660,15 L675,15 L675,3 L690,3 L690,15 L705,15 L705,3 L720,3 L720,15 L735,15 L735,3 L750,3 L750,15 L765,15 L765,3 L780,3 L780,15 L795,15 L795,3 L810,3" fill="none" stroke="#00ff00" strokeWidth="1.2" />
      );
    } else {
      // Draw a hex bus
      const elements = [];
      const len = sig.changes.length;
      for (let i = 0; i < len; i++) {
        const startX = sig.changes[i].x;
        const endX = i < len - 1 ? sig.changes[i+1].x : 820;
        const v = sig.changes[i].v;
        
        // Draw polygon
        if (v === 'X' || v === 'U') {
          // Red box with X
          elements.push(
            <g key={i}>
              <polygon points={`${startX},9 ${startX+3},3 ${endX-3},3 ${endX},9 ${endX-3},15 ${startX+3},15`} fill="none" stroke="#ff0000" strokeWidth="1.2" />
              <text x={startX + 6} y={12.5} fill="#ff0000" fontSize="10" fontFamily="monospace">XX</text>
            </g>
          );
        } else {
          elements.push(
            <g key={i}>
              <polygon points={`${startX},9 ${startX+3},3 ${endX-3},3 ${endX},9 ${endX-3},15 ${startX+3},15`} fill="none" stroke="#00ff00" strokeWidth="1.2" />
              <text x={startX + 6} y={12.5} fill="#00ff00" fontSize="10" fontFamily="monospace">{v}</text>
            </g>
          );
        }
      }
      return <>{elements}</>;
    }
  };

  return (
    <div className="absolute inset-0 flex bg-[#1e1e1e] text-gray-300 overflow-hidden font-sans">
      
      {/* Left Pane: Signal List */}
      <div className="w-[280px] h-full flex flex-col border-r border-[#3e3e42] bg-[#1e1e1e] shadow-sm z-10 shrink-0">
        
        {/* Header */}
        <div className="h-6 border-b border-[#3e3e42] bg-[#262626] flex items-center px-1 text-[11px] font-sans text-gray-400">
          <div className="w-8">Dir</div>
          <div className="w-10">Type</div>
          <div className="flex-1">Signals</div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {signals.map((sig, idx) => (
            <div key={sig.id} className="flex items-center px-1 text-[12px] h-[18px] hover:bg-[#2a2a2a] cursor-pointer">
              <div className="w-8 text-gray-500 font-mono text-[10px]">{sig.dir}</div>
              <div className="w-10 text-gray-500 font-mono text-[10px]">{sig.type}</div>
              <div className="flex-1 font-mono flex">
                <span className="text-gray-300">{sig.name}</span>
                {sig.val && <span className="text-gray-500 ml-1">={sig.val}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Pane: Waveforms */}
      <div className="flex-1 h-full bg-[#1e1e1e] relative overflow-auto custom-scrollbar">
        
        {/* Timeline Header */}
        <div className="h-6 w-full sticky top-0 z-20 flex bg-[#1e1e1e] border-b border-[#3e3e42]">
          <svg width="2000" height="24">
            {/* Timeline ticks */}
            {[...Array(20)].map((_, i) => (
              <g key={i}>
                <line x1={i*100} y1="18" x2={i*100} y2="24" stroke="#555555" strokeWidth="1" />
                <text x={i*100 + 5} y="15" fill="#888888" fontSize="10" fontFamily="monospace">{i*100} ns</text>
              </g>
            ))}
          </svg>
        </div>

        {/* Waveform Area */}
        <div className="relative w-[2000px] h-[800px]">
          {/* Vertical Grid */}
          <svg width="100%" height="100%" className="absolute inset-0 pointer-events-none">
            {[...Array(40)].map((_, i) => (
              <line key={i} x1={i*50} y1="0" x2={i*50} y2="800" stroke="#333333" strokeWidth="1" strokeDasharray="2,2" />
            ))}
            {/* Red cursor line */}
            <line x1="550" y1="0" x2="550" y2="800" stroke="#ef4444" strokeWidth="1" />
          </svg>

          {/* Traces */}
          <div className="absolute inset-0 flex flex-col pt-[2px]">
            {signals.map((sig, idx) => (
              <div key={sig.id} className="h-[18px] relative flex items-center">
                <svg width="2000" height="18" className="absolute top-0 left-0">
                  {/* Horizontal grid line */}
                  <line x1="0" y1="18" x2="2000" y2="18" stroke="#2a2a2a" strokeWidth="1" />
                  {renderWaveform(sig)}
                </svg>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
