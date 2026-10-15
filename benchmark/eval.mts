// Runs the bill agent over the 150-bill synthetic set with real model calls and writes benchmark/results.json
// (+ results.md). Methodology: benchmark/METHODOLOGY.md.
//
//   pnpm bench:eval                         # all 150 bills
//   pnpm bench:eval --limit 10 --concurrency 2
//   pnpm bench:eval --category food
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { computeSplit } from "../src/lib/money/allocate.ts";
import { fromMinor, toMinor } from "../src/lib/money/format.ts";
import { RECEIPT_SYSTEM_PROMPT } from "../src/server/ai/receipt.ts";
import { toolDefinitions } from "../src/server/ai/tools.ts";
import { config, runAgent, SYSTEM, type AgentRun } from "./receipt-agent.mts";
import { costOf, fetchModelInfo, wilson, type ModelInfo } from "./stats.mts";

const DIR = path.dirname(fileURLToPath(import.meta.url));
export type Case = {
  id: string;
  file: string;
  category: string;
  layout: string;
  condition: string;
  currency: string;
  people: string[];
  note: string;
  planted: boolean;
  truth: {
    merchant: string;
    currency: string;
    items: { name: string; quantity: number; totalPrice: number }[];
    tax: number | null;
    serviceCharge: number | null;
    tip: number | null;
    discount: number | null;
    total: number;
    correctTotal: number;
    assignment: string[][];
  };
};

const flag = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** The split a careful person would produce from the true lines, computed by the same money engine. */
export function expectedSplit(c: Case): Record<string, number> {
  const t = c.truth;
  const m = (n: number | null) => toMinor(n ?? 0, t.currency);
  const res = computeSplit({
    memberIds: c.people,
    // Same rule as the tool: within a line, a left-over cent goes by group order.
    items: t.items.map((it, i) => ({ id: String(i), amount: m(it.totalPrice), assignees: [...t.assignment[i]].sort((x, y) => c.people.indexOf(x) - c.people.indexOf(y)).map((p) => ({ memberId: p, weight: 1 })) })),
    tax: m(t.tax),
    tip: m(t.tip),
    serviceCharge: m(t.serviceCharge),
    discount: m(t.discount),
  });
  return Object.fromEntries(res.shares.map((s) => [s.memberId, fromMinor(s.total, t.currency)]));
}

const eq = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null && Math.abs(a - b) < 0.005;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export type Row = {
  id: string;
  category: string;
  layout: string;
  condition: string;
  currency: string;
  people: number;
  planted: boolean;
  ok: boolean;
  error?: string;
  retries: number;
  linesTotal: number;
  /** True lines whose price was read exactly (order-insensitive match). */
  linesPriced: number;
  /** ...and whose name also matched. */
  linesNamed: number;
  lineCountRight: boolean;
  totalRead: boolean;
  taxRead: boolean;
  /** Every line, the tax, tip, service charge, discount and printed total were read exactly. */
  extractionCorrect: boolean;
  /** The model computed the split itself with allocate_tax_tip. */
  modelComputed: boolean;
  splitCorrect: boolean;
  validationOk: boolean;
  /** Model reported a problem with the bill (and check_receipt failed). On a correct bill this is either a real
   *  false alarm (the bill was read correctly) or the check catching the model's own misread. */
  flagged: boolean;
  modelCalls: Record<string, number>;
  ms: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  // Saved for inspection in the dashboard.
  extracted?: {
    merchant: string | null;
    total: number | null;
    tax: number | null;
    tip: number | null;
    serviceCharge: number | null;
    discount: number | null;
    items: { name: string; totalPrice: number }[];
  };
  modelSplit?: Record<string, number> | null;
  expected?: Record<string, number>;
  issues?: string[];
  explanation?: string;
  trace?: AgentRun["trace"];
  calls?: AgentRun["calls"];
};

/** Lines matched order-insensitively by price; a name match is counted separately. */
function matchLines(truth: Case["truth"]["items"], read: { name: string; totalPrice: number }[]) {
  const left = [...read];
  let priced = 0,
    named = 0;
  for (const t of truth) {
    const i = left.findIndex((r) => eq(r.totalPrice, t.totalPrice));
    if (i < 0) continue;
    priced++;
    const a = norm(left[i].name),
      b = norm(t.name);
    if (a === b || (a.length > 3 && b.length > 3 && (a.includes(b) || b.includes(a)))) named++;
    left.splice(i, 1);
  }
  return { priced, named };
}

const transient = (e: unknown) =>
  e instanceof OpenAI.APIConnectionError || e instanceof OpenAI.APIConnectionTimeoutError || (e instanceof OpenAI.APIError && (e.status === 429 || (e.status ?? 0) >= 500)) ||
  /timed? ?out|ECONNRESET|socket/i.test(String((e as Error)?.message));

export async function score(c: Case, info: ModelInfo | null): Promise<Row> {
  const image = `data:image/png;base64,${(await readFile(path.join(DIR, "dataset", c.file))).toString("base64")}`;
  const base = { id: c.id, category: c.category, layout: c.layout, condition: c.condition, currency: c.currency, people: c.people.length, planted: c.planted, linesTotal: c.truth.items.length };
  const started = performance.now();
  let retries = 0;
  for (;;) {
    try {
      const run = await runAgent(image, c.people, c.note);
      const r = run.receipt;
      const { priced, named } = matchLines(c.truth.items, r.items);
      const expected = expectedSplit(c);
      const modelCalls: Record<string, number> = {};
      for (const t of run.trace) if (t.by === "model") modelCalls[t.tool] = (modelCalls[t.tool] ?? 0) + 1;
      const tokensIn = run.calls.reduce((a, x) => a + x.prompt, 0);
      const tokensOut = run.calls.reduce((a, x) => a + x.completion, 0);
      const receiptCheckFailed = run.trace.some((t) => t.tool === "check_receipt" && !t.ok);
      const charge = (read: number | null, truth: number | null) => (truth == null ? read == null || read === 0 : eq(read, truth));
      const taxRead = charge(r.tax, c.truth.tax);
      const extractionCorrect =
        priced === c.truth.items.length &&
        r.items.length === c.truth.items.length &&
        eq(r.total, c.truth.total) &&
        taxRead &&
        charge(r.tip, c.truth.tip) &&
        charge(r.serviceCharge, c.truth.serviceCharge) &&
        charge(r.discount, c.truth.discount);
      return {
        ...base,
        ok: true,
        retries,
        linesPriced: priced,
        linesNamed: named,
        lineCountRight: r.items.length === c.truth.items.length,
        totalRead: eq(r.total, c.truth.total),
        taxRead,
        extractionCorrect,
        modelComputed: run.split != null,
        splitCorrect: run.split != null && c.people.every((p) => eq(run.split![p] ?? 0, expected[p] ?? 0)),
        validationOk: run.validation.ok,
        flagged: receiptCheckFailed && run.decision.receiptIssues.length > 0,
        modelCalls,
        ms: run.ms.see + run.ms.reason,
        tokensIn,
        tokensOut,
        costUsd: info ? costOf(info, tokensIn, tokensOut) : null,
        extracted: { merchant: r.merchant, total: r.total, tax: r.tax, tip: r.tip, serviceCharge: r.serviceCharge, discount: r.discount, items: r.items.map((i) => ({ name: i.name, totalPrice: i.totalPrice })) },
        modelSplit: run.split,
        expected,
        issues: run.decision.receiptIssues,
        explanation: run.decision.explanation,
        trace: run.trace,
        calls: run.calls,
      };
    } catch (e) {
      if (transient(e) && retries < 3) {
        retries++;
        await new Promise((res) => setTimeout(res, 2000 * retries));
        continue;
      }
      const empty = { linesPriced: 0, linesNamed: 0, lineCountRight: false, totalRead: false, taxRead: false, extractionCorrect: false, modelComputed: false, splitCorrect: false, validationOk: false, flagged: false };
      return { ...base, ...empty, ok: false, error: String((e as Error).message).slice(0, 200), retries, modelCalls: {}, ms: Math.round(performance.now() - started), tokensIn: 0, tokensOut: 0, costUsd: null };
    }
  }
}

/** A short, stable fingerprint of everything that affects results, so runs are only compared like for like. */
export function settingsHash() {
  const h = createHash("sha256");
  h.update(JSON.stringify({ model: config.model, baseURL: config.baseURL, reasoning: process.env.AI_REASONING_PARAM ?? "chat_template_kwargs", system: SYSTEM, read: RECEIPT_SYSTEM_PROMPT, tools: toolDefinitions }));
  return h.digest("hex").slice(0, 12);
}

export function summarise(rows: Row[], info: ModelInfo | null) {
  const done = rows.filter((r) => r.ok);
  const rate = (k: number, n: number) => ({ k, n, ...wilson(k, n) });
  const block = (rs: Row[]) => {
    const fine = rs.filter((r) => r.ok);
    const clean = rs.filter((r) => !r.planted);
    const planted = rs.filter((r) => r.planted);
    const lines = rs.reduce((a, r) => a + r.linesTotal, 0);
    return {
      bills: rs.length,
      completed: rate(fine.length, rs.length),
      linesPriced: rate(rs.reduce((a, r) => a + r.linesPriced, 0), lines),
      linesNamed: rate(rs.reduce((a, r) => a + r.linesNamed, 0), lines),
      totalRead: rate(rs.filter((r) => r.totalRead).length, rs.length),
      taxRead: rate(rs.filter((r) => r.taxRead).length, rs.length),
      modelComputed: rate(rs.filter((r) => r.modelComputed).length, rs.length),
      splitCorrect: rate(rs.filter((r) => r.splitCorrect).length, rs.length),
      splitCorrectClean: rate(clean.filter((r) => r.splitCorrect).length, clean.length),
      validationOk: rate(rs.filter((r) => r.validationOk).length, rs.length),
      extractionCorrect: rate(rs.filter((r) => r.extractionCorrect).length, rs.length),
      // Reasoning on its own: was the split right when the bill had been read right?
      splitCorrectGivenRead: rate(rs.filter((r) => r.extractionCorrect && r.splitCorrect).length, rs.filter((r) => r.extractionCorrect).length),
      plantedCaught: rate(planted.filter((r) => r.flagged).length, planted.length),
      // A flag on a correct bill that was also read correctly: a true false alarm.
      falseAlarms: rate(clean.filter((r) => r.flagged && r.extractionCorrect).length, clean.filter((r) => r.extractionCorrect).length),
      // Misreads on correct bills: did check_receipt make the model notice them?
      misreadsFlagged: rate(clean.filter((r) => r.ok && !r.extractionCorrect && r.flagged).length, clean.filter((r) => r.ok && !r.extractionCorrect).length),
    };
  };
  const times = done.map((r) => r.ms).sort((a, b) => a - b);
  const pctl = (p: number) => (times.length ? times[Math.min(times.length - 1, Math.floor(p * times.length))] : 0);
  const tokensIn = done.reduce((a, r) => a + r.tokensIn, 0);
  const tokensOut = done.reduce((a, r) => a + r.tokensOut, 0);
  const cost = info ? costOf(info, tokensIn, tokensOut) : null;
  const by = (key: "category" | "layout" | "condition" | "currency") =>
    Object.fromEntries([...new Set(rows.map((r) => r[key]))].sort().map((v) => [v, block(rows.filter((r) => r[key] === v))]));
  return {
    overall: block(rows),
    byCategory: by("category"),
    byLayout: by("layout"),
    byCondition: by("condition"),
    byCurrency: by("currency"),
    latencyMs: { p50: pctl(0.5), p95: pctl(0.95), mean: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0 },
    tokens: { in: tokensIn, out: tokensOut, perBillIn: done.length ? Math.round(tokensIn / done.length) : 0, perBillOut: done.length ? Math.round(tokensOut / done.length) : 0 },
    costUsd: cost == null ? null : { total: cost, perBill: done.length ? cost / done.length : 0, per1000Bills: done.length ? (cost / done.length) * 1000 : 0 },
    retries: rows.reduce((a, r) => a + r.retries, 0),
  };
}

const pct = (x: { k: number; n: number; lo: number; hi: number }) =>
  x.n ? `${((100 * x.k) / x.n).toFixed(1)}% (${x.k}/${x.n}, 95% CI ${(100 * x.lo).toFixed(0)}–${(100 * x.hi).toFixed(0)}%)` : "n/a";

function markdown(meta: Awaited<ReturnType<typeof buildMeta>>, s: ReturnType<typeof summarise>) {
  const o = s.overall;
  const cats = Object.entries(s.byCategory);
  return `# Results · ${meta.model}

${meta.date} · ${meta.bills} synthetic bills · endpoint \`${meta.baseURL}\` · settings \`${meta.settings}\`
Application-level evaluation on synthetic data, not an official benchmark. Method: [METHODOLOGY.md](METHODOLOGY.md).

| Metric | Result |
|---|---|
| Runs completed | ${pct(o.completed)} |
| Line prices read exactly | ${pct(o.linesPriced)} |
| Line names + prices read | ${pct(o.linesNamed)} |
| Printed total read | ${pct(o.totalRead)} |
| Tax read | ${pct(o.taxRead)} |
| Split computed by the model (tool call) | ${pct(o.modelComputed)} |
| Model's split correct to the cent (all bills) | ${pct(o.splitCorrect)} |
| … on bills without a planted error | ${pct(o.splitCorrectClean)} |
| App validation rule passed | ${pct(o.validationOk)} |
| Bill read completely (every line, charge and total) | ${pct(o.extractionCorrect)} |
| Split correct when the bill was read correctly | ${pct(o.splitCorrectGivenRead)} |
| Planted wrong totals caught | ${pct(o.plantedCaught)} |
| False alarms (flag on a correctly read, correct bill) | ${pct(o.falseAlarms)} |
| Misreads on correct bills flagged by check_receipt | ${pct(o.misreadsFlagged)} |
| Latency per bill (p50 / p95) | ${(s.latencyMs.p50 / 1000).toFixed(1)}s / ${(s.latencyMs.p95 / 1000).toFixed(1)}s |
| Tokens per bill (in / out) | ${s.tokens.perBillIn} / ${s.tokens.perBillOut} |
| Cost | ${s.costUsd ? `$${s.costUsd.total.toFixed(4)} total · $${s.costUsd.perBill.toFixed(5)} per bill · $${s.costUsd.per1000Bills.toFixed(2)} per 1,000 bills` : "n/a"} |
| Network retries | ${s.retries} |

Prices: $${meta.price.inPerM}/1M input, $${meta.price.outPerM}/1M output tokens (${meta.price.source}).

## By category

| Category | Bills | Lines priced | Total read | Split correct | Planted caught | False alarms |
|---|---|---|---|---|---|---|
${cats.map(([k, b]) => `| ${k} | ${b.bills} | ${((100 * b.linesPriced.k) / (b.linesPriced.n || 1)).toFixed(1)}% | ${b.totalRead.k}/${b.totalRead.n} | ${b.splitCorrect.k}/${b.splitCorrect.n} | ${b.plantedCaught.k}/${b.plantedCaught.n} | ${b.falseAlarms.k}/${b.falseAlarms.n} |`).join("\n")}
`;
}

async function buildMeta(info: ModelInfo | null, n: number, concurrency: number) {
  return {
    model: config.model,
    baseURL: config.baseURL,
    date: new Date().toISOString(),
    bills: n,
    concurrency,
    settings: settingsHash(),
    reasoning: { read: "off (JSON schema)", toolLoop: "off", param: process.env.AI_REASONING_PARAM ?? "chat_template_kwargs" },
    toolChoice: "auto",
    temperature: { read: 0, toolLoop: 0 },
    modelInfo: info && { contextLength: info.contextLength, modality: info.modality, quantization: info.quantization },
    price: info ? { inPerM: info.pricePromptPerM, outPerM: info.priceCompletionPerM, source: info.priceSource } : { inPerM: null, outPerM: null, source: "unavailable" },
  };
}

/** Writes the results table into README.md between the results markers, so the README and the dashboard
 *  always show the same run (both read results.json). */
async function writeReadme(md: string) {
  const file = path.join(DIR, "README.md");
  const readme = await readFile(file, "utf8").catch(() => "");
  const start = "<!-- results:start -->", end = "<!-- results:end -->";
  if (!readme.includes(start) || !readme.includes(end)) return;
  const table = md.replace(/^# Results[^\n]*\n\n/, "").replace(/\(METHODOLOGY\.md\)/g, "(METHODOLOGY.md)");
  await writeFile(file, readme.slice(0, readme.indexOf(start) + start.length) + "\n" + table.trim() + "\n" + readme.slice(readme.indexOf(end)));
}

// CLI
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "") && process.argv.includes("--report")) {
  // Rebuild results.md and the README section from the saved run, without any model calls.
  const saved = JSON.parse(await readFile(path.join(DIR, "results.json"), "utf8"));
  const md = markdown(saved, saved.summary);
  await writeFile(path.join(DIR, "results.md"), md);
  await writeReadme(md);
  console.log("Rebuilt benchmark/results.md and the README results section from results.json");
} else if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  const all: Case[] = JSON.parse(await readFile(path.join(DIR, "dataset/cases.json"), "utf8"));
  const category = flag("--category");
  const cases = (category ? all.filter((c) => c.category === category) : all).slice(0, Number(flag("--limit") ?? all.length));
  const concurrency = Number(flag("--concurrency") ?? 6);
  const info = await fetchModelInfo(config).catch(() => null);
  console.log(`Model ${config.model} · ${cases.length} bills · concurrency ${concurrency}${info ? ` · $${info.pricePromptPerM}/$${info.priceCompletionPerM} per 1M tokens (${info.priceSource})` : ""}\n`);

  const rows: Row[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < cases.length) {
        const c = cases[next++];
        const row = await score(c, info);
        rows.push(row);
        const mark = !row.ok ? "✗" : row.splitCorrect ? "✓" : "·";
        console.log(`${mark} ${c.id.padEnd(13)} lines ${row.linesPriced}/${row.linesTotal} split ${row.splitCorrect ? "correct" : row.modelComputed ? "wrong" : "none"}${c.planted ? ` planted:${row.flagged ? "caught" : "missed"}` : row.flagged ? " false-alarm" : ""} ${(row.ms / 1000).toFixed(1)}s${row.error ? ` ${row.error}` : ""}`);
      }
    }),
  );
  rows.sort((a, b) => a.id.localeCompare(b.id));
  const summary = summarise(rows, info);
  const meta = await buildMeta(info, rows.length, concurrency);
  await writeFile(path.join(DIR, "results.json"), JSON.stringify({ ...meta, summary, rows }, null, 2));
  await writeFile(path.join(DIR, "results.md"), markdown(meta, summary));
  await writeReadme(markdown(meta, summary));
  console.log(`\n${markdown(meta, summary)}\nWrote benchmark/results.json and results.md`);
}
