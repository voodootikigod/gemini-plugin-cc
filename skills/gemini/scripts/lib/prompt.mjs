// Prompt template renderer.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "..", "..", "prompts");

export function renderPrompt(name, vars) {
  const tmpl = readFileSync(resolve(PROMPTS_DIR, `${name}.md`), "utf8");
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v ?? ""),
    tmpl,
  );
}
