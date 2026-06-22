"use client";
import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Code2, Maximize2, Maximize, ChevronUp, Settings, List, Bookmark, Brackets, RotateCcw, Lock, ChevronDown } from 'lucide-react';

export default function EditorPane() {
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
    <div className="w-full h-full flex flex-col bg-[#1e1e1e] rounded-lg border border-[#3e3e42] overflow-hidden font-sans shadow-xl">
      
      {/* Top Header */}
      <div className="h-10 bg-[#262626] flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2 text-gray-300 font-semibold text-[13px]">
          <Code2 size={16} className="text-green-500" />
          Code
        </div>
        <div className="flex items-center gap-3 text-gray-400">
          <button className="hover:text-white transition-colors" title="Fullscreen">
            <Maximize size={14} />
          </button>
          <button className="hover:text-white transition-colors" title="Collapse">
            <ChevronUp size={16} />
          </button>
        </div>
      </div>

      {/* Sub Toolbar */}
      <div className="h-10 bg-[#1e1e1e] flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-4 text-[13px] text-gray-300">
          <button className="flex items-center gap-1 hover:bg-[#3e3e42] px-2 py-1 rounded transition-colors">
            Verilog <ChevronDown size={14} />
          </button>
          <div className="flex items-center gap-1 text-gray-400">
            <Lock size={12} />
            <span className="text-[12px]">Auto</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-gray-400">
          <button className="hover:text-white transition-colors" title="Format">
            <List size={15} />
          </button>
          <button className="hover:text-white transition-colors" title="Snippets">
            <Bookmark size={15} />
          </button>
          <button className="hover:text-white transition-colors" title="Auto Indent">
            <Brackets size={15} />
          </button>
          <button className="hover:text-white transition-colors" title="Reset">
            <RotateCcw size={15} />
          </button>
          <button className="hover:text-white transition-colors" title="Fullscreen">
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
      <div className="h-8 bg-[#1e1e1e] border-t border-[#3e3e42]/50 flex items-center justify-between px-4 shrink-0 text-[12px] text-gray-500">
        <div>Saved</div>
        <div>Ln 1, Col 1</div>
      </div>

    </div>
  );
}
