// Stage 1: how accurately Qwen3.8 reads each sample bill. Run with `pnpm eval`.
import { evalite } from "evalite";
import { extractReceiptWithNebius } from "../src/server/ai/nebius";
import type { ExtractedReceipt } from "../src/server/ai/receipt";
import { receiptFixtures } from "./fixtures/expected";
import { close, config, fixtureImages, similar } from "./lib";

type Expected = (typeof receiptFixtures)[number]["expected"];

function score(out: ExtractedReceipt, exp: Expected): number {
  if (exp.kind === "not_a_bill") return out.kind === "not_a_bill" ? 1 : 0;
  const checks = [
    out.kind === exp.kind,
    similar(out.merchant, exp.merchant),
    out.category === exp.category,
    (out.currency ?? null) === exp.currency,
    out.date === exp.date,
    close(out.tax, exp.tax),
    close(out.total, exp.total),
  ];
  if (exp.items.length) {
    checks.push(out.items.length === exp.items.length);
    for (const item of exp.items) {
      const match = out.items.find((i) => similar(i.name, item.name) || close(i.totalPrice, item.totalPrice));
      checks.push(Boolean(match && close(match.totalPrice, item.totalPrice)));
    }
  }
  return checks.filter(Boolean).length / checks.length;
}

evalite<string, ExtractedReceipt, Expected>(`Bill reading · ${config.model}`, {
  data: async () => receiptFixtures.map((f) => ({ input: f.file, expected: f.expected })),
  task: async (file) => extractReceiptWithNebius(config, await fixtureImages(file)),
  scorers: [{ name: "Field accuracy", scorer: ({ output, expected }) => (expected ? score(output, expected) : 0) }],
});
