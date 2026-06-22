// src/simulator.worker.js
self.onmessage = function(e) {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
      console.log("Worker: Initializing iverilog WASM...");
      // Here we will eventually load the WebAssembly module
      self.postMessage({ type: 'READY' });
      break;

    case 'COMPILE':
      console.log("Worker: Compiling Verilog...");
      // Mock compilation delay
      setTimeout(() => {
        self.postMessage({ type: 'COMPILE_SUCCESS' });
      }, 500);
      break;

    case 'SIMULATE':
      console.log("Worker: Running simulation steps...");
      // Mock simulation output
      const mockVcd = `$date
  Mon Jun 22 20:00:00 2026
$end
$version
  Icarus Verilog (Mock)
$end
$timescale
  1s
$end
$scope module top $end
$var wire 1 ! clk $end
$upscope $end
$enddefinitions $end
#0
$dumpvars
0!
$end
#1
1!
#2
0!`;
      setTimeout(() => {
        self.postMessage({ type: 'SIMULATION_DONE', vcd: mockVcd });
      }, 1000);
      break;

    default:
      console.warn("Worker: Unknown message type", type);
  }
};
