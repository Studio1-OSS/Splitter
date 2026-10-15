// Bill → verified split, in three steps, with Splitter's own code:
//   1. SEE     the vision model reads the bill image into structured JSON (receipt schema);
//   2. REASON  it decides who had which line from a plain-English note;
//   3. CALCULATE + CHECK  it calls calculator tools for the maths. Its own allocate_tax_tip result is the split.
// The app then applies one validation rule: the model's shares must add up to what the bill's lines and charges
// come to. It never computes the split for the model; a missing tool call is a failure.
//
//   pnpm bench:agent benchmark/dataset/food-03.png "Aman had the …, everyone shared the …" Aman,Priya,Rakesh
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { chatWithTools, extractReceiptWithNebius, type NebiusConfig } from "../src/server/ai/nebius.ts";
import type { ExtractedReceipt } from "../src/server/ai/receipt.ts";
import { createTools, toolDefinitions, type ToolCall } from "../src/server/ai/tools.ts";

export const config: NebiusConfig = {
  apiKey: process.env.NEBIUS_API_KEY ?? "",
  baseURL: process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.us-north1.nebius.com/v1/",
  model: process.env.NEBIUS_MODEL || "nvidia/Nemotron-3.5-Super-VL",
};

const decisionSchema = z.object({
  lines: z.array(z.object({ line: z.number().int(), members: z.array(z.string()) })).describe("Who had each bill line"),
  receiptIssues: z.array(z.string()).describe("Problems check_receipt found, in plain words; [] if none"),
  explanation: z.string(),
});
export type Decision = z.infer<typeof decisionSchema>;

export const SYSTEM = `You split one bill between friends. You get the bill lines (already read from the photo), the people (as refs m1, m2…) and a note saying who had what.
Steps:
1. Call check_receipt for bill 1. If it reports problems, list them in receiptIssues.
2. Decide who had each line from the note. "Everyone" means all people. Every line needs at least one person.
3. Call allocate_tax_tip with your line assignment. Its shares are the answer: tax, tip, fees and discount are spread by the tool.
4. Call validate_total with those shares and the total allocate_tax_tip returned, to confirm they add up.
Do every sum with the tools, never in your head. Reply with ONLY this JSON: {"lines":[{"line":1,"members":["m1"]}],"receiptIssues":[],"explanation":"..."}`;

export type Usage = { prompt: number; completion: number };
export type AgentRun = {
  receipt: ExtractedReceipt;
  decision: Decision;
  /** Shares by person name, exactly as the model's own allocate_tax_tip call returned them. null if it never made one. */
  split: Record<string, number> | null;
  /** The total the model's allocation came to. */
  splitTotal: number | null;
  /** App validation rule: the model's shares add up to the bill's lines + charges. */
  validation: { ok: boolean; reason: string };
  trace: ToolCall[];
  ms: { see: number; reason: number };
  /** Raw token usage of every model call, in order: [read the bill, ...tool-loop turns]. */
  calls: Usage[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function runAgent(image: string, people: string[], note: string, cfg: NebiusConfig = config): Promise<AgentRun> {
  const calls: Usage[] = [];
  const metered: NebiusConfig = { ...cfg, onUsage: (u) => calls.push({ prompt: u.prompt_tokens, completion: u.completion_tokens }) };

  // 1. SEE
  let t = performance.now();
  const receipt = await extractReceiptWithNebius(metered, [image]);
  const see = performance.now() - t;

  // 2 + 3. REASON and CALCULATE with tools (native function calling)
  const refs = people.map((name, i) => ({ ref: `m${i + 1}`, name }));
  const tools = createTools({ currency: receipt.currency ?? "USD", memberRefs: refs.map((r) => r.ref), bills: [{ no: 1, receipt }] });
  const trace: ToolCall[] = [];
  const user = [
    `People: ${refs.map((r) => `${r.ref}=${r.name}`).join(", ")}`,
    `Note: ${note}`,
    `Bill 1: ${receipt.merchant ?? "?"} · ${receipt.currency ?? "?"}`,
    ...receipt.items.map((it, i) => `  line ${i + 1}: ${it.name} ×${it.quantity} = ${it.totalPrice}`),
    `  subtotal ${receipt.subtotal} · tax ${receipt.tax} · tip ${receipt.tip} · service ${receipt.serviceCharge} · discount ${receipt.discount} · total ${receipt.total}`,
  ].join("\n");

  t = performance.now();
  const decision = await chatWithTools(metered, {
    system: SYSTEM,
    user,
    schema: decisionSchema,
    tools: toolDefinitions,
    runTool: (name, args) => {
      const call = tools.run(name, args, "model");
      trace.push(call);
      return call.result;
    },
    thinking: false,
    maxTokens: 4000,
  });
  const reason = performance.now() - t;

  // The answer is the model's own last successful allocation. The app does not compute one for it.
  const nameOf = new Map(refs.map((r) => [r.ref, r.name]));
  const allocation = [...trace].reverse().find((c) => c.by === "model" && c.tool === "allocate_tax_tip" && c.ok);
  const result = allocation?.result as { total: number; shares: Record<string, number> } | undefined;
  const split = result ? Object.fromEntries(Object.entries(result.shares).map(([ref, v]) => [nameOf.get(ref) ?? ref, v])) : null;

  // Validation rule: the shares must add up to the bill's own lines + charges (independent of the printed total).
  const expectedTotal = round2(
    receipt.items.reduce((a, i) => a + i.totalPrice, 0) + (receipt.tax ?? 0) + (receipt.tip ?? 0) + (receipt.serviceCharge ?? 0) - (receipt.discount ?? 0),
  );
  let validation: AgentRun["validation"];
  if (!split) validation = { ok: false, reason: "The model never called allocate_tax_tip, so there is no split to check." };
  else {
    const check = tools.run("validate_total", { total: expectedTotal, shares: Object.entries(result!.shares).map(([member, amount]) => ({ member, amount })) }, "app");
    trace.push(check);
    validation = check.ok
      ? { ok: true, reason: `Shares add up to ${expectedTotal}, what the bill's lines and charges come to.` }
      : { ok: false, reason: `Shares don't add up to ${expectedTotal}: ${JSON.stringify(check.result)}` };
  }

  return { receipt, decision, split, splitTotal: result?.total ?? null, validation, trace, ms: { see: Math.round(see), reason: Math.round(reason) }, calls };
}

// CLI
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  const [file, note, people = "Aman,Priya,Rakesh"] = process.argv.slice(2);
  if (!file || !note) {
    console.log('Usage: pnpm bench:agent <bill.png> "<who had what>" [Name1,Name2,...]');
    process.exit(1);
  }
  const image = `data:image/${file.endsWith(".png") ? "png" : "jpeg"};base64,${(await readFile(file)).toString("base64")}`;
  const run = await runAgent(image, people.split(","), note);
  const tokens = run.calls.reduce((a, c) => ({ in: a.in + c.prompt, out: a.out + c.completion }), { in: 0, out: 0 });
  console.log(`\nModel ${config.model}`);
  console.log(`\n1 · SEE (${run.ms.see}ms) — ${run.receipt.merchant} · ${run.receipt.items.length} lines · printed total ${run.receipt.total} ${run.receipt.currency}`);
  console.log(`\n2/3 · REASON + CALCULATE (${run.ms.reason}ms)`);
  for (const c of run.trace) console.log(`  ${c.ok ? "✓" : "✗"} ${c.by}:${c.tool}(${JSON.stringify(c.args)})\n      → ${JSON.stringify(c.result)}`);
  if (run.decision.receiptIssues.length) console.log(`\n⚠ Bill issues the model reported: ${run.decision.receiptIssues.join(" ")}`);
  console.log(`\nThe model's split:`, run.split ?? "none");
  console.log(`Validation: ${run.validation.ok ? "✓" : "✗"} ${run.validation.reason}`);
  console.log(`Why: ${run.decision.explanation}`);
  console.log(`Tokens: ${tokens.in} in / ${tokens.out} out across ${run.calls.length} model calls`);
}
