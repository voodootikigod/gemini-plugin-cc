// Shared argv parser for gemini-companion subcommands.

const VALID_SCOPES = new Set(["auto", "working-tree", "branch", "staged", "unstaged"]);

export function parseArgs(argv) {
  const out = {
    base: null,
    scope: "auto",
    model: "gemini-3.1-pro-preview",
    json: false,
    include: [],
    exclude: [],
    focus: [],
    wait: false,
    background: false,
    out: null,
    force: false,
    screenshot: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--wait") { out.wait = true; continue; }
    if (a === "--background") { out.background = true; continue; }
    if (a === "--json") { out.json = true; continue; }
    if (a === "--base") { out.base = argv[++i]; continue; }
    if (a.startsWith("--base=")) { out.base = a.slice(7); continue; }
    if (a === "--scope") { out.scope = argv[++i]; continue; }
    if (a.startsWith("--scope=")) { out.scope = a.slice(8); continue; }
    if (a === "--model") { out.model = argv[++i]; continue; }
    if (a.startsWith("--model=")) { out.model = a.slice(8); continue; }
    if (a === "--include") { out.include.push(argv[++i]); continue; }
    if (a.startsWith("--include=")) { out.include.push(a.slice(10)); continue; }
    if (a === "--exclude") { out.exclude.push(argv[++i]); continue; }
    if (a.startsWith("--exclude=")) { out.exclude.push(a.slice(10)); continue; }
    if (a === "--out") { out.out = argv[++i]; continue; }
    if (a.startsWith("--out=")) { out.out = a.slice(6); continue; }
    if (a === "--force") { out.force = true; continue; }
    if (a === "--screenshot") { out.screenshot.push(argv[++i]); continue; }
    if (a.startsWith("--screenshot=")) { out.screenshot.push(a.slice(13)); continue; }
    out.focus.push(a);
  }
  if (!VALID_SCOPES.has(out.scope)) {
    throw new Error(`invalid --scope ${out.scope} (one of: ${[...VALID_SCOPES].join(", ")})`);
  }
  if (out.base) out.scope = "branch";
  return out;
}
