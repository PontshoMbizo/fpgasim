"use client";
// Monaco cannot read CSS variables, so the suite palette is repeated here as two editor
// themes (light and dark) that match the tokens in src/app/globals.css. Editors pick one
// with useSuiteMonacoTheme(), which follows the system colour scheme like the CSS does.
import { useSyncExternalStore } from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";

const THEMES = {
  "suite-light": {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "4b7352" },
      { token: "keyword", foreground: "1463b2" },
      { token: "number", foreground: "985c08" },
      { token: "string", foreground: "a83227" },
      { token: "type", foreground: "6a3fa0" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#24292f",
      "editorLineNumber.foreground": "#8a939d",
      "editorLineNumber.activeForeground": "#24292f",
      "editor.lineHighlightBackground": "#f6f8fa",
      "editor.lineHighlightBorder": "#f6f8fa",
      "editor.selectionBackground": "#cfe3fb",
      "editor.inactiveSelectionBackground": "#e5f0fc",
      "editorCursor.foreground": "#1463b2",
      "editorIndentGuide.background1": "#e3e6e9",
      "editorWidget.background": "#f8f9fa",
      "editorWidget.border": "#cdd2d8",
      "scrollbarSlider.background": "#cdd2d880",
      "scrollbarSlider.hoverBackground": "#a7b0bc99",
    },
  },
  "suite-dark": {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8ab593" },
      { token: "keyword", foreground: "78b5f5" },
      { token: "number", foreground: "f3d34a" },
      { token: "string", foreground: "ffaaa3" },
      { token: "type", foreground: "c4a2f5" },
    ],
    colors: {
      "editor.background": "#1c2026",
      "editor.foreground": "#e5e9ee",
      "editorLineNumber.foreground": "#6f7a87",
      "editorLineNumber.activeForeground": "#e5e9ee",
      "editor.lineHighlightBackground": "#22272e",
      "editor.lineHighlightBorder": "#22272e",
      "editor.selectionBackground": "#263e58",
      "editor.inactiveSelectionBackground": "#263e5899",
      "editorCursor.foreground": "#78b5f5",
      "editorIndentGuide.background1": "#343d48",
      "editorWidget.background": "#20252c",
      "editorWidget.border": "#424b57",
      "scrollbarSlider.background": "#424b5780",
      "scrollbarSlider.hoverBackground": "#5b6470aa",
    },
  },
};

/** Pass as <Editor beforeMount={defineSuiteThemes} /> so the theme exists before first paint. */
export function defineSuiteThemes(monaco) {
  for (const [name, theme] of Object.entries(THEMES)) monaco.editor.defineTheme(name, theme);
}

const subscribe = (onChange) => {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

/** "suite-dark" or "suite-light", following the system setting. */
export function useSuiteMonacoTheme() {
  const dark = useSyncExternalStore(subscribe, () => window.matchMedia(DARK_QUERY).matches, () => false);
  return dark ? "suite-dark" : "suite-light";
}

/** The page's mono font (IBM Plex Mono via next/font) for Monaco, or a system fallback. */
export function monoFontFamily() {
  const fallback = "ui-monospace, 'SFMono-Regular', Menlo, monospace";
  if (typeof window === "undefined") return fallback;
  const page = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
  return page ? `${page}, ${fallback}` : fallback;
}
