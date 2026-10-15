// Checks what a model on Nebius Token Factory supports before you switch Splitter to it:
// image input, strict JSON-schema output, native tool calls and the reasoning toggle.
// Then runs the real bill-reading path once.
//
//   pnpm smoke:nebius                                   # NEBIUS_MODEL from .env, sample receipt
//   pnpm smoke:nebius --model <model-id> [./receipt.jpg]
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { cleanModelJson, extractReceiptWithNebius, reasoningOptions } from "../src/server/ai/nebius.ts";
import { reconcileReceipt } from "../src/server/ai/receipt.ts";

const args = process.argv.slice(2);
const modelFlag = args.indexOf("--model");
const model = modelFlag >= 0 ? args.splice(modelFlag, 2)[1] : process.env.NEBIUS_MODEL || "nvidia/Nemotron-3.5-Super-VL";
const apiKey = process.env.NEBIUS_API_KEY;
if (!apiKey) {
  console.error("✗ NEBIUS_API_KEY is not set. Add it to .env first.");
  process.exit(1);
}
const config = { apiKey, baseURL: process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.us-north1.nebius.com/v1/", model };
const client = new OpenAI({ apiKey, baseURL: config.baseURL });
console.log(`Model ${model} at ${config.baseURL}\n`);

const file = args[0] ?? fileURLToPath(new URL("../evals/fixtures/receipt-beach-shack.png", import.meta.url));
const image = `data:${file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg"};base64,${(await readFile(file)).toString("base64")}`;
const ask = (content: OpenAI.Chat.Completions.ChatCompletionContentPart[], extra: Record<string, unknown> = {}) =>
  client.chat.completions.create({ model, max_tokens: 400, temperature: 0, messages: [{ role: "user", content }], ...reasoningOptions(false), ...extra });

const results: [string, boolean | null, string][] = [];
async function check(name: string, fn: () => Promise<[boolean, string]>) {
  const t = Date.now();
  try {
    const [ok, note] = await fn();
    results.push([name, ok, `${note} (${Date.now() - t}ms)`]);
  } catch (e) {
    results.push([name, false, e instanceof OpenAI.APIError ? `${e.status}: ${e.message.slice(0, 120)}` : String(e).slice(0, 120)]);
  }
}

await check("Image input", async () => {
  const r = await ask([{ type: "text", text: "Business name on this receipt? Name only." }, { type: "image_url", image_url: { url: image } }]);
  const text = cleanModelJson(r.choices[0]?.message?.content ?? "");
  return [text.length > 0, `"${text.slice(0, 40)}"`];
});

await check("Strict JSON schema", async () => {
  const schema = { type: "object", properties: { total: { type: "number" } }, required: ["total"], additionalProperties: false };
  const r = await ask([{ type: "text", text: "Return the grand total of this receipt as JSON." }, { type: "image_url", image_url: { url: image } }], {
    response_format: { type: "json_schema", json_schema: { name: "t", schema, strict: true } },
  });
  const parsed = JSON.parse(cleanModelJson(r.choices[0]?.message?.content ?? "{}"));
  return [typeof parsed.total === "number", `total ${parsed.total}`];
});

await check("Native tool calls", async () => {
  const r = await ask([{ type: "text", text: "Split 100 equally between m1 and m2 using the tool." }], {
    tools: [
      {
        type: "function",
        function: {
          name: "calculate_split",
          description: "Splits an amount equally",
          parameters: { type: "object", properties: { amount: { type: "number" }, members: { type: "array", items: { type: "string" } } }, required: ["amount", "members"] },
        },
      },
    ],
    tool_choice: "auto",
  });
  const call = r.choices[0]?.message?.tool_calls?.[0];
  return [Boolean(call), call && call.type === "function" ? `${call.function.name}(${call.function.arguments})` : "answered without calling the tool"];
});

await check("Reasoning toggle", async () => {
  if (!Object.keys(reasoningOptions(true)).length) return [true, "AI_REASONING_PARAM=none (not sent)"];
  const r = await ask([{ type: "text", text: "What is 17 × 23? Number only." }], reasoningOptions(true));
  const m = r.choices[0]?.message as { content?: string; reasoning_content?: string; reasoning?: string };
  const reasoned = Boolean(m.reasoning_content || m.reasoning || /<think>/i.test(m.content ?? ""));
  return [true, reasoned ? "accepted, reasoning returned" : "accepted, no visible reasoning"];
});

await check("Bill reading (app path)", async () => {
  const receipt = await extractReceiptWithNebius(config, [image]);
  const issues = reconcileReceipt(receipt);
  return [receipt.items.length > 0, `${receipt.merchant} · ${receipt.items.length} lines · total ${receipt.total}${issues.length ? ` · ${issues.length} notes` : ""}`];
});

const width = Math.max(...results.map((r) => r[0].length));
for (const [name, ok, note] of results) console.log(`${ok ? "✓" : "✗"} ${name.padEnd(width)}  ${note}`);
const tools = results.find((r) => r[0] === "Native tool calls")?.[1];
console.log(`\nSettle with AI will use ${tools ? "native tool calls" : "app-run tools (the route doesn't support function calling)"}.`);
