import React from 'react';
import { COLORS } from '../../lib/theme';

// A small marker attached to a physical pin representing a visual stimulus block that
// drives that pin's net. Rendered as a sibling to PinOverlay inside HardwareViewer's
// <svg> — connected to the pin with a dashed leader line so it reads as "attached to
// this pin" without overlapping the pin's own state-colored dot.
export default function StimulusOverlay({ stimulus, pin, isHovered, onHover, onLeave, onClick }) {
  if (!pin) return null;
  const x = pin.x;
  const y = pin.y - 26;
  const disabled = stimulus.enabled === false;
  const fill = disabled ? 'transparent' : (isHovered ? COLORS.accent : COLORS.elevated);
  const glyphColor = disabled ? COLORS.textMuted : (isHovered ? COLORS.base : COLORS.accent);

  return (
    <g
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      className="cursor-pointer"
    >
      <line x1={pin.x} y1={pin.y - 4} x2={x} y2={y + 9} stroke={COLORS.accent} strokeWidth="1.25" strokeDasharray="2,2" opacity={disabled ? 0.4 : 0.8} />
      <rect
        x={x - 9} y={y - 9} width="18" height="18" rx="4"
        fill={fill}
        stroke={COLORS.accent}
        strokeWidth="1.5"
        strokeDasharray={disabled ? '2,2' : undefined}
      />
      <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fill={glyphColor} className="select-none">
        {disabled ? '⏸' : '⚡'}
      </text>
      <title>{stimulus.label || stimulus.target} ({stimulus.kind})</title>
    </g>
  );
}
