"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { formatMoney, fromMinor, moneyParts } from "@/lib/money";
import { requireUser } from "./auth";
import { db } from "./db";
import { notifyGroup } from "./notify";
import { AppError } from "./services/errors";
import * as batches from "./services/batches";
import * as expenses from "./services/expenses";
import * as groups from "./services/groups";
import * as settlements from "./services/settlements";

/**
 * Variables for custom Novu workflow templates, alongside the generic title/body/url.
 * Amounts are plain numbers in major units (e.g. 600.5); `currency` is the symbol, e.g. "₹".
 */
function templateVars(group: { name: string; currency: string }, v: { billTitle: string; total: number; share: number; paidByName: string }) {
  return {
    billTitle: v.billTitle,
    groupName: group.name,
    paidByName: v.paidByName,
    currency: moneyParts(0, group.currency).symbol,
    totalAmount: fromMinor(v.total, group.currency),
    yourShare: fromMinor(v.share, group.currency),
  };
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    // Let Next.js redirects/notFound propagate.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function createGroupAction(input: groups.CreateGroupInput) {
  const user = await requireUser();
  return run(async () => {
    const id = await groups.createGroup(db, user, input);
    revalidatePath("/dashboard");
    return { id };
  });
}

export async function addMemberAction(groupId: string, displayName: string) {
  const user = await requireUser();
  return run(async () => {
    await groups.addPlaceholderMember(db, user.id, groupId, displayName);
    revalidatePath(`/groups/${groupId}`);
  });
}

export async function resetInviteAction(groupId: string) {
  const user = await requireUser();
  return run(async () => {
    await groups.resetInvite(db, user.id, groupId);
    revalidatePath(`/groups/${groupId}`);
  });
}

export async function joinGroupAction(inviteToken: string, claimMemberId?: string) {
  const user = await requireUser(`/join/${inviteToken}`);
  return run(async () => {
    const groupId = await groups.joinGroup(db, user, inviteToken, claimMemberId);
    revalidatePath("/dashboard");
    revalidatePath(`/groups/${groupId}`);
    const group = await db.query.groups.findFirst({ where: (g, { eq }) => eq(g.id, groupId) });
    if (group) {
      await notifyGroup({
        groupId,
        actorUserId: user.id,
        eventId: `join:${groupId}:${user.id}`,
        title: `${user.name} joined ${group.name}`,
        body: `${user.name} is in the group now and can see every expense and their share.`,
        url: `/groups/${groupId}`,
        extra: () => templateVars(group, { billTitle: `${user.name} joined`, total: 0, share: 0, paidByName: user.name }),
      });
    }
    return { groupId };
  });
}

export async function createExpenseAction(input: expenses.CreateExpenseInput) {
  const user = await requireUser();
  return run(async () => {
    const result = await expenses.createExpense(db, user.id, input);
    revalidatePath(`/groups/${result.group.id}`);
    revalidatePath("/dashboard");

    const shareByMember = new Map(result.shares.map((s) => [s.memberId, s.total]));
    const payer = await db.query.members.findFirst({ where: (m, { eq }) => eq(m.id, input.paidByMemberId) });
    const paidByName = payer?.displayName ?? user.name;
    await notifyGroup({
      groupId: result.group.id,
      actorUserId: user.id,
      eventId: `expense:${result.expenseId}`,
      title: `${user.name} added “${input.merchant}” in ${result.group.name}`,
      body: (memberId) => {
        const share = shareByMember.get(memberId) ?? 0;
        const who = payer?.userId === user.id ? "" : ` ${paidByName} paid.`;
        return share > 0
          ? `Your share is ${formatMoney(share, result.group.currency)} of ${formatMoney(result.total, result.group.currency)}.${who}`
          : `Total ${formatMoney(result.total, result.group.currency)}. You're not part of this one.${who}`;
      },
      url: `/expenses/${result.expenseId}`,
      extra: (memberId) =>
        templateVars(result.group, { billTitle: input.merchant, total: result.total, share: shareByMember.get(memberId) ?? 0, paidByName }),
    });
    return { expenseId: result.expenseId, shareToken: result.shareToken };
  });
}

export async function deleteExpenseAction(expenseId: string) {
  const user = await requireUser();
  return run(async () => {
    const groupId = await expenses.deleteExpense(db, user.id, expenseId);
    revalidatePath(`/groups/${groupId}`);
    return { groupId };
  });
}

export async function recordSettlementAction(input: {
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}) {
  const user = await requireUser();
  return run(async () => {
    const { id, group } = await settlements.recordSettlement(db, user.id, input);
    revalidatePath(`/groups/${group.id}`);
    revalidatePath("/dashboard");
    await notifyGroup({
      groupId: group.id,
      actorUserId: user.id,
      eventId: `settlement:${id}`,
      title: `Payment recorded in ${group.name}`,
      body: (memberId) => {
        const amount = formatMoney(input.amount, group.currency);
        if (memberId === input.toMemberId) return `${user.name} says you were paid ${amount}. Confirm it in the group once it arrives.`;
        if (memberId === input.fromMemberId) return `${user.name} recorded your payment of ${amount}.`;
        return `${user.name} recorded a payment of ${amount}. Balances are updated.`;
      },
      url: `/groups/${group.id}`,
      extra: () => templateVars(group, { billTitle: "Payment", total: input.amount, share: input.amount, paidByName: user.name }),
    });
  });
}

export async function confirmSettlementAction(settlementId: string) {
  const user = await requireUser();
  return run(async () => {
    const groupId = await settlements.confirmSettlement(db, user.id, settlementId);
    revalidatePath(`/groups/${groupId}`);
    const row = await db.query.settlements.findFirst({ where: (t, { eq }) => eq(t.id, settlementId), with: { group: true } });
    if (row) {
      await notifyGroup({
        groupId,
        actorUserId: user.id,
        eventId: `confirm:${settlementId}`,
        title: `Payment confirmed in ${row.group.name}`,
        body: (memberId) =>
          memberId === row.fromMemberId
            ? `${user.name} confirmed your ${formatMoney(row.amount, row.group.currency)} payment. You're all set.`
            : `${user.name} confirmed receiving ${formatMoney(row.amount, row.group.currency)}.`,
        url: `/groups/${groupId}`,
        extra: () => templateVars(row.group, { billTitle: "Payment confirmed", total: row.amount, share: row.amount, paidByName: user.name }),
      });
    }
  });
}

export async function deleteSettlementAction(settlementId: string) {
  const user = await requireUser();
  return run(async () => {
    const groupId = await settlements.deleteSettlement(db, user.id, settlementId);
    revalidatePath(`/groups/${groupId}`);
    revalidatePath("/dashboard");
  });
}

export async function publishBatchAction(input: batches.PublishBatchInput) {
  const user = await requireUser();
  return run(async () => {
    const res = await batches.publishBatch(db, user.id, input);
    revalidatePath(`/groups/${res.group.id}`);
    revalidatePath("/dashboard");
    const c = res.group.currency;
    await notifyGroup({
      groupId: res.group.id,
      actorUserId: user.id,
      eventId: `batch:${res.batchId}`,
      title: `${input.title} is settled`,
      body: (memberId) => {
        const t = res.perMember.get(memberId) ?? { share: 0, paid: 0 };
        const net = t.paid - t.share;
        const head = `${user.name} added ${res.expenseCount} expenses (${formatMoney(res.total, c)}).`;
        if (net < 0) return `${head} You owe ${formatMoney(-net, c)} overall. Tap to see how it was split.`;
        if (net > 0) return `${head} You're owed ${formatMoney(net, c)}. Tap to see the details.`;
        return `${head} You're even on these. Tap to see the details.`;
      },
      url: `/groups/${res.group.id}/batches/${res.batchId}`,
      extra: (memberId) =>
        templateVars(res.group, { billTitle: input.title, total: res.total, share: res.perMember.get(memberId)?.share ?? 0, paidByName: user.name }),
    });
    return { batchId: res.batchId };
  });
}

export async function setBatchShareImagesAction(batchId: string, on: boolean) {
  const user = await requireUser();
  return run(async () => {
    const groupId = await batches.setBatchShareImages(db, user.id, batchId, on);
    revalidatePath(`/groups/${groupId}/batches/${batchId}`);
  });
}
