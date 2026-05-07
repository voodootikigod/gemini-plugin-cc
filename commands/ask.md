---
description: Send a free-form prompt to Google Gemini — generic passthrough with optional file attachments and opt-in file-writing mode
argument-hint: '[--file <path>]... [--prompt-file <path>] [--write] [--model <id>] [--wait|--background] [prompt text...]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(gemini:*), AskUserQuestion
---

Route an arbitrary request to Google Gemini through the bundled companion script. Generic — not tied to visual design. Use this when the user wants Gemini specifically (e.g., for stronger file-writing, friendlier tone rewrites, long-context summarization, multimodal reasoning) rather than the design-focused subcommands.

Raw slash-command arguments:
`$ARGUMENTS`

Prompt resolution priority (companion script handles this):
1. `--prompt-file <path>` — read prompt from file
2. Trailing positional text — joined as the prompt
3. Stdin — if neither flag nor positional given, the script reads stdin

If none of those produce a non-empty prompt, the script errors out.

File attachments:
- `--file <path>` (repeatable) — attach any file. Images get multimodal treatment; text files are inlined. Resolved relative to CWD.
- `--screenshot <path>` is accepted as an alias and merged into the same attachment list.
- **Workspace scoping:** gemini-cli restricts `@<path>` reads to the current workspace (CWD and below). Files under `/tmp/` or other directories outside the repo will be silently dropped by the CLI. Copy them into the repo (or symlink) before passing.

Write mode (DESTRUCTIVE — opt-in):
- Default: `--approval-mode plan` — Gemini returns a plan; no files are touched.
- `--write`: switches to `--approval-mode yolo` so Gemini can create / edit files in the current directory without prompts. Use only when the user explicitly wants Gemini to do the writing (e.g., "have Gemini rewrite these docs to be friendlier").
- When `--write` is set, confirm the destructive intent with the user via `AskUserQuestion` BEFORE running, unless the raw arguments already include `--wait` or `--background` (those signal the user has already chosen execution mode and confirmed).

Execution mode rules:
- `--wait` in args → run in foreground, return stdout verbatim.
- `--background` in args → run as a background Bash task; tell the user to use BashOutput to check progress.
- Otherwise: ask once via `AskUserQuestion`. Foreground is fine for short prompts; background is recommended when `--write` is set or when many large files are attached.

Foreground flow:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/gemini/scripts/gemini-companion.mjs" ask $ARGUMENTS
```

Background flow:
```typescript
Bash({
  command: `node "${CLAUDE_PLUGIN_ROOT}/skills/gemini/scripts/gemini-companion.mjs" ask $ARGUMENTS`,
  description: "Gemini ask (generic)",
  run_in_background: true
})
```

Output discipline:
- Return Gemini's stdout verbatim. Do not summarize, edit, or paraphrase.
- The companion writes a `note: --write enabled ...` line to stderr when destructive mode is active — surface this to the user.

Examples:
- `/gemini:ask rewrite this README to be friendlier --file README.md --write`
- `/gemini:ask --prompt-file ./prompts/refactor.md --file src/auth.ts`
- `/gemini:ask explain the trade-offs between PPR and ISR for our docs site`
