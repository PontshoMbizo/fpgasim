import React from 'react';
import { Search } from 'lucide-react';

// Floating, compact search + layer filter that sits over the board view
// (cohesive with the corner Legend) instead of taking a full toolbar row.
export default function SearchPanel({ search, setSearch, layer, setLayer, layers, count }) {
  return (
    <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 bg-panel border border-edge rounded-suite p-1 shadow-[0_3px_14px_#00000014]">
      <div className="relative">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pin…"
          aria-label="Search pins"
          className="border border-edge bg-panel text-text-primary rounded-suite pl-7 pr-2 min-h-[28px] w-44 text-[12px] focus:outline-none focus:border-accent placeholder:text-text-muted"
        />
      </div>
      <select
        value={layer}
        onChange={(e) => setLayer(e.target.value)}
        aria-label="Pin layer"
        className="border border-edge bg-panel text-text-primary rounded-suite px-1.5 min-h-[28px] text-[12px] focus:outline-none focus:border-accent"
      >
        {layers.map((l) => (
          <option key={l} value={l}>{l}</option>
        ))}
      </select>
      <span className="text-[11px] text-text-muted tabular-nums px-1">{count}</span>
    </div>
  );
}
