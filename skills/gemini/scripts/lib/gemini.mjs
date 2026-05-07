// Gemini CLI wrapper. Headless `gemini -p` invocation with multimodal
// support via @<path> references for screenshot attachments.

import { spawnSync } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const RATE_LIMIT_BACKOFF_MS = 2_000;

function buildPromptWithImages(prompt, images) {
  if (!images || !images.length) return prompt;
  const refs = images
    .map((img) => `@${img.absolute}`)
    .join("\n");
  return [
    prompt.trimEnd(),
    "",
    "## Attached files",
    "(each `@path` is loaded as input by the Gemini CLI — images are read multimodally; text files are inlined)",
    "",
    refs,
    "",
  ].join("\n");
}

function stripAnsi(s) {
  // Strip CSI escape sequences so error messages are readable in the terminal.
  return typeof s === "string"
    ? s.replace(/\x1B\[[0-9;?]*[ -\/]*[@-~]/g, "")
    : s;
}

// Returns one of: "rate-limit", "model-unavailable", null.
// Matches common shapes produced by the Gemini CLI / API:
//   - HTTP 429 / "RESOURCE_EXHAUSTED" / "rate limit"
//   - HTTP 404 / "NOT_FOUND" / "model_not_found" / "is not found"
//   - "model X is not available" / "is unavailable"
function classifyTransientError(message) {
  if (!message) return null;
  const m = message.toLowerCase();
  if (m.includes("429") || m.includes("resource_exhausted") || m.includes("rate limit") || m.includes("too many requests")) {
    return "rate-limit";
  }
  if (m.includes("model_not_found")
    || m.includes("not_found")
    || /\b404\b/.test(m)
    || (m.includes("model") && (m.includes("not found") || m.includes("not available") || m.includes("unavailable") || m.includes("does not exist")))
  ) {
    return "model-unavailable";
  }
  return null;
}

function attemptGemini(finalPrompt, model, json, timeoutMs, approvalMode) {
  const args = [
    "-p", finalPrompt,
    "-m", model,
    "--approval-mode", approvalMode,
    "-o", json ? "json" : "text",
  ];
  const r = spawnSync("gemini", args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: timeoutMs,
  });
  if (r.error && r.error.code === "ETIMEDOUT") {
    throw new Error(`gemini call exceeded timeout of ${Math.round(timeoutMs / 1000)}s`);
  }
  if (r.signal === "SIGTERM") {
    throw new Error(`gemini call timed out (signal SIGTERM)`);
  }
  if (r.status !== 0) {
    const errorMsg = stripAnsi(r.stderr) || `gemini exited with status ${r.status}`;
    throw new Error(errorMsg);
  }
  return r.stdout;
}

export function runGemini(prompt, {
  model = "gemini-3.1-pro-preview",
  json = false,
  images = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  approvalMode = "plan",
} = {}) {
  const finalPrompt = buildPromptWithImages(prompt, images);
  const modelChain = [model, "gemini-3.1-pro-preview", "gemini-3-pro-preview", "gemini-2.5-pro"];
  const uniqueModels = [...new Set(modelChain)];

  let lastError;
  for (const m of uniqueModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return attemptGemini(finalPrompt, m, json, timeoutMs, approvalMode);
      } catch (e) {
        lastError = e;
        const kind = classifyTransientError(e.message);
        if (kind === "rate-limit" && attempt === 0) {
          process.stderr.write(`warning: model ${m} rate-limited, backing off ${RATE_LIMIT_BACKOFF_MS}ms before retry...\n`);
          // synchronous sleep; we are inside spawnSync flow already.
          spawnSync(process.execPath, ["-e", `setTimeout(()=>{}, ${RATE_LIMIT_BACKOFF_MS})`], { timeout: RATE_LIMIT_BACKOFF_MS + 500 });
          continue;
        }
        if (kind) {
          process.stderr.write(`warning: model ${m} unavailable or rate-limited (${kind}), trying next...\n`);
          break;
        }
        throw e;
      }
    }
  }
  throw new Error(`All preferred models failed. Last error: ${lastError ? lastError.message : "(unknown)"}`);
}
