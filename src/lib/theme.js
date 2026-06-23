// Single source of truth for colors used inside SVG fill/stroke attributes,
// where Tailwind utility classes can't be applied cleanly. These values mirror
// the @theme tokens in src/app/globals.css — keep them in sync.

export const COLORS = {
  base: "#0a0a0a",
  panel: "#1e1e1e",
  elevated: "#262626",
  hover: "#2a2a2a",
  edge: "#3e3e42",

  textPrimary: "#ffffff",
  textSecondary: "#d4d4d4",
  textMuted: "#6b7280",

  accent: "#22c55e",
  danger: "#ef4444",
  info: "#38bdf8",
  focus: "#3b82f6",

  // Signal / pin states
  sigHigh: "#22c55e",
  sigLow: "#3f6212",
  sigX: "#f59e0b",
  sigZ: "#6b7280",
};

// Per-state colors for board pins and waveform buses.
export const STATE_COLORS = {
  HIGH: COLORS.sigHigh,
  LOW: COLORS.sigLow,
  X: COLORS.sigX,
  Z: COLORS.sigZ,
};

// Color used to tint pins by which board layer they belong to.
export const LAYER_COLORS = {
  ALL: COLORS.info,
  SD: "#a855f7",
  HDMI: "#38bdf8",
  POWER: "#ef4444",
  ONBOARD: "#f59e0b",
  IO: "#94a3b8",
};
