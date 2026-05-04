# gemini-plugin-cc

A visual design companion for AI coding agents. Uses Google Gemini to generate `DESIGN.md` (Stitch open format) and run visual design reviews against the rendered UI — brand fidelity, color tokens, typography, spacing, accessibility, component variants. Not a code architecture review.

Ships in two forms from the same source tree:

- **Claude Code plugin**: five slash commands (`/gemini:design`, `/gemini:visual-design-review`, `/gemini:visual-alt-design`, `/gemini:visual-second-opinion`, `/gemini:setup`) with foreground/background execution, `AskUserQuestion` flows, and `${CLAUDE_PLUGIN_ROOT}` resolution.
- **[skills.sh](https://skills.sh) skill**: a self-contained `SKILL.md` invocable by natural language from any supported agent (Claude Code, Codex, Cursor, OpenCode, and others). The skill folder bundles its own scripts, prompts, and JSON schemas.

Both share one UI-context bundler, one prompt renderer, and one headless `gemini -p` runtime (multimodal — screenshots are attached to the call), so output is identical regardless of how the review is triggered.

---

## Why

Code reviewers, human or LLM, drift toward defects. The same is true for visual reviews: bugs are easy to point at, brand integrity is harder. Once a UI ships, visual choices get expensive to revisit — components proliferate, tokens drift, and "vibes" replace explicit design rules.

This plugin asks a different question: *does the UI uphold the brand?* It uses Gemini's multimodal capabilities to read screenshots alongside the source, anchored to a `DESIGN.md` that captures the visual identity in machine-readable tokens.

It's also a counterweight: the agent that generated the UI usually isn't the best one to evaluate it visually. Routing the visual question to a different model — and a model with strong design priors — surfaces issues the original author missed.

---

## DESIGN.md — the source of truth

This plugin uses the **open Stitch DESIGN.md format** as the contract for visual identity. It's a plain Markdown file with YAML frontmatter:

- **Frontmatter** = machine-readable tokens (`colors`, `typography`, `rounded`, `spacing`, `components`).
- **Body** = human-readable rationale in eight canonical sections (Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts).

Spec: [github.com/google-labs-code/design.md](https://github.com/google-labs-code/design.md). The format is open — you do not need to use Google Stitch the product. Any agent that reads project files can use it.

If the official `design-md` (or `stitch`) CLI is on `PATH`, this plugin detects it and folds its `lint` output into reviews. If it isn't, the plugin's own validator runs anyway (frontmatter shape + token-reference resolution + WCAG AA contrast on color pairs by role-name convention).

---

## Commands

| Command | Purpose | Default mode |
|---|---|---|
| `/gemini:design` | Generate Stitch-format `DESIGN.md` from the current UI: tokens + 8 canonical sections. | foreground |
| `/gemini:visual-design-review` | Multi-axis visual critique with verdict (`ship` / `ship-with-followups` / `redesign-recommended`), severity-ordered findings, token references, and WCAG ratios. Optional JSON output. | background |
| `/gemini:visual-alt-design` | Reconstruct the current visual identity, then propose 2–3 meaningfully different alternatives with token-level diffs and tradeoff comparison. | background |
| `/gemini:visual-second-opinion` | Three Gemini calls: **advocate** (case to ship), **critic** (case to redesign), **synthesis** (verdict + cruxes + next action). | background (~60–120s) |
| `/gemini:setup` | Verify Node, `gemini` CLI presence, auth, git, optional `design-md` CLI, and DESIGN.md presence. | foreground |

`visual-design-review`, `visual-alt-design`, and `visual-second-opinion` run a one-time **DESIGN.md preflight**: if no `DESIGN.md` exists at one of the conventional paths, they ask once whether to generate one first. Pass `--no-design-prompt` to skip the question. When `DESIGN.md` *does* exist, it is auto-included (no question, no flag).

---

## Requirements

**Required:**
- **Node.js 18+**
- **[`gemini` CLI](https://github.com/google-gemini/gemini-cli)** on `PATH` (tested against `0.37.0`)
- **Authenticated Gemini session**: either `GEMINI_API_KEY` / `GOOGLE_API_KEY` env var, or a logged-in `gemini auth login` session
- **A git repository** as the working directory

**Optional:**
- **`design-md` (or `stitch`) CLI** — official Stitch validator. When present, augments review context.
- **`DESIGN.md`** at the repo root — strongly improves review quality. If missing, the plugin offers to generate one before reviewing.

Run `/gemini:setup` to verify everything in one shot.

---

## Install

### As a Claude Code plugin (full slash-command surface)

Claude Code installs plugins from marketplaces. This repository publishes a single-plugin marketplace at `.claude-plugin/marketplace.json`, so you can add the GitHub repo directly from inside Claude Code:

```text
/plugin marketplace add voodootikigod/gemini-plugin-cc
/plugin install gemini@gemini-plugin-cc
/reload-plugins
/gemini:setup
```

You can also use the full git URL:

```text
/plugin marketplace add https://github.com/voodootikigod/gemini-plugin-cc.git
/plugin install gemini@gemini-plugin-cc
/reload-plugins
```

For local development against a clone:

```bash
git clone https://github.com/voodootikigod/gemini-plugin-cc.git
cd gemini-plugin-cc
claude
```

Then, inside Claude Code:

```text
/plugin marketplace add .
/plugin install gemini@gemini-plugin-cc
/reload-plugins
```

Non-interactive installs use the same marketplace and plugin names:

```bash
claude plugin marketplace add voodootikigod/gemini-plugin-cc
claude plugin install gemini@gemini-plugin-cc
```

After installation, the plugin wires up the five `/gemini:*` slash commands with their `AskUserQuestion` flows (foreground vs background, DESIGN.md preflight) and `${CLAUDE_PLUGIN_ROOT}` resolution. Run `/gemini:setup` in any git repo to verify the toolchain.

### As a skill via skills.sh (any supported agent)

Install the `gemini` skill directly from the GitHub repo:

```bash
# install the repo's gemini skill
npx skills add voodootikigod/gemini-plugin-cc@gemini

# equivalent full URL form
npx skills add https://github.com/voodootikigod/gemini-plugin-cc.git

# install all skills from the repo (currently just gemini)
npx skills add voodootikigod/gemini-plugin-cc
```

For local development:

```bash
git clone https://github.com/voodootikigod/gemini-plugin-cc.git
cd gemini-plugin-cc
npx skills add ./
```

`skills.sh` discovers the skill via the `skills` field in `.claude-plugin/plugin.json`, which points at `./skills/gemini`. The skill folder is self-contained: `SKILL.md`, `scripts/`, `prompts/`, and `schemas/` all live alongside each other and ship as a unit.

Once installed, invoke by description rather than command. Examples that should match the skill:

- "Review the visual design of this UI"
- "Check brand consistency across these screens"
- "Generate a DESIGN.md from these screenshots"
- "Propose alternative palettes / type systems"
- "Get a second opinion on this UI before I ship"

The skill intentionally doesn't match code-architecture review intent. That belongs to a software-design-review skill or agent.

---

## How input is gathered

The companion bundles three things into the Gemini call automatically:

1. **`DESIGN.md`** if present (read from `./DESIGN.md`, `./design.md`, `./docs/DESIGN.md`, or `./docs/design.md`). Internal validator runs every time; external `design-md lint` is folded in when the CLI is present.
2. **Screenshots** scanned from conventional directories — capped at 12 images and ~800 KB total to keep the multimodal call focused:
   - `design/`
   - `screenshots/`
   - `.design/`
   - `docs/design/`
   - `docs/screenshots/`
   - `test-results/` (Playwright snapshots)
   - `storybook-static/`
   - `playwright-report/`
3. **UI source** — Tailwind config (`tailwind.config.{js,ts,mjs,cjs}`), top-level CSS (`globals.css`, `app.css`, `tailwind.css`, etc.), files under `styles/` / `src/styles/`, and a sample of components from `components/`, `src/components/`, `app/components/`, `ui/`, `src/ui/`. Each file truncated at 8 KB.

Pass `--screenshot <path>` (repeatable) to add explicit images on top of the conventional-dir scan.

---

## Common flags

All subcommands share the same flag surface, parsed by `scripts/lib/args.mjs`:

| Flag | Meaning |
|---|---|
| `--wait` | Run synchronously in the foreground |
| `--background` | Detach via Claude Code's `Bash(..., run_in_background: true)` |
| `--screenshot <path>` | Attach an explicit image (repeatable) |
| `--include <glob>` | Limit context to matching source paths (repeatable) |
| `--exclude <glob>` | Drop matching source paths from context (repeatable) |
| `--model <id>` | Override model (default `gemini-3.1-pro-preview`) |
| `--json` | `visual-design-review` only. Emits JSON conforming to `schemas/visual-design-review-output.schema.json` (parsed and required-field-checked before return) |
| `--out <path>` | `design` only. Output path (default `./DESIGN.md`) |
| `--force` | `design` only. Overwrite an existing file |
| `--no-design-prompt` | Skip the DESIGN.md preflight in `visual-design-review`, `visual-alt-design`, `visual-second-opinion` |
| `<focus...>` | Trailing free-form text, passed to the prompt as user-focus / intent / constraints |

### Model fallback

If the requested model returns 429 or "not found", the runtime walks a fallback chain (currently `gemini-3.1-pro-preview` then `gemini-3-pro-preview` then `gemini-2.5-pro`) and emits a warning to stderr on each downgrade. Override the entire chain by setting `--model <id>` explicitly; the chain still applies as fallback.

### JSON output

`--json` is `visual-design-review`-only. The runtime appends a strict `<output_override>` instruction to the prompt, runs Gemini in JSON mode, then parses the result, validates against `schemas/visual-design-review-output.schema.json` for required fields, and pretty-prints. On parse failure, the raw response is dumped to `/tmp/gemini-bad-output-<ts>.txt` for inspection.

---

## Examples

```text
# Verify everything is wired up
/gemini:setup

# Generate DESIGN.md before reviewing anything
/gemini:design
/gemini:design --out docs/DESIGN.md
/gemini:design --force focus on the editorial brand voice

# Visual critique
/gemini:visual-design-review
/gemini:visual-design-review --screenshot ./design/dashboard.png --screenshot ./design/settings.png
/gemini:visual-design-review --include "src/ui/**" --exclude "**/*.stories.*" focus on accessibility
/gemini:visual-design-review --json

# Alternative visual identities
/gemini:visual-alt-design
/gemini:visual-alt-design must stay AA accessible, primary stays in blue family
/gemini:visual-alt-design --background

# Three-pass: advocate, critic, synthesis with verdict
/gemini:visual-second-opinion
/gemini:visual-second-opinion --background
```

When invoked as a skills.sh skill from a non-Claude-Code agent, the same flag surface applies. The agent constructs the same `node .../gemini-companion.mjs <subcommand> [flags]` invocation under the hood. See `skills/gemini/SKILL.md` for the agent-facing brief.

---

## Visual-design-review axes

`/gemini:visual-design-review` evaluates the UI along these axes (skipping any that don't apply):

1. **Brand fidelity** — does the rendered UI feel like the brand DESIGN.md describes
2. **Color adherence** — semantic role usage, off-token hex values, hard-coded colors that should be tokens
3. **Typography** — font family/weight/size from the type scale, hierarchy, letter-spacing
4. **Spacing & layout** — spacing scale used consistently, grid alignment, whitespace policy
5. **Component variants** — buttons/inputs/cards rendered with the correct variant tokens
6. **Elevation & depth** — shadow tiers and z-index match the elevation policy
7. **Shapes** — corner radii used per role
8. **Accessibility** — text/background contrast meets WCAG AA, focus states visible, no color-only signaling
9. **Cross-screen consistency** — same component renders identically across screens
10. **Do's and Don'ts compliance** — explicit "Don't" rules from DESIGN.md respected

Default output is Markdown: verdict, summary, ordered findings (each with severity, location, token reference, problem, impact, fix), what's working, and open questions. `--json` returns the same structure conforming to the schema.

---

## How `visual-second-opinion` works

Three sequential Gemini calls with separate prompts, all sharing the same context bundle (DESIGN.md + screenshots + UI source):

1. **Advocate** (`prompts/advocate.md`): the honest case to ship. Told to bail if the design is genuinely broken on visual grounds, rather than rubber-stamp.
2. **Critic** (`prompts/critic.md`): the honest case to redesign or send back. Same constraint in reverse: don't invent problems.
3. **Synthesis** (`prompts/synthesis.md`): receives both outputs, identifies where they agree (often more than it looks), where the real cruxes are, and returns a verdict plus next action.

Total runtime is typically 60–120 seconds. Background is the default recommendation.

---

## DESIGN.md preflight

Three subcommands (`visual-design-review`, `visual-alt-design`, `visual-second-opinion`) check for `DESIGN.md` at:

- `./DESIGN.md`
- `./design.md`
- `./docs/DESIGN.md`
- `./docs/design.md`

If found, the doc is read in full and prepended to the review context silently — no prompt. If not found, the command asks once whether to generate one via `/gemini:design` first. Reasoning: visual critique works much better when there's an explicit token system to evaluate against, rather than asking the model to reverse-engineer the brand from screenshots.

Pass `--no-design-prompt` to skip the question entirely.

---

## Layout

```
gemini-plugin-cc/
├── .claude-plugin/
│   ├── plugin.json                        # plugin manifest; declares the skill via `skills: ["./skills/gemini"]`
│   └── marketplace.json                   # Claude Code marketplace; installs `gemini@gemini-plugin-cc`
├── commands/                              # Claude Code slash-command surface
│   ├── design.md                          # → visual-design-doc
│   ├── visual-design-review.md
│   ├── visual-alt-design.md
│   ├── visual-second-opinion.md
│   └── setup.md
├── skills/
│   └── gemini/                            # self-contained skill (ships via skills.sh)
│       ├── SKILL.md                       # frontmatter + when-to-use + invocation contract
│       ├── prompts/                       # one template per subcommand / pass
│       │   ├── visual-design-doc.md
│       │   ├── visual-design-review.md
│       │   ├── visual-alt-design.md
│       │   ├── advocate.md
│       │   ├── critic.md
│       │   └── synthesis.md
│       ├── scripts/
│       │   ├── gemini-companion.mjs       # subcommand dispatcher
│       │   └── lib/
│       │       ├── args.mjs               # flag parser
│       │       ├── ui-context.mjs         # screenshot + source + DESIGN.md bundler
│       │       ├── designmd.mjs           # internal Stitch validator (frontmatter, token refs, WCAG)
│       │       ├── designmd-cli.mjs       # optional bridge to external `design-md` / `stitch` CLI
│       │       ├── gemini.mjs             # headless `gemini -p` wrapper with multimodal + model fallback
│       │       └── prompt.mjs             # template renderer
│       └── schemas/
│           └── visual-design-review-output.schema.json
└── README.md
```

The `commands/` directory is plugin-only (Claude Code reads it). The `skills/gemini/` directory is the source of truth for everything else, and is what skills.sh installs.

---

## Architecture

```
┌──────────────────────┐         ┌──────────────────────┐
│ /gemini:* slash cmd  │         │  natural-language    │
│ (Claude Code plugin) │         │  invocation (skill)  │
└──────────┬───────────┘         └──────────┬───────────┘
           │                                │
           └───────────────┬────────────────┘
                           │ node gemini-companion.mjs <sub> [flags]
                           ▼
            ┌──────────────────────────────┐
            │  scripts/gemini-companion    │
            │  - subcommand dispatch       │
            │  - JSON parse + schema check │
            └──────────┬───────────────────┘
                       │
   ┌────────┬──────────┼─────────────┬──────────────┬──────────────┐
   ▼        ▼          ▼             ▼              ▼              ▼
args.mjs  ui-context  designmd     designmd-cli   prompt.mjs    gemini.mjs
flags     scan dirs   internal     optional       {{TEMPLATE}}  gemini -p +
          + DESIGN.md validator    Stitch CLI     rendering     @<image> refs
                                                                + fallback chain
                                          │                          │
                                          ▼                          ▼
                                    prompts/*.md           gemini-3.1-pro-preview
                                                          → gemini-3-pro-preview
                                                          → gemini-2.5-pro
```

Single dispatcher, single context bundler, single Gemini wrapper. Adding a new review variant is a prompt template plus a ~10-line subcommand handler.

---

## Adding a new review variant

1. Drop a prompt template at `skills/gemini/prompts/<name>.md` using the `{{TARGET_LABEL}}`, `{{USER_FOCUS}}`, and `{{REVIEW_INPUT}}` placeholders. Multi-pass variants can introduce additional placeholders (see `synthesis.md` which uses `{{ADVOCATE}}` and `{{CRITIC}}`).
2. Add a subcommand handler in `skills/gemini/scripts/gemini-companion.mjs` (~10 lines: build UI context, render prompt, run Gemini with `images` attached, emit).
3. Register the subcommand name in the `SUBCOMMANDS` set at the top of the dispatcher.
4. Add a slash-command file at `commands/<name>.md` with frontmatter (`description`, `argument-hint`, `disable-model-invocation`, `allowed-tools`) and the foreground/background execution stanzas.
5. Mention the new command in `skills/gemini/SKILL.md` so natural-language invocation finds it.

The bundler, args parser, and Gemini runtime are reused as-is, no wiring required.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `gemini: command not found` | CLI not installed or not on `PATH` | Install from https://github.com/google-gemini/gemini-cli, then re-run `/gemini:setup` |
| `gemini exited with status N` referencing auth | No API key, no logged-in session | Set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`), or run `gemini auth login` |
| `not a git repository` | `cwd` is outside any git worktree | `cd` into the repo before invoking |
| "No screenshots found" | No images in any conventional dir, no `--screenshot` flag | Drop PNG/JPG/WEBP files into `design/` or pass `--screenshot <path>` |
| `gemini returned non-JSON output` (with `--json`) | Model went off-script under instruction stress | Inspect `/tmp/gemini-bad-output-<ts>.txt`, retry without `--json`, or with `--model gemini-2.5-pro` for stricter JSON adherence |
| `warning: model X unavailable or rate-limited` | 429 or 404 on requested model | Automatic. Runtime falls through to the next model in the chain. No action needed unless all fail |
| Background run never returns output | Claude Code background buffer not yet drained | Use `BashOutput` to read the running task's stdout |
| `[lint] DESIGN.md self-check` warnings | Generated `DESIGN.md` has token-ref or WCAG issues | Open the file, address the warnings, regenerate with `--force` if you want a fresh draft |

---

## Design notes

- **DESIGN.md is the contract.** Without it, the review still runs but is limited to raw accessibility and internal consistency. Generate one with `/gemini:design` before any serious review pass.
- **Multimodal is the point.** The Gemini CLI's `@<path>` syntax loads images as image inputs. Reviewing a UI without seeing it pixels-on-screen misses most of the design.
- **Conventional directories beat configuration.** The plugin scans `design/`, `screenshots/`, `test-results/`, etc. so it just works in the common case. Override with `--screenshot` only when you need surgical control.
- **Internal validator runs always.** The official `design-md` CLI is optional; we always do our own frontmatter / token-ref / WCAG check so reviews include token-adherence info even on machines without the official CLI.
- **Pass output through unchanged.** Slash commands and `SKILL.md` both tell the agent to return Gemini's stdout as-is — no summarization, no editing, no "applying" the suggestions. Visual review is advisory; the human (or the *next* agent in the loop) decides what to act on.

---

## License & author

Author: Chris Williams (`chris@voodootikigod.com`).

License: [MIT](./LICENSE).
