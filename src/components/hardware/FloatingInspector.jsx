import React from 'react';

export default function FloatingInspector({ hoveredPin, hoveredComponent, mousePos }) {
  if (!hoveredPin && !hoveredComponent) return null;
  
  return (
    <div
      style={{ left: mousePos.x + 20, top: mousePos.y + 20 }}
      className="fixed z-50 bg-[#262626] border border-[#3e3e42] text-gray-300 p-4 rounded-lg shadow-xl min-w-[260px] pointer-events-none"
    >
      {hoveredPin && (
        <>
          <div className="text-lg font-bold text-white">Pin {hoveredPin.id}</div>
          <div className="text-gray-400">{hoveredPin.bank}</div>
          <div className="mt-2 text-sm text-gray-300">
            {hoveredPin.special.length ? hoveredPin.special.join(" • ") : "Standard GPIO"}
          </div>
        </>
      )}
      {hoveredComponent && (
        <>
          <div className="text-lg font-bold text-white">{hoveredComponent.name}</div>
          <div className="text-cyan-400">{hoveredComponent.type}</div>
          <div className="mt-2 text-gray-400 text-sm">{hoveredComponent.description}</div>
        </>
      )}
    </div>
  );
}
