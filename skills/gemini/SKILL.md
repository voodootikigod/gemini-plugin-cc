---
name: gemini
description: Visual design companion. Generates Stitch-format DESIGN.md from UI source + screenshots, runs visual design reviews against brand fidelity, color/typography/spacing tokens, accessibility (WCAG), and component variants. Triggers on intents like "review the UI", "check brand consistency", "draft DESIGN.md", "propose alternative visual designs", "second opinion on this design". Not for code-architecture review.
---

# Gemini Visual Design Companion

Five workflows, one runtime. Pick the subcommand by user intent.

| User intent | Subcommand | Default mode |
|---|---|---|
| "review the UI", "check the visual design", "is this on-brand" | `visual-design-review` | background |
| "draft DESIGN.md", "generate a design system file", "extract tokens" | `visual-design-doc` | foreground |
| "alternative visual designs", "what other palettes / type systems would work" | `visual-alt-design` | background |
| "second opinion", "advocate vs critic on the visuals" | `visual-second-opinion` | background (3 calls) |
| "is gemini set up", "check the plugin" | `setup` | foreground |

**Do not trigger this skill for code-architecture review, API design critique, bug hunts, or line-level lint.** Those belong to a code-review skill.

## What this skill does

- Reads `DESIGN.md` (open Stitch format: https://github.com/google-labs-code/design.md) when present and uses it as the source of truth for tokens, brand voice, and "Do's and Don'ts."
- Scans conventional screenshot directories (`design/`, `screenshots/`, `.design/`, `docs/design/`, `docs/screenshots/`, `test-results/`, `storybook-static/`, `playwright-report/`) and attaches images to the multimodal Gemini call.
- Pulls Tailwind config, top-level CSS, and a sample of component source for token-adherence analysis.
- Runs internal Stitch validation (frontmatter shape + token-ref resolution + WCAG AA contrast) on every review. If `design-md` (or `stitch`) CLI is on PATH, its `lint` output is also folded into the review context.

## Prerequisites

**Required:**
- Node.js >= 18 on PATH
- `gemini` CLI installed and authenticated (`GEMINI_API_KEY` / `GOOGLE_API_KEY`, or `gemini auth login`)
- Working directory is a git repo

**Optional:**
- `design-md` (or `stitch`) CLI on PATH — official Stitch validator. Plugin works without it.
- `DESIGN.md` at the repo root — strongly improves review quality. Generate via `visual-design-doc` if missing.

Verify with `setup`.

## Invocation

```bash
node "${SKILL_DIR}/scripts/gemini-companion.mjs" <subcommand> [flags] [focus...]
```

`${SKILL_DIR}` is the directory containing this `SKILL.md`. When invoked through the Claude Code plugin, prefer `${CLAUDE_PLUGIN_ROOT}/skills/gemini/scripts/gemini-companion.mjs`.

### Shared flags

| Flag | Meaning |
|---|---|
| `--wait` / `--background` | Foreground vs detached |
| `--screenshot <path>` | Add an explicit image (repeatable) on top of the conventional-dir scan |
| `--include <glob>` / `--exclude <glob>` | Path filters for source files (repeatable) |
| `--model <id>` | Override model (default `gemini-3.1-pro-preview`, fallback chain on 429/404) |
| `--json` | `visual-design-review` only — emit JSON conforming to `schemas/visual-design-review-output.schema.json` |
| `--out <path>` / `--force` | `visual-design-doc` only — output path (default `DESIGN.md`) / overwrite |
| `--no-design-prompt` | Skip the DESIGN.md preflight in `visual-design-review`, `visual-alt-design`, `visual-second-opinion` |
| `<focus...>` | Trailing free-form text becomes user-focus / constraints in the prompt |

## DESIGN.md preflight

`visual-design-review`, `visual-alt-design`, and `visual-second-opinion` check for `DESIGN.md` at `./DESIGN.md`, `./design.md`, `./docs/DESIGN.md`, or `./docs/design.md`. If missing AND `--no-design-prompt` is not passed, ask once whether to generate one first via `visual-design-doc`. Recommended: yes — gives the review concrete tokens to evaluate.

If `DESIGN.md` exists, the script auto-includes it. Do not ask.

## Output discipline

Return Gemini's stdout **verbatim**. Do not summarize, edit, paraphrase, soften, or apply suggestions. The human (or the next agent) decides what to act on.

`visual-design-doc` writes to disk and prints `wrote <path> (<bytes>)` instead of the doc body. After writing, the script self-validates the new file and emits any frontmatter / token-ref / WCAG warnings to stderr.

## Subcommand details

### `visual-design-review`
Multi-axis visual critique along: brand fidelity, color, typography, spacing & layout, component variants, elevation, shapes, accessibility, cross-screen consistency, do's-and-don'ts compliance. Output: verdict (`ship` / `ship-with-followups` / `redesign-recommended`), summary, ordered findings with severity + token reference + screenshot anchor + WCAG ratios where relevant. Pass `--json` for structured output validated against the schema.

### `visual-second-opinion`
Three sequential Gemini calls: **advocate** (strongest honest case to ship), **critic** (strongest honest case to redesign), **synthesis** (verdict, agreements, real cruxes, next action). Returns one Markdown doc with all three. ~60–120s total.

### `visual-alt-design`
Reconstructs the current visual identity from `DESIGN.md` + screenshots + UI source, then proposes 2–3 meaningfully different alternatives with token-level deltas (colors, typography, rounded, spacing) and an honest comparison matrix. Generative, not critique.

### `visual-design-doc`
Drafts a Stitch-format `DESIGN.md` from the inputs: YAML frontmatter (colors, typography, rounded, spacing, components) plus the eight canonical sections (Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts). Default output `./DESIGN.md`. Refuses to overwrite without `--force`.

### `setup`
Verifies node >= 18, `gemini` on PATH, auth, git repo. Reports optional `design-md`/`stitch` CLI presence and `DESIGN.md` presence. Required checks fail the run; optional checks are informational.

## Failure modes

- `gemini: command not found` → install Gemini CLI, retry `setup`
- Auth error → set `GEMINI_API_KEY` or run `gemini auth login`
- "not a git repo" → cd into a git worktree
- No screenshots and no UI source → drop screenshots into a conventional dir or pass `--screenshot <path>`; the review will still run against `DESIGN.md` alone if it exists
- Non-JSON output with `--json` → raw saved to `/tmp/gemini-bad-output-<ts>.txt`; retry without `--json` or with `--model gemini-2.5-pro`

## Related

Slash commands (Claude Code plugin install): `/gemini:design`, `/gemini:visual-design-review`, `/gemini:visual-alt-design`, `/gemini:visual-second-opinion`, `/gemini:setup` — each maps to the corresponding subcommand with identical flags.
