"use client";
import React from "react";
import { Maximize2, Minimize2, ChevronUp, ChevronDown } from "lucide-react";

// A selectable tab, styled like the suite's results-dock tabs: the active one sits on
// a paper chip with an edge border.
export function TabButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 min-h-[27px] px-2.5 rounded-suite border text-[13px] transition-colors ${
        active
          ? "bg-panel border-edge text-text-primary font-medium"
          : "border-transparent text-text-secondary hover:bg-accent-bg"
      }`}
    >
      <Icon size={14} strokeWidth={2} className={active ? "text-accent" : "text-text-muted"} />
      {label}
    </button>
  );
}

// Small icon-only button used in pane headers and toolbars.
export function IconButton({ title, onClick, children, pressed }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      className={`inline-flex items-center justify-center min-w-[27px] min-h-[27px] px-1.5 rounded-suite transition-colors ${
        pressed ? "bg-accent-bg text-accent" : "text-text-muted hover:bg-accent-bg hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

// Shared pane header: a left content slot (title or tabs) and the Fullscreen /
// Collapse controls on the right. Chrome background, like the suite's panel headers.
export default function PaneHeader({
  children,
  isFullscreen = false,
  onFullscreen,
  isCollapsed = false,
  onCollapse,
}) {
  return (
    <div className="min-h-[35px] bg-base border-b border-edge flex items-center justify-between gap-2 px-2 py-[3px] shrink-0">
      <div className="flex items-center flex-wrap gap-1 min-w-0" role="tablist">{children}</div>

      <div className="flex items-center gap-0.5">
        {onFullscreen && (
          <IconButton onClick={onFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </IconButton>
        )}
        {onCollapse && (
          <IconButton onClick={onCollapse} title={isCollapsed ? "Expand" : "Collapse"}>
            {isCollapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </IconButton>
        )}
      </div>
    </div>
  );
}
