// Stitch DESIGN.md parser + validator.
// Spec: https://github.com/google-labs-code/design.md
//
// Validates:
//   - YAML frontmatter shape (--- fences, allowed top-level keys)
//   - color hex format (#rgb, #rrggbb, #rrggbbaa)
//   - dimensions (number + px/em/rem/%/deg, or bare number)
//   - token references (e.g. {colors.primary})
//   - canonical markdown sections (8 sections, alias-aware)
//   - WCAG AA contrast for color pairs by role-name convention
//
// Zero deps. Intentionally narrow YAML support — Stitch DESIGN.md
// frontmatter is a constrained subset, not arbitrary YAML.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ALLOWED_TOP_KEYS = new Set([
  "version", "name", "description", "colors", "typography", "rounded", "spacing", "components",
]);

const CANONICAL_SECTIONS = [
  { name: "Overview", aliases: ["Overview", "Brand & Style", "Brand and Style"] },
  { name: "Colors", aliases: ["Colors", "Color Palette", "Color Palette & Roles"] },
  { name: "Typography", aliases: ["Typography", "Typography Rules"] },
  { name: "Layout", aliases: ["Layout", "Layout & Spacing", "Layout and Spacing"] },
  { name: "Elevation & Depth", aliases: ["Elevation & Depth", "Elevation"] },
  { name: "Shapes", aliases: ["Shapes", "Shape", "Shape & Form"] },
  { name: "Components", aliases: ["Components", "Component Stylings"] },
  { name: "Do's and Don'ts", aliases: ["Do's and Don'ts", "Dos and Donts", "Dos and Don'ts", "Do's & Don'ts"] },
];

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const DIMENSION_RE = /^-?\d+(?:\.\d+)?(?:px|em|rem|%|deg)?$/;
const TOKEN_REF_RE = /^\{[a-zA-Z]+(?:\.[a-zA-Z0-9_-]+)+\}$/;

export function splitFrontmatter(raw) {
  // Match leading `---\n...\n---` fence.
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { frontmatter: null, body: raw };
  return { frontmatter: m[1], body: m[2] };
}

// Minimal indent-aware YAML parser tailored to Stitch frontmatter.
// Supports: top-level scalars, nested mappings (1 or 2 levels of nesting),
// quoted/unquoted scalar values. Rejects flow style, anchors, multi-doc, etc.
export function parseFrontmatter(yaml) {
  if (yaml == null) return null;
  const lines = yaml.split(/\r?\n/);
  const root = {};
  const stack = [{ indent: -1, obj: root }];

  const stripQuotes = (s) => {
    s = s.trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.match(/^ */)[0].length;
    const trimmed = line.slice(indent);
    if (trimmed.startsWith("- ") || trimmed === "-") {
      throw new Error(`frontmatter line ${i + 1}: YAML lists are not supported in Stitch DESIGN.md frontmatter`);
    }
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      throw new Error(`frontmatter line ${i + 1}: missing ':' in "${trimmed}"`);
    }
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    if (value === "" || value === "{}" ) {
      const child = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      // Inline object literal not supported; treat as scalar.
      parent[key] = stripQuotes(value);
    }
  }
  return root;
}

function* walkLeaves(obj, path = []) {
  if (obj == null) return;
  if (typeof obj !== "object") {
    yield { path, value: obj };
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    yield* walkLeaves(v, [...path, k]);
  }
}

// WCAG: relative luminance + contrast.
function hexToRgb(hex) {
  const h = hex.replace(/^#/, "");
  let r, g, b;
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16); g = parseInt(h[1] + h[1], 16); b = parseInt(h[2] + h[2], 16);
  } else {
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
  }
  return [r, g, b];
}
function relLum([r, g, b]) {
  const norm = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * norm(r) + 0.7152 * norm(g) + 0.0722 * norm(b);
}
export function contrastRatio(hexA, hexB) {
  const [la, lb] = [relLum(hexToRgb(hexA)), relLum(hexToRgb(hexB))];
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

function findColorPairs(colors) {
  // Heuristic: pair tokens whose names suggest foreground/background relationship.
  // e.g. textPrimary + background, onSurface + surface, foreground + background.
  if (!colors || typeof colors !== "object") return [];
  const entries = Object.entries(colors).filter(([, v]) => typeof v === "string" && HEX_RE.test(v));
  const pairs = [];
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [aName, aHex] of entries) {
    const a = norm(aName);
    if (a.startsWith("text") || a.startsWith("foreground") || a.startsWith("on")) {
      const surface = a.startsWith("on") ? a.slice(2) : null;
      for (const [bName, bHex] of entries) {
        const b = norm(bName);
        if (a === b) continue;
        const isBg = b.startsWith("background") || b === "surface" || b === "bg" || (surface && b === surface);
        if (isBg) {
          pairs.push({ fg: aName, bg: bName, fgHex: aHex, bgHex: bHex });
        }
      }
    }
  }
  return pairs;
}

function findSections(body) {
  // Find ## headings (and # too as fallback). Return list of { name, lineIndex }.
  const headings = [];
  const lines = body.split(/\r?\n/);
  lines.forEach((l, i) => {
    const m = l.match(/^#{1,3}\s+(.+?)\s*$/);
    if (m) headings.push({ name: m[1].trim(), line: i + 1 });
  });
  return headings;
}

function matchSection(heading, section) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const h = norm(heading);
  return section.aliases.some((alias) => norm(alias) === h);
}

export function validateDesignMd(raw, { wcagThreshold = 4.5 } = {}) {
  const errors = [];
  const warnings = [];
  const { frontmatter, body } = splitFrontmatter(raw);

  if (frontmatter == null) {
    errors.push("missing YAML frontmatter (expected --- fences at top of file)");
    return { ok: false, errors, warnings, tokens: null, sections: [] };
  }

  let tokens;
  try {
    tokens = parseFrontmatter(frontmatter);
  } catch (e) {
    errors.push(`frontmatter parse error: ${e.message}`);
    return { ok: false, errors, warnings, tokens: null, sections: [] };
  }

  if (!tokens.name) errors.push("frontmatter: required key 'name' is missing");

  for (const k of Object.keys(tokens)) {
    if (!ALLOWED_TOP_KEYS.has(k)) {
      warnings.push(`frontmatter: unknown top-level key '${k}' (allowed: ${[...ALLOWED_TOP_KEYS].join(", ")})`);
    }
  }

  // Validate leaf shapes by category.
  const validateColor = (path, v) => {
    if (typeof v !== "string") { errors.push(`colors.${path.join(".")}: expected string, got ${typeof v}`); return; }
    if (TOKEN_REF_RE.test(v)) return;
    if (!HEX_RE.test(v)) errors.push(`colors.${path.join(".")} = "${v}" is not a valid hex color`);
  };
  if (tokens.colors) {
    for (const { path, value } of walkLeaves(tokens.colors)) {
      validateColor(path, value);
    }
  }

  const validateDimension = (label, v) => {
    if (typeof v !== "string" && typeof v !== "number") {
      errors.push(`${label}: expected string|number, got ${typeof v}`); return;
    }
    const s = String(v);
    if (TOKEN_REF_RE.test(s)) return;
    if (!DIMENSION_RE.test(s)) errors.push(`${label} = "${s}" is not a valid dimension`);
  };
  for (const cat of ["spacing", "rounded"]) {
    if (tokens[cat]) {
      for (const { path, value } of walkLeaves(tokens[cat])) {
        validateDimension(`${cat}.${path.join(".")}`, value);
      }
    }
  }

  // Resolve token refs inside components — surface unresolvable refs.
  const resolveRef = (ref) => {
    const inner = ref.slice(1, -1); // strip { }
    const parts = inner.split(".");
    let cur = tokens;
    for (const p of parts) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[p];
    }
    return cur;
  };
  if (tokens.components) {
    for (const { path, value } of walkLeaves(tokens.components)) {
      if (typeof value === "string" && TOKEN_REF_RE.test(value)) {
        if (resolveRef(value) === undefined) {
          errors.push(`components.${path.join(".")} → unresolvable token ref "${value}"`);
        }
      }
    }
  }

  // Section coverage.
  const headings = findSections(body || "");
  const present = new Set();
  for (const sec of CANONICAL_SECTIONS) {
    if (headings.some((h) => matchSection(h.name, sec))) present.add(sec.name);
  }
  const missing = CANONICAL_SECTIONS.filter((s) => !present.has(s.name)).map((s) => s.name);
  if (missing.length) {
    warnings.push(`missing canonical sections: ${missing.join(", ")}`);
  }

  // WCAG contrast pairs.
  const contrastFindings = [];
  if (tokens.colors) {
    const pairs = findColorPairs(tokens.colors);
    for (const p of pairs) {
      const ratio = contrastRatio(p.fgHex, p.bgHex);
      if (ratio < wcagThreshold) {
        contrastFindings.push({
          fg: p.fg, bg: p.bg, fgHex: p.fgHex, bgHex: p.bgHex,
          ratio: Math.round(ratio * 100) / 100,
          required: wcagThreshold,
        });
      }
    }
  }
  for (const f of contrastFindings) {
    warnings.push(`WCAG: ${f.fg} on ${f.bg} = ${f.ratio}:1 (need ≥${f.required}:1)`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    tokens,
    sections: { present: [...present], missing },
    contrast: contrastFindings,
  };
}

const DESIGN_MD_CANDIDATES = ["DESIGN.md", "design.md", "docs/DESIGN.md", "docs/design.md"];

export function findDesignMd(cwd = process.cwd()) {
  for (const rel of DESIGN_MD_CANDIDATES) {
    const full = join(cwd, rel);
    if (existsSync(full)) return { path: rel, absolute: full };
  }
  return null;
}

export function readDesignMd(cwd = process.cwd()) {
  const found = findDesignMd(cwd);
  if (!found) return null;
  try {
    const raw = readFileSync(found.absolute, "utf8");
    return { path: found.path, absolute: found.absolute, raw };
  } catch { return null; }
}
