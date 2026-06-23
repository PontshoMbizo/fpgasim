"use client";
import React from 'react';
import { useSim } from '../lib/simState';
import { COLORS } from '../lib/theme';

// GTKWave-esque Waveform Viewer. Reads the shared simulation signals and time
// cursor so it stays in sync with the Hardware tab.
export default function SignalGeneratorPane() {
  const { signals, timeCursor, setTimeCursor, timeMax } = useSim();

  const renderWaveform = (sig) => {
    if (sig.kind === 'clock') {
      // Build a square wave for the visible range from the clock period.
      const half = sig.period / 2;
      let d = `M0,15`;
      let high = false;
      for (let x = 0; x <= 820; x += half) {
        d += ` L${x},${high ? 3 : 15} L${x},${high ? 15 : 3}`;
        high = !high;
      }
      return <path d={d} fill="none" stroke={COLORS.sigHigh} strokeWidth="1.2" />;
    }

    if (sig.kind === 'bit') {
      let d = 'M0,';
      let first = true;
      const pts = [...sig.changes, { x: 820, v: sig.changes[sig.changes.length - 1].v }];
      let prevY = pts[0].v === '1' ? 3 : 15;
      d = `M0,${prevY}`;
      for (let i = 1; i < pts.length; i++) {
        const y = pts[i - 1].v === '1' ? 3 : 15;
        const ny = pts[i].v === '1' ? 3 : 15;
        d += ` L${pts[i].x},${y} L${pts[i].x},${ny}`;
      }
      return <path d={d} fill="none" stroke={COLORS.sigHigh} strokeWidth="1.2" />;
    }

    // Hex bus
    const elements = [];
    const len = sig.changes.length;
    for (let i = 0; i < len; i++) {
      const startX = sig.changes[i].x;
      const endX = i < len - 1 ? sig.changes[i + 1].x : 820;
      const v = sig.changes[i].v;
      const unknown = v === 'X' || v === 'U';
      const c = unknown ? COLORS.sigX : COLORS.sigHigh;
      elements.push(
        <g key={i}>
          <polygon points={`${startX},9 ${startX + 3},3 ${endX - 3},3 ${endX},9 ${endX - 3},15 ${startX + 3},15`} fill="none" stroke={c} strokeWidth="1.2" />
          <text x={startX + 6} y={12.5} fill={c} fontSize="10" fontFamily="monospace">{unknown ? 'XX' : v}</text>
        </g>
      );
    }
    return <>{elements}</>;
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
    setTimeCursor(Math.max(0, Math.min(Math.round(x), timeMax)));
  };

  return (
    <div className="absolute inset-0 flex bg-panel text-text-secondary overflow-hidden font-sans">

      {/* Left Pane: Signal List */}
      <div className="w-[280px] h-full flex flex-col border-r border-edge bg-panel shadow-sm z-10 shrink-0">

        {/* Header */}
        <div className="h-6 border-b border-edge bg-elevated flex items-center px-1 text-[11px] font-sans text-text-muted">
          <div className="w-8">Dir</div>
          <div className="w-10">Type</div>
          <div className="flex-1">Signals</div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {signals.map((sig) => (
            <div key={sig.id} className="flex items-center px-1 text-[12px] h-[18px] hover:bg-hover cursor-pointer">
              <div className="w-8 text-text-muted font-mono text-[10px]">{sig.dir}</div>
              <div className="w-10 text-text-muted font-mono text-[10px]">{sig.type}</div>
              <div className="flex-1 font-mono flex">
                <span className="text-text-secondary">{sig.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Pane: Waveforms */}
      <div className="flex-1 h-full bg-panel relative overflow-auto custom-scrollbar" onClick={handleSeek}>

        {/* Timeline Header */}
        <div className="h-6 w-full sticky top-0 z-20 flex bg-panel border-b border-edge">
          <svg width="2000" height="24">
            {[...Array(20)].map((_, i) => (
              <g key={i}>
                <line x1={i * 100} y1="18" x2={i * 100} y2="24" stroke={COLORS.textMuted} strokeWidth="1" />
                <text x={i * 100 + 5} y="15" fill={COLORS.textMuted} fontSize="10" fontFamily="monospace">{i * 100} ns</text>
              </g>
            ))}
          </svg>
        </div>

        {/* Waveform Area */}
        <div className="relative w-[2000px] h-[800px]">
          {/* Vertical Grid */}
          <svg width="100%" height="100%" className="absolute inset-0 pointer-events-none">
            {[...Array(40)].map((_, i) => (
              <line key={i} x1={i * 50} y1="0" x2={i * 50} y2="800" stroke={COLORS.edge} strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
            ))}
            {/* Shared cursor line */}
            <line x1={timeCursor} y1="0" x2={timeCursor} y2="800" stroke={COLORS.danger} strokeWidth="1" />
          </svg>

          {/* Traces */}
          <div className="absolute inset-0 flex flex-col pt-[2px]">
            {signals.map((sig) => (
              <div key={sig.id} className="h-[18px] relative flex items-center">
                <svg width="2000" height="18" className="absolute top-0 left-0">
                  <line x1="0" y1="18" x2="2000" y2="18" stroke={COLORS.hover} strokeWidth="1" />
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
