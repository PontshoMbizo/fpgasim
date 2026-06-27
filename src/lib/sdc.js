// Parses Gowin Timing Constraints (.sdc) files.
// Syntax reference: SUG940-1.3E Gowin Design Timing Constraints User Guide, Appendix A.
//
// Supported commands:
//   create_clock -name <name> -period <ns> [get_ports {port}]
//   create_clock -name <name> -period <ns> -waveform {rise fall} [get_ports {port}]
//
// Returns:
//   {
//     clocks : Map<portName, { name, periodNs, waveformNs }>
//     errors : string[]
//   }

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/#[^\n]*/g, ' '); // SDC uses # for comments
}

// Minimal word-level tokeniser — SDC uses Tcl-like syntax.
function tokenise(text) {
  const clean = stripComments(text);
  // Split on whitespace but keep brackets and braces as separate tokens.
  return clean.match(/[\[\]{}]|[^\s[\]{}]+/g) || [];
}

/**
 * Parse a .sdc (Timing Constraints) file.
 * @param {string} text - Raw .sdc content.
 * @returns {{ clocks: Map, errors: string[] }}
 */
export function parseSdc(text) {
  const clocks = new Map(); // portName → { name, periodNs, waveformNs }
  const errors = [];

  const words = tokenise(text);
  let i = 0;

  const peek  = () => words[i] ?? '';
  const next  = () => words[i++] ?? '';

  while (i < words.length) {
    const cmd = next();

    // ---------- create_clock ----------
    if (cmd === 'create_clock') {
      let name = null;
      let periodNs = null;
      let waveformNs = [0, null]; // [rise, fall]; fall defaults to period/2
      let portName = null;

      while (i < words.length) {
        const w = peek();
        if (w === 'create_clock' || w === 'create_generated_clock' ||
            w === 'set_false_path' || w === 'set_multicycle_path' ||
            w === 'set_input_delay' || w === 'set_output_delay' ||
            w === 'set_clock_groups' || w === 'set_clock_uncertainty' ||
            w === 'set_max_delay'   || w === 'set_min_delay' ||
            w === 'set_operating_conditions') break;

        next(); // consume w
        if (w === '-name')   { name     = next(); continue; }
        if (w === '-period') { periodNs = parseFloat(next()); continue; }
        if (w === '-waveform') {
          // Expect { rise fall }
          if (peek() === '{') next(); // consume {
          waveformNs[0] = parseFloat(next());
          waveformNs[1] = parseFloat(next());
          if (peek() === '}') next();
          continue;
        }
        if (w === '[') {
          // [get_ports {portname}] or [get_pins {path}]
          const fn = next(); // get_ports / get_pins
          if (peek() === '{') next(); // consume {
          const rawName = next();
          portName = rawName.replace(/[{}]/g, '').trim();
          if (peek() === '}') next();
          if (peek() === ']') next();
          continue;
        }
        // skip anything else
      }

      if (portName && periodNs !== null) {
        const fall = waveformNs[1] ?? periodNs / 2;
        clocks.set(portName, {
          name: name || portName,
          periodNs,
          waveformNs: [waveformNs[0], fall],
        });
      } else {
        errors.push(`create_clock: could not resolve port name or period (name=${name}, period=${periodNs}, port=${portName})`);
      }
      continue;
    }

    // Skip all other commands (set_false_path, set_input_delay, etc.)
    // Advance until next top-level command (starts a new word not beginning with -/[/{)
    // Simple heuristic: just keep consuming.
  }

  return { clocks, errors };
}
