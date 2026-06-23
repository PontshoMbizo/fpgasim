"use client";
import React from "react";
import { Maximize, Minimize, ChevronUp, ChevronDown } from "lucide-react";

// A single selectable tab button, shared styling for active/inactive states.
export function TabButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 h-full px-2 text-[12px] transition-colors ${
        active
          ? "text-text-primary font-bold"
          : "text-text-muted font-medium hover:text-text-secondary"
      }`}
    >
      <Icon
        size={13}
        strokeWidth={active ? 2.5 : 2}
        className={active ? "text-accent" : "text-accent/60"}
      />
      {label}
    </button>
  );
}

// Shared pane header with a left content slot (title or tabs) and the
// Fullscreen / Collapse controls on the right.
export default function PaneHeader({
  children,
  isFullscreen = false,
  onFullscreen,
  isCollapsed = false,
  onCollapse,
}) {
  return (
    <div className="h-7 bg-elevated flex items-center justify-between px-2 shrink-0">
      <div className="flex items-center h-full">{children}</div>

      <div className="flex items-center gap-2.5 text-text-muted">
        {onFullscreen && (
          <button
            onClick={onFullscreen}
            className="hover:text-text-primary transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
          </button>
        )}
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="hover:text-text-primary transition-colors"
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}
