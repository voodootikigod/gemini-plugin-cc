// UI context bundler for visual design review.
// Scans conventional directories for design screenshots, gathers
// design-token-adjacent source (Tailwind config, CSS, component files),
// loads DESIGN.md if present, and returns a single bundle for prompt rendering.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { resolve, relative, extname, basename, join } from "node:path";
import { readDesignMd, validateDesignMd } from "./designmd.mjs";

const CONVENTIONAL_IMAGE_DIRS = [
  "design",
  "screenshots",
  ".design",
  "docs/design",
  "docs/screenshots",
  "test-results",
  "storybook-static",
  "playwright-report",
];

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const MAX_IMAGES = 12;
const MAX_IMAGE_BYTES_TOTAL = 800_000;
const MAX_SOURCE_FILES = 12;
const MAX_SOURCE_FILE_BYTES = 8_000;

const TAILWIND_CONFIG_NAMES = [
  "tailwind.config.js", "tailwind.config.ts",
  "tailwind.config.mjs", "tailwind.config.cjs",
];

const CSS_GLOB_DIRS = ["styles", "app", "src/styles", "src/app"];
const COMPONENT_DIRS = ["components", "src/components", "app/components", "ui", "src/ui"];

function safeStat(p) { try { return statSync(p); } catch { return null; } }

function walkDir(root, { exts, max = Infinity, depth = 6 } = {}) {
  const out = [];
  const stack = [{ p: root, d: 0 }];
  while (stack.length && out.length < max) {
    const { p, d } = stack.pop();
    let entries;
    try { entries = readdirSync(p, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = join(p, e.name);
      if (e.isDirectory()) {
        if (d < depth) stack.push({ p: full, d: d + 1 });
      } else if (e.isFile()) {
        const ext = extname(e.name).toLowerCase();
        if (!exts || exts.has(ext)) {
          out.push(full);
          if (out.length >= max) break;
        }
      }
    }
  }
  return out;
}

function mimeFor(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function collectImagesFromDirs(cwd, dirs) {
  const found = [];
  for (const d of dirs) {
    const abs = resolve(cwd, d);
    const st = safeStat(abs);
    if (!st || !st.isDirectory()) continue;
    const files = walkDir(abs, { exts: IMAGE_EXTS, max: MAX_IMAGES * 4 });
    for (const f of files) {
      const fst = safeStat(f);
      if (!fst) continue;
      found.push({
        absolute: f,
        path: relative(cwd, f),
        bytes: fst.size,
        sourceDir: d,
      });
    }
  }
  // Sort by mtime desc when available, then truncate by total byte budget.
  found.sort((a, b) => {
    const sa = safeStat(a.absolute), sb = safeStat(b.absolute);
    return (sb?.mtimeMs || 0) - (sa?.mtimeMs || 0);
  });
  const picked = [];
  let total = 0;
  for (const f of found) {
    if (picked.length >= MAX_IMAGES) break;
    if (total + f.bytes > MAX_IMAGE_BYTES_TOTAL) continue;
    picked.push(f);
    total += f.bytes;
  }
  return { picked, totalBytes: total, scannedDirs: dirs };
}

function collectExplicitScreenshots(cwd, paths) {
  const out = [];
  for (const p of paths) {
    const abs = resolve(cwd, p);
    const st = safeStat(abs);
    if (!st || !st.isFile()) continue;
    out.push({
      absolute: abs,
      path: relative(cwd, abs),
      bytes: st.size,
      mtime: st.mtime,
      sourceDir: "(explicit)",
    });
  }
  return out;
}

function collectSourceFiles(cwd, { include = [], exclude = [] } = {}) {
  const out = [];

  for (const name of TAILWIND_CONFIG_NAMES) {
    const abs = resolve(cwd, name);
    if (existsSync(abs)) {
      out.push({ path: name, absolute: abs, kind: "tailwind-config" });
      break;
    }
  }

  // Top-level CSS adjacent to roots.
  const cssCandidates = [
    "globals.css", "app.css", "index.css", "tailwind.css", "main.css", "styles.css",
  ];
  for (const c of cssCandidates) {
    const abs = resolve(cwd, c);
    if (existsSync(abs)) out.push({ path: c, absolute: abs, kind: "css" });
  }

  // Style dirs (recursive shallow).
  for (const d of CSS_GLOB_DIRS) {
    const abs = resolve(cwd, d);
    if (!safeStat(abs)?.isDirectory()) continue;
    const files = walkDir(abs, { exts: new Set([".css", ".scss"]), max: 6, depth: 3 });
    for (const f of files) out.push({ path: relative(cwd, f), absolute: f, kind: "css" });
  }

  // Components — sample a handful, alphabetical for stability.
  for (const d of COMPONENT_DIRS) {
    const abs = resolve(cwd, d);
    if (!safeStat(abs)?.isDirectory()) continue;
    const files = walkDir(abs, {
      exts: new Set([".tsx", ".jsx", ".vue", ".svelte"]),
      max: 30,
      depth: 4,
    });
    files.sort();
    for (const f of files.slice(0, 6)) {
      out.push({ path: relative(cwd, f), absolute: f, kind: "component" });
    }
  }

  // Apply include/exclude globs.
  const matchAny = (path, patterns) => {
    if (!patterns.length) return false;
    return patterns.some((p) => {
      const re = new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
      return re.test(path);
    });
  };
  const filtered = out
    .filter((f) => !exclude.length || !matchAny(f.path, exclude))
    .filter((f) => !include.length || matchAny(f.path, include))
    .slice(0, MAX_SOURCE_FILES);

  // Read content (truncated).
  for (const f of filtered) {
    try {
      let body = readFileSync(f.absolute, "utf8");
      if (body.length > MAX_SOURCE_FILE_BYTES) {
        body = body.slice(0, MAX_SOURCE_FILE_BYTES) + `\n\n/* …truncated, original ${body.length} bytes… */\n`;
      }
      f.content = body;
    } catch {
      f.content = "(unreadable)";
    }
  }
  return filtered;
}

function loadDesignMd(cwd) {
  const found = readDesignMd(cwd);
  if (!found) return null;
  const validation = validateDesignMd(found.raw);
  return { ...found, validation };
}

export function buildUiContext({
  cwd = process.cwd(),
  screenshots = [],
  include = [],
  exclude = [],
} = {}) {
  const explicit = collectExplicitScreenshots(cwd, screenshots);
  const conventional = collectImagesFromDirs(cwd, CONVENTIONAL_IMAGE_DIRS);

  // Combine: explicit first, then conventional, dedupe by absolute path.
  const seen = new Set();
  const combined = [];
  for (const list of [explicit, conventional.picked]) {
    for (const img of list) {
      if (seen.has(img.absolute)) continue;
      if (combined.length >= MAX_IMAGES) break;
      seen.add(img.absolute);
      combined.push(img);
    }
  }

  combined.forEach((img) => {
    img.mime = mimeFor(img.absolute);
  });

  const sourceFiles = collectSourceFiles(cwd, { include, exclude });
  const designMd = loadDesignMd(cwd);

  // Build a markdown summary block to embed in the prompt.
  const sections = [];

  if (designMd) {
    sections.push(`### DESIGN.md (\`${designMd.path}\`)\n\n\`\`\`markdown\n${designMd.raw}\n\`\`\`\n`);
    const v = designMd.validation;
    const lintLines = [];
    if (v.errors.length) lintLines.push(`**Errors:**\n${v.errors.map((e) => `- ${e}`).join("\n")}`);
    if (v.warnings.length) lintLines.push(`**Warnings:**\n${v.warnings.map((w) => `- ${w}`).join("\n")}`);
    if (v.contrast?.length) {
      lintLines.push(
        `**Contrast issues:**\n${v.contrast.map((c) => `- ${c.fg} (${c.fgHex}) on ${c.bg} (${c.bgHex}) = ${c.ratio}:1`).join("\n")}`,
      );
    }
    if (lintLines.length) sections.push(`### DESIGN.md lint\n\n${lintLines.join("\n\n")}\n`);
  } else {
    sections.push(`### DESIGN.md\n\nNot found at any of: \`DESIGN.md\`, \`design.md\`, \`docs/DESIGN.md\`, \`docs/design.md\`. Generate one with \`/gemini:design\` for stronger token-adherence checks.\n`);
  }

  if (combined.length) {
    sections.push(
      `### Screenshots (${combined.length})\n\n` +
      combined.map((i) => `- \`${i.path}\` (${i.mime}, ${(i.bytes / 1024).toFixed(1)} KB) — from \`${i.sourceDir}\``).join("\n") +
      `\n`,
    );
  } else {
    sections.push(
      `### Screenshots\n\nNo screenshots found. Drop PNG/JPG/WEBP into one of: ` +
      CONVENTIONAL_IMAGE_DIRS.map((d) => `\`${d}/\``).join(", ") +
      ` or pass \`--screenshot <path>\` (repeatable).\n`,
    );
  }

  if (sourceFiles.length) {
    const blocks = sourceFiles.map((f) => `#### ${f.path} (${f.kind})\n\n\`\`\`\n${f.content}\n\`\`\``);
    sections.push(`### UI source\n\n${blocks.join("\n\n")}\n`);
  }

  return {
    label: combined.length
      ? `${combined.length} screenshot(s) + ${sourceFiles.length} source file(s)${designMd ? " + DESIGN.md" : ""}`
      : `UI source only (${sourceFiles.length} files)${designMd ? " + DESIGN.md" : ""}`,
    body: sections.join("\n"),
    images: combined,
    sourceFiles,
    designMd,
  };
}

}
 : ""}`,
    body: sections.join("\n"),
    images: combined,
    sourceFiles,
    designMd,
  };
}
