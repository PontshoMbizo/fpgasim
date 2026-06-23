import React from 'react';
import { STATE_COLORS } from '../../lib/theme';

const STATE_LABEL = { HIGH: 'HIGH', LOW: 'LOW', X: 'UNKNOWN', Z: 'FLOATING' };

export default function FloatingInspector({ hoveredPin, hoveredComponent, pinState, mousePos }) {
  if (!hoveredPin && !hoveredComponent) return null;

  return (
    <div
      style={{ left: mousePos.x + 20, top: mousePos.y + 20 }}
      className="fixed z-50 bg-elevated border border-edge text-text-secondary p-4 rounded-lg shadow-xl min-w-[260px] pointer-events-none"
    >
      {hoveredPin && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-lg font-bold text-text-primary">Pin {hoveredPin.id}</div>
            {pinState && (
              <span
                className="text-[11px] font-mono font-bold px-2 py-0.5 rounded"
                style={{ color: STATE_COLORS[pinState], borderColor: STATE_COLORS[pinState], borderWidth: 1 }}
              >
                {STATE_LABEL[pinState] || pinState}
              </span>
            )}
          </div>
          <div className="text-text-muted">{hoveredPin.name} · bank {hoveredPin.bank}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-panel border border-edge">{hoveredPin.layer}</span>
            <span className="px-2 py-0.5 rounded bg-panel border border-edge uppercase">{hoveredPin.kind}</span>
            {hoveredPin.side && (
              <span className="px-2 py-0.5 rounded bg-panel border border-edge">{hoveredPin.side}</span>
            )}
          </div>
          <div className="mt-2 text-sm text-text-secondary">
            {hoveredPin.special.length ? hoveredPin.special.join(" • ") : "Standard GPIO"}
          </div>
        </>
      )}
      {hoveredComponent && !hoveredPin && (
        <>
          <div className="text-lg font-bold text-text-primary">{hoveredComponent.name}</div>
          <div className="text-info">{hoveredComponent.type}</div>
          <div className="mt-2 text-text-muted text-sm">{hoveredComponent.description}</div>
        </>
      )}
    </div>
  );
}
