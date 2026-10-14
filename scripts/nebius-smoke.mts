// Checks that your Nebius key + model support what the app needs:
// base64 image input, structured JSON output and thinking disabled.
//
//   pnpm smoke:nebius                       # uses evals/fixtures/receipt-beach-shack.png
//   pnpm smoke:nebius ./path/to/receipt.jpg # uses your own image
import "dotenv/config";
import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import { cleanModelJson, extractReceiptWithNebius } from "../src/server/ai/nebius.ts";
import { reconcileReceipt } from "../src/server/ai/receipt.ts";

const SAMPLE = new URL("../evals/fixtures/receipt-beach-shack.png", import.meta.url);

const apiKey = process.env.NEBIUS_API_KEY;
if (!apiKey) {
  console.error("✗ NEBIUS_API_KEY is not set. Add it to .env first.");
  process.exit(1);
}
const config = {
  apiKey,
  baseURL: process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/",
  model: process.env.NEBIUS_MODEL || "Qwen/Qwen3.8-27B",
};
console.log(`Model ${config.model} at ${config.baseURL}`);

async function loadImage(arg?: string) {
  if (arg) {
    const type = arg.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    return `data:${type};base64,${(await readFile(arg)).toString("base64")}`;
  }
  return `data:image/png;base64,${(await readFile(SAMPLE)).toString("base64")}`;
}

const image = await loadImage(process.argv[2]);
const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });

// 1. Raw call: is thinking actually off, and does the model see the image?
const raw = await client.chat.completions.create({
  model: config.model,
  max_tokens: 200,
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What is the business name on this receipt? Reply with the name only." },
        { type: "image_url", image_url: { url: image } },
      ],
    },
  ],
  // @ts-expect-error provider-specific extension
  chat_template_kwargs: { enable_thinking: false },
});
const msg = raw.choices[0]?.message as { content?: string; reasoning_content?: string };
const thinking = Boolean(msg?.reasoning_content) || /<think>/i.test(msg?.content ?? "");
console.log(`${thinking ? "⚠" : "✓"} thinking disabled: ${!thinking}`);
console.log(`✓ base64 image accepted, model says: ${cleanModelJson(msg?.content ?? "").slice(0, 80)}`);

// 2. The exact production path: structured extraction + reconciliation.
const started = Date.now();
const receipt = await extractReceiptWithNebius(config, [image]);
console.log(`✓ structured extraction in ${Date.now() - started}ms (category: ${receipt.category ?? "none"})`);
console.log(JSON.stringify(receipt, null, 2));
const issues = reconcileReceipt(receipt);
console.log(issues.length ? `Reconciliation notes:\n- ${issues.map((i) => i.message).join("\n- ")}` : "✓ totals reconcile");
console.log(`Tokens: ${JSON.stringify(raw.usage)}`);
