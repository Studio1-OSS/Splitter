import { beforeEach, describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "../db/schema";
import type { DB } from "../db";
import { buildGroupLedger } from "./ask";
import { getBatch, getSharedBatch, publishBatch, setBatchShareImages } from "./batches";
import { getBillImage, getSharedBillImage, uploadBillImage } from "./bills";
import { AppError } from "./errors";
import { createExpense, deleteExpense, getExpense } from "./expenses";
import { createGroup, getGroupDetail, getInvite, joinGroup } from "./groups";

let db: DB;
const aman = { id: "u_aman", name: "Aman" };
const rakesh = { id: "u_rakesh", name: "Rakesh" };
const outsider = { id: "u_out", name: "Outsider" };
/** n bytes that start with a JPEG signature. */
const jpeg = (n: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(Math.max(0, n - 4), 7)]);

beforeEach(async () => {
  db = drizzle(createClient({ url: ":memory:" }), { schema }) as unknown as DB;
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.user).values([aman, rakesh, outsider].map((u) => ({ ...u, email: `${u.id}@example.com`, emailVerified: true })));
});

async function setup() {
  const groupId = await createGroup(db, aman, { name: "Maya's 30th", kind: "party", currency: "INR", friends: ["Rakesh", "Mahima"] });
  const token = (await db.query.groups.findFirst())!.inviteToken;
  const spot = (await getInvite(db, token)).placeholders.find((p) => p.displayName === "Rakesh")!;
  await joinGroup(db, rakesh, token, spot.id);
  const { members } = await getGroupDetail(db, aman.id, groupId);
  const m = Object.fromEntries(members.map((x) => [x.displayName, x.id])) as Record<"Aman" | "Rakesh" | "Mahima", string>;
  return { groupId, m };
}

const equal = (ids: string[]) => ids.map((memberId) => ({ memberId, weight: 1 }));

describe("publishBatch", () => {
  it("publishes expenses, payments and bill images together and balances to zero", async () => {
    const { groupId, m } = await setup();
    const img1 = await uploadBillImage(db, aman.id, { groupId, mime: "image/jpeg", bytes: jpeg(1000), thumb: jpeg(100) });
    const img2 = await uploadBillImage(db, rakesh.id, { groupId, mime: "image/jpeg", bytes: jpeg(1000), thumb: jpeg(100) });
    const all = [m.Aman, m.Rakesh, m.Mahima];

    const res = await publishBatch(db, aman.id, {
      groupId,
      title: "Maya's 30th",
      context: "Aman paid the venue, Rakesh paid 200 twice, Mahima paid 500 for drinks",
      summary: "4 expenses",
      expenses: [
        { merchant: "Venue", category: "party", date: "2026-10-10", paidByMemberId: m.Aman, items: [{ name: "Venue", amount: 300000, assignees: equal(all) }], billNos: [1], note: "Aman paid (your note)" },
        { merchant: "Taxi", category: "transport", date: "2026-10-10", paidByMemberId: m.Rakesh, items: [{ name: "Taxi", amount: 20000, assignees: equal(all) }], billNos: [2] },
        { merchant: "Taxi back", category: "transport", date: "2026-10-11", paidByMemberId: m.Rakesh, items: [{ name: "Taxi", amount: 20000, assignees: equal(all) }] },
        { merchant: "Drinks", category: "party", date: "2026-10-10", paidByMemberId: m.Mahima, items: [{ name: "Drinks", amount: 50000, assignees: equal([m.Aman, m.Mahima]) }] },
      ],
      payments: [{ fromMemberId: m.Rakesh, toMemberId: m.Aman, amount: 10000 }],
      bills: [
        { no: 1, imageIds: [img1] },
        { no: 2, imageIds: [img2] },
      ],
    });
    expect(res.expenseCount).toBe(4);
    expect(res.total).toBe(390000);
    expect(res.perMember.get(m.Aman)).toEqual({ share: 100000 + 6667 + 6667 + 25000, paid: 300000 });

    const { batch, totals, transfers, payments } = await getBatch(db, rakesh.id, res.batchId);
    expect(batch.expenses).toHaveLength(4);
    expect(batch.expenses[0].batchId).toBe(res.batchId);
    expect(batch.images.map((i) => i.billNo)).toEqual([1, 2]);
    expect(batch.images[0].expenseId).toBe(batch.expenses.find((e) => e.merchant === "Venue")!.id);
    expect(payments).toHaveLength(1);
    expect(totals.reduce((a, t) => a + t.net, 0)).toBe(0);
    expect(transfers.every((t) => t.toMemberId === m.Aman)).toBe(true);

    const detail = await getGroupDetail(db, aman.id, groupId);
    expect(detail.balances.reduce((a, b) => a + b.amount, 0)).toBe(0);

    // Images can't be attached twice.
    await expect(
      publishBatch(db, aman.id, {
        groupId,
        title: "Again",
        expenses: [{ merchant: "X", date: "2026-10-12", paidByMemberId: m.Aman, items: [{ name: "X", amount: 100, assignees: equal(all) }] }],
        bills: [{ no: 1, imageIds: [img1] }],
      }),
    ).rejects.toThrow(/already used/);
  });

  it("rejects the whole batch if one expense is invalid, naming it", async () => {
    const { groupId, m } = await setup();
    await expect(
      publishBatch(db, aman.id, {
        groupId,
        title: "Bad",
        expenses: [
          { merchant: "Fine", date: "2026-10-10", paidByMemberId: m.Aman, items: [{ name: "Fine", amount: 100, assignees: equal([m.Aman]) }] },
          { merchant: "Broken", date: "2026-10-10", paidByMemberId: m.Aman, items: [{ name: "Broken", amount: 100, assignees: [] }] },
        ],
      }),
    ).rejects.toThrow(/Expense 2 \(Broken\)/);
    expect(await db.select().from(schema.expenses)).toHaveLength(0);
    expect(await db.select().from(schema.batches)).toHaveLength(0);
  });

  it("rejects payments between unknown or identical members", async () => {
    const { groupId, m } = await setup();
    await expect(
      publishBatch(db, aman.id, {
        groupId,
        title: "Pay",
        expenses: [{ merchant: "A", date: "2026-10-10", paidByMemberId: m.Aman, items: [{ name: "A", amount: 100, assignees: equal([m.Aman]) }] }],
        payments: [{ fromMemberId: m.Aman, toMemberId: m.Aman, amount: 5 }],
      }),
    ).rejects.toThrow(/invalid payer/);
  });
});

describe("access and sharing", () => {
  it("keeps bill images and batches private to members, with opt-in public images", async () => {
    const { groupId, m } = await setup();
    await expect(uploadBillImage(db, outsider.id, { groupId, mime: "image/jpeg", bytes: jpeg(10), thumb: jpeg(10) })).rejects.toThrow(AppError);
    await expect(uploadBillImage(db, aman.id, { groupId, mime: "image/jpeg", bytes: jpeg(500 * 1024), thumb: jpeg(10) })).rejects.toThrow(/too large/);
    const text = Buffer.from("NOT_A_REAL_JPEG");
    await expect(uploadBillImage(db, aman.id, { groupId, mime: "image/jpeg", bytes: text, thumb: jpeg(10) })).rejects.toThrow(/real image/);
    await expect(uploadBillImage(db, aman.id, { groupId, mime: "image/jpeg", bytes: jpeg(10), thumb: text })).rejects.toThrow(/thumbnail/i);
    const img = await uploadBillImage(db, aman.id, { groupId, mime: "image/jpeg", bytes: jpeg(1000), thumb: jpeg(100) });
    const { batchId, shareToken } = await publishBatch(db, aman.id, {
      groupId,
      title: "Party",
      expenses: [{ merchant: "Venue", date: "2026-10-10", paidByMemberId: m.Aman, items: [{ name: "Venue", amount: 900, assignees: equal([m.Aman, m.Rakesh]) }], billNos: [1] }],
      bills: [{ no: 1, imageIds: [img] }],
    });

    expect((await getBillImage(db, rakesh.id, img, "thumb")).data.length).toBe(100);
    await expect(getBillImage(db, outsider.id, img, "full")).rejects.toThrow(AppError);
    await expect(getBatch(db, outsider.id, batchId)).rejects.toThrow(AppError);

    const shared = await getSharedBatch(db, shareToken);
    expect(shared?.images).toEqual([]);
    expect(shared?.context).toBe("");
    expect(shared?.expenses.every((e) => e.note === null)).toBe(true);
    expect(JSON.stringify(shared)).not.toMatch(/example\.com|u_aman|u_rakesh/);
    await expect(getSharedBillImage(db, shareToken, img, "full")).rejects.toThrow(AppError);

    await setBatchShareImages(db, rakesh.id, batchId, true);
    expect((await getSharedBatch(db, shareToken))?.images).toHaveLength(1);
    expect((await getSharedBillImage(db, shareToken, img, "full")).data.length).toBe(1000);
    await expect(getSharedBillImage(db, "wrong-token", img, "full")).rejects.toThrow(AppError);
  });

  it("attaches every page of a multi-page bill", async () => {
    const { groupId, m } = await setup();
    const p1 = await uploadBillImage(db, aman.id, { groupId, mime: "image/jpeg", bytes: jpeg(500), thumb: jpeg(50), page: 1 });
    const p2 = await uploadBillImage(db, aman.id, { groupId, mime: "image/jpeg", bytes: jpeg(500), thumb: jpeg(50), page: 2 });
    const { batchId } = await publishBatch(db, aman.id, {
      groupId,
      title: "Hotel",
      expenses: [{ merchant: "Hotel", date: "2026-10-10", paidByMemberId: m.Aman, items: [{ name: "Room", amount: 9408, assignees: equal([m.Aman, m.Rakesh]) }], billNos: [1] }],
      bills: [{ no: 1, imageIds: [p1, p2] }],
    });
    const { batch } = await getBatch(db, aman.id, batchId);
    expect(batch.images.map((i) => [i.billNo, i.page])).toEqual([
      [1, 1],
      [1, 2],
    ]);
    expect(new Set(batch.images.map((i) => i.expenseId)).size).toBe(1);
  });

  it("attaches a scanned bill photo to a single expense, members only", async () => {
    const { groupId, m } = await setup();
    const img = await uploadBillImage(db, rakesh.id, { groupId, mime: "image/jpeg", bytes: jpeg(800), thumb: jpeg(80) });
    const add = (imageIds: string[], gid = groupId) =>
      createExpense(db, rakesh.id, {
        groupId: gid,
        merchant: "Dinner",
        date: "2026-10-10",
        paidByMemberId: m.Rakesh,
        items: [{ name: "Dinner", amount: 900, assignees: equal([m.Aman, m.Rakesh]) }],
        imageIds,
      });
    const { expenseId } = await add([img]);
    const expense = await getExpense(db, aman.id, expenseId);
    expect(expense.expense.images.map((i) => i.id)).toEqual([img]);
    expect((await getBillImage(db, aman.id, img, "thumb")).data.length).toBe(80);
    await expect(getBillImage(db, outsider.id, img, "full")).rejects.toThrow(AppError);
    // A photo can't be attached twice, and never from another group.
    await expect(add([img])).rejects.toThrow(/already used/);
    const other = await createGroup(db, outsider, { name: "Other", currency: "INR" });
    const foreign = await uploadBillImage(db, outsider.id, { groupId: other, mime: "image/jpeg", bytes: jpeg(800), thumb: jpeg(80) });
    await expect(add([foreign])).rejects.toThrow(/already used|missing/);
  });

  it("deletes an expense's bill image with the expense", async () => {
    const { groupId, m } = await setup();
    const img = await uploadBillImage(db, aman.id, { groupId, mime: "image/jpeg", bytes: jpeg(1000), thumb: jpeg(100) });
    const { batchId } = await publishBatch(db, aman.id, {
      groupId,
      title: "Dinner",
      expenses: [{ merchant: "Dinner", date: "2026-10-10", paidByMemberId: m.Aman, items: [{ name: "Dinner", amount: 900, assignees: equal([m.Aman, m.Rakesh]) }], billNos: [1] }],
      bills: [{ no: 1, imageIds: [img] }],
    });
    const { batch } = await getBatch(db, aman.id, batchId);
    await deleteExpense(db, aman.id, batch.expenses[0].id);
    expect(await db.select().from(schema.billImages)).toHaveLength(0);
  });

  it("builds an Ask Splitter ledger for members only, with notes and balances", async () => {
    const { groupId, m } = await setup();
    await publishBatch(db, aman.id, {
      groupId,
      title: "Party",
      context: "Mahima paid 500 for drinks",
      expenses: [{ merchant: "Drinks", date: "2026-10-10", paidByMemberId: m.Mahima, note: "Mahima paid (your note)", items: [{ name: "Drinks", amount: 50000, assignees: equal([m.Aman, m.Mahima]) }] }],
    });
    const { ledger } = await buildGroupLedger(db, rakesh.id, groupId);
    expect(ledger).toContain("The person asking is Rakesh");
    expect(ledger).toContain("Drinks");
    expect(ledger).toContain("paid by Mahima");
    expect(ledger).toContain("Mahima paid 500 for drinks");
    expect(ledger).toContain("Aman pays Mahima ₹250.00");
    expect(ledger).not.toMatch(/example\.com/);
    await expect(buildGroupLedger(db, outsider.id, groupId)).rejects.toThrow(AppError);
  });
});
