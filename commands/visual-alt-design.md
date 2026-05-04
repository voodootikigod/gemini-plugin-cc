---
description: Use Gemini to read the current visual identity and propose 2–3 meaningfully different alternatives with token-level diffs and tradeoff comparison
argument-hint: '[--wait|--background] [--screenshot <path>]... [--include <glob>]... [--exclude <glob>]... [--model <id>] [constraints / focus ...]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(gemini:*), AskUserQuestion
---

Read the current visual identity from `DESIGN.md`, screenshots, and UI source, then propose 2–3 alternative visual identities with concrete token diffs (colors, typography, rounded, spacing) and an honest tradeoff comparison.

This is **generative**, not a critique. Use `/gemini:visual-design-review` for critique and `/gemini:visual-second-opinion` for adversarial framing.

Raw slash-command arguments:
`$ARGUMENTS`

Tip: trailing free-form text becomes the user-focus / constraints block. Useful for things like `must stay accessible at AA`, `keep brand voice editorial`, `assume dark mode primary`.

DESIGN.md preflight (run BEFORE the execution-mode question):
- Check `./DESIGN.md`, `./design.md`, `./docs/DESIGN.md`, `./docs/design.md`.
- If none AND `--no-design-prompt` not present, ask once via `AskUserQuestion`:
  - Question: "No DESIGN.md found. Generate one with Gemini first? It gives alt-design an explicit baseline to differentiate from."
  - Options (recommended first): `Yes — generate DESIGN.md first (Recommended)`, `Skip — read identity from screenshots and code`, `Cancel`
- On `Yes`: run `visual-design-doc` and wait. On `Skip`: proceed. On `Cancel`: stop.

Execution mode rules:
- If `--wait` or `--background` is set, do not ask.
- Otherwise default recommendation is **background** when screenshots are present, **foreground** otherwise.

Foreground flow:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/gemini/scripts/gemini-companion.mjs" visual-alt-design $ARGUMENTS
```

Background flow:
```typescript
Bash({
  command: `node "${CLAUDE_PLUGIN_ROOT}/skills/gemini/scripts/gemini-companion.mjs" visual-alt-design $ARGUMENTS`,
  description: "Gemini alternative visual designs",
  run_in_background: true
})
```

Return stdout verbatim. Do not edit, summarize, or apply any of the alternatives.
