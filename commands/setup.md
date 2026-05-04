---
description: Verify the Gemini visual-design plugin can run — checks node, gemini CLI, auth, git, optional design-md CLI, and DESIGN.md presence
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Verify the Gemini visual-design plugin is ready to run.

Required:
- Node.js >= 18
- `gemini` CLI on PATH
- Auth (`GEMINI_API_KEY` / `GOOGLE_API_KEY` env, or `gemini auth login` session)
- Inside a git worktree

Optional (improves output but not required):
- `design-md` (or `stitch`) CLI on PATH — official Stitch validator. When present, its `lint` output is folded into review context.
- `DESIGN.md` at the repo root — gives reviews concrete tokens to evaluate against.

Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/gemini/scripts/gemini-companion.mjs" setup
```

Return stdout verbatim. If a required check fails, the script exits non-zero and surfaces what to fix. Optional checks are reported as `SKIP` and do not fail the run.
