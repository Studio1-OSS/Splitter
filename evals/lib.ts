import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ExtractedReceipt } from "../src/server/ai/receipt";

export const config = {
  apiKey: process.env.NEBIUS_API_KEY ?? "",
  baseURL: process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/",
  model: process.env.NEBIUS_MODEL || "Qwen/Qwen3.8-27B",
};

const FIXTURES = path.join(import.meta.dirname, "fixtures");

/** Loads a fixture as base64 data URLs. PDFs use their pre-rendered page PNGs (pdf.js is browser-only). */
export async function fixtureImages(file: string): Promise<string[]> {
  const files = file.endsWith(".pdf")
    ? [file.replace(/\.pdf$/, "-page-1.png"), file.replace(/\.pdf$/, "-page-2.png")]
    : [file];
  return Promise.all(files.map(async (f) => `data:image/png;base64,${(await readFile(path.join(FIXTURES, f))).toString("base64")}`));
}

export const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const close = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? a == null && b == null : Math.abs(a - b) <= 0.01;
export function similar(a: string | null | undefined, b: string | null | undefined) {
  const x = norm(a);
  const y = norm(b);
  if (!x && !y) return true;
  return x === y || (x.length > 2 && y.length > 2 && (x.includes(y) || y.includes(x)));
}

/** A receipt in the shape the planner receives, with sensible empty defaults. */
export const bill = (o: Partial<ExtractedReceipt>): ExtractedReceipt => ({
  kind: "receipt",
  merchant: null,
  category: null,
  date: null,
  currency: "INR",
  items: [],
  subtotal: null,
  tax: null,
  tip: null,
  suggestedTips: [],
  serviceCharge: null,
  discount: null,
  total: null,
  paidByHint: null,
  ...o,
});
