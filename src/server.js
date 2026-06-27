// Server-only entry point. Re-exports the template registry API. Import this (or
// "@/lib/templates" directly) from server code only — it touches the filesystem and
// must never be pulled into a client bundle. Client code should import template
// constants from "./lib/templateDefaults" instead.

export {
  getTemplates,
  getTemplate,
  setTemplate,
  setTemplates,
  resetTemplates,
} from "./lib/templates";

export { DEFAULT_TEMPLATES, TEMPLATE_NAMES } from "./lib/templateDefaults";
