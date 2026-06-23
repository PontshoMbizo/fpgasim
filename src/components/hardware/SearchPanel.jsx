import React from 'react';
import { Search } from 'lucide-react';

// Floating, compact search + layer filter that sits over the board view
// (cohesive with the corner Legend) instead of taking a full toolbar row.
export default function SearchPanel({ search, setSearch, layer, setLayer, layers, count }) {
  return (
    <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-elevated/90 backdrop-blur-sm border border-edge rounded-md px-2 py-1.5 shadow-lg">
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pin…"
          className="border border-edge bg-panel text-text-secondary rounded pl-7 pr-2 py-1 w-44 text-[12px] focus:outline-none focus:border-focus placeholder-text-muted"
        />
      </div>
      <select
        value={layer}
        onChange={(e) => setLayer(e.target.value)}
        className="border border-edge bg-panel text-text-secondary rounded px-2 py-1 text-[12px] focus:outline-none focus:border-focus"
      >
        {layers.map((l) => (
          <option key={l} value={l}>{l}</option>
        ))}
      </select>
      <span className="text-[11px] text-text-muted tabular-nums pr-1">{count}</span>
    </div>
  );
}
