#!/bin/sh
# Lockstep session entrypoint (fulgurlab bridge). Contract, per
# fulgurlab/docs/bridge-protocol.md "container line protocol":
#   stdin : `##SRC <bytes>` + exactly that many bytes of Verilog (design + harness),
#           then the quantum stream (`T <quantum_ns> <in_hex>` lines) owned by vvp.
#   stdout: E/O/X lines only (the harness $displays them). Logs -> stderr.
# Exit codes: 2 = compile failure, 5 = bad framing. Runtime errors surface as vvp's
# own exit (the server treats child exit as session end).
set -eu

SRC=/work/top.v
OBJ=/work/a.out

# 1. Framing header. `read` in POSIX sh consumes single bytes — it cannot over-read
#    past the newline, so the byte count that follows stays intact for dd.
read -r header || { echo "error: empty stdin (want ##SRC <bytes>)" 1>&2; exit 5; }
case "$header" in
  "##SRC "*) n=${header#\#\#SRC } ;;
  *) echo "error: bad framing header: $header" 1>&2; exit 5 ;;
esac
case "$n" in
  ''|*[!0-9]*) echo "error: bad byte count: $n" 1>&2; exit 5 ;;
esac

# 2. Copy exactly $n source bytes; bs=1 so nothing of the quantum stream is consumed.
dd bs=1 count="$n" of="$SRC" 2>/dev/null

# 3. Compile. Logs -> stderr so stdout stays protocol-clean.
if ! iverilog -g2012 -o "$OBJ" "$SRC" 1>&2; then
  exit 2
fi

# 4. Run. vvp inherits the remaining stdin = the quantum stream. The harness reads it
#    via /dev/stdin and $displays E/O/X lines on stdout, flushing per line. Any user
#    $display chatter on stdout is tolerated: the server routes non-E/O/X lines to logs.
exec vvp "$OBJ"
