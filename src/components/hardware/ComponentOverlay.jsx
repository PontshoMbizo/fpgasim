import React from 'react';
import { COLORS } from '../../lib/theme';

export default function ComponentOverlay({ component, isHovered, onHover, onLeave }) {
  return (
    <g onMouseEnter={onHover} onMouseLeave={onLeave}>
      <rect
        x={component.x}
        y={component.y}
        width={component.width}
        height={component.height}
        fill={isHovered ? COLORS.info : "transparent"}
        fillOpacity={isHovered ? 0.08 : 0}
        stroke={isHovered ? COLORS.info : "transparent"}
        strokeWidth="3"
        rx="8"
      />
    </g>
  );
}
