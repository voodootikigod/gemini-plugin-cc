---
description: Run a Google Gemini visual design review — brand fidelity, token adherence, typography, color, spacing, accessibility, component variants
argument-hint: '[--wait|--background] [--screenshot <path>]... [--include <glob>]... [--exclude <glob>]... [--model <id>] [--json] [focus ...]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(gemini:*), AskUserQuestion
---

Run a Gemini-powered visual design review through the bundled companion script.
This evaluates the rendered UI (screenshots) and source (Tailwind/CSS/components) against the project's `DESIGN.md` (Stitch open format: https://github.com/google-labs-code/design.md).

This is a **visual** review — brand, color, typography, spacing, accessibility, component variant correctness — not a code-architecture review.

Raw slash-command arguments:
`$ARGUMENTS`

DESIGN.md preflight (run BEFORE the size question):
- Check whether `DESIGN.md` exists at: `./DESIGN.md`, `./design.md`, `./docs/DESIGN.md`, `./docs/design.md`.
- If none exists AND the raw arguments do NOT contain `--no-design-prompt`, use `AskUserQuestion` exactly once:
  - Question: "No DESIGN.md found. Generate one with Gemini before reviewing? It gives the review explicit tokens and brand rules to evaluate against."
  - Options (recommended first): `Yes — generate DESIGN.md first (Recommended)`, `Skip — review without spec`, `Cancel`
- On `Yes`: run the generator in the foreground and wait:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/skills/gemini/scripts/gemini-companion.mjs" visual-design-doc $ARGUMENTS
  ```
  Then tell the user `DESIGN.md` was written, and proceed.
- On `Skip`: proceed (review will rely on raw accessibility + internal consistency).
- On `Cancel`: stop and return `Review cancelled.` to the user.

Core constraint:
- Review-only. Do not fix issues, edit components, or apply patches.
- Return Gemini's stdout verbatim.

Screenshot ingestion:
- The companion automatically scans conventional directories: `design/`, `screenshots/`, `.design/`, `docs/design/`, `docs/screenshots/`, `test-results/`, `storybook-static/`, `playwright-report/`.
- Pass `--screenshot <path>` (repeatable) to add explicit images on top of the scan.
- If nothing is found, the review proceeds against UI source only and says so in its summary.

Execution mode rules:
- If raw arguments include `--wait`, do not ask. Run in foreground.
- If raw arguments include `--background`, do not ask. Run as background task.
- Otherwise: ask once via `AskUserQuestion`. Background is recommended whenever screenshots are involved (multimodal reasoning takes ~30–60s).

Foreground flow:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/gemini/scripts/gemini-companion.mjs" visual-design-review $ARGUMENTS
```

Background flow:
```typescript
Bash({
  command: `node "${CLAUDE_PLUGIN_ROOT}/skills/gemini/scripts/gemini-companion.mjs" visual-design-review $ARGUMENTS`,
  description: "Gemini visual design review",
  run_in_background: true
})
```
After launching: "Gemini visual design review started in the background. Use BashOutput to check progress."
