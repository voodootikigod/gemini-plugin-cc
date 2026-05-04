---
description: Three-pass Gemini visual review — advocate (ship), critic (redesign), synthesis (verdict + cruxes)
argument-hint: '[--wait|--background] [--screenshot <path>]... [--include <glob>]... [--exclude <glob>]... [--model <id>] [focus ...]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(gemini:*), AskUserQuestion
---

Run a three-pass visual review:

1. **Advocate** — strongest honest case to ship the current visual design as-is.
2. **Critic** — strongest honest case to redesign or send back.
3. **Synthesis** — verdict, where the two agree, where they actually disagree, and what to do.

Output is a single Markdown document with all three sections, returned verbatim.

DESIGN.md preflight (run BEFORE the execution-mode question):
- Check `./DESIGN.md`, `./design.md`, `./docs/DESIGN.md`, `./docs/design.md`.
- If none AND `--no-design-prompt` not present, ask once via `AskUserQuestion`:
  - Question: "No DESIGN.md found. Generate one before the second-opinion run? It gives advocate and critic concrete tokens to argue about."
  - Options (recommended first): `Yes — generate DESIGN.md first (Recommended)`, `Skip — argue from screenshots/code only`, `Cancel`
- On `Yes`: run `visual-design-doc` and wait. On `Skip`: proceed. On `Cancel`: stop.

Raw slash-command arguments:
`$ARGUMENTS`

Execution mode rules:
- Three Gemini calls. Default recommendation: **background**.
- If `--wait` or `--background` is set, do not ask.
- Otherwise ask once via `AskUserQuestion` with `Run in background (Recommended)` first.

Foreground flow:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/gemini/scripts/gemini-companion.mjs" visual-second-opinion $ARGUMENTS
```

Background flow:
```typescript
Bash({
  command: `node "${CLAUDE_PLUGIN_ROOT}/skills/gemini/scripts/gemini-companion.mjs" visual-second-opinion $ARGUMENTS`,
  description: "Gemini visual second opinion (advocate + critic + synthesis)",
  run_in_background: true
})
```

After launching the background flow, tell the user: "Gemini visual second opinion started in the background. Three Gemini calls — expect 60–120s. Use BashOutput to check progress."

Return stdout verbatim.
