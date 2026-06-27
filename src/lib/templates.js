// Server-side template registry. Built-in defaults (src/lib/templateDefaults.js) are
// the base; this layers persistent per-deployment overrides stored as JSON on disk so
// an operator can change the editor's starter Design/Testbench without a rebuild.
//
//   import { setTemplate, getTemplates } from "@/lib/templates";
//   setTemplate("testbench", "`timescale 1ns/1ps\nmodule tb; ... endmodule\n");
//   const { design, testbench } = getTemplates();
//
// This module touches the filesystem and MUST only be imported from server code
// (server components, route handlers, scripts) — never a "use client" module.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { DEFAULT_TEMPLATES, TEMPLATE_NAMES } from "./templateDefaults";

// Where overrides are persisted. Override the path with NIKA_TEMPLATES_FILE.
const STORE_PATH =
  process.env.NIKA_TEMPLATES_FILE || join(process.cwd(), "data", "templates.json");

// Same ceiling the simulate route enforces, so a template can't exceed what can run.
const MAX_TEMPLATE_BYTES = 200 * 1024;

function isValidName(name) {
  return TEMPLATE_NAMES.includes(name);
}

// Read the override file; returns {} if absent or unparseable (defaults then apply).
function readStore() {
  try {
    const raw = readFileSync(STORE_PATH, "utf8");
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    // Keep only recognized string entries.
    const out = {};
    for (const name of TEMPLATE_NAMES) {
      if (typeof obj[name] === "string") out[name] = obj[name];
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(store) {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2) + "\n", "utf8");
}

/** All templates: built-in defaults with any persisted overrides applied. */
export function getTemplates() {
  return { ...DEFAULT_TEMPLATES, ...readStore() };
}

/** One template by name (`design` | `testbench`). Throws on an unknown name. */
export function getTemplate(name) {
  if (!isValidName(name)) throw new Error(`Unknown template "${name}".`);
  return getTemplates()[name];
}

/**
 * Set one template and persist it. Pass `null`/`undefined` to clear the override and
 * fall back to the built-in default. Returns the full template set after the change.
 */
export function setTemplate(name, code) {
  if (!isValidName(name)) {
    throw new Error(`Unknown template "${name}". Expected one of: ${TEMPLATE_NAMES.join(", ")}.`);
  }
  const store = readStore();
  if (code == null) {
    delete store[name];
  } else {
    if (typeof code !== "string") throw new Error("Template body must be a string.");
    if (Buffer.byteLength(code, "utf8") > MAX_TEMPLATE_BYTES) {
      throw new Error(`Template too large (max ${MAX_TEMPLATE_BYTES} bytes).`);
    }
    store[name] = code;
  }
  writeStore(store);
  return getTemplates();
}

/** Set several templates at once, e.g. setTemplates({ design, testbench }). */
export function setTemplates(map) {
  if (!map || typeof map !== "object") throw new Error("Expected an object of { name: code }.");
  let result;
  for (const [name, code] of Object.entries(map)) {
    result = setTemplate(name, code);
  }
  return result ?? getTemplates();
}

/** Drop all overrides, restoring the built-in defaults. */
export function resetTemplates() {
  writeStore({});
  return getTemplates();
}
