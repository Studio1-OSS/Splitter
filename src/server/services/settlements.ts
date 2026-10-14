import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { DB } from "../db";
import * as schema from "../db/schema";
import { groupMemberIds, requireMember } from "./access";
import { AppError } from "./errors";

export const recordSettlementInput = z.object({
  groupId: z.string().min(1),
  fromMemberId: z.string().min(1),
  toMemberId: z.string().min(1),
  amount: z.number().int().positive("Amount must be more than zero").max(1_000_000_000),
});

/** Records "A paid B". Counts toward balances immediately; the recipient can confirm it. */
export async function recordSettlement(db: DB, userId: string, input: z.input<typeof recordSettlementInput>) {
  const data = recordSettlementInput.parse(input);
  const { group } = await requireMember(db, data.groupId, userId);
  if (data.fromMemberId === data.toMemberId) throw new AppError("Pick two different people");
  const ids = await groupMemberIds(db, group.id);
  if (!ids.has(data.fromMemberId) || !ids.has(data.toMemberId)) throw new AppError("Both people must be in this group");

  const id = nanoid();
  await db.insert(schema.settlements).values({ id, ...data, status: "reported", createdBy: userId });
  await db.update(schema.groups).set({ updatedAt: new Date() }).where(eq(schema.groups.id, group.id));
  return { id, group };
}

async function loadSettlement(db: DB, userId: string, settlementId: string) {
  const settlement = await db.query.settlements.findFirst({ where: eq(schema.settlements.id, settlementId) });
  if (!settlement) throw new AppError("Payment not found", 404);
  const { member } = await requireMember(db, settlement.groupId, userId);
  return { settlement, me: member };
}

/** Only the person who received the money can confirm it. */
export async function confirmSettlement(db: DB, userId: string, settlementId: string) {
  const { settlement, me } = await loadSettlement(db, userId, settlementId);
  if (settlement.toMemberId !== me.id) throw new AppError("Only the person who was paid can confirm", 403);
  await db.update(schema.settlements).set({ status: "confirmed" }).where(eq(schema.settlements.id, settlementId));
  return settlement.groupId;
}

/** The reporter or the recipient can remove a payment (e.g. it never arrived). */
export async function deleteSettlement(db: DB, userId: string, settlementId: string) {
  const { settlement, me } = await loadSettlement(db, userId, settlementId);
  if (settlement.createdBy !== userId && settlement.toMemberId !== me.id)
    throw new AppError("You can't remove this payment", 403);
  await db.delete(schema.settlements).where(eq(schema.settlements.id, settlementId));
  return settlement.groupId;
}
