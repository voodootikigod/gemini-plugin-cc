// Shared argv parser for gemini-companion subcommands.

const REPEATABLE_VALUE_FLAGS = new Set(["--screenshot", "--include", "--exclude"]);
const SINGLE_VALUE_FLAGS = new Set(["--model", "--out"]);
const BOOL_FLAGS = new Set([
  "--wait", "--background", "--json", "--force", "--no-design-prompt",
]);

function takeValue(name, raw, argv, i) {
  const next = argv[i + 1];
  if (next === undefined) {
    throw new Error(`flag ${raw} requires a value`);
  }
  if (typeof next === "string" && next.startsWith("--")) {
    throw new Error(`flag ${raw} requires a value (got "${next}")`);
  }
  return next;
}

export function parseArgs(argv) {
  const out = {
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
    noDesignPrompt: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    // Boolean flags
    if (a === "--wait") { out.wait = true; continue; }
    if (a === "--background") { out.background = true; continue; }
    if (a === "--json") { out.json = true; continue; }
    if (a === "--force") { out.force = true; continue; }
    if (a === "--no-design-prompt") { out.noDesignPrompt = true; continue; }

    // --flag=value form (single-value)
    if (a.startsWith("--model=")) { out.model = a.slice(8); continue; }
    if (a.startsWith("--out=")) { out.out = a.slice(6); continue; }
    if (a.startsWith("--screenshot=")) { out.screenshot.push(a.slice(13)); continue; }
    if (a.startsWith("--include=")) { out.include.push(a.slice(10)); continue; }
    if (a.startsWith("--exclude=")) { out.exclude.push(a.slice(10)); continue; }

    // --flag value form
    if (a === "--model") { out.model = takeValue("--model", a, argv, i); i++; continue; }
    if (a === "--out") { out.out = takeValue("--out", a, argv, i); i++; continue; }
    if (a === "--screenshot") { out.screenshot.push(takeValue("--screenshot", a, argv, i)); i++; continue; }
    if (a === "--include") { out.include.push(takeValue("--include", a, argv, i)); i++; continue; }
    if (a === "--exclude") { out.exclude.push(takeValue("--exclude", a, argv, i)); i++; continue; }

    // Reject unknown long flags rather than silently treating them as focus text.
    if (a.startsWith("--")) {
      const known = new Set([
        ...BOOL_FLAGS, ...SINGLE_VALUE_FLAGS, ...REPEATABLE_VALUE_FLAGS,
      ]);
      const head = a.includes("=") ? a.slice(0, a.indexOf("=")) : a;
      if (!known.has(head)) {
        throw new Error(`unknown flag: ${a}`);
      }
    }

    out.focus.push(a);
  }
  return out;
}
