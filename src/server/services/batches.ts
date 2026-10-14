import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { computeBalances, simplifyDebts } from "@/lib/money";
import type { DB } from "../db";
import * as schema from "../db/schema";
import { groupMemberIds, requireMember } from "./access";
import { AppError } from "./errors";
import { expenseFields, prepareExpense, writeExpense, type PreparedExpense } from "./expenses";

export const publishBatchInput = z.object({
  groupId: z.string().min(1),
  title: z.string().trim().min(1, "Give this a name").max(120),
  context: z.string().max(4000).default(""),
  summary: z.string().max(2000).default(""),
  expenses: z
    .array(expenseFields.extend({ billNos: z.array(z.number().int().positive()).max(20).default([]) }))
    .min(1, "There's nothing to publish yet")
    .max(60),
  payments: z
    .array(z.object({ fromMemberId: z.string(), toMemberId: z.string(), amount: z.number().int().positive().max(1_000_000_000) }))
    .max(30)
    .default([]),
  /** Stored copies of each bill: one image id per page. */
  bills: z
    .array(z.object({ no: z.number().int().positive(), imageIds: z.array(z.string().min(1)).min(1).max(4) }))
    .max(20)
    .default([]),
});
export type PublishBatchInput = z.input<typeof publishBatchInput>;

/**
 * Publishes a reviewed "Settle with AI" plan: the batch, every expense (each re-validated and re-split
 * on the server), any recorded payments and the bill images, all in one transaction.
 */
export async function publishBatch(db: DB, userId: string, input: PublishBatchInput) {
  const data = publishBatchInput.parse(input);
  const { group } = await requireMember(db, data.groupId, userId);
  const memberIds = await groupMemberIds(db, group.id);
  const batchId = nanoid();

  const prepared: (PreparedExpense & { billNos: number[] })[] = data.expenses.map(({ billNos, ...fields }, i) => {
    try {
      return { ...prepareExpense(fields, { group, memberIds, userId, batchId }), billNos };
    } catch (e) {
      if (e instanceof AppError) throw new AppError(`Expense ${i + 1} (${fields.merchant}): ${e.message}`);
      throw e;
    }
  });
  for (const p of data.payments) {
    if (!memberIds.has(p.fromMemberId) || !memberIds.has(p.toMemberId) || p.fromMemberId === p.toMemberId)
      throw new AppError("A recorded payment has an invalid payer or recipient");
  }

  const imageIds = data.bills.flatMap((b) => b.imageIds);
  if (imageIds.length) {
    const pending = await db
      .select({ id: schema.billImages.id })
      .from(schema.billImages)
      .where(and(inArray(schema.billImages.id, imageIds), eq(schema.billImages.groupId, group.id), isNull(schema.billImages.batchId)));
    if (pending.length !== new Set(imageIds).size) throw new AppError("Some bill images are missing or were already used");
  }

  const shareToken = nanoid(16);
  await db.transaction(async (tx) => {
    await tx.insert(schema.batches).values({
      id: batchId,
      groupId: group.id,
      title: data.title,
      context: data.context,
      summary: data.summary,
      shareToken,
      createdBy: userId,
    });
    for (const p of prepared) await writeExpense(tx, p);
    if (data.payments.length) {
      await tx.insert(schema.settlements).values(
        data.payments.map((p) => ({ id: nanoid(), groupId: group.id, ...p, status: "reported" as const, batchId, createdBy: userId })),
      );
    }
    for (const b of data.bills) {
      const owner = prepared.find((p) => p.billNos.includes(b.no));
      await tx
        .update(schema.billImages)
        .set({ batchId, billNo: b.no, expenseId: owner?.expenseId ?? null })
        .where(inArray(schema.billImages.id, b.imageIds));
    }
    await tx.update(schema.groups).set({ updatedAt: new Date() }).where(eq(schema.groups.id, group.id));
  });

  // Per member: what they owe across the batch and what they paid.
  const perMember = new Map<string, { share: number; paid: number }>([...memberIds].map((id) => [id, { share: 0, paid: 0 }]));
  for (const p of prepared) {
    perMember.get(p.data.paidByMemberId)!.paid += p.split.total;
    for (const s of p.split.shares) perMember.get(s.memberId)!.share += s.total;
  }
  return { batchId, shareToken, group, perMember, expenseCount: prepared.length, total: prepared.reduce((a, p) => a + p.split.total, 0) };
}

async function loadBatch(db: DB, where: ReturnType<typeof eq>) {
  return db.query.batches.findFirst({
    where,
    with: {
      group: true,
      expenses: {
        orderBy: [asc(schema.expenses.date), asc(schema.expenses.createdAt)],
        with: {
          paidBy: true,
          shares: true,
          items: { orderBy: [asc(schema.expenseItems.position)], with: { assignments: true } },
        },
      },
      images: { columns: { id: true, billNo: true, page: true, expenseId: true }, orderBy: [asc(schema.billImages.billNo), asc(schema.billImages.page)] },
    },
  });
}

function batchLedger(
  members: { id: string; displayName: string }[],
  batch: NonNullable<Awaited<ReturnType<typeof loadBatch>>>,
  payments: { fromMemberId: string; toMemberId: string; amount: number }[],
) {
  const net = computeBalances(
    members.map((m) => m.id),
    batch.expenses.map((e) => ({ paidByMemberId: e.paidByMemberId, shares: e.shares })),
    payments,
  );
  const totals = members.map((m) => ({
    memberId: m.id,
    name: m.displayName,
    share: batch.expenses.reduce((a, e) => a + (e.shares.find((s) => s.memberId === m.id)?.amount ?? 0), 0),
    paid: batch.expenses.filter((e) => e.paidByMemberId === m.id).reduce((a, e) => a + e.total, 0),
    net: net.get(m.id) ?? 0,
  }));
  return { totals, transfers: simplifyDebts(net) };
}

export async function getBatch(db: DB, userId: string, batchId: string) {
  const batch = await loadBatch(db, eq(schema.batches.id, batchId));
  if (!batch) throw new AppError("Not found", 404);
  const { member: me } = await requireMember(db, batch.groupId, userId);
  const [members, payments] = await Promise.all([
    db.select().from(schema.members).where(eq(schema.members.groupId, batch.groupId)),
    db.select().from(schema.settlements).where(eq(schema.settlements.batchId, batch.id)),
  ]);
  return { batch, me, members, payments, ...batchLedger(members, batch, payments) };
}

export async function listBatches(db: DB, userId: string, groupId: string) {
  await requireMember(db, groupId, userId);
  return db
    .select({ id: schema.batches.id, title: schema.batches.title, createdAt: schema.batches.createdAt })
    .from(schema.batches)
    .where(eq(schema.batches.groupId, groupId))
    .orderBy(desc(schema.batches.createdAt));
}

export async function setBatchShareImages(db: DB, userId: string, batchId: string, on: boolean) {
  const batch = await db.query.batches.findFirst({ where: eq(schema.batches.id, batchId) });
  if (!batch) throw new AppError("Not found", 404);
  await requireMember(db, batch.groupId, userId);
  await db.update(schema.batches).set({ shareImages: on }).where(eq(schema.batches.id, batchId));
  return batch.groupId;
}

/**
 * Public view for /s/b/[token]. By default: display names and amounts only. The group's notes, the AI
 * summary, per-expense explanations and bill photos are included only when a member turns on
 * "Show photos and notes" (stored as batches.shareImages).
 */
export async function getSharedBatch(db: DB, shareToken: string) {
  const batch = await loadBatch(db, eq(schema.batches.shareToken, shareToken));
  if (!batch) return null;
  const [members, payments] = await Promise.all([
    db.select({ id: schema.members.id, displayName: schema.members.displayName }).from(schema.members).where(eq(schema.members.groupId, batch.groupId)),
    db
      .select({ fromMemberId: schema.settlements.fromMemberId, toMemberId: schema.settlements.toMemberId, amount: schema.settlements.amount })
      .from(schema.settlements)
      .where(eq(schema.settlements.batchId, batch.id)),
  ]);
  const nameOf = new Map(members.map((m) => [m.id, m.displayName]));
  const { totals, transfers } = batchLedger(members, batch, payments);
  return {
    title: batch.title,
    groupName: batch.group.name,
    groupEmoji: batch.group.emoji,
    currency: batch.group.currency,
    context: batch.shareImages ? batch.context : "",
    summary: batch.shareImages ? batch.summary : "",
    images: batch.shareImages ? batch.images.map((i) => ({ id: i.id, billNo: i.billNo, page: i.page, expenseId: i.expenseId })) : [],
    expenses: batch.expenses.map((e) => ({
      id: e.id,
      merchant: e.merchant,
      category: e.category,
      date: e.date,
      total: e.total,
      paidBy: e.paidBy.displayName,
      note: batch.shareImages ? e.note : null,
      people: e.shares.map((s) => ({ name: nameOf.get(s.memberId) ?? "Someone", amount: s.amount })),
    })),
    payments: payments.map((p) => ({ from: nameOf.get(p.fromMemberId) ?? "Someone", to: nameOf.get(p.toMemberId) ?? "Someone", amount: p.amount })),
    totals: totals.map(({ name, share, paid, net }) => ({ name, share, paid, net })).filter((t) => t.share || t.paid),
    transfers: transfers.map((t) => ({ from: nameOf.get(t.fromMemberId) ?? "Someone", to: nameOf.get(t.toMemberId) ?? "Someone", amount: t.amount })),
  };
}
