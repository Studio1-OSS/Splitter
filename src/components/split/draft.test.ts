import { describe, expect, it } from "vitest";
import { computeSplit } from "@/lib/money";
import { amountProblem, emptyDraft, expenseLines, toSplitInput, type Draft } from "./draft";

const people = [
  { id: "a", name: "Ana" },
  { id: "b", name: "Ben" },
  { id: "c", name: "Cy" },
];
const base = (over: Partial<Draft>): Draft => ({
  ...emptyDraft("EUR", { people, paidBy: "a" }),
  kind: "amount",
  merchant: "Hotel",
  amount: 60000,
  ...over,
});
const totals = (d: Draft) => computeSplit(toSplitInput(d)).shares.map((s) => s.total);

describe("single-amount drafts", () => {
  it("splits equally among included people", () => {
    expect(totals(base({ splitMode: "equal", shares: { a: 1, b: 1, c: 0 } }))).toEqual([30000, 30000, 0]);
  });

  it("splits by shares", () => {
    expect(totals(base({ splitMode: "shares", shares: { a: 2, b: 1, c: 1 } }))).toEqual([30000, 15000, 15000]);
  });

  it("splits by exact amounts and requires them to add up", () => {
    const d = base({ splitMode: "exact", amount: 10000, exact: { a: 5000, b: 3000, c: 1000 } });
    expect(amountProblem(d)).toMatch(/unassigned/);
    const ok = { ...d, exact: { a: 5000, b: 3000, c: 2000 } };
    expect(amountProblem(ok)).toBeNull();
    expect(expenseLines(ok)).toHaveLength(3);
    expect(totals(ok)).toEqual([5000, 3000, 2000]);
    expect(amountProblem({ ...d, exact: { a: 9000, b: 3000 } })).toMatch(/more than/);
  });

  it("flags missing basics", () => {
    expect(amountProblem(base({ merchant: "" }))).toMatch(/description/);
    expect(amountProblem(base({ amount: 0 }))).toMatch(/amount/);
    expect(amountProblem(base({ shares: { a: 0, b: 0, c: 0 } }))).toMatch(/Include/);
  });

  it("ignores tax/tip fields for single amounts", () => {
    const d = base({ splitMode: "equal", shares: { a: 1, b: 1, c: 1 }, tax: 999, tip: 999 });
    expect(computeSplit(toSplitInput(d)).total).toBe(60000);
  });
});
