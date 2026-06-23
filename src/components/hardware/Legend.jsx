import React from 'react';
import { STATE_COLORS } from '../../lib/theme';

const ITEMS = [
  { label: 'High', color: STATE_COLORS.HIGH },
  { label: 'Low', color: STATE_COLORS.LOW },
  { label: 'Unknown', color: STATE_COLORS.X },
  { label: 'Floating', color: STATE_COLORS.Z },
];

// Small key in the corner of the board canvas explaining pin-state colors.
export default function Legend() {
  return (
    <div className="absolute bottom-3 right-3 z-20 bg-elevated/90 backdrop-blur-sm border border-edge rounded-md px-3 py-2 text-[11px] text-text-secondary pointer-events-none">
      <div className="font-semibold text-text-muted mb-1 uppercase tracking-wide text-[10px]">Pin state</div>
      <div className="flex flex-col gap-1">
        {ITEMS.map((it) => (
          <div key={it.label} className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: it.color }} />
            {it.label}
          </div>
        ))}
      </div>
    </div>
  );
}
