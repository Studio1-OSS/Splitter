import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { BANNER_ART_KEYS, BANNER_COLOR_KEYS } from "@/config/banners";
import { GROUP_KIND_KEYS } from "@/config/categories";
import { computeBalances, isValidCurrency, simplifyDebts } from "@/lib/money";
import type { DB } from "../db";
import * as schema from "../db/schema";
import { requireMember } from "./access";
import { AppError } from "./errors";

const name = z.string().trim().min(1, "Name is required").max(60);

export const createGroupInput = z.object({
  name,
  emoji: z.string().trim().min(1).max(8).default("👥"),
  kind: z.enum(GROUP_KIND_KEYS).default("other"),
  banner: z.object({ color: z.enum(BANNER_COLOR_KEYS), art: z.enum(BANNER_ART_KEYS) }).optional(),
  currency: z.string().refine(isValidCurrency, "Unknown currency"),
  friends: z.array(name).max(50).default([]),
});

export type CreateGroupInput = z.input<typeof createGroupInput>;

export async function createGroup(
  db: DB,
  user: { id: string; name: string },
  input: z.input<typeof createGroupInput>,
) {
  const data = createGroupInput.parse(input);
  const groupId = nanoid();
  await db.transaction(async (tx) => {
    await tx.insert(schema.groups).values({
      id: groupId,
      name: data.name,
      emoji: data.emoji,
      kind: data.kind,
      bannerColor: data.banner?.color ?? null,
      bannerArt: data.banner?.art ?? null,
      currency: data.currency,
      inviteToken: nanoid(24),
      createdBy: user.id,
    });
    await tx.insert(schema.members).values([
      { id: nanoid(), groupId, userId: user.id, displayName: user.name },
      ...[...new Set(data.friends)].map((displayName) => ({ id: nanoid(), groupId, userId: null, displayName })),
    ]);
  });
  return groupId;
}

export async function addPlaceholderMember(db: DB, userId: string, groupId: string, displayName: string) {
  await requireMember(db, groupId, userId);
  const id = nanoid();
  await db.insert(schema.members).values({ id, groupId, userId: null, displayName: name.parse(displayName) });
  return id;
}

export async function renameGroup(db: DB, userId: string, groupId: string, newName: string) {
  await requireMember(db, groupId, userId);
  await db.update(schema.groups).set({ name: name.parse(newName) }).where(eq(schema.groups.id, groupId));
}

/** Groups the user belongs to, with their own net balance in each. */
export async function listGroupsForUser(db: DB, userId: string) {
  const mine = await db
    .select({ group: schema.groups, memberId: schema.members.id })
    .from(schema.members)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.members.groupId))
    .where(eq(schema.members.userId, userId))
    .orderBy(desc(schema.groups.updatedAt));
  if (mine.length === 0) return [];

  const groupIds = mine.map((m) => m.group.id);
  const [memberRows, ledgers] = await Promise.all([
    db.select().from(schema.members).where(inArray(schema.members.groupId, groupIds)),
    loadLedgers(db, groupIds),
  ]);

  return mine.map(({ group, memberId }) => {
    const members = memberRows.filter((m) => m.groupId === group.id);
    const ledger = ledgers.get(group.id)!;
    const net = computeBalances(
      members.map((m) => m.id),
      ledger.expenses,
      ledger.settlements,
    );
    return {
      ...group,
      memberCount: members.length,
      memberNames: members.map((m) => m.displayName),
      myBalance: net.get(memberId) ?? 0,
      expenseCount: ledger.expenses.length,
      lastActivity: ledger.lastActivity ?? group.createdAt,
    };
  });
}

async function loadLedgers(db: DB, groupIds: string[]) {
  const [expenseRows, shareRows, settlementRows] = await Promise.all([
    db
      .select({
        id: schema.expenses.id,
        groupId: schema.expenses.groupId,
        paidBy: schema.expenses.paidByMemberId,
        createdAt: schema.expenses.createdAt,
      })
      .from(schema.expenses)
      .where(inArray(schema.expenses.groupId, groupIds)),
    db
      .select({
        expenseId: schema.expenseShares.expenseId,
        memberId: schema.expenseShares.memberId,
        amount: schema.expenseShares.amount,
      })
      .from(schema.expenseShares)
      .innerJoin(schema.expenses, eq(schema.expenses.id, schema.expenseShares.expenseId))
      .where(inArray(schema.expenses.groupId, groupIds)),
    db.select().from(schema.settlements).where(inArray(schema.settlements.groupId, groupIds)),
  ]);

  const ledgers = new Map(
    groupIds.map((id) => [
      id,
      {
        expenses: [] as { paidByMemberId: string; shares: { memberId: string; amount: number }[] }[],
        settlements: [] as typeof settlementRows,
        lastActivity: undefined as Date | undefined,
      },
    ]),
  );
  const sharesByExpense = Map.groupBy(shareRows, (s) => s.expenseId);
  for (const e of expenseRows) {
    const ledger = ledgers.get(e.groupId)!;
    ledger.expenses.push({ paidByMemberId: e.paidBy, shares: sharesByExpense.get(e.id) ?? [] });
    if (!ledger.lastActivity || e.createdAt > ledger.lastActivity) ledger.lastActivity = e.createdAt;
  }
  for (const s of settlementRows) {
    const ledger = ledgers.get(s.groupId)!;
    ledger.settlements.push(s);
    if (!ledger.lastActivity || s.createdAt > ledger.lastActivity) ledger.lastActivity = s.createdAt;
  }
  return ledgers;
}

export async function getGroupDetail(db: DB, userId: string, groupId: string) {
  const { group, member: me } = await requireMember(db, groupId, userId);
  const [members, expenseRows, ledgers] = await Promise.all([
    db.select().from(schema.members).where(eq(schema.members.groupId, groupId)).orderBy(asc(schema.members.createdAt), sql`rowid`),
    db.query.expenses.findMany({
      where: eq(schema.expenses.groupId, groupId),
      orderBy: [desc(schema.expenses.date), desc(schema.expenses.createdAt)],
      with: {
        shares: true,
        // First page of a stored bill photo, for the thumbnail in the activity list.
        images: { columns: { id: true }, orderBy: [asc(schema.billImages.page)], limit: 1 },
      },
    }),
    loadLedgers(db, [groupId]),
  ]);
  const ledger = ledgers.get(groupId)!;
  const net = computeBalances(
    members.map((m) => m.id),
    ledger.expenses,
    ledger.settlements,
  );

  return {
    group,
    me,
    members,
    balances: members.map((m) => ({ member: m, amount: net.get(m.id) ?? 0 })),
    transfers: simplifyDebts(net),
    expenses: expenseRows.map((e) => ({
      ...e,
      myShare: e.shares.find((s) => s.memberId === me.id)?.amount ?? 0,
    })),
    settlements: [...ledger.settlements].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  };
}

export async function getInvite(db: DB, inviteToken: string) {
  const group = await db.query.groups.findFirst({ where: eq(schema.groups.inviteToken, inviteToken) });
  if (!group) throw new AppError("This invite link is invalid or has been reset", 404);
  const placeholders = await db
    .select({ id: schema.members.id, displayName: schema.members.displayName })
    .from(schema.members)
    .where(and(eq(schema.members.groupId, group.id), isNull(schema.members.userId)));
  const memberCount = (await db.select({ id: schema.members.id }).from(schema.members).where(eq(schema.members.groupId, group.id))).length;
  return { group: { id: group.id, name: group.name, emoji: group.emoji }, placeholders, memberCount };
}

/**
 * Joins via invite link. If `claimMemberId` names a placeholder (e.g. "Sam" added by a friend),
 * the account takes over that member so past expenses carry over.
 */
export async function joinGroup(
  db: DB,
  user: { id: string; name: string },
  inviteToken: string,
  claimMemberId?: string,
) {
  const group = await db.query.groups.findFirst({ where: eq(schema.groups.inviteToken, inviteToken) });
  if (!group) throw new AppError("This invite link is invalid or has been reset", 404);

  const existing = await db.query.members.findFirst({
    where: and(eq(schema.members.groupId, group.id), eq(schema.members.userId, user.id)),
  });
  if (existing) return group.id;

  if (claimMemberId) {
    const claimed = await db
      .update(schema.members)
      .set({ userId: user.id })
      .where(
        and(
          eq(schema.members.id, claimMemberId),
          eq(schema.members.groupId, group.id),
          isNull(schema.members.userId),
        ),
      )
      .returning({ id: schema.members.id });
    if (claimed.length === 1) return group.id;
    throw new AppError("That spot was already claimed. Join as yourself instead.", 409);
  }

  await db.insert(schema.members).values({ id: nanoid(), groupId: group.id, userId: user.id, displayName: user.name });
  return group.id;
}

export async function resetInvite(db: DB, userId: string, groupId: string) {
  await requireMember(db, groupId, userId);
  await db.update(schema.groups).set({ inviteToken: nanoid(24) }).where(eq(schema.groups.id, groupId));
}
