import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { get } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toMinor } from "../src/lib/money/format";
import { createDashboardServer, dashboardData } from "./server.mts";
import { expectedSplit, summarise, transient, withSummaries, type Case, type Results, type Row } from "./eval.mts";
import { costOf, wilson } from "./stats.mts";
import cases from "./dataset/cases.json";
import realCases from "./dataset/real/cases.json";
import holdoutCases from "./dataset/holdout/cases.json";

const all = cases as Case[];
const real = realCases as Case[];
const holdout = holdoutCases as Case[];

describe("dataset", () => {
  it("is balanced: 5 categories × 30, 6 planted errors and 10 per currency in each", () => {
    expect(all).toHaveLength(150);
    const cats = [...new Set(all.map((c) => c.category))].sort();
    expect(cats).toEqual(["food", "groceries", "home", "party", "travel"]);
    for (const cat of cats) {
      const cs = all.filter((c) => c.category === cat);
      expect(cs).toHaveLength(30);
      expect(cs.filter((c) => c.planted)).toHaveLength(6);
      for (const cur of ["INR", "USD", "EUR"]) expect(cs.filter((c) => c.currency === cur)).toHaveLength(10);
    }
  });

  it("has exact, conserving ground truth: shares sum to the correct total; planted bills print a different one", () => {
    for (const c of all) {
      const shares = expectedSplit(c);
      const sum = Object.values(shares).reduce((a, b) => a + toMinor(b, c.currency), 0);
      expect(sum, c.id).toBe(toMinor(c.truth.correctTotal, c.currency));
      expect(c.truth.total !== c.truth.correctTotal, c.id).toBe(c.planted);
      expect(new Set(c.truth.items.map((i) => i.name)).size, c.id).toBe(c.truth.items.length);
      expect(c.truth.assignment.every((who) => who.length > 0)).toBe(true);
    }
  });
});

describe("real receipts (CORD v2)", () => {
  it("has 150 receipts with a licence file, an image and a CORD source each", () => {
    expect(real).toHaveLength(150);
    expect(readFileSync(new URL("./dataset/real/README.md", import.meta.url), "utf8")).toContain("CC BY 4.0");
    expect(new Set(real.map((c) => c.id)).size).toBe(150);
    for (const c of real) {
      expect(c.set).toBe("real");
      expect(c.source, c.id).toMatch(/^CORD v2 · (test|validation|train) #\d+$/);
      expect(existsSync(new URL(`./dataset/${c.file}`, import.meta.url)), c.file).toBe(true);
    }
  });

  it("has ground truth that adds up, unique line names and no planted errors", () => {
    for (const c of real) {
      const t = c.truth;
      const lines = t.items.reduce((a, i) => a + i.totalPrice, 0);
      expect(lines + (t.tax ?? 0) + (t.serviceCharge ?? 0) - (t.discount ?? 0), c.id).toBe(t.total);
      expect(c.planted).toBe(false);
      expect(t.correctTotal).toBe(t.total);
      expect(t.items.length).toBeGreaterThanOrEqual(2);
      expect(new Set(t.items.map((i) => i.name.toLowerCase())).size, c.id).toBe(t.items.length);
      const shares = expectedSplit(c);
      expect(Object.values(shares).reduce((a, b) => a + toMinor(b, c.currency), 0), c.id).toBe(toMinor(t.total, c.currency));
    }
  });
});

describe("held-out real receipts", () => {
  it("has 100 receipts that come after the real track and never overlap it", () => {
    expect(holdout).toHaveLength(100);
    const used = new Set(real.map((c) => c.source));
    for (const c of holdout) {
      expect(c.set).toBe("holdout");
      expect(used.has(c.source), c.id).toBe(false);
      expect(existsSync(new URL(`./dataset/${c.file}`, import.meta.url)), c.file).toBe(true);
      const t = c.truth;
      expect(t.items.reduce((a, i) => a + i.totalPrice, 0) + (t.tax ?? 0) + (t.serviceCharge ?? 0) - (t.discount ?? 0), c.id).toBe(t.total);
      expect(new Set(t.items.map((i) => i.name.toLowerCase())).size, c.id).toBe(t.items.length);
    }
  });
});

describe("stats", () => {
  it("Wilson intervals match known values and stay inside [0, 1]", () => {
    const w = wilson(24, 25);
    expect(w.lo).toBeCloseTo(0.8046, 3);
    expect(w.hi).toBeCloseTo(0.9929, 3);
    expect(wilson(0, 10).lo).toBe(0);
    expect(wilson(10, 10).hi).toBe(1);
    expect(wilson(0, 0)).toEqual({ lo: 0, hi: 0 });
  });

  it("costs tokens at per-1M prices", () => {
    expect(costOf({ pricePromptPerM: 0.3, priceCompletionPerM: 0.9 }, 1_000_000, 100_000)).toBeCloseTo(0.39, 6);
  });

  it("counts failed runs as failures, never drops them", () => {
    const base = { category: "food", layout: "thermal", condition: "clean", currency: "USD", people: 2, retries: 0, linesTotal: 2, modelCalls: {}, ms: 1000, tokensIn: 10, tokensOut: 5, costUsd: 0 };
    const pass: Row = { ...base, id: "a", set: "synthetic", planted: false, ok: true, linesPriced: 2, linesNamed: 2, lineCountRight: true, totalRead: true, taxRead: true, extractionCorrect: true, modelComputed: true, splitCorrect: true, validationOk: true, flagged: false };
    const fail: Row = { ...base, id: "b", set: "synthetic", planted: false, ok: false, linesPriced: 0, linesNamed: 0, lineCountRight: false, totalRead: false, taxRead: false, extractionCorrect: false, modelComputed: false, splitCorrect: false, validationOk: false, flagged: false };
    const s = summarise([pass, fail], null);
    expect(s.overall.splitCorrect).toMatchObject({ k: 1, n: 2 });
    expect(s.overall.completed).toMatchObject({ k: 1, n: 2 });
    expect(s.overall.linesPriced).toMatchObject({ k: 2, n: 4 });
  });

  it("retries network errors only, including the app's wrapped messages", () => {
    for (const m of ["The AI service returned an error: Connection error.", "The AI service returned 429: rate limited", "The AI service returned 503: overloaded", "Could not reach the AI service", "Request timed out."])
      expect(transient(new Error(m)), m).toBe(true);
    for (const m of ["The AI service returned 400: bad request", "The AI response couldn't be understood. Please try again.", "The bill could not be read. Try a sharper, well-lit photo."])
      expect(transient(new Error(m)), m).toBe(false);
  });

  it("summarises each track and the combined view from the same rows", () => {
    const base = { category: "food", layout: "thermal", condition: "clean", currency: "USD", people: 2, retries: 0, linesTotal: 2, modelCalls: {}, ms: 1000, tokensIn: 10, tokensOut: 5, costUsd: 0, planted: false, ok: true, linesPriced: 2, linesNamed: 2, lineCountRight: true, totalRead: true, taxRead: true, extractionCorrect: true, modelComputed: true, validationOk: true, flagged: false };
    const rows: Row[] = [
      { ...base, id: "s1", set: "synthetic", splitCorrect: true },
      { ...base, id: "s2", set: "synthetic", splitCorrect: true },
      { ...base, id: "r1", set: "real", splitCorrect: false },
    ];
    const meta = { date: "2026-01-01T00:00:00Z", bills: 0, concurrency: 1, settings: "x" };
    const res = withSummaries({ model: "m", baseURL: "u", rows, sets: { synthetic: meta, real: { ...meta, date: "2026-01-02T00:00:00Z" } }, price: { inPerM: 0.3, outPerM: 0.9, source: "test" } } as unknown as Results, null);
    expect(res.summaries.all!.overall.splitCorrect).toMatchObject({ k: 2, n: 3 });
    expect(res.summaries.synthetic!.overall.splitCorrect).toMatchObject({ k: 2, n: 2 });
    expect(res.summaries.real!.overall.splitCorrect).toMatchObject({ k: 0, n: 1 });
    expect(res.summary).toEqual(res.summaries.all);
    expect(res.date).toBe("2026-01-02T00:00:00Z");
  });
});

describe("dashboard server", () => {
  let base = "";
  const server = createDashboardServer();
  beforeAll(async () => {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const a = server.address();
    if (a && typeof a !== "string") base = `http://127.0.0.1:${a.port}`;
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  it("serves the dashboard, data and images; nothing else", async () => {
    for (const p of ["/", "/app.js", "/styles.css", "/icons.svg", "/favicon.svg", "/dataset/food-01.png", "/dataset/real/real-001.jpg", "/dataset/holdout/holdout-001.jpg", "/fonts/Geist-Variable.ttf", "/fonts/FragmentMono-Regular.ttf"]) {
      const r = await fetch(base + p);
      expect(r.status, p).toBe(200);
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      await r.arrayBuffer();
    }
    for (const p of ["/.env", "/%2eenv", "/.git/config", "/server.mts", "/dataset/generate.mjs", "/dataset/../.env", "/constructor", "/fonts/../../.env", "/fonts/Geist-OFL.txt", "/src/fonts/Geist-Variable.ttf", "/dataset/real/cases.json", "/dataset/real/README.md", "/dataset/real/../cases.json", "/dataset/real/real-1.jpg", "/dataset/holdout/cases.json", "/dataset/holdout/real-001.jpg"]) {
      const r = await fetch(base + p);
      expect(r.status, p).toBe(404);
      await r.text();
    }
    expect((await fetch(base + "/", { method: "POST" })).status).toBe(405);
    const denied = await new Promise<number | undefined>((resolve, reject) => {
      get(base + "/", { headers: { host: "untrusted.example" } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on("error", reject);
    });
    expect(denied).toBe(403);
  });

  it("dashboard data never contains the API key", async () => {
    const data = await dashboardData().catch(() => null);
    if (data) expect(JSON.stringify(data)).not.toContain(process.env.NEBIUS_API_KEY || "nebius-key-placeholder");
  });
});
