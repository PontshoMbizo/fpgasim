"use client";
import React from 'react';
import { useSim } from '../lib/simState';
import { COLORS } from '../lib/theme';

// GTKWave-esque Waveform Viewer. Reads the shared simulation model and time cursor
// so it stays in sync with the Hardware tab. Time is stored in ns; pixels are
// derived here via `pxPerNs`.
export default function SignalGeneratorPane() {
  const { signals, timeCursor, setTimeCursor, timeMax, pxPerNs } = useSim();

  const px = (t) => t * pxPerNs;
  const canvasW = Math.max(px(timeMax) + 100, 400); // a little trailing space
  const TICK_NS = 100;
  const GRID_NS = 50;
  const tickCount = Math.floor(timeMax / TICK_NS) + 1;
  const gridCount = Math.floor(timeMax / GRID_NS) + 1;

  const renderWaveform = (sig) => {
    if (sig.kind === 'bit') {
      const pts = [...sig.changes, { t: timeMax, v: sig.changes[sig.changes.length - 1].v }];
      const y = (v) => (v === '1' ? 3 : 15);
      let d = `M0,${y(pts[0].v)}`;
      for (let i = 1; i < pts.length; i++) {
        d += ` L${px(pts[i].t)},${y(pts[i - 1].v)} L${px(pts[i].t)},${y(pts[i].v)}`;
      }
      return <path d={d} fill="none" stroke={COLORS.sigHigh} strokeWidth="1.2" />;
    }

    // Hex bus
    const elements = [];
    const len = sig.changes.length;
    for (let i = 0; i < len; i++) {
      const startX = px(sig.changes[i].t);
      const endX = i < len - 1 ? px(sig.changes[i + 1].t) : px(timeMax);
      if (endX - startX < 1) continue;
      const v = sig.changes[i].v;
      const unknown = v === 'x' || v === 'X' || v === 'z';
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
    setTimeCursor(Math.max(0, Math.min(Math.round(x / pxPerNs), timeMax)));
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
          <svg width={canvasW} height="24">
            {[...Array(tickCount)].map((_, i) => (
              <g key={i}>
                <line x1={px(i * TICK_NS)} y1="18" x2={px(i * TICK_NS)} y2="24" stroke={COLORS.textMuted} strokeWidth="1" />
                <text x={px(i * TICK_NS) + 5} y="15" fill={COLORS.textMuted} fontSize="10" fontFamily="monospace">{i * TICK_NS} ns</text>
              </g>
            ))}
          </svg>
        </div>

        {/* Waveform Area */}
        <div className="relative h-[800px]" style={{ width: canvasW }}>
          {/* Vertical Grid */}
          <svg width="100%" height="100%" className="absolute inset-0 pointer-events-none">
            {[...Array(gridCount)].map((_, i) => (
              <line key={i} x1={px(i * GRID_NS)} y1="0" x2={px(i * GRID_NS)} y2="800" stroke={COLORS.edge} strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
            ))}
            {/* Shared cursor line */}
            <line x1={px(timeCursor)} y1="0" x2={px(timeCursor)} y2="800" stroke={COLORS.danger} strokeWidth="1" />
          </svg>

          {/* Traces */}
          <div className="absolute inset-0 flex flex-col pt-[2px]">
            {signals.map((sig) => (
              <div key={sig.id} className="h-[18px] relative flex items-center">
                <svg width={canvasW} height="18" className="absolute top-0 left-0">
                  <line x1="0" y1="18" x2={canvasW} y2="18" stroke={COLORS.hover} strokeWidth="1" />
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
