import React from 'react';

export default function UartConsole({ logs }) {
  return (
    <div className="w-full h-full bg-panel text-text-primary px-[15px] py-3 font-mono text-[11px] leading-[1.9] overflow-auto whitespace-pre-wrap flex-1 min-h-0 custom-scrollbar">
      {logs || "Waiting for UART output...\n\nMake sure your design drives the TX pin correctly at 115200 baud."}
    </div>
  );
}
