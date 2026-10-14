// Nebius Token Factory adapter. Every Nebius/Qwen-specific option lives in this file,
// so swapping to another OpenAI-compatible provider means editing only here.
import OpenAI from "openai";
import type { z } from "zod";
import { RECEIPT_SYSTEM_PROMPT, receiptJsonSchema, receiptSchema, type ExtractedReceipt } from "./receipt";

export type NebiusConfig = { apiKey: string; baseURL: string; model: string };

export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly kind: "provider" | "invalid_output" | "truncated" | "refused",
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

let cached: { key: string; client: OpenAI } | undefined;
function getClient({ apiKey, baseURL }: NebiusConfig) {
  const key = `${baseURL}|${apiKey}`;
  if (cached?.key !== key) {
    cached = { key, client: new OpenAI({ apiKey, baseURL, maxRetries: 2, timeout: 180_000 }) };
  }
  return cached.client;
}

/** Strips reasoning blocks and markdown fences that some deployments still emit. */
export function cleanModelJson(raw: string): string {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  // An unterminated think block (thinking cut short) — drop everything before the first "{".
  if (/<think>/i.test(text)) text = text.slice(text.indexOf("{"));
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

type Content = OpenAI.Chat.Completions.ChatCompletionContentPart[];

const imageParts = (images: string[]): Content =>
  images.map((url) => ({ type: "image_url", image_url: { url } }));

/**
 * One structured call: tries strict JSON-schema output, falls back to JSON mode (schema in the prompt)
 * and validates with zod either way. `thinking` toggles Qwen3.8's reasoning via the vLLM chat template.
 */
export async function chatJSON<T>(
  config: NebiusConfig,
  opts: {
    system: string;
    content: Content;
    schema: z.ZodType<T>;
    jsonSchema: Record<string, unknown>;
    name: string;
    thinking?: boolean;
    maxTokens?: number;
    temperature?: number;
    /** Shown when the model runs out of output tokens. */
    truncatedMessage?: string;
  },
): Promise<T> {
  const client = getClient(config);
  let lastError: unknown;

  for (const mode of ["json_schema", "json_object"] as const) {
    let completion;
    try {
      completion = await client.chat.completions.create({
        model: config.model,
        temperature: opts.temperature ?? (opts.thinking ? 0.6 : 0),
        max_tokens: opts.maxTokens ?? 4096,
        response_format:
          mode === "json_schema"
            ? { type: "json_schema", json_schema: { name: opts.name, schema: opts.jsonSchema, strict: true } }
            : { type: "json_object" },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.content },
        ],
        // @ts-expect-error provider-specific extension, passed through to the vLLM chat template
        chat_template_kwargs: { enable_thinking: Boolean(opts.thinking) },
      });
    } catch (error) {
      lastError = error;
      // A 400 usually means this response_format is unsupported: try the next mode.
      if (error instanceof OpenAI.APIError && error.status === 400 && mode === "json_schema") continue;
      throw new ExtractionError(
        error instanceof OpenAI.APIError
          ? `The AI service returned ${error.status ?? "an error"}: ${error.message}`
          : "Could not reach the AI service",
        "provider",
      );
    }

    const choice = completion.choices[0];
    const message = choice?.message as { content?: string | null; refusal?: string | null } | undefined;
    if (message?.refusal) throw new ExtractionError(message.refusal, "refused");
    if (choice?.finish_reason === "length") {
      throw new ExtractionError(opts.truncatedMessage ?? "That was too much to read in one go. Try fewer or closer photos.", "truncated");
    }
    try {
      return opts.schema.parse(JSON.parse(cleanModelJson(message?.content ?? "")));
    } catch (error) {
      lastError = error;
    }
  }
  console.error(`AI call "${opts.name}" produced invalid output`, lastError);
  throw new ExtractionError("The AI response couldn't be understood. Please try again.", "invalid_output");
}

/** Plain-text answer (used by Ask Splitter). */
export async function chatText(
  config: NebiusConfig,
  opts: { system: string; user: string; thinking?: boolean; maxTokens?: number },
): Promise<string> {
  try {
    const completion = await getClient(config).chat.completions.create({
      model: config.model,
      temperature: opts.thinking ? 0.6 : 0.3,
      max_tokens: opts.maxTokens ?? 1500,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      // @ts-expect-error provider-specific extension
      chat_template_kwargs: { enable_thinking: Boolean(opts.thinking) },
    });
    const choice = completion.choices[0];
    // A cut-off answer is worse than none: the caller retries without thinking.
    if (choice?.finish_reason === "length") return "";
    return (choice?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  } catch (error) {
    throw new ExtractionError(
      error instanceof OpenAI.APIError ? `The AI service returned ${error.status ?? "an error"}` : "Could not reach the AI service",
      "provider",
    );
  }
}

/** Reads one bill. Pass several images when they are pages of the same bill. */
export async function extractReceiptWithNebius(config: NebiusConfig, images: string | string[]): Promise<ExtractedReceipt> {
  const pages = Array.isArray(images) ? images : [images];
  try {
    return await chatJSON(config, {
      system: RECEIPT_SYSTEM_PROMPT,
      name: "receipt",
      schema: receiptSchema,
      jsonSchema: receiptJsonSchema as Record<string, unknown>,
      content: [
        {
          type: "text",
          text: pages.length > 1 ? `These ${pages.length} images are pages of ONE bill, in order. Extract it once.` : "Extract this bill.",
        },
        ...imageParts(pages),
      ],
    });
  } catch (e) {
    if (e instanceof ExtractionError && e.kind === "invalid_output")
      throw new ExtractionError("The bill could not be read. Try a sharper, well-lit photo.", "invalid_output");
    throw e;
  }
}

export { imageParts };
