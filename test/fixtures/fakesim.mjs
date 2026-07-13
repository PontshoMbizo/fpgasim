// Fake lockstep sim child — speaks the container line protocol without iverilog.
// Used by lockstep.test.mjs to exercise LockstepSession/server logic hermetically.
//
// Behaviour switches (recognised inside the ##SRC payload):
//   FAKE_HANG      never answer the first T (forces reply-timeout)
//   FAKE_END_AT_2  emit "X done" instead of the 2nd O reply
//   FAKE_EDGES     emit two E lines before each O
// Otherwise: outputs mirror the low hex digit of the inputs, t accumulates quanta.

let buf = Buffer.alloc(0);
let srcLen = -1;
let srcBuf = Buffer.alloc(0); // framing counts BYTES (like dd in the real entrypoint)
let src = "";
let t = 0n;
let steps = 0;

process.stdin.on("data", (d) => {
  buf = Buffer.concat([buf, d]);
  for (;;) {
    if (srcLen < 0) {
      const nl = buf.indexOf(0x0a);
      if (nl < 0) return;
      const header = buf.slice(0, nl).toString();
      const m = /^##SRC (\d+)$/.exec(header);
      if (!m) {
        process.stderr.write(`fakesim: bad header ${header}\n`);
        process.exit(5);
      }
      srcLen = Number(m[1]);
      buf = buf.slice(nl + 1);
      continue;
    }
    if (srcBuf.length < srcLen) {
      const need = srcLen - srcBuf.length;
      const take = buf.slice(0, need);
      srcBuf = Buffer.concat([srcBuf, take]);
      buf = buf.slice(take.length);
      if (srcBuf.length < srcLen) return;
      src = srcBuf.toString();
      if (/FAKE_COMPILE_FAIL/.test(src)) {
        process.stderr.write("fakesim: compile error: synthetic\n");
        process.exit(2);
      }
      continue;
    }
    const nl = buf.indexOf(0x0a);
    if (nl < 0) return;
    const line = buf.slice(0, nl).toString().trim();
    buf = buf.slice(nl + 1);
    const m = /^T (\d+) ([0-9a-fA-F]+)$/.exec(line);
    if (!m) {
      process.stderr.write(`fakesim: bad T line: ${line}\n`);
      process.exit(3);
    }
    steps++;
    if (/FAKE_HANG/.test(src)) continue; // swallow it
    if (/FAKE_END_AT_2/.test(src) && steps === 2) {
      process.stdout.write("X done\n");
      process.exit(0);
    }
    t += BigInt(m[1]);
    const out = (parseInt(m[2].slice(-1), 16) & 0xf).toString(16);
    if (/FAKE_EDGES/.test(src)) {
      process.stdout.write(`E ${t - BigInt(m[1]) / 2n} 0\n`);
      process.stdout.write(`E ${t - BigInt(m[1]) / 4n} ${out}\n`);
    }
    process.stdout.write(`O ${t} ${out}\n`);
  }
});
process.stdin.on("end", () => process.exit(0));
