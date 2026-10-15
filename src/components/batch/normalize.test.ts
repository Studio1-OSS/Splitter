import { describe, expect, it } from "vitest";
import { computeSplit } from "@/lib/money";
import type { Plan } from "@/server/ai/planner";
import type { ExtractedReceipt } from "@/server/ai/receipt";
import { toSplitInput } from "../split/draft";
import { normalizePlan, proposalProblem } from "./normalize";

const members = [
  { id: "aman", name: "Aman" },
  { id: "rakesh", name: "Rakesh" },
  { id: "mahima", name: "Mahima" },
  { id: "priya", name: "Priya" },
];
const receipt = (o: Partial<ExtractedReceipt>): ExtractedReceipt => ({
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
const bills = [
  {
    no: 1,
    receipt: receipt({
      merchant: "Britto's",
      category: "food",
      date: "2026-10-10",
      total: 3240,
      items: [
        { name: "Prawn curry", quantity: 2, totalPrice: 1400 },
        { name: "Kingfisher", quantity: 4, totalPrice: 1200 },
        { name: "Fish thali", quantity: 1, totalPrice: 640 },
      ],
    }),
  },
  { no: 2, receipt: receipt({ merchant: "Casa Anjuna", category: "accommodation", date: "2026-10-09", total: 8400 }) },
  { no: 3, receipt: receipt({ merchant: "Hotel Lux", currency: "EUR", total: 100 }) },
];
const ctx = { members, currency: "INR", bills, defaultCategory: "other" as const, today: "2026-10-14" };
type E = Plan["expenses"][number];
const exp = (o: Partial<E>): E => ({
  billRefs: [],
  description: "Thing",
  category: null,
  date: null,
  amount: 100,
  paidBy: "aman",
  split: { mode: "equal", participants: [], lines: [] },
  explanation: "",
  confidence: "high",
  ...o,
});
const plan = (expenses: E[], extra: Partial<Plan> = {}): Plan => ({
  summary: "s",
  expenses,
  payments: [],
  questions: [],
  duplicates: [],
  ...extra,
});
const totals = (p: Parameters<typeof toSplitInput>[0]) => computeSplit(toSplitInput(p)).shares.map((s) => s.total);

describe("normalizePlan", () => {
  it("splits equally among everyone by default and fills from the bill", () => {
    const { proposals } = normalizePlan(plan([exp({ billRefs: [2], description: "", amount: 8400, category: null })]), ctx);
    const [p] = proposals;
    expect(p.merchant).toBe("Casa Anjuna");
    expect(p.category).toBe("accommodation");
    expect(p.date).toBe("2026-10-09");
    expect(proposalProblem(p)).toBeNull();
    expect(totals(p)).toEqual([210000, 210000, 210000, 210000]);
  });

  it("respects 'only these people' and drops unknown members", () => {
    const participants = ["aman", "rakesh", "ghost"].map((member) => ({ member, shares: null, amount: null }));
    const [p] = normalizePlan(plan([exp({ amount: 500, split: { mode: "equal", participants, lines: [] } })]), ctx).proposals;
    expect(totals(p)).toEqual([25000, 25000, 0, 0]);
  });

  it("handles shares and exact amounts, warning when exact doesn't add up", () => {
    const shares = [
      { member: "aman", shares: 2, amount: null },
      { member: "rakesh", shares: 1, amount: null },
      { member: "mahima", shares: 1, amount: null },
    ];
    const [s] = normalizePlan(plan([exp({ amount: 400, split: { mode: "shares", participants: shares, lines: [] } })]), ctx).proposals;
    expect(totals(s)).toEqual([20000, 10000, 10000, 0]);

    const exact = [
      { member: "aman", shares: null, amount: 2500 },
      { member: "rakesh", shares: null, amount: 1800 },
    ];
    const [bad] = normalizePlan(plan([exp({ amount: 5000, split: { mode: "exact", participants: exact, lines: [] } })]), ctx).proposals;
    expect(proposalProblem(bad)).toMatch(/unassigned/);
    expect(bad.warnings.join()).toMatch(/unassigned/);
    const [ok] = normalizePlan(plan([exp({ amount: 4300, split: { mode: "exact", participants: exact, lines: [] } })]), ctx).proposals;
    expect(proposalProblem(ok)).toBeNull();
  });

  it("builds an itemized proposal from bill lines", () => {
    const lines = [
      { line: 1, members: ["aman", "rakesh"] },
      { line: 2, members: ["aman", "rakesh", "mahima"] },
      { line: 3, members: ["priya"] },
    ];
    const [p] = normalizePlan(plan([exp({ billRefs: [1], amount: 3240, split: { mode: "items", participants: [], lines } })]), ctx).proposals;
    expect(p.kind).toBe("itemized");
    expect(proposalProblem(p)).toBeNull();
    expect(totals(p)).toEqual([110000, 110000, 40000, 64000]);
  });

  it("warns about missing payers, negative amounts and foreign currencies", () => {
    const [p] = normalizePlan(plan([exp({ billRefs: [3], paidBy: "nobody", amount: -5 })]), ctx).proposals;
    expect(p.paidBy).toBeNull();
    expect(p.amount).toBe(0);
    expect(p.warnings.join(" ")).toMatch(/who paid/);
    expect(p.warnings.join(" ")).toMatch(/negative/);
    expect(p.warnings.join(" ")).toMatch(/EUR/);
    expect(proposalProblem(p)).toMatch(/who paid/);
  });

  it("keeps context-only expenses and reports bills that weren't used", () => {
    const res = normalizePlan(plan([exp({ billRefs: [], description: "Drinks", amount: 500, paidBy: "mahima" })], { duplicates: [{ billRefs: [1, 3], reason: "same" }] }), ctx);
    expect(res.proposals[0].billRefs).toEqual([]);
    expect(res.uncovered).toEqual([2]); // 1 and 3 are named in a duplicate record
  });

  it("keeps single-bill duplicates that match existing expenses", () => {
    const res = normalizePlan(
      plan([], { duplicates: [{ billRefs: [1], reason: "Already saved" }, { billRefs: [2], reason: "Copy" }] }),
      ctx,
    );
    expect(res.duplicates.map((x) => x.billRefs)).toEqual([[1], [2]]);
    expect(res.uncovered).toEqual([3]);
  });

  it("only includes payments between two known, different members", () => {
    const res = normalizePlan(
      plan([], {
        payments: [
          { billRef: null, from: "aman", to: "mahima", amount: 300, explanation: "" },
          { billRef: null, from: "aman", to: "aman", amount: 300, explanation: "" },
          { billRef: 99, from: "ghost", to: "mahima", amount: 300, explanation: "" },
        ],
      }),
      ctx,
    );
    expect(res.payments.map((p) => p.include)).toEqual([true, false, false]);
    expect(res.payments[0].amount).toBe(30000);
    expect(res.payments[2].billRef).toBeNull();
  });
});
