// Stage 2: does the planner turn bills + notes into the right payers and splits? Text-only, so it's cheap.
import { evalite } from "evalite";
import { planSettlement, type Plan } from "../src/server/ai/planner";
import { bill, close, config } from "./lib";

const members = [
  { ref: "m1", name: "Aman", isMe: false },
  { ref: "m2", name: "Rakesh", isMe: false },
  { ref: "m3", name: "Mahima", isMe: true },
  { ref: "m4", name: "Priya", isMe: false },
];
const ref = (name: string) => members.find((m) => m.name === name)!.ref;

type Want = {
  amount: number;
  paidBy: string;
  /** Who shares it. Omit to accept anyone; use exact/shares for weighted splits. */
  among?: string[];
  exact?: Record<string, number>;
  shares?: Record<string, number>;
};
type Case = {
  name: string;
  kind: string;
  bills: Parameters<typeof bill>[0][];
  notes: string;
  expenses: Want[];
  payments?: { from: string; to: string; amount: number }[];
  duplicates?: number;
};

const all = members.map((m) => m.name);
const cases: Case[] = [
  {
    name: "Trip: who paid which bill, two taxis, notes-only drinks without Priya",
    kind: "trip",
    bills: [
      { merchant: "Britto's Beach Shack", total: 3402, date: "2026-10-10" },
      { kind: "invoice", merchant: "Casa Anjuna", total: 9408, date: "2026-10-11" },
      { merchant: "Goa Cabs", total: 200, date: "2026-10-09" },
      { merchant: "Goa Cabs", total: 200, date: "2026-10-11" },
    ],
    notes: "Aman paid #1 and #2. Rakesh paid 200 twice for taxis. Mahima paid 500 for drinks, Priya didn't drink.",
    expenses: [
      { amount: 3402, paidBy: "Aman", among: all },
      { amount: 9408, paidBy: "Aman", among: all },
      { amount: 200, paidBy: "Rakesh", among: all },
      { amount: 200, paidBy: "Rakesh", among: all },
      { amount: 500, paidBy: "Mahima", among: ["Aman", "Rakesh", "Mahima"] },
    ],
  },
  {
    name: "Dinner only for three",
    kind: "dinner",
    bills: [{ merchant: "Bombay Canteen", total: 4800 }],
    notes: "Rakesh paid. Only Aman, Rakesh and I were there.",
    expenses: [{ amount: 4800, paidBy: "Rakesh", among: ["Aman", "Rakesh", "Mahima"] }],
  },
  {
    name: "Party: drinks by shares, decorations by me",
    kind: "party",
    bills: [
      { merchant: "Hops & Co", total: 3600 },
      { merchant: "Party Mart", total: 1250 },
    ],
    notes: "Aman paid drinks: Rakesh had double, Priya doesn't drink. I bought the decorations for everyone.",
    expenses: [
      { amount: 3600, paidBy: "Aman", shares: { Aman: 1, Rakesh: 2, Mahima: 1 } },
      { amount: 1250, paidBy: "Mahima", among: all },
    ],
  },
  {
    name: "Event: festival passes at different prices",
    kind: "event",
    bills: [{ kind: "ticket", merchant: "Sunburn", total: 7900 }],
    notes: "Aman bought all 4 passes. His was 2,500, ours were 1,800 each.",
    expenses: [{ amount: 7900, paidBy: "Aman", exact: { Aman: 2500, Rakesh: 1800, Mahima: 1800, Priya: 1800 } }],
  },
  {
    name: "Home: rent 2:1:1 without Priya",
    kind: "home",
    bills: [{ kind: "invoice", merchant: "Rent October", total: 40000 }],
    notes: "Priya doesn't live here. Rent is by room size: Aman 2, Rakesh 1, me 1. Aman paid.",
    expenses: [{ amount: 40000, paidBy: "Aman", shares: { Aman: 2, Rakesh: 1, Mahima: 1 } }],
  },
  {
    name: "Duplicate photo of the same bill",
    kind: "dinner",
    bills: [
      { merchant: "Toit", total: 2100, date: "2026-10-03" },
      { merchant: "Toit", total: 2100, date: "2026-10-03" },
    ],
    notes: "Rakesh paid.",
    expenses: [{ amount: 2100, paidBy: "Rakesh", among: all }],
    duplicates: 1,
  },
  {
    name: "A payment back is not an expense",
    kind: "trip",
    bills: [
      { merchant: "Shack", total: 1200 },
      { kind: "payment_screenshot", merchant: "UPI", total: 300, paidByHint: "From Rakesh Kumar to Aman Verma" },
    ],
    notes: "Aman paid #1. #2 is Rakesh paying Aman back.",
    expenses: [{ amount: 1200, paidBy: "Aman", among: all }],
    payments: [{ from: "Rakesh", to: "Aman", amount: 300 }],
  },
  {
    name: "Handwritten note becomes separate expenses",
    kind: "trip",
    bills: [
      {
        kind: "handwritten_note",
        total: 750,
        items: [
          { name: "Mahima · drinks", quantity: 1, totalPrice: 500 },
          { name: "Priya · snacks", quantity: 1, totalPrice: 250 },
        ],
      },
    ],
    notes: "",
    expenses: [
      { amount: 500, paidBy: "Mahima" },
      { amount: 250, paidBy: "Priya" },
    ],
  },
];

function score(plan: Plan, c: Case): number {
  const checks: boolean[] = [];
  const pool = [...plan.expenses];
  for (const want of c.expenses) {
    const i = pool.findIndex((e) => close(e.amount, want.amount) && e.paidBy === ref(want.paidBy));
    checks.push(i >= 0);
    if (i < 0) continue;
    const got = pool.splice(i, 1)[0];
    if (want.among) {
      const got_ = got.split.participants.map((p) => p.member).sort().join(",");
      const wanted = want.among.map(ref).sort().join(",");
      checks.push(got_ === wanted || (want.among.length === members.length && got.split.participants.length === 0));
    }
    if (want.exact)
      checks.push(Object.entries(want.exact).every(([n, a]) => close(got.split.participants.find((p) => p.member === ref(n))?.amount, a)));
    if (want.shares) {
      const s = got.split.participants.filter((p) => (p.shares ?? 0) > 0);
      checks.push(Object.entries(want.shares).every(([n, w]) => s.find((p) => p.member === ref(n))?.shares === w) && s.length === Object.keys(want.shares).length);
    }
  }
  checks.push(pool.length === 0); // no extra expenses
  for (const p of c.payments ?? []) checks.push(plan.payments.some((x) => x.from === ref(p.from) && x.to === ref(p.to) && close(x.amount, p.amount)));
  if (c.duplicates !== undefined) checks.push(plan.duplicates.length >= c.duplicates);
  return checks.filter(Boolean).length / checks.length;
}

evalite<Case, Plan, Case>(`Settlement planning · ${config.model}`, {
  data: async () => cases.map((c) => ({ input: c, expected: c })),
  task: async (c) =>
    planSettlement(config, {
      groupName: c.name,
      groupKind: c.kind,
      currency: "INR",
      members,
      bills: c.bills.map((b, i) => ({ no: i + 1, receipt: bill(b) })),
      notes: c.notes,
      answers: [],
      recentExpenses: [],
      today: "2026-10-14",
    }),
  scorers: [{ name: "Plan accuracy", scorer: ({ output, expected }) => (expected ? score(output, expected) : 0) }],
});
