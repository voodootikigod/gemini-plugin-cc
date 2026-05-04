// Gemini CLI wrapper. Headless `gemini -p` invocation with multimodal
// support via @<path> references for screenshot attachments.

import { spawnSync } from "node:child_process";

function buildPromptWithImages(prompt, images) {
  if (!images || !images.length) return prompt;
  const refs = images
    .map((img) => `@${img.absolute}`)
    .join("\n");
  return [
    prompt.trimEnd(),
    "",
    "## Attached screenshots",
    "(each `@path` is loaded as a multimodal image input by the Gemini CLI)",
    "",
    refs,
    "",
  ].join("\n");
}

function attemptGemini(finalPrompt, model, json) {
  const args = [
    "-p", finalPrompt,
    "-m", model,
    "--approval-mode", "plan",
    "-o", json ? "json" : "text",
  ];
  const r = spawnSync("gemini", args, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  if (r.status !== 0) {
    const errorMsg = r.stderr || `gemini exited with status ${r.status}`;
    throw new Error(errorMsg);
  }
  return r.stdout;
}

export function runGemini(prompt, { model = "gemini-3.1-pro-preview", json = false, images = [] } = {}) {
  const finalPrompt = buildPromptWithImages(prompt, images);
  const modelChain = [model, "gemini-3.1-pro-preview", "gemini-3-pro-preview", "gemini-2.5-pro"];
  const uniqueModels = [...new Set(modelChain)];

  for (const m of uniqueModels) {
    try {
      return attemptGemini(finalPrompt, m, json);
    } catch (e) {
      if (e.message.includes("429") || e.message.includes("not found")) {
        process.stderr.write(`warning: model ${m} unavailable or rate-limited, trying next...\n`);
        continue;
      }
      throw e;
    }
  }
  throw new Error("All preferred models are unavailable.");
}
