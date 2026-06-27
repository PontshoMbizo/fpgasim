#!/bin/sh
# Sandbox contract: read combined Verilog source on stdin, emit the VCD on stdout,
# put all compile/runtime logs on stderr. Exit codes signal the failing stage so the
# launcher can label errors:
#   2 = compile (iverilog) failure
#   3 = runtime (vvp) failure
#   4 = no VCD produced (design never called $dumpvars/$dumpfile)
set -eu

SRC=/work/top.v
OBJ=/work/a.out
VCD=/work/out.vcd

# 1. Read source from stdin.
cat > "$SRC"

# 2. Compile. -g2012 enables SystemVerilog-2012 constructs. Logs -> stderr.
if ! iverilog -g2012 -o "$OBJ" "$SRC" 1>&2; then
  exit 2
fi

# 3. Run. vvp interprets the bytecode (never natively executed, so /work can be
#    noexec). $display and other prints go to stderr to keep stdout VCD-only.
if ! vvp "$OBJ" 1>&2; then
  exit 3
fi

if [ -f /work/frame.ppm ]; then
  echo "PPM_FRAME_B64:$(base64 -w 0 /work/frame.ppm)" 1>&2
fi

# 4. Emit the dump. If the design produced none, that's a usage error, not a crash.
if [ ! -f "$VCD" ]; then
  echo "error: simulation produced no VCD (did the testbench call \$dumpfile/\$dumpvars?)" 1>&2
  exit 4
fi

cat "$VCD"
