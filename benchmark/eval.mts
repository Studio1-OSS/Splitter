// Runs the bill agent over the benchmark with real model calls and writes benchmark/results.json (+ results.md).
// Two tracks: 150 synthetic bills (dataset/cases.json) and 150 real receipt photos (dataset/real/cases.json).
// Results are merged by track, so running one track keeps the other's saved rows. Method: benchmark/METHODOLOGY.md.
//
//   pnpm bench:eval                         # both tracks, 300 bills
//   pnpm bench:eval --set real              # or --set synthetic
//   pnpm bench:eval --reasoning on          # same bills with the model's reasoning on → results-reasoning.json
//   pnpm bench:eval --retry-failed          # rerun only bills that failed on a network error (add --reasoning on for that run)
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
import { config, MODES, runAgent, SYSTEM, type AgentRun, type Mode } from "./receipt-agent.mts";
import { costOf, fetchModelInfo, wilson, type ModelInfo } from "./stats.mts";

const DIR = path.dirname(fileURLToPath(import.meta.url));
export type Track = "synthetic" | "real" | "holdout";
/** The 300-bill benchmark. "All" combines these two. */
export const TRACKS: Track[] = ["synthetic", "real"];
/** Plus 100 held-out real receipts, never looked at while building or tuning anything; reported on their own. */
export const ALL_TRACKS: Track[] = [...TRACKS, "holdout"];
const CASE_FILES: Record<Track, string> = { synthetic: "dataset/cases.json", real: "dataset/real/cases.json", holdout: "dataset/holdout/cases.json" };
const LABEL: Record<Track, string> = { synthetic: "Synthetic", real: "Real", holdout: "Held-out real" };
/** Reasoning off (what the app uses) is the main result; reasoning on is saved next to it for comparison. */
export const RESULT_FILES: Record<Mode, string> = { off: "results.json", on: "results-reasoning.json" };

export type Case = {
  id: string;
  file: string;
  set?: Track;
  /** Where a real receipt came from, e.g. "CORD v2 · test #1". */
  source?: string;
  category: string;
  layout: string;
  condition: string;
  currency: string;
  people: string[];
  note: string;
  planted: boolean;
  truth: {
    merchant: string | null;
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
  set: Track;
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

export const transient = (e: unknown) =>
  e instanceof OpenAI.APIConnectionError || e instanceof OpenAI.APIConnectionTimeoutError || (e instanceof OpenAI.APIError && (e.status === 429 || (e.status ?? 0) >= 500)) ||
  // The app wraps provider errors in its own message, so match those too: "…returned an error: Connection error.",
  // "…returned 429: …", "…returned 503: …", "Could not reach the AI service".
  /timed? ?out|ECONNRESET|socket|connection error|could not reach|returned (429|5\d\d)\b/i.test(String((e as Error)?.message));

export async function loadCases(tracks: Track[] = TRACKS): Promise<Case[]> {
  const sets = await Promise.all(tracks.map(async (t) => (JSON.parse(await readFile(path.join(DIR, CASE_FILES[t]), "utf8")) as Case[]).map((c) => ({ ...c, set: t }))));
  return sets.flat();
}

export async function score(c: Case, info: ModelInfo | null, mode: Mode = "off"): Promise<Row> {
  const mime = c.file.endsWith(".jpg") ? "image/jpeg" : "image/png";
  const image = `data:${mime};base64,${(await readFile(path.join(DIR, "dataset", c.file))).toString("base64")}`;
  const base = { id: c.id, set: c.set ?? "synthetic", category: c.category, layout: c.layout, condition: c.condition, currency: c.currency, people: c.people.length, planted: c.planted, linesTotal: c.truth.items.length };
  const started = performance.now();
  let retries = 0;
  for (;;) {
    try {
      const run = await runAgent(image, c.people, c.note, config, mode);
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
export function settingsHash(mode: Mode = "off") {
  const h = createHash("sha256");
  // Mode is only hashed when on, so reasoning-off fingerprints stay comparable with earlier runs.
  h.update(JSON.stringify({ model: config.model, baseURL: config.baseURL, reasoning: process.env.AI_REASONING_PARAM ?? "chat_template_kwargs", system: SYSTEM, read: RECEIPT_SYSTEM_PROMPT, tools: toolDefinitions, ...(mode === "on" ? { mode: MODES.on } : {}) }));
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
const short = (x: { k: number; n: number }) => (x.n ? `${((100 * x.k) / x.n).toFixed(1)}% (${x.k}/${x.n})` : "n/a");

type Summary = ReturnType<typeof summarise>;
type RunMeta = { date: string; bills: number; concurrency: number; settings: string; retriedFailed?: { date: string; bills: number } };
export type Results = Awaited<ReturnType<typeof buildMeta>> & { date: string; settings: string; bills: number; sets: Partial<Record<Track, RunMeta>>; summary: Summary; summaries: Record<"all" | Track, Summary | null>; rows: Row[] };

function comparison(off: Results, on: Results) {
  const tracks = (["all", ...ALL_TRACKS] as const).filter((t) => off.summaries[t] && on.summaries[t]);
  const head = tracks.map((t) => (t === "all" ? `All ${off.summaries.all!.overall.bills}` : LABEL[t]));
  const row = (label: string, f: (s: Summary) => string) => `| ${label} | ${tracks.map((t) => `${f(off.summaries[t]!)} → ${f(on.summaries[t]!)}`).join(" | ")} |`;
  const r = (k: keyof Summary["overall"]) => (s: Summary) => { const x = s.overall[k] as { k: number; n: number }; return x.n ? `${((100 * x.k) / x.n).toFixed(1)}%` : "n/a"; };
  return `
## Reasoning off vs on

The same bills, run again with reasoning on, set the way Nebius Token Factory exposes it: \`reasoning_effort: "medium"\` (the endpoint's default level) on both the bill read and the tool loop, with temperature and top_p left at Token Factory's defaults. Each cell is **off → on**. Splitter uses reasoning off.

| Metric | ${head.join(" | ")} |
|---|${tracks.map(() => "---").join("|")}|
${row("Splits correct to the cent", r("splitCorrect"))}
${row("Bill read completely", r("extractionCorrect"))}
${row("Split correct when read correctly", r("splitCorrectGivenRead"))}
${row("Split computed by the model (tool call)", r("modelComputed"))}
${row("Runs completed", r("completed"))}
${row("Planted wrong totals caught", (s) => (s.overall.plantedCaught.n ? `${s.overall.plantedCaught.k}/${s.overall.plantedCaught.n}` : "n/a"))}
${row("False alarms", (s) => `${s.overall.falseAlarms.k}/${s.overall.falseAlarms.n}`)}
${row("Latency p50", (s) => `${(s.latencyMs.p50 / 1000).toFixed(1)}s`)}
${row("Output tokens per bill", (s) => String(s.tokens.perBillOut))}
${row("Cost per bill", (s) => (s.costUsd ? `$${s.costUsd.perBill.toFixed(4)}` : "n/a"))}

Reasoning on runs at Token Factory's default temperature (above 0), so a single run carries some run-to-run noise. Run: ${on.date} · settings \`${on.settings}\`.
`;
}

function markdown(res: Results, on: Results | null = null) {
  const cols = [["all", `All ${res.summaries.all!.overall.bills}`], ...ALL_TRACKS.filter((t) => res.summaries[t]).map((t) => [t, `${LABEL[t]} ${res.summaries[t]!.overall.bills}`])] as ["all" | Track, string][];
  const row = (label: string, f: (s: Summary) => string) => `| ${label} | ${cols.map(([k]) => f(res.summaries[k]!)).join(" | ")} |`;
  const o = (k: keyof Summary["overall"]) => (s: Summary) => short(s.overall[k] as { k: number; n: number });
  const runs = ALL_TRACKS.filter((t) => res.sets[t]).map((t) => `${t}: ${res.sets[t]!.date} · settings \`${res.sets[t]!.settings}\``).join(" · ");
  const same = new Set(TRACKS.filter((t) => res.sets[t]).map((t) => res.sets[t]!.settings)).size <= 1;
  const syn = res.summaries.synthetic;
  return `# Results · ${res.model}

${res.summaries.all!.overall.bills} bills${res.summaries.holdout ? ` + ${res.summaries.holdout.overall.bills} held-out real receipts` : ""} · endpoint \`${res.baseURL}\` · ${runs}${same ? "" : "\n\n**The tracks were run with different settings, so the combined column mixes two configurations.**"}
Application-level evaluation, not an official benchmark. Real receipts: CORD v2 (CC BY 4.0). Method: [METHODOLOGY.md](METHODOLOGY.md).

| Metric | ${cols.map(([, l]) => l).join(" | ")} |
|---|${cols.map(() => "---").join("|")}|
${row("Runs completed", o("completed"))}
${row("Model's split correct to the cent", (s) => pct(s.overall.splitCorrect))}
${row("Split computed by the model (tool call)", o("modelComputed"))}
${row("Bill read completely (every line, charge and total)", o("extractionCorrect"))}
${row("Split correct when the bill was read correctly", o("splitCorrectGivenRead"))}
${row("Line prices read exactly", o("linesPriced"))}
${row("Line names + prices read", o("linesNamed"))}
${row("Printed total read", o("totalRead"))}
${row("Tax read", o("taxRead"))}
${row("App validation rule passed", o("validationOk"))}
${row("Planted wrong totals caught", (s) => (s.overall.plantedCaught.n ? short(s.overall.plantedCaught) : "n/a (none planted)"))}
${row("False alarms (flag on a correctly read, correct bill)", o("falseAlarms"))}
${row("Misreads on correct bills flagged by check_receipt", o("misreadsFlagged"))}
${row("Latency per bill (p50 / p95)", (s) => `${(s.latencyMs.p50 / 1000).toFixed(1)}s / ${(s.latencyMs.p95 / 1000).toFixed(1)}s`)}
${row("Tokens per bill (in / out)", (s) => `${s.tokens.perBillIn} / ${s.tokens.perBillOut}`)}
${row("Cost per bill", (s) => (s.costUsd ? `$${s.costUsd.perBill.toFixed(5)}` : "n/a"))}
${row("Cost per 1,000 bills", (s) => (s.costUsd ? `$${s.costUsd.per1000Bills.toFixed(2)}` : "n/a"))}
${row("Network retries", (s) => String(s.retries))}

Prices: $${res.price.inPerM}/1M input, $${res.price.outPerM}/1M output tokens (${res.price.source}).
${syn ? `
## Synthetic bills by category

| Category | Bills | Lines priced | Total read | Split correct | Planted caught | False alarms |
|---|---|---|---|---|---|---|
${Object.entries(syn.byCategory).map(([k, b]) => `| ${k} | ${b.bills} | ${((100 * b.linesPriced.k) / (b.linesPriced.n || 1)).toFixed(1)}% | ${b.totalRead.k}/${b.totalRead.n} | ${b.splitCorrect.k}/${b.splitCorrect.n} | ${b.plantedCaught.k}/${b.plantedCaught.n} | ${b.falseAlarms.k}/${b.falseAlarms.n} |`).join("\n")}
` : ""}${on ? comparison(res, on) : ""}`;
}

async function buildMeta(info: ModelInfo | null, mode: Mode = "off") {
  return {
    model: config.model,
    baseURL: config.baseURL,
    mode,
    reasoning: mode === "on"
      ? { read: "on, reasoning_effort medium", toolLoop: "on, reasoning_effort medium", param: "reasoning_effort" }
      : { read: "off (JSON schema)", toolLoop: "off", param: process.env.AI_REASONING_PARAM ?? "chat_template_kwargs" },
    toolChoice: "auto",
    temperature: mode === "on" ? { read: "Token Factory default", toolLoop: "Token Factory default" } : { read: 0, toolLoop: 0 },
    modelInfo: info && { contextLength: info.contextLength, modality: info.modality, quantization: info.quantization },
    price: info ? { inPerM: info.pricePromptPerM, outPerM: info.priceCompletionPerM, source: info.priceSource } : { inPerM: null, outPerM: null, source: "unavailable" },
  };
}

/** Reads results.json, upgrading a single-track file (written before the real track existed) to the per-track shape. */
export async function loadResults(mode: Mode = "off"): Promise<Results | null> {
  const saved = JSON.parse(await readFile(path.join(DIR, RESULT_FILES[mode]), "utf8").catch(() => "null"));
  if (!saved) return null;
  const rows: Row[] = saved.rows.map((r: Row) => ({ ...r, set: r.set ?? "synthetic" }));
  const sets = saved.sets ?? { synthetic: { date: saved.date, bills: saved.bills, concurrency: saved.concurrency, settings: saved.settings } };
  return { ...saved, rows, sets };
}

/** Recomputes every summary from the rows, so the combined view always matches the per-track ones. */
export function withSummaries(res: Omit<Results, "summary" | "summaries">, info: ModelInfo | null): Results {
  const price = info ?? ({ pricePromptPerM: res.price.inPerM, priceCompletionPerM: res.price.outPerM } as ModelInfo);
  const has = (t: Track) => res.rows.some((r) => r.set === t);
  // "All" is the 300-bill benchmark; held-out receipts are reported on their own.
  const main = res.rows.filter((r) => TRACKS.includes(r.set));
  const all = summarise(main, res.price.inPerM == null ? null : price);
  const per = Object.fromEntries(ALL_TRACKS.map((t) => [t, has(t) ? summarise(res.rows.filter((r) => r.set === t), res.price.inPerM == null ? null : price) : null])) as Record<Track, Summary | null>;
  const latest = ALL_TRACKS.map((t) => res.sets[t]).filter(Boolean).sort((a, b) => b!.date.localeCompare(a!.date))[0]!;
  return { ...res, date: latest.date, settings: latest.settings, bills: main.length, summary: all, summaries: { all, ...per } } as Results;
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
const reasoningFlag = (flag("--reasoning") ?? "off") as Mode;
if (!(reasoningFlag in MODES)) throw new Error("--reasoning must be on or off");

/** Writes a mode's results, then results.md and the README from the reasoning-off run plus the comparison. */
async function save(mode: Mode, res: Results) {
  await writeFile(path.join(DIR, RESULT_FILES[mode]), JSON.stringify(res, null, 2));
  const off = mode === "off" ? res : await loadResults("off");
  const on = mode === "on" ? res : await loadResults("on");
  if (!off) return;
  const md = markdown(off, on && withSummaries(on, null));
  await writeFile(path.join(DIR, "results.md"), md);
  await writeReadme(md);
  return md;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "") && process.argv.includes("--report")) {
  // Rebuild results.md and the README section from the saved runs, without any model calls.
  const saved = await loadResults("off");
  if (!saved) throw new Error("No benchmark/results.json yet. Run pnpm bench:eval first.");
  const on = await loadResults("on");
  if (on) await writeFile(path.join(DIR, RESULT_FILES.on), JSON.stringify(withSummaries(on, null), null, 2));
  await save("off", withSummaries(saved, null));
  console.log("Rebuilt benchmark/results.md and the README results section from the saved results");
} else if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  const mode = reasoningFlag;
  const setFlag = flag("--set") ?? "all";
  if (setFlag !== "all" && !ALL_TRACKS.includes(setFlag as Track)) throw new Error("--set must be synthetic, real, holdout or all");
  const tracks = setFlag === "all" ? TRACKS : [setFlag as Track];
  const all = await loadCases(tracks);
  const category = flag("--category");
  const retryFailed = process.argv.includes("--retry-failed");
  const previous = retryFailed ? await loadResults(mode) : null;
  const failedIds = new Set((previous?.rows ?? []).filter((r) => !r.ok && transient(new Error(r.error ?? ""))).map((r) => r.id));
  const cases = retryFailed
    ? all.filter((c) => failedIds.has(c.id))
    : (category ? all.filter((c) => c.category === category) : all).slice(0, Number(flag("--limit") ?? all.length));
  const concurrency = Number(flag("--concurrency") ?? 6);
  const info = await fetchModelInfo(config).catch(() => null);
  console.log(`Model ${config.model} · reasoning ${mode} · ${tracks.join(" + ")} · ${cases.length} bills · concurrency ${concurrency}${info ? ` · $${info.pricePromptPerM}/$${info.priceCompletionPerM} per 1M tokens (${info.priceSource})` : ""}\n`);

  const rows: Row[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < cases.length) {
        const c = cases[next++];
        const row = await score(c, info, mode);
        rows.push(row);
        const mark = !row.ok ? "✗" : row.splitCorrect ? "✓" : "·";
        console.log(`${mark} ${c.id.padEnd(13)} lines ${row.linesPriced}/${row.linesTotal} split ${row.splitCorrect ? "correct" : row.modelComputed ? "wrong" : "none"}${c.planted ? ` planted:${row.flagged ? "caught" : "missed"}` : row.flagged ? " false-alarm" : ""} ${(row.ms / 1000).toFixed(1)}s${row.error ? ` ${row.error}` : ""}`);
      }
    }),
  );

  // Replace only the tracks that ran (or, with --retry-failed, only the retried bills); everything else stays as saved.
  const saved = await loadResults(mode);
  const ran = new Set(rows.map((r) => r.set));
  const retried = new Set(rows.map((r) => r.id));
  const keep = (saved?.rows ?? []).filter((r) => (retryFailed ? !retried.has(r.id) : !ran.has(r.set)));
  // A rerun of failed bills counts as a retry on those rows, so the reported retry total stays honest.
  if (retryFailed) for (const r of rows) r.retries += 1 + ((saved?.rows ?? []).find((x) => x.id === r.id)?.retries ?? 0);
  const runMeta: RunMeta = { date: new Date().toISOString(), bills: 0, concurrency, settings: settingsHash(mode) };
  const sets = { ...(saved?.sets ?? {}) };
  if (!retryFailed) for (const t of ran) sets[t] = { ...runMeta, bills: rows.filter((r) => r.set === t).length };
  else for (const t of ran) sets[t] = { ...sets[t]!, retriedFailed: { date: runMeta.date, bills: rows.filter((r) => r.set === t).length } } as RunMeta;
  const merged = [...keep, ...rows].sort((a, b) => ALL_TRACKS.indexOf(a.set) - ALL_TRACKS.indexOf(b.set) || a.id.localeCompare(b.id));
  const res = withSummaries({ ...(await buildMeta(info, mode)), sets, rows: merged } as Results, info);
  const md = await save(mode, res);
  console.log(`\n${md ?? ""}\nWrote benchmark/${RESULT_FILES[mode]} and results.md`);
}
