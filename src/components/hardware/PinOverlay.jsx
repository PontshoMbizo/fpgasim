import React from 'react';
import { COLORS, STATE_COLORS } from '../../lib/theme';

export default function PinOverlay({ pin, state, isHovered, isHighlighted, onHover, onLeave }) {
  // Driven pins are colored by their simulated state; undriven pins are neutral.
  const stateColor = state ? STATE_COLORS[state] : null;
  const fill = isHovered ? COLORS.info : stateColor || COLORS.textSecondary;
  const stroke = stateColor || COLORS.focus;

  return (
    <g onMouseEnter={onHover} onMouseLeave={onLeave} className="cursor-pointer">
      {/* enlarged transparent hit target */}
      <circle cx={pin.x} cy={pin.y} r={18} fill="transparent" />

      {/* net highlight ring */}
      {isHighlighted && (
        <circle cx={pin.x} cy={pin.y} r={16} fill={COLORS.accent} opacity="0.25">
          <animate attributeName="r" values="10;16;10" dur="1.2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* pulse on driven-HIGH pins */}
      {state === 'HIGH' && (
        <circle cx={pin.x} cy={pin.y} r={10} fill={COLORS.sigHigh} opacity="0.35">
          <animate attributeName="opacity" values="0.35;0.05;0.35" dur="1s" repeatCount="indefinite" />
        </circle>
      )}

      <circle
        cx={pin.x}
        cy={pin.y}
        r="8"
        fill={fill}
        stroke={stroke}
        strokeWidth="2"
      />
    </g>
  );
}
