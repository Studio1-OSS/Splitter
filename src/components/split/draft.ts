import { nanoid } from "nanoid";
import { isCategory, type CategoryKey } from "@/config/categories";
import { currencyExponent, isValidCurrency, toMinor, type Minor, type SplitInput } from "@/lib/money";
import { isRealDate, todayISO } from "@/lib/utils";
import type { ExtractedReceipt, ReceiptIssue } from "@/server/ai/receipt";
import type { ToolCall } from "@/server/ai/tools";

export type DraftItem = { id: string; name: string; quantity: number; amount: Minor };
export type Person = { id: string; name: string };
export type SplitMode = "equal" | "shares" | "exact";

/** Everything the split flow edits. Plain JSON so it can be saved to localStorage. */
export type Draft = {
  /** "itemized": receipt lines assigned to people. "amount": one total split by a rule. */
  kind: "itemized" | "amount";
  merchant: string;
  category: CategoryKey;
  date: string;
  currency: string;
  // itemized
  items: DraftItem[];
  tax: Minor;
  tip: Minor;
  serviceCharge: Minor;
  discount: Minor;
  suggestedTips: Minor[];
  printedTotal: Minor | null;
  issues: ReceiptIssue[];
  /** Tool checks run when the receipt was read (shown as "How this was checked"). */
  checks?: ToolCall[];
  /** Group expenses: stored copies of the scanned bill, attached when the expense is saved. */
  imageIds?: string[];
  /** itemId -> personIds sharing it equally */
  assignments: Record<string, string[]>;
  // amount
  amount: Minor;
  splitMode: SplitMode;
  /** equal / shares: people included, with share counts */
  shares: Record<string, number>;
  /** exact: amount per person */
  exact: Record<string, Minor>;
  // shared
  people: Person[];
  paidBy: string | null;
};

export const newItem = (): DraftItem => ({ id: nanoid(8), name: "", quantity: 1, amount: 0 });

export function emptyDraft(
  currency: string,
  { people = [], paidBy = null, category = "other" }: { people?: Person[]; paidBy?: string | null; category?: CategoryKey } = {},
): Draft {
  return {
    kind: "itemized",
    merchant: "",
    category,
    date: todayISO(),
    currency,
    items: [newItem()],
    tax: 0,
    tip: 0,
    serviceCharge: 0,
    discount: 0,
    suggestedTips: [],
    printedTotal: null,
    issues: [],
    assignments: {},
    amount: 0,
    splitMode: "equal",
    shares: Object.fromEntries(people.map((p) => [p.id, 1])),
    exact: {},
    people,
    paidBy,
  };
}

/** Older saved guest drafts predate single-amount splits; fill in the new fields. */
export function upgradeDraft(saved: Partial<Draft>, fallback: Draft): Draft {
  const merged = { ...fallback, ...saved };
  if (!isCategory(merged.category)) merged.category = fallback.category;
  if (!merged.shares || Object.keys(merged.shares).length === 0)
    merged.shares = Object.fromEntries(merged.people.map((p) => [p.id, 1]));
  return merged;
}

export function applyReceipt(
  draft: Draft,
  receipt: ExtractedReceipt,
  issues: ReceiptIssue[],
  { lockCurrency }: { lockCurrency: boolean },
): Draft {
  const detected = receipt.currency?.toUpperCase();
  const currency = !lockCurrency && detected && isValidCurrency(detected) ? detected : draft.currency;
  const m = (n: number | null | undefined) => (n == null ? 0 : Math.max(0, toMinor(n, currency)));
  const items = receipt.items
    .filter((i) => i.name.trim() || i.totalPrice)
    .map((i) => ({ id: nanoid(8), name: i.name.trim() || "Item", quantity: i.quantity || 1, amount: m(i.totalPrice) }));

  const extraIssues =
    lockCurrency && detected && detected !== draft.currency
      ? [{ field: "currency", message: `The receipt looks like ${detected}, but this group uses ${draft.currency}. Amounts were kept as printed.` }]
      : [];

  return {
    ...draft,
    kind: "itemized",
    merchant: receipt.merchant?.trim() || draft.merchant,
    category: receipt.category && isCategory(receipt.category) ? receipt.category : draft.category,
    date: isRealDate(receipt.date) ? receipt.date : draft.date,
    currency,
    items: items.length ? items : [newItem()],
    tax: m(receipt.tax),
    tip: m(receipt.tip),
    serviceCharge: m(receipt.serviceCharge),
    discount: m(receipt.discount),
    suggestedTips: (receipt.suggestedTips ?? []).filter((t) => t > 0).map(m).slice(0, 4),
    printedTotal: receipt.total == null ? null : m(receipt.total),
    issues: [...issues.filter((i) => !(lockCurrency && i.field === "currency")), ...extraIssues],
    assignments: {},
  };
}

/** Items the user actually filled in. */
export const usableItems = (d: Draft) => d.items.filter((i) => i.name.trim() !== "" || i.amount > 0);

export const exactTotal = (d: Draft) => d.people.reduce((a, p) => a + (d.exact[p.id] ?? 0), 0);

export const draftTotal = (d: Draft) =>
  d.kind === "amount"
    ? d.amount
    : usableItems(d).reduce((a, i) => a + i.amount, 0) + d.tax + d.tip + d.serviceCharge - d.discount;

export type ExpenseLine = {
  id: string;
  name: string;
  quantity: number;
  amount: Minor;
  assignees: { memberId: string; weight: number }[];
};

/**
 * The lines that get saved and split. Single amounts map onto the same engine:
 * equal/shares = one line with weighted assignees; exact = one line per person.
 */
export function expenseLines(d: Draft): ExpenseLine[] {
  if (d.kind === "itemized") {
    return usableItems(d).map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      amount: i.amount,
      assignees: (d.assignments[i.id] ?? []).map((memberId) => ({ memberId, weight: 1 })),
    }));
  }
  const title = d.merchant.trim() || "Expense";
  if (d.splitMode === "exact") {
    return d.people
      .filter((p) => (d.exact[p.id] ?? 0) > 0)
      .map((p) => ({
        id: `exact-${p.id}`,
        name: `${title} · ${p.name}`,
        quantity: 1,
        amount: d.exact[p.id],
        assignees: [{ memberId: p.id, weight: 1 }],
      }));
  }
  return [
    {
      id: "amount",
      name: title,
      quantity: 1,
      amount: d.amount,
      assignees: d.people
        .filter((p) => (d.shares[p.id] ?? 0) > 0)
        .map((p) => ({ memberId: p.id, weight: d.splitMode === "shares" ? d.shares[p.id] : 1 })),
    },
  ];
}

export function toSplitInput(d: Draft): SplitInput {
  const charges = d.kind === "itemized" ? { tax: d.tax, tip: d.tip, serviceCharge: d.serviceCharge, discount: d.discount } : {};
  return { memberIds: d.people.map((p) => p.id), items: expenseLines(d), ...charges };
}

/** Why the single-amount form can't continue yet, or null when it can. */
export function amountProblem(d: Draft): string | null {
  if (!d.merchant.trim()) return "Add a description";
  if (d.people.length === 0) return "Add at least one person";
  if (!d.paidBy) return "Choose who paid";
  if (d.amount <= 0) return "Enter the amount";
  if (d.splitMode === "exact") {
    const remaining = d.amount - exactTotal(d);
    if (remaining !== 0) return remaining > 0 ? "Some of the amount is still unassigned" : "The amounts add up to more than the total";
    return null;
  }
  if (!d.people.some((p) => (d.shares[p.id] ?? 0) > 0)) return "Include at least one person";
  return null;
}

/** Switches currency while keeping the printed numbers (e.g. 12.50 USD → 12.50 EUR, 1250 cents → ¥13 for JPY). */
export function changeCurrency(d: Draft, currency: string): Draft {
  const factor = 10 ** (currencyExponent(currency) - currencyExponent(d.currency));
  const r = (m: Minor) => Math.round(m * factor);
  return {
    ...d,
    currency,
    items: d.items.map((i) => ({ ...i, amount: r(i.amount) })),
    tax: r(d.tax),
    tip: r(d.tip),
    serviceCharge: r(d.serviceCharge),
    discount: r(d.discount),
    suggestedTips: d.suggestedTips.map(r),
    printedTotal: d.printedTotal == null ? null : r(d.printedTotal),
    amount: r(d.amount),
    exact: Object.fromEntries(Object.entries(d.exact).map(([k, v]) => [k, r(v)])),
  };
}
