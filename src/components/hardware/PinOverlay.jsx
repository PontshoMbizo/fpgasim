import React from 'react';
import { COLORS, STATE_COLORS } from '../../lib/theme';

export default function PinOverlay({ pin, state, pinFunction, isHovered, isHighlighted, onHover, onLeave, canAddStimulus, onAddStimulus }) {
  // Driven pins are colored by their simulated state; undriven pins are neutral.
  const stateColor = state ? STATE_COLORS[state] : null;
  const fill = isHovered ? COLORS.info : stateColor || COLORS.textSecondary;
  const stroke = stateColor || COLORS.focus;

  // Pulse when the device is active. For active-low devices (like LEDs), it's active when LOW.
  const isActive = pinFunction?.activeLow ? state === 'LOW' : state === 'HIGH';

  return (
    <g onMouseEnter={onHover} onMouseLeave={onLeave} className="cursor-pointer">
      {/* enlarged transparent hit target */}
      <circle cx={pin.x} cy={pin.y} r={18} fill="transparent" />

      {/* net highlight ring */}
      {isHighlighted && (
        <circle cx={pin.x} cy={pin.y} r={10} fill={COLORS.accent} opacity="0.25">
          <animate attributeName="r" values="6;10;6" dur="1.2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* pulse on driven/active pins */}
      {isActive && (
        <circle cx={pin.x} cy={pin.y} r={6} fill={COLORS.sigHigh} opacity="0.35">
          <animate attributeName="opacity" values="0.35;0.05;0.35" dur="1s" repeatCount="indefinite" />
        </circle>
      )}

      <circle
        cx={pin.x}
        cy={pin.y}
        r="5"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.5"
      />

      {/* Advanced-mode-only "add a stimulus block here" affordance, shown on hover for
          pins not already claimed by a stimulus block. */}
      {isHovered && canAddStimulus && (
        <g
          onClick={(e) => { e.stopPropagation(); onAddStimulus(); }}
          className="cursor-pointer"
        >
          <circle cx={pin.x + 12} cy={pin.y - 12} r="7" fill={COLORS.accent} />
          <text x={pin.x + 12} y={pin.y - 9} textAnchor="middle" fontSize="10" fontWeight="bold" fill={COLORS.base}>+</text>
        </g>
      )}
    </g>
  );
}
