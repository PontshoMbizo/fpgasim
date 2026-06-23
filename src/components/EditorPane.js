"use client";
import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Code2, Maximize2, List, Bookmark, Brackets, RotateCcw, Lock, ChevronDown } from 'lucide-react';
import PaneHeader from './ui/PaneHeader';

export default function EditorPane({ isFullscreen, onFullscreen, isCollapsed, onCollapse }) {
  const [code, setCode] = useState(`module top(
    input clk,
    input btn1,
    input btn2,
    output reg [5:0] leds
);

  // Simple clock divider for visual testing
  reg [24:0] counter;
  always @(posedge clk) begin
    counter <= counter + 1;
  end

  always @(posedge clk) begin
    if (!btn1)
      leds <= 6'b111111;
    else if (!btn2)
      leds <= 6'b000000;
    else
      leds <= counter[24:19];
  end

endmodule
`);

  return (
    <div className="w-full h-full flex flex-col bg-panel rounded-lg border border-edge overflow-hidden font-sans shadow-xl">

      <PaneHeader
        isFullscreen={isFullscreen}
        onFullscreen={onFullscreen}
        isCollapsed={isCollapsed}
        onCollapse={onCollapse}
      >
        <div className="flex items-center gap-2 text-text-secondary font-semibold text-[13px]">
          <Code2 size={16} className="text-accent" />
          Code
        </div>
      </PaneHeader>

      {/* Sub Toolbar */}
      <div className="h-10 bg-panel flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-4 text-[13px] text-text-secondary">
          <button className="flex items-center gap-1 hover:bg-edge px-2 py-1 rounded transition-colors">
            Verilog <ChevronDown size={14} />
          </button>
          <div className="flex items-center gap-1 text-text-muted">
            <Lock size={12} />
            <span className="text-[12px]">Auto</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-text-muted">
          <button className="hover:text-text-primary transition-colors" title="Format">
            <List size={15} />
          </button>
          <button className="hover:text-text-primary transition-colors" title="Snippets">
            <Bookmark size={15} />
          </button>
          <button className="hover:text-text-primary transition-colors" title="Auto Indent">
            <Brackets size={15} />
          </button>
          <button className="hover:text-text-primary transition-colors" title="Reset">
            <RotateCcw size={15} />
          </button>
          <button onClick={onFullscreen} className="hover:text-text-primary transition-colors" title="Fullscreen">
            <Maximize2 size={15} />
          </button>
        </div>
      </div>

      {/* Monaco Editor Container */}
      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          defaultLanguage="verilog"
          theme="vs-dark"
          value={code}
          onChange={(val) => setCode(val)}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
            lineHeight: 24,
            padding: { top: 16 },
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            formatOnPaste: true,
            renderLineHighlight: "all"
          }}
        />
      </div>

      {/* Footer */}
      <div className="h-8 bg-panel border-t border-edge/50 flex items-center justify-between px-4 shrink-0 text-[12px] text-text-muted">
        <div>Saved</div>
        <div>Ln 1, Col 1</div>
      </div>

    </div>
  );
}
