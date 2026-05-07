#!/usr/bin/env node
// Gemini companion. Subcommand dispatch:
//   visual-design-review    — multi-axis visual design critique against DESIGN.md
//   visual-design-doc       — generate Stitch-format DESIGN.md from UI source
//   visual-alt-design       — propose 2–3 visual identity alternatives
//   visual-second-opinion   — advocate + critic + synthesis on the visual design
//   ask                     — generic Gemini passthrough: free-form prompt + optional file attachments
//   setup                   — verify Node + gemini CLI + auth + git + optional design-md CLI
//
// All subcommands accept the same flag surface (see lib/args.mjs).

import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/args.mjs";
import { renderPrompt } from "./lib/prompt.mjs";
import { runGemini } from "./lib/gemini.mjs";
import { buildUiContext } from "./lib/ui-context.mjs";
import { detectStitchCli, lintDesignMd } from "./lib/designmd-cli.mjs";
import { findDesignMd, validateDesignMd } from "./lib/designmd.mjs";
import { validateAgainstSchema, collectEnums } from "./lib/schema-check.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = resolve(__dirname, "..", "schemas");

const SUBCOMMANDS = new Set([
  "visual-design-review",
  "visual-design-doc",
  "visual-alt-design",
  "visual-second-opinion",
  "ask",
  "setup",
]);

function fail(msg, code = 1) {
  process.stderr.write(`gemini-companion: ${msg}\n`);
  process.exit(code);
}

function focusText(args) {
  const t = args.focus.join(" ").trim();
  return t || "(none — review the visual design on its own merits)";
}

function emit(stdout) {
  process.stdout.write(stdout.endsWith("\n") ? stdout : `${stdout}\n`);
}

function loadSchema(schemaName) {
  const schemaPath = resolve(SCHEMAS_DIR, `${schemaName}.schema.json`);
  if (!existsSync(schemaPath)) {
    process.stderr.write(`warning: schema ${schemaName} not found at ${schemaPath}; skipping JSON validation\n`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(schemaPath, "utf8"));
  } catch (e) {
    process.stderr.write(`warning: schema ${schemaName} unreadable (${e.message}); skipping JSON validation\n`);
    return null;
  }
}

function jsonInstruction(schemaName) {
  const schema = loadSchema(schemaName);
  const enumLines = [];
  if (schema) {
    const enums = collectEnums(schema);
    for (const [path, values] of Object.entries(enums)) {
      enumLines.push(`- ${path}: one of [${values.join(", ")}]`);
    }
  }
  return [
    "",
    "<output_override>",
    `Ignore any Markdown formatting instructions above.`,
    `Return ONLY a single valid JSON object conforming to the ${schemaName} schema.`,
    `No prose, no code fences, no commentary outside the JSON.`,
    ...(enumLines.length ? ["", "Allowed enum values (use exactly these strings):", ...enumLines] : []),
    "</output_override>",
  ].join("\n");
}

function validateJson(text, schemaName) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) {
    const path = `/tmp/gemini-bad-output-${Date.now()}.txt`;
    try { writeFileSync(path, text); } catch {}
    throw new Error(`gemini returned non-JSON output. raw saved to ${path}. parse error: ${e.message}`);
  }
  const schema = loadSchema(schemaName);
  if (schema) {
    const errs = validateAgainstSchema(parsed, schema);
    if (errs.length) {
      const path = `/tmp/gemini-bad-output-${Date.now()}.txt`;
      try { writeFileSync(path, text); } catch {}
      throw new Error(
        `gemini output failed schema validation (${errs.length} error${errs.length === 1 ? "" : "s"}). raw saved to ${path}.\n  - ` +
        errs.slice(0, 10).join("\n  - ") +
        (errs.length > 10 ? `\n  - ... ${errs.length - 10} more` : ""),
      );
    }
  }
  return JSON.stringify(parsed, null, 2);
}

function externalLint(designMdAbs) {
  // Returns formatted markdown block from the official design-md CLI if present.
  const cli = detectStitchCli();
  if (!cli) return "";
  const r = lintDesignMd(designMdAbs);
  if (!r) return "";
  const status = r.status === 0 ? "OK" : `FAIL (status ${r.status})`;
  const body = [r.stdout, r.stderr].filter(Boolean).join("\n").trim();
  return `\n### \`${cli.bin} lint\` — ${status}\n\n\`\`\`\n${body || "(no output)"}\n\`\`\`\n`;
}

function ctxOptions(args) {
  return {
    cwd: process.cwd(),
    screenshots: args.screenshot,
    include: args.include,
    exclude: args.exclude,
  };
}

// Surface DESIGN.md validator output on stderr so the human sees it (the
// LLM also receives the same content embedded in the review context).
function reportDesignMdLint(ctx) {
  if (!ctx.designMd?.validation) return;
  const v = ctx.designMd.validation;
  if (!v.errors.length && !v.warnings.length) return;
  process.stderr.write(`\n[lint] DESIGN.md (${ctx.designMd.path}):\n`);
  for (const e of v.errors) process.stderr.write(`  error:   ${e}\n`);
  for (const w of v.warnings) process.stderr.write(`  warn:    ${w}\n`);
}

function cmdVisualDesignReview(args) {
  const ctx = buildUiContext(ctxOptions(args));
  reportDesignMdLint(ctx);
  let body = ctx.body;
  if (ctx.designMd) body += externalLint(ctx.designMd.absolute);
  let prompt = renderPrompt("visual-design-review", {
    TARGET_LABEL: ctx.label,
    USER_FOCUS: focusText(args),
    REVIEW_INPUT: body,
  });
  if (args.json) prompt += jsonInstruction("visual-design-review-output");
  let out = runGemini(prompt, { model: args.model, json: args.json, images: ctx.images });
  if (args.json) out = validateJson(out, "visual-design-review-output");
  emit(out);
}

// Strip a leading ```markdown / ```yaml / ``` fence wrapping if Gemini ignored
// the "do not wrap" instruction. Only unwraps when the response begins with a
// fence and ends with a matching one — otherwise returns the input unchanged.
function unwrapCodeFence(text) {
  const m = text.match(/^\s*```(?:markdown|md|yaml|yml|text|)?\r?\n([\s\S]*?)\r?\n```\s*$/);
  return m ? m[1] : text;
}

function cmdVisualDesignDoc(args) {
  const outPath = args.out || "DESIGN.md";
  const absOut = resolve(process.cwd(), outPath);
  if (existsSync(absOut) && !args.force) {
    throw new Error(`${outPath} already exists — pass --force to overwrite or --out <path> to write elsewhere`);
  }
  const ctx = buildUiContext(ctxOptions(args));
  const prompt = renderPrompt("visual-design-doc", {
    TARGET_LABEL: ctx.label,
    USER_FOCUS: focusText(args),
    REVIEW_INPUT: ctx.body,
  });
  const raw = runGemini(prompt, { model: args.model, json: false, images: ctx.images });
  const out = unwrapCodeFence(raw);
  if (out !== raw) process.stderr.write("note: stripped wrapping code fence from generated DESIGN.md\n");
  mkdirSync(dirname(absOut), { recursive: true });
  const body = out.endsWith("\n") ? out : `${out}\n`;
  writeFileSync(absOut, body);
  process.stdout.write(`wrote ${outPath} (${Buffer.byteLength(body, "utf8")} bytes)\n`);

  // Self-validate and surface lint issues so the user sees them immediately.
  try {
    const v = validateDesignMd(out);
    if (v.errors.length || v.warnings.length) {
      process.stderr.write("\n[lint] DESIGN.md self-check:\n");
      for (const e of v.errors) process.stderr.write(`  error:   ${e}\n`);
      for (const w of v.warnings) process.stderr.write(`  warn:    ${w}\n`);
    }
  } catch {}
}

function cmdVisualAltDesign(args) {
  const ctx = buildUiContext(ctxOptions(args));
  reportDesignMdLint(ctx);
  const prompt = renderPrompt("visual-alt-design", {
    TARGET_LABEL: ctx.label,
    USER_FOCUS: focusText(args),
    REVIEW_INPUT: ctx.body,
  });
  emit(runGemini(prompt, { model: args.model, json: false, images: ctx.images }));
}

function cmdVisualSecondOpinion(args) {
  const ctx = buildUiContext(ctxOptions(args));
  reportDesignMdLint(ctx);

  process.stderr.write("→ pass 1/3: advocate\n");
  const advocate = runGemini(
    renderPrompt("advocate", {
      TARGET_LABEL: ctx.label,
      USER_FOCUS: focusText(args),
      REVIEW_INPUT: ctx.body,
    }),
    { model: args.model, images: ctx.images },
  );

  process.stderr.write("→ pass 2/3: critic\n");
  const critic = runGemini(
    renderPrompt("critic", {
      TARGET_LABEL: ctx.label,
      USER_FOCUS: focusText(args),
      REVIEW_INPUT: ctx.body,
    }),
    { model: args.model, images: ctx.images },
  );

  process.stderr.write("→ pass 3/3: synthesis\n");
  const synthesis = runGemini(
    renderPrompt("synthesis", {
      TARGET_LABEL: ctx.label,
      USER_FOCUS: focusText(args),
      ADVOCATE: advocate,
      CRITIC: critic,
    }),
    { model: args.model },
  );

  emit([
    "# Gemini Visual Second Opinion",
    "",
    `**Target:** ${ctx.label}`,
    "",
    "## Advocate",
    advocate.trim(),
    "",
    "## Critic",
    critic.trim(),
    "",
    "## Synthesis",
    synthesis.trim(),
  ].join("\n"));
}

function readStdinSync() {
  try {
    if (process.stdin.isTTY) return "";
    return readFileSync(0, "utf8");
  } catch { return ""; }
}

function resolveAttachments(paths) {
  const out = [];
  for (const p of paths) {
    const abs = resolve(process.cwd(), p);
    if (!existsSync(abs)) {
      throw new Error(`attachment not found: ${p}`);
    }
    out.push({ absolute: abs });
  }
  return out;
}

function cmdAsk(args) {
  // Resolve prompt: --prompt-file > trailing focus > stdin
  let prompt = "";
  if (args.promptFile) {
    const abs = resolve(process.cwd(), args.promptFile);
    if (!existsSync(abs)) throw new Error(`--prompt-file not found: ${args.promptFile}`);
    prompt = readFileSync(abs, "utf8");
  } else if (args.focus.length) {
    prompt = args.focus.join(" ");
  } else {
    prompt = readStdinSync();
  }
  prompt = prompt.trim();
  if (!prompt) {
    throw new Error("ask requires a prompt: pass it as trailing args, via --prompt-file <path>, or pipe to stdin");
  }

  const attachments = resolveAttachments([...args.file, ...args.screenshot]);
  const approvalMode = args.write ? "yolo" : "plan";
  if (args.write) {
    process.stderr.write("note: --write enabled (approval-mode=yolo) — Gemini may create/modify files in this directory\n");
  }

  const out = runGemini(prompt, {
    model: args.model,
    json: args.json,
    images: attachments,
    approvalMode,
  });
  emit(out);
}

function cmdSetup() {
  const checks = [];
  const node = process.versions.node;
  const nodeMajor = parseInt(node.split(".")[0], 10);
  checks.push({ name: "node >= 18", ok: nodeMajor >= 18, detail: `node ${node}`, required: true });

  const gem = spawnSync("gemini", ["--version"], { encoding: "utf8" });
  checks.push({
    name: "gemini CLI on PATH",
    ok: gem.status === 0,
    detail: gem.status === 0 ? gem.stdout.trim() : "not found — install from https://github.com/google-gemini/gemini-cli",
    required: true,
  });

  const auth = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  checks.push({
    name: "auth (GEMINI_API_KEY or GOOGLE_API_KEY env, or `gemini auth login` session)",
    ok: auth,
    detail: auth ? "env var set" : "no env var — confirm `gemini auth login` was run",
    required: true,
  });

  const git = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  checks.push({
    name: "inside git worktree",
    ok: git.status === 0 && git.stdout.trim() === "true",
    detail: git.status === 0 ? "yes" : "no — run from a git repo",
    required: true,
  });

  const stitch = detectStitchCli();
  checks.push({
    name: "design-md / stitch CLI (optional)",
    ok: !!stitch,
    detail: stitch ? `found: ${stitch.bin} ${stitch.version}` : "not found — internal validator will be used",
    required: false,
  });

  const designMd = findDesignMd();
  checks.push({
    name: "DESIGN.md present (optional)",
    ok: !!designMd,
    detail: designMd ? `found: ${designMd.path}` : "not found — generate one with /gemini:design",
    required: false,
  });

  const lines = ["# Gemini visual-design plugin setup check", ""];
  let allRequiredOk = true;
  for (const c of checks) {
    const mark = c.ok ? "OK  " : (c.required ? "FAIL" : "SKIP");
    lines.push(`[${mark}] ${c.name} — ${c.detail}`);
    if (c.required && !c.ok) allRequiredOk = false;
  }
  lines.push("");
  lines.push(allRequiredOk ? "All required checks passed." : "Some required checks failed — fix before running reviews.");
  emit(lines.join("\n"));
  if (!allRequiredOk) process.exit(2);
}

function main() {
  const [sub, ...rest] = process.argv.slice(2);
  if (!sub || !SUBCOMMANDS.has(sub)) {
    fail(`usage: gemini-companion <${[...SUBCOMMANDS].join("|")}> [flags] [focus...]`);
  }
  let args;
  try { args = parseArgs(rest); }
  catch (e) { fail(e.message); }

  try {
    if (sub === "visual-design-review") cmdVisualDesignReview(args);
    else if (sub === "visual-design-doc") cmdVisualDesignDoc(args);
    else if (sub === "visual-alt-design") cmdVisualAltDesign(args);
    else if (sub === "visual-second-opinion") cmdVisualSecondOpinion(args);
    else if (sub === "ask") cmdAsk(args);
    else if (sub === "setup") cmdSetup();
  } catch (e) {
    fail(e.message);
  }
}

main();
