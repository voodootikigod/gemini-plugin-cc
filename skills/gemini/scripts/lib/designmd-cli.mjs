// Optional bridge to the official Stitch DESIGN.md CLI (`design-md` or
// `stitch`). Detection is lazy and best-effort — when present, we prefer
// the official lint output. When absent, the dispatcher falls back to the
// internal validator in lib/designmd.mjs. Plugin works without it.

import { spawnSync } from "node:child_process";

const CANDIDATES = ["design-md", "stitch"];

function probe(bin) {
  const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
  if (r.status === 0) return { bin, version: r.stdout.trim() };
  // Some CLIs use `<bin> spec` or `--help` — try a no-op fallback.
  const r2 = spawnSync(bin, ["--help"], { encoding: "utf8" });
  if (r2.status === 0) return { bin, version: "unknown" };
  return null;
}

let cached = null;
let cachedSet = false;

export function detectStitchCli() {
  if (cachedSet) return cached;
  for (const c of CANDIDATES) {
    const hit = probe(c);
    if (hit) {
      cached = hit;
      cachedSet = true;
      return hit;
    }
  }
  cached = null;
  cachedSet = true;
  return null;
}

export function lintDesignMd(absPath) {
  const cli = detectStitchCli();
  if (!cli) return null;
  const r = spawnSync(cli.bin, ["lint", absPath], { encoding: "utf8" });
  return {
    bin: cli.bin,
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
  };
}
