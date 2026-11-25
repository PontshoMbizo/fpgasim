// Single source of truth for colors used inside SVG fill/stroke attributes and inline
// styles, where Tailwind utility classes can't be applied cleanly. Each value is the
// matching @theme token in src/app/globals.css as a CSS variable, so SVG overlays and
// waveforms follow the light/dark theme with the rest of the UI. Fallbacks are the
// light values, for library users who render without globals.css.

const v = (name, fallback) => `var(--color-${name}, ${fallback})`;

export const COLORS = {
  base: v("base", "#f1f2f3"),
  panel: v("panel", "#ffffff"),
  elevated: v("elevated", "#f8f9fa"),
  hover: v("hover", "#e9edf1"),
  edge: v("edge", "#cdd2d8"),
  rule: v("rule", "#e3e6e9"),

  textPrimary: v("text-primary", "#24292f"),
  textSecondary: v("text-secondary", "#3d454e"),
  textMuted: v("text-muted", "#626c77"),

  accent: v("accent", "#1463b2"),
  onAccent: v("on-accent", "#ffffff"),
  run: v("run", "#217344"),
  danger: v("danger", "#a83227"),
  info: v("info", "#1463b2"),
  focus: v("focus", "#1463b2"),

  // Signal / pin states
  sigHigh: v("sig-high", "#1f9d55"),
  sigLow: v("sig-low", "#8a939d"),
  sigX: v("sig-x", "#b7791f"),
  sigZ: v("sig-z", "#a7b0bc"),
  // Undriven pins on the board photo (same in both themes)
  pinIdle: v("pin-idle", "#d4d8dd"),
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
