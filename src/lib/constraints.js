// Parses Gowin Physical Constraints (.cst) files.
// Syntax reference: SUG935-1.3E Gowin Design Physical Constraints User Guide, Appendix A.
//
// Supported directives:
//   IO_LOC  "port"  pin_number [exclusive] ;
//   IO_PORT "port"  ATTR=VALUE ... ;
//
// Returns:
//   {
//     ioPins  : Map<portName, string[]>   port → [pinNum, ...] (multiple locations allowed)
//     ioAttrs : Map<portName, object>     port → { ioType, pullMode, drive, slewRate, openDrain, hysteresis }
//     errors  : string[]                 fatal parse errors
//   }

// Strip // and /* */ comments.
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

// Tokenise: returns an array of { type, value } tokens.
// Types: KEYWORD | STRING | NUMBER | EQ | SEMI | EOF
function tokenise(text) {
  const clean = stripComments(text);
  const tokens = [];
  let i = 0;
  while (i < clean.length) {
    // Skip whitespace
    if (/\s/.test(clean[i])) { i++; continue; }
    // Quoted string (escaped name or port name)
    if (clean[i] === '"') {
      let s = '';
      i++; // skip opening quote
      while (i < clean.length && clean[i] !== '"') {
        s += clean[i++];
      }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: s });
      continue;
    }
    // Semicolon
    if (clean[i] === ';') { tokens.push({ type: 'SEMI', value: ';' }); i++; continue; }
    // Equals
    if (clean[i] === '=') { tokens.push({ type: 'EQ', value: '=' }); i++; continue; }
    // Comma
    if (clean[i] === ',') { tokens.push({ type: 'COMMA', value: ',' }); i++; continue; }
    // Number or keyword/identifier
    const m = /^([^\s;=,"]+)/.exec(clean.slice(i));
    if (m) {
      const val = m[1];
      // Numbers (integers or floats)
      if (/^-?[0-9]+(\.[0-9]+)?$/.test(val)) {
        tokens.push({ type: 'NUMBER', value: val });
      } else {
        tokens.push({ type: 'KEYWORD', value: val.toUpperCase() });
      }
      i += val.length;
      continue;
    }
    i++; // skip unrecognised char
  }
  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

/**
 * Parse a .cst (Physical Constraints) file.
 * @param {string} text - Raw .cst file content.
 * @returns {{ ioPins: Map, ioAttrs: Map, errors: string[] }}
 */
export function parseCst(text) {
  const ioPins  = new Map(); // portName → string[]
  const ioAttrs = new Map(); // portName → { ioType?, pullMode?, drive?, slewRate?, ... }
  const errors  = [];

  const tokens = tokenise(text);
  let pos = 0;

  const peek  = () => tokens[pos] ?? { type: 'EOF', value: '' };
  const next  = () => tokens[pos++] ?? { type: 'EOF', value: '' };
  const expect = (type, hint) => {
    const t = next();
    if (t.type !== type) errors.push(`Expected ${hint || type}, got "${t.value}"`);
    return t;
  };

  while (peek().type !== 'EOF') {
    const kw = peek();

    // ---------- IO_LOC ----------
    if (kw.type === 'KEYWORD' && kw.value === 'IO_LOC') {
      next(); // consume IO_LOC
      const portTok = expect('STRING', 'port name');
      const portName = portTok.value.replace(/^\\/, '').trimEnd(); // strip backslash-escape

      const pins = [];
      // Collect comma-separated pin identifiers until SEMI or EOF
      while (peek().type !== 'SEMI' && peek().type !== 'EOF') {
        const t = next();
        if (t.type === 'COMMA') continue;
        if (t.type === 'KEYWORD' && t.value === 'EXCLUSIVE') continue;
        if (t.type === 'NUMBER' || t.type === 'KEYWORD' || t.type === 'STRING') {
          pins.push(t.value);
        }
      }
      if (peek().type === 'SEMI') next(); // consume ;

      if (pins.length === 0) {
        errors.push(`IO_LOC "${portName}" has no pin location`);
      } else {
        ioPins.set(portName, pins);
      }
      continue;
    }

    // ---------- IO_PORT ----------
    if (kw.type === 'KEYWORD' && kw.value === 'IO_PORT') {
      next(); // consume IO_PORT
      const portTok = expect('STRING', 'port name');
      const portName = portTok.value.replace(/^\\/, '').trimEnd();

      const attrs = {};
      // Parse ATTR=VALUE pairs until SEMI
      while (peek().type !== 'SEMI' && peek().type !== 'EOF') {
        const attrTok = next();
        if (attrTok.type !== 'KEYWORD') { errors.push(`Expected attribute name, got "${attrTok.value}"`); break; }
        if (peek().type === 'EQ') {
          next(); // consume =
          const valTok = next();
          const key   = attrTok.value.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          attrs[key] = valTok.value;
        }
      }
      if (peek().type === 'SEMI') next();
      ioAttrs.set(portName, attrs);
      continue;
    }

    // Skip unrecognised / unsupported directives until next ;
    next();
    while (peek().type !== 'SEMI' && peek().type !== 'EOF') next();
    if (peek().type === 'SEMI') next();
  }

  return { ioPins, ioAttrs, errors };
}
