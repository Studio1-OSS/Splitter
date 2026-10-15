import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { CATEGORY_KEYS } from "@/config/categories";
import { computeSplit, SplitError } from "@/lib/money";
import { isRealDate } from "@/lib/utils";
import type { DB } from "../db";
import * as schema from "../db/schema";
import { groupMemberIds, requireMember } from "./access";
import { AppError } from "./errors";

const minor = z.number().int().min(0).max(1_000_000_000);

/** Fields of one expense, without the group (shared by single expenses and AI batches). */
export const expenseFields = z.object({
  paidByMemberId: z.string().min(1, "Choose who paid"),
  merchant: z.string().trim().min(1, "Add a name for this expense").max(120),
  category: z.enum(CATEGORY_KEYS).default("other"),
  date: z.string().refine(isRealDate, "Use a real date"),
  note: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        quantity: z.number().positive().max(10_000).default(1),
        amount: minor,
        assignees: z
          .array(z.object({ memberId: z.string().min(1), weight: z.number().positive().max(1000) }))
          .max(100),
      }),
    )
    .min(1, "Add at least one item")
    .max(300),
  tax: minor.default(0),
  tip: minor.default(0),
  serviceCharge: minor.default(0),
  discount: minor.default(0),
});
export type ExpenseFields = z.output<typeof expenseFields>;

export const createExpenseInput = expenseFields.extend({
  groupId: z.string().min(1),
  /** Stored copies of the scanned bill (one per page), uploaded to /api/bills before saving. */
  imageIds: z.array(z.string().min(1)).max(4).default([]),
});
export type CreateExpenseInput = z.input<typeof createExpenseInput>;

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Group = typeof schema.groups.$inferSelect;

/**
 * Validates one expense against the group's members and recomputes the split on the server
 * (client totals are never trusted). Pure apart from id generation; nothing is written yet.
 */
export function prepareExpense(data: ExpenseFields, ctx: { group: Group; memberIds: Set<string>; userId: string; batchId?: string }) {
  const { group, memberIds } = ctx;
  if (!memberIds.has(data.paidByMemberId)) throw new AppError("The payer is not in this group");
  for (const item of data.items)
    for (const a of item.assignees)
      if (!memberIds.has(a.memberId)) throw new AppError("An item is assigned to someone outside this group");

  const items = data.items.map((item) => ({ ...item, id: nanoid() }));
  let split;
  try {
    split = computeSplit({
      memberIds: [...memberIds],
      items,
      tax: data.tax,
      tip: data.tip,
      serviceCharge: data.serviceCharge,
      discount: data.discount,
    });
  } catch (e) {
    if (e instanceof SplitError) throw new AppError(e.message);
    throw e;
  }
  if (split.total < 0) throw new AppError("The discount is larger than the bill");

  const expenseId = nanoid();
  return {
    expenseId,
    shareToken: nanoid(16),
    data,
    items,
    split,
    batchId: ctx.batchId ?? null,
    group,
    userId: ctx.userId,
  };
}
export type PreparedExpense = ReturnType<typeof prepareExpense>;

export async function writeExpense(tx: Tx, p: PreparedExpense) {
  const { data, items, split, expenseId } = p;
  await tx.insert(schema.expenses).values({
    id: expenseId,
    groupId: p.group.id,
    paidByMemberId: data.paidByMemberId,
    merchant: data.merchant,
    category: data.category,
    date: data.date,
    currency: p.group.currency,
    subtotal: split.subtotal,
    tax: data.tax,
    tip: data.tip,
    serviceCharge: data.serviceCharge,
    discount: data.discount,
    total: split.total,
    shareToken: p.shareToken,
    batchId: p.batchId,
    note: data.note || null,
    createdBy: p.userId,
  });
  await tx.insert(schema.expenseItems).values(
    items.map((item, position) => ({ id: item.id, expenseId, position, name: item.name, quantity: item.quantity, amount: item.amount })),
  );
  const assignments = items.flatMap((item) => item.assignees.map((a) => ({ itemId: item.id, memberId: a.memberId, weight: a.weight })));
  if (assignments.length) await tx.insert(schema.itemAssignments).values(assignments);
  const shares = split.shares.filter((s) => s.total !== 0);
  if (shares.length) await tx.insert(schema.expenseShares).values(shares.map((s) => ({ expenseId, memberId: s.memberId, amount: s.total })));
}

/** Validates membership, recomputes the split and writes everything in one transaction. */
export async function createExpense(db: DB, userId: string, input: CreateExpenseInput) {
  const { groupId, ...fields } = createExpenseInput.parse(input);
  const { group } = await requireMember(db, groupId, userId);
  const memberIds = await groupMemberIds(db, group.id);
  const { imageIds, ...expense } = fields;
  const prepared = prepareExpense(expense, { group, memberIds, userId });

  if (imageIds.length) {
    const pending = await db
      .select({ id: schema.billImages.id })
      .from(schema.billImages)
      .where(
        and(
          inArray(schema.billImages.id, imageIds),
          eq(schema.billImages.groupId, group.id),
          isNull(schema.billImages.batchId),
          isNull(schema.billImages.expenseId),
        ),
      );
    if (pending.length !== new Set(imageIds).size) throw new AppError("The bill photo is missing or was already used");
  }

  await db.transaction(async (tx) => {
    await writeExpense(tx, prepared);
    if (imageIds.length) {
      await tx.update(schema.billImages).set({ expenseId: prepared.expenseId, billNo: 1 }).where(inArray(schema.billImages.id, imageIds));
    }
    await tx.update(schema.groups).set({ updatedAt: new Date() }).where(eq(schema.groups.id, group.id));
  });

  return { expenseId: prepared.expenseId, shareToken: prepared.shareToken, group, total: prepared.split.total, shares: prepared.split.shares };
}

async function loadExpense(db: DB, where: ReturnType<typeof eq>) {
  return db.query.expenses.findFirst({
    where,
    with: {
      group: true,
      paidBy: true,
      items: { orderBy: [asc(schema.expenseItems.position)], with: { assignments: true } },
      shares: { with: { member: true } },
      batch: { columns: { id: true, title: true } },
      images: { columns: { id: true, billNo: true, page: true }, orderBy: [asc(schema.billImages.page)] },
    },
  });
}

export async function getExpense(db: DB, userId: string, expenseId: string) {
  const expense = await loadExpense(db, eq(schema.expenses.id, expenseId));
  if (!expense) throw new AppError("Expense not found", 404);
  const { member } = await requireMember(db, expense.groupId, userId);
  const members = await db.select().from(schema.members).where(eq(schema.members.groupId, expense.groupId));
  return { expense, me: member, members };
}

/** Public, read-only view for share links. Exposes display names only — never emails or user ids. */
export async function getSharedExpense(db: DB, shareToken: string) {
  const expense = await loadExpense(db, eq(schema.expenses.shareToken, shareToken));
  if (!expense) return null;
  const members = await db
    .select({ id: schema.members.id, displayName: schema.members.displayName })
    .from(schema.members)
    .where(eq(schema.members.groupId, expense.groupId));
  const nameOf = new Map(members.map((m) => [m.id, m.displayName]));
  return {
    groupName: expense.group.name,
    groupEmoji: expense.group.emoji,
    merchant: expense.merchant,
    category: expense.category,
    date: expense.date,
    currency: expense.currency,
    subtotal: expense.subtotal,
    tax: expense.tax,
    tip: expense.tip,
    serviceCharge: expense.serviceCharge,
    discount: expense.discount,
    total: expense.total,
    paidBy: expense.paidBy.displayName,
    items: expense.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      amount: i.amount,
      people: i.assignments.map((a) => nameOf.get(a.memberId) ?? "Someone"),
    })),
    shares: expense.shares
      .map((s) => ({ name: s.member.displayName, amount: s.amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export async function deleteExpense(db: DB, userId: string, expenseId: string) {
  const expense = await db.query.expenses.findFirst({ where: eq(schema.expenses.id, expenseId) });
  if (!expense) throw new AppError("Expense not found", 404);
  await requireMember(db, expense.groupId, userId);
  if (expense.createdBy !== userId) throw new AppError("Only the person who added this expense can delete it", 403);
  await db.delete(schema.expenses).where(and(eq(schema.expenses.id, expenseId)));
  return expense.groupId;
}
