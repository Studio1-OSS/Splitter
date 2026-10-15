// Small, dependency-free helpers for the benchmark: live model prices from Nebius Token Factory and
// Wilson score intervals for the reported rates.
import type { NebiusConfig } from "../src/server/ai/nebius.ts";

export type ModelInfo = {
  id: string;
  /** USD per 1M tokens. */
  pricePromptPerM: number;
  priceCompletionPerM: number;
  priceSource: string;
  contextLength: number | null;
  modality: string | null;
  quantization: string | null;
};

/**
 * Reads the model's live price and card from `GET /v1/models?verbose=true`. Prices there are USD per token
 * (strings). PRICE_IN_PER_M / PRICE_OUT_PER_M override them, e.g. for a negotiated rate.
 */
export async function fetchModelInfo(cfg: Pick<NebiusConfig, "apiKey" | "baseURL" | "model">): Promise<ModelInfo> {
  const res = await fetch(`${cfg.baseURL.replace(/\/?$/, "/")}models?verbose=true`, { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
  if (!res.ok) throw new Error(`models list returned ${res.status}`);
  const body = (await res.json()) as { data?: Record<string, unknown>[] };
  const m = body.data?.find((x) => x.id === cfg.model) as
    | { id: string; pricing?: { prompt?: string; completion?: string }; context_length?: number; architecture?: { modality?: string }; quantization?: string }
    | undefined;
  if (!m) throw new Error(`${cfg.model} is not in the models list`);
  const envIn = Number(process.env.PRICE_IN_PER_M);
  const envOut = Number(process.env.PRICE_OUT_PER_M);
  const overridden = Number.isFinite(envIn) && Number.isFinite(envOut) && process.env.PRICE_IN_PER_M && process.env.PRICE_OUT_PER_M;
  return {
    id: m.id,
    pricePromptPerM: overridden ? envIn : perM(m.pricing?.prompt),
    priceCompletionPerM: overridden ? envOut : perM(m.pricing?.completion),
    priceSource: overridden ? "PRICE_IN_PER_M / PRICE_OUT_PER_M" : `GET /v1/models?verbose=true on ${new Date().toISOString().slice(0, 10)}`,
    contextLength: m.context_length ?? null,
    modality: m.architecture?.modality ?? null,
    quantization: m.quantization ?? null,
  };
}

/** USD per token (string) → USD per 1M tokens, without float noise like 0.8999999. */
const perM = (perToken: string | undefined) => Number((Number(perToken ?? 0) * 1e6).toPrecision(8));

/** USD cost of a call or run. */
export const costOf = (info: Pick<ModelInfo, "pricePromptPerM" | "priceCompletionPerM">, tokensIn: number, tokensOut: number) =>
  (tokensIn * info.pricePromptPerM + tokensOut * info.priceCompletionPerM) / 1e6;

/** Wilson score interval for k successes out of n (95% by default). Honest at small n and near 0% / 100%. */
export function wilson(k: number, n: number, z = 1.96) {
  if (n === 0) return { lo: 0, hi: 0 };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}
