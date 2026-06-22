import React from 'react';

export default function ComponentOverlay({ component, isHovered, onHover, onLeave }) {
  return (
    <g onMouseEnter={onHover} onMouseLeave={onLeave}>
      <rect
        x={component.x}
        y={component.y}
        width={component.width}
        height={component.height}
        fill="transparent"
        stroke={isHovered ? "#38bdf8" : "transparent"}
        strokeWidth="3"
        rx="8"
      />
    </g>
  );
}
