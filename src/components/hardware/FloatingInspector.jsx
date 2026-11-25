import React from 'react';
import { STATE_COLORS } from '../../lib/theme';

const STATE_LABEL = { HIGH: 'HIGH', LOW: 'LOW', X: 'UNKNOWN', Z: 'FLOATING' };

export default function FloatingInspector({ hoveredPin, hoveredComponent, pinState, mousePos }) {
  if (!hoveredPin && !hoveredComponent) return null;

  return (
    <div
      style={{ left: mousePos.x + 20, top: mousePos.y + 20 }}
      className="fixed z-50 bg-panel border border-edge text-text-secondary px-3 py-2.5 rounded-suite shadow-[0_5px_18px_#00000020] min-w-[240px] max-w-[320px] pointer-events-none text-[12px]"
    >
      {hoveredPin && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-medium text-text-primary">Pin {hoveredPin.id}</div>
            {pinState && (
              <span
                className="text-[11px] font-mono font-medium px-1.5 py-px rounded-suite"
                style={{ color: STATE_COLORS[pinState], borderColor: STATE_COLORS[pinState], borderWidth: 1 }}
              >
                {STATE_LABEL[pinState] || pinState}
              </span>
            )}
          </div>
          <div className="text-text-muted text-[11px]">{hoveredPin.name} · bank {hoveredPin.bank}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className="px-1.5 py-px rounded-suite bg-elevated border border-rule">{hoveredPin.layer}</span>
            <span className="px-1.5 py-px rounded-suite bg-elevated border border-rule uppercase">{hoveredPin.kind}</span>
            {hoveredPin.side && (
              <span className="px-1.5 py-px rounded-suite bg-elevated border border-rule">{hoveredPin.side}</span>
            )}
          </div>
          <div className="mt-2 text-[12px] text-text-secondary">
            {hoveredPin.special.length ? hoveredPin.special.join(" • ") : "Standard GPIO"}
          </div>
        </>
      )}
      {hoveredComponent && !hoveredPin && (
        <>
          <div className="text-[13px] font-medium text-text-primary">{hoveredComponent.name}</div>
          <div className="text-accent text-[11px]">{hoveredComponent.type}</div>
          <div className="mt-2 text-text-muted text-[12px]">{hoveredComponent.description}</div>
        </>
      )}
    </div>
  );
}
