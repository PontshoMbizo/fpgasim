import React from 'react';

export default function SearchPanel({ search, setSearch, layer, setLayer }) {
  return (
    <div className="p-4 border-b border-[#3e3e42] bg-[#262626] flex gap-4 items-center shrink-0">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search pin..."
        className="border border-[#3e3e42] bg-[#1e1e1e] text-gray-300 rounded px-3 py-2 w-80 focus:outline-none focus:border-blue-500 placeholder-gray-500"
      />
      <select
        value={layer}
        onChange={(e) => setLayer(e.target.value)}
        className="border border-[#3e3e42] bg-[#1e1e1e] text-gray-300 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
      >
        <option>ALL</option>
        <option>HDMI</option>
        <option>SD</option>
        <option>POWER</option>
      </select>
    </div>
  );
}
