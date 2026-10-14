// Turns the AI's draft plan into editable proposals. Pure and unit-tested: nothing the model
// says is trusted until it passes through here, and the server re-validates again on publish.
import { nanoid } from "nanoid";
import { isCategory, type CategoryKey } from "@/config/categories";
import { toMinor, type Minor } from "@/lib/money";
import { isRealDate } from "@/lib/utils";
import type { Plan } from "@/server/ai/planner";
import type { ExtractedReceipt } from "@/server/ai/receipt";
import { amountProblem, emptyDraft, type Draft, type Person } from "../split/draft";

export type Proposal = Draft & {
  pid: string;
  billRefs: number[];
  explanation: string;
  confidence: "high" | "medium" | "low";
  warnings: string[];
};

export type ProposedPayment = {
  pid: string;
  billRef: number | null;
  fromMemberId: string | null;
  toMemberId: string | null;
  amount: Minor;
  explanation: string;
  include: boolean;
};

/** A plan whose member refs the server already mapped to member ids (unknown refs become null). */
export type ResolvedPlan = Plan;

export type NormalizeContext = {
  members: Person[];
  currency: string;
  bills: { no: number; receipt: ExtractedReceipt }[];
  defaultCategory: CategoryKey;
  today: string;
};

const isDate = isRealDate;

export function normalizePlan(plan: ResolvedPlan, ctx: NormalizeContext) {
  const memberIds = new Set(ctx.members.map((m) => m.id));
  const known = (id: string | null | undefined): id is string => !!id && memberIds.has(id);
  const m = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? 0 : toMinor(n, ctx.currency));
  const billByNo = new Map(ctx.bills.map((b) => [b.no, b.receipt]));

  const proposals: Proposal[] = plan.expenses.map((e) => {
    const warnings: string[] = [];
    const billRefs = e.billRefs.filter((n) => billByNo.has(n));
    const bill = billRefs.length === 1 ? billByNo.get(billRefs[0]) : undefined;

    const base = emptyDraft(ctx.currency, { people: ctx.members, paidBy: null });
    const category: CategoryKey = isCategory(e.category)
      ? e.category
      : bill?.category && isCategory(bill.category)
        ? bill.category
        : ctx.defaultCategory;
    const draft: Draft = {
      ...base,
      kind: "amount",
      merchant: e.description.trim().slice(0, 120) || bill?.merchant?.trim() || "Expense",
      category,
      date: isDate(e.date) ? e.date : isDate(bill?.date) ? bill!.date! : ctx.today,
      paidBy: known(e.paidBy) ? e.paidBy : null,
      amount: Math.max(0, m(e.amount)),
    };
    if (!draft.paidBy) warnings.push("Choose who paid");
    if (e.amount < 0) warnings.push("The AI suggested a negative amount; check it");
    if (bill?.currency && bill.currency.toUpperCase() !== ctx.currency) {
      warnings.push(`The bill is in ${bill.currency.toUpperCase()}, but the group uses ${ctx.currency}`);
    }

    const participants = e.split.participants.filter((p) => known(p.member));
    const everyoneShares = Object.fromEntries(ctx.members.map((p) => [p.id, 1]));
    const onlyThese = (ids: string[]) => Object.fromEntries(ctx.members.map((p) => [p.id, ids.includes(p.id) ? 1 : 0]));

    if (e.split.mode === "items" && bill && bill.items.length > 0) {
      const items = bill.items.map((i) => ({ id: nanoid(8), name: i.name || "Item", quantity: i.quantity || 1, amount: Math.max(0, m(i.totalPrice)) }));
      const assignments: Record<string, string[]> = {};
      for (const l of e.split.lines) {
        const item = items[l.line - 1];
        if (item) assignments[item.id] = [...new Set(l.members.filter(known))];
      }
      const unassigned = items.filter((i) => !assignments[i.id]?.length).length;
      if (unassigned) warnings.push(`${unassigned} line${unassigned === 1 ? "" : "s"} still need people`);
      Object.assign(draft, {
        kind: "itemized",
        items,
        assignments,
        tax: m(bill.tax),
        tip: m(bill.tip),
        serviceCharge: m(bill.serviceCharge),
        discount: m(bill.discount),
      } satisfies Partial<Draft>);
    } else if (e.split.mode === "exact") {
      draft.splitMode = "exact";
      draft.exact = Object.fromEntries(participants.map((p) => [p.member, Math.max(0, m(p.amount))]));
      const sum = Object.values(draft.exact).reduce((a, b) => a + b, 0);
      if (draft.amount === 0) draft.amount = sum;
    } else if (e.split.mode === "shares" && participants.some((p) => (p.shares ?? 0) > 0)) {
      draft.splitMode = "shares";
      draft.shares = Object.fromEntries(
        ctx.members.map((p) => {
          const s = participants.find((x) => x.member === p.id)?.shares ?? 0;
          return [p.id, Math.max(0, Math.min(20, Math.round(s)))];
        }),
      );
    } else {
      if (e.split.mode === "items") warnings.push("Line-by-line split needs a bill with lines; split equally instead");
      draft.splitMode = "equal";
      draft.shares = participants.length ? onlyThese(participants.map((p) => p.member)) : everyoneShares;
      if (!participants.length)
        warnings.push(e.split.participants.length ? "Couldn't match the people; split among everyone" : "Split among everyone for now; check who shared it");
    }

    const problem = amountProblem(draft);
    if (draft.kind === "amount" && problem && !warnings.includes("Choose who paid")) warnings.push(problem);

    return { ...draft, pid: nanoid(8), billRefs, explanation: e.explanation, confidence: e.confidence, warnings };
  });

  const payments: ProposedPayment[] = plan.payments.map((p) => ({
    pid: nanoid(8),
    billRef: p.billRef != null && billByNo.has(p.billRef) ? p.billRef : null,
    fromMemberId: known(p.from) ? p.from : null,
    toMemberId: known(p.to) ? p.to : null,
    amount: Math.max(0, m(p.amount)),
    explanation: p.explanation,
    include: known(p.from) && known(p.to) && p.from !== p.to && p.amount > 0,
  }));

  const covered = new Set([...proposals.flatMap((p) => p.billRefs), ...payments.flatMap((p) => (p.billRef ? [p.billRef] : []))]);
  // A bill named in a duplicate record was deliberately skipped, so it isn't "unused".
  const duplicateRefs = new Set(plan.duplicates.flatMap((d) => d.billRefs));
  const uncovered = ctx.bills.map((b) => b.no).filter((no) => !covered.has(no) && !duplicateRefs.has(no));

  return {
    summary: plan.summary,
    proposals,
    payments,
    questions: plan.questions.slice(0, 5),
    // Keep single-bill records too: they explain a match with an expense already in the group.
    duplicates: plan.duplicates
      .map((d) => ({ ...d, billRefs: d.billRefs.filter((n) => billByNo.has(n)) }))
      .filter((d) => d.billRefs.length > 0),
    uncovered,
  };
}

export type NormalizedPlan = ReturnType<typeof normalizePlan>;

/** True when a proposal can be published as-is. */
export function proposalProblem(p: Proposal): string | null {
  if (!p.paidBy) return "Choose who paid";
  if (p.kind === "amount") return amountProblem(p);
  if (!p.merchant.trim()) return "Add a description";
  const lines = p.items.filter((i) => i.name.trim() || i.amount > 0);
  if (!lines.length) return "Add at least one line";
  if (lines.some((i) => !p.assignments[i.id]?.length)) return "Some lines still need people";
  return null;
}
