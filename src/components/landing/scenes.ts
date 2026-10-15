// Example occasions for the landing page. Totals are computed with the real money engine at runtime,
// so every number shown matches what the app would produce for the same bills and notes.
import { computeBalances, computeSplit, simplifyDebts, toMinor } from "@/lib/money";

export const PEOPLE = ["Aman", "Rakesh", "Mahima", "Priya"] as const;
type Name = (typeof PEOPLE)[number];

export type DocKind = "receipt" | "invoice" | "screenshot" | "note" | "ticket";
type Rule = { kind: "equal"; who: Name[] } | { kind: "shares"; shares: Partial<Record<Name, number>> } | { kind: "exact"; amounts: Partial<Record<Name, number>> };

export type Scene = {
  key: string;
  label: string;
  title: string;
  people: Name[];
  bills: { kind: DocKind; label: string; amount: number; lines?: string[] }[];
  notes: string;
  expenses: { label: string; bill: number | null; amount: number; paidBy: Name; rule: Rule; ruleLabel: string }[];
};

const everyone = (people: readonly Name[]) => ({ kind: "equal" as const, who: [...people] });

export const SCENES: Scene[] = [
  {
    key: "trip",
    label: "Trip",
    title: "Goa weekend",
    people: [...PEOPLE],
    bills: [
      { kind: "receipt", label: "Britto's Beach Shack", amount: 3240, lines: ["Prawn curry ×2", "Kingfisher ×4", "Fish thali"] },
      { kind: "invoice", label: "Casa Anjuna · 2 nights", amount: 8400 },
      { kind: "screenshot", label: "Taxi · Calangute", amount: 200 },
      { kind: "screenshot", label: "Taxi · back", amount: 200 },
      { kind: "note", label: "Mahima 500 drinks", amount: 500 },
    ],
    notes: "Aman paid #1 and #2. Rakesh paid 200 twice for taxis. Mahima paid 500 for drinks, Priya didn't drink.",
    expenses: [
      { label: "Britto's Beach Shack", bill: 1, amount: 3240, paidBy: "Aman", rule: everyone(PEOPLE), ruleLabel: "Equally · 4" },
      { label: "Casa Anjuna", bill: 2, amount: 8400, paidBy: "Aman", rule: everyone(PEOPLE), ruleLabel: "Equally · 4" },
      { label: "Taxi to Calangute", bill: 3, amount: 200, paidBy: "Rakesh", rule: everyone(PEOPLE), ruleLabel: "Equally · 4" },
      { label: "Taxi back", bill: 4, amount: 200, paidBy: "Rakesh", rule: everyone(PEOPLE), ruleLabel: "Equally · 4" },
      { label: "Drinks", bill: 5, amount: 500, paidBy: "Mahima", rule: { kind: "equal", who: ["Aman", "Rakesh", "Mahima"] }, ruleLabel: "Equally · not Priya" },
    ],
  },
  {
    key: "party",
    label: "Party",
    title: "Maya's 30th",
    people: [...PEOPLE],
    bills: [
      { kind: "invoice", label: "The Loft · venue", amount: 6000 },
      { kind: "receipt", label: "Party Mart · decor", amount: 1250, lines: ["Balloons", "Banner", "Candles"] },
      { kind: "receipt", label: "Hops & Co · drinks", amount: 3600, lines: ["Beer tower ×2", "Mocktails ×3"] },
    ],
    notes: "Rakesh paid the venue, I got the decorations, Aman paid drinks. Priya doesn't drink, Rakesh had double.",
    expenses: [
      { label: "Venue", bill: 1, amount: 6000, paidBy: "Rakesh", rule: everyone(PEOPLE), ruleLabel: "Equally · 4" },
      { label: "Decorations", bill: 2, amount: 1250, paidBy: "Mahima", rule: everyone(PEOPLE), ruleLabel: "Equally · 4" },
      { label: "Drinks", bill: 3, amount: 3600, paidBy: "Aman", rule: { kind: "shares", shares: { Aman: 1, Rakesh: 2, Mahima: 1 } }, ruleLabel: "Shares 1 · 2 · 1" },
    ],
  },
  {
    key: "event",
    label: "Event",
    title: "Festival weekend",
    people: [...PEOPLE],
    bills: [
      { kind: "ticket", label: "Sunburn · 4 passes", amount: 7900 },
      { kind: "screenshot", label: "Cab · both ways", amount: 1200 },
      { kind: "receipt", label: "Food stalls", amount: 1600, lines: ["Tacos", "Momos", "Lemonade"] },
    ],
    notes: "Aman bought the passes: his was 2,500, ours 1,800 each. Rakesh booked the cab, Mahima paid for food.",
    expenses: [
      { label: "Festival passes", bill: 1, amount: 7900, paidBy: "Aman", rule: { kind: "exact", amounts: { Aman: 2500, Rakesh: 1800, Mahima: 1800, Priya: 1800 } }, ruleLabel: "Exact amounts" },
      { label: "Cab", bill: 2, amount: 1200, paidBy: "Rakesh", rule: everyone(PEOPLE), ruleLabel: "Equally · 4" },
      { label: "Food stalls", bill: 3, amount: 1600, paidBy: "Mahima", rule: everyone(PEOPLE), ruleLabel: "Equally · 4" },
    ],
  },
  {
    key: "dinner",
    label: "Dinner",
    title: "Friday dinner club",
    people: [...PEOPLE],
    bills: [
      { kind: "receipt", label: "Bombay Canteen", amount: 4800, lines: ["Thali ×4", "Kulfi ×2"] },
      { kind: "receipt", label: "Bar tab", amount: 2100, lines: ["Gin & tonic ×3", "IPA ×3"] },
    ],
    notes: "Mahima paid dinner, Rakesh paid the bar. Bar only for the three of us who drank.",
    expenses: [
      { label: "Bombay Canteen", bill: 1, amount: 4800, paidBy: "Mahima", rule: everyone(PEOPLE), ruleLabel: "Equally · 4" },
      { label: "Bar tab", bill: 2, amount: 2100, paidBy: "Rakesh", rule: { kind: "equal", who: ["Aman", "Rakesh", "Mahima"] }, ruleLabel: "Equally · not Priya" },
    ],
  },
  {
    key: "home",
    label: "Home",
    title: "Flat 4B · October",
    people: ["Aman", "Rakesh", "Mahima"],
    bills: [
      { kind: "invoice", label: "Rent · October", amount: 40000 },
      { kind: "invoice", label: "Electricity", amount: 2400 },
      { kind: "screenshot", label: "Internet · ACT", amount: 999 },
    ],
    notes: "Rent by room size 2:1:1, I paid it. Rakesh paid electricity, Mahima internet.",
    expenses: [
      { label: "Rent", bill: 1, amount: 40000, paidBy: "Aman", rule: { kind: "shares", shares: { Aman: 2, Rakesh: 1, Mahima: 1 } }, ruleLabel: "Shares 2 · 1 · 1" },
      { label: "Electricity", bill: 2, amount: 2400, paidBy: "Rakesh", rule: { kind: "equal", who: ["Aman", "Rakesh", "Mahima"] }, ruleLabel: "Equally · 3" },
      { label: "Internet", bill: 3, amount: 999, paidBy: "Mahima", rule: { kind: "equal", who: ["Aman", "Rakesh", "Mahima"] }, ruleLabel: "Equally · 3" },
    ],
  },
];

export const CURRENCY = "INR";

function assignees(rule: Rule) {
  if (rule.kind === "equal") return rule.who.map((memberId) => ({ memberId, weight: 1 }));
  if (rule.kind === "shares") return Object.entries(rule.shares).map(([memberId, weight]) => ({ memberId, weight: weight! }));
  return [];
}

/** Runs a scene through computeSplit / computeBalances / simplifyDebts. */
export function computeScene(scene: Scene) {
  const memberIds = [...scene.people];
  const splits = scene.expenses.map((e) => {
    const amount = toMinor(e.amount, CURRENCY);
    const items =
      e.rule.kind === "exact"
        ? Object.entries(e.rule.amounts).map(([memberId, a]) => ({ id: memberId, amount: toMinor(a!, CURRENCY), assignees: [{ memberId, weight: 1 }] }))
        : [{ id: e.label, amount, assignees: assignees(e.rule) }];
    const split = computeSplit({ memberIds, items });
    return { ...e, split };
  });
  const net = computeBalances(
    memberIds,
    splits.map((s) => ({ paidByMemberId: s.paidBy, shares: s.split.shares.map((x) => ({ memberId: x.memberId, amount: x.total })) })),
    [],
  );
  const share = new Map(memberIds.map((id) => [id, splits.reduce((a, s) => a + (s.split.shares.find((x) => x.memberId === id)?.total ?? 0), 0)]));
  return {
    total: splits.reduce((a, s) => a + s.split.total, 0),
    splits,
    people: memberIds.map((id) => ({ name: id, share: share.get(id) ?? 0, net: net.get(id) ?? 0 })),
    transfers: simplifyDebts(net),
  };
}
