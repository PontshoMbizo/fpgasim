import React from 'react';

export default function PinOverlay({ pin, isHovered, isHighlighted, onHover, onLeave }) {
  return (
    <g onMouseEnter={onHover} onMouseLeave={onLeave} className="cursor-pointer">
      <circle cx={pin.x} cy={pin.y} r={18} fill="transparent" />
      {isHighlighted && (
        <circle cx={pin.x} cy={pin.y} r={16} fill="#22c55e" opacity="0.25">
          <animate attributeName="r" values="10;16;10" dur="1.2s" repeatCount="indefinite" />
        </circle>
      )}
      <circle 
        cx={pin.x} 
        cy={pin.y} 
        r="8" 
        fill={isHovered ? "#38bdf8" : "#f8fafc"} 
        stroke="#2563eb" 
        strokeWidth="2" 
      />
    </g>
  );
}
