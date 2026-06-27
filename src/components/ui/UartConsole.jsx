import React from 'react';

export default function UartConsole({ logs }) {
  return (
    <div className="w-full h-full bg-black text-green-400 p-4 font-mono text-[13px] overflow-auto whitespace-pre-wrap flex-1 min-h-0">
      {logs || "Waiting for UART output...\n\nMake sure your design drives the TX pin correctly at 115200 baud."}
    </div>
  );
}
