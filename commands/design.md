---
description: Generate a Stitch-format DESIGN.md (visual identity tokens + 8 canonical sections) from the current UI using Gemini
argument-hint: '[--wait|--background] [--screenshot <path>]... [--out <path>] [--force] [--include <glob>]... [--exclude <glob>]... [--model <id>] [intent ...]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(gemini:*), AskUserQuestion
---

Generate `DESIGN.md` for the current UI. Gemini drafts a Stitch-format design system manifest — YAML frontmatter (colors, typography, rounded, spacing, components) plus the eight canonical markdown sections (Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts).

Spec: https://github.com/google-labs-code/design.md

Raw slash-command arguments:
`$ARGUMENTS`

Behavior:
- Default output path: `./DESIGN.md`. Override with `--out <path>` (e.g. `--out docs/DESIGN.md`).
- Refuses to overwrite an existing file unless `--force` is passed.
- After writing, the script self-validates against the Stitch spec and surfaces any frontmatter / token-ref / WCAG warnings to stderr.
- If the optional `design-md` (or `stitch`) CLI is on PATH, it is detected by the `setup` command but not invoked here.

Inputs gathered automatically:
- Screenshots from `design/`, `screenshots/`, `.design/`, `docs/design/`, `docs/screenshots/`, `test-results/`, `storybook-static/`, `playwright-report/`.
- Tailwind config (`tailwind.config.{js,ts,mjs,cjs}`) and top-level CSS files.
- A handful of components from `components/`, `src/components/`, `app/components/`, `ui/`, `src/ui/`.
- Add explicit images with `--screenshot <path>` (repeatable).

Execution: defaults to foreground. One Gemini call.

Foreground flow:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/gemini/scripts/gemini-companion.mjs" visual-design-doc $ARGUMENTS
```

Background flow:
```typescript
Bash({
  command: `node "${CLAUDE_PLUGIN_ROOT}/skills/gemini/scripts/gemini-companion.mjs" visual-design-doc $ARGUMENTS`,
  description: "Gemini DESIGN.md generation",
  run_in_background: true
})
```

After running, tell the user where the file was written and offer to open it.
