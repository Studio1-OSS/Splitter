import { beforeEach, describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "../db/schema";
import type { DB } from "../db";
import { createGroup, getGroupDetail, getInvite, joinGroup, listGroupsForUser } from "./groups";
import { createExpense, deleteExpense, getExpense, getSharedExpense } from "./expenses";
import { confirmSettlement, deleteSettlement, recordSettlement } from "./settlements";
import { AppError } from "./errors";

let db: DB;
const alice = { id: "u_alice", name: "Alice" };
const bob = { id: "u_bob", name: "Bob" };
const mallory = { id: "u_mallory", name: "Mallory" };

beforeEach(async () => {
  const client = createClient({ url: ":memory:" });
  db = drizzle(client, { schema }) as unknown as DB;
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.user).values(
    [alice, bob, mallory].map((u) => ({ ...u, email: `${u.id}@example.com`, emailVerified: true })),
  );
});

async function setupGroup() {
  const groupId = await createGroup(db, alice, { name: "Lisbon trip", currency: "EUR", friends: ["Bob", "Chris"] });
  const invite = (await db.query.groups.findFirst())!.inviteToken;
  const { placeholders } = await getInvite(db, invite);
  const bobSpot = placeholders.find((p) => p.displayName === "Bob")!;
  await joinGroup(db, bob, invite, bobSpot.id);
  const detail = await getGroupDetail(db, alice.id, groupId);
  const byName = Object.fromEntries(detail.members.map((m) => [m.displayName, m.id]));
  return { groupId, invite, members: byName as Record<"Alice" | "Bob" | "Chris", string> };
}

describe("groups", () => {
  it("creates a group with the owner and placeholder friends", async () => {
    const { groupId } = await setupGroup();
    const detail = await getGroupDetail(db, alice.id, groupId);
    expect(detail.members.map((m) => m.displayName)).toEqual(["Alice", "Bob", "Chris"]);
    expect(detail.members.find((m) => m.displayName === "Bob")!.userId).toBe(bob.id);
    expect(detail.members.find((m) => m.displayName === "Chris")!.userId).toBeNull();
  });

  it("hides groups from non-members", async () => {
    const { groupId } = await setupGroup();
    await expect(getGroupDetail(db, mallory.id, groupId)).rejects.toThrow(AppError);
    expect(await listGroupsForUser(db, mallory.id)).toEqual([]);
  });

  it("joining twice is a no-op and claimed spots can't be stolen", async () => {
    const { invite, members, groupId } = await setupGroup();
    await joinGroup(db, bob, invite);
    expect((await getGroupDetail(db, bob.id, groupId)).members).toHaveLength(3);
    await expect(joinGroup(db, mallory, invite, members.Bob)).rejects.toThrow(/already claimed/);
  });
});

describe("expenses", () => {
  it("computes shares on the server and balances to zero", async () => {
    const { groupId, members } = await setupGroup();
    const { expenseId, total } = await createExpense(db, alice.id, {
      groupId,
      paidByMemberId: members.Alice,
      merchant: "Time Out Market",
      date: "2026-10-01",
      items: [
        { name: "Bacalhau", amount: 1800, assignees: [{ memberId: members.Alice, weight: 1 }] },
        { name: "Sardines", amount: 1200, assignees: [{ memberId: members.Bob, weight: 1 }] },
        {
          name: "Vinho verde",
          amount: 2400,
          assignees: Object.values(members).map((memberId) => ({ memberId, weight: 1 })),
        },
      ],
      tax: 540,
      tip: 500,
    });
    expect(total).toBe(1800 + 1200 + 2400 + 540 + 500);

    const detail = await getGroupDetail(db, bob.id, groupId);
    const sum = detail.balances.reduce((a, b) => a + b.amount, 0);
    expect(sum).toBe(0);
    expect(detail.balances.find((b) => b.member.id === members.Alice)!.amount).toBeGreaterThan(0);
    expect(detail.transfers.every((t) => t.toMemberId === members.Alice)).toBe(true);

    const { expense } = await getExpense(db, bob.id, expenseId);
    expect(expense.shares.reduce((a, s) => a + s.amount, 0)).toBe(total);
  });

  it("rejects unassigned items and outsiders", async () => {
    const { groupId, members } = await setupGroup();
    const base = { groupId, paidByMemberId: members.Alice, merchant: "Café", date: "2026-10-02" };
    await expect(
      createExpense(db, alice.id, { ...base, items: [{ name: "Coffee", amount: 300, assignees: [] }] }),
    ).rejects.toThrow(/not assigned/);

    const other = await createGroup(db, mallory, { name: "Mallory's", currency: "EUR" });
    const malloryMember = (await getGroupDetail(db, mallory.id, other)).me.id;
    await expect(
      createExpense(db, alice.id, {
        ...base,
        items: [{ name: "Coffee", amount: 300, assignees: [{ memberId: malloryMember, weight: 1 }] }],
      }),
    ).rejects.toThrow(/outside this group/);
    await expect(
      createExpense(db, mallory.id, {
        ...base,
        items: [{ name: "Coffee", amount: 300, assignees: [{ memberId: members.Alice, weight: 1 }] }],
      }),
    ).rejects.toThrow(/not found/);
  });

  it("share links expose names and amounts but no account data", async () => {
    const { groupId, members } = await setupGroup();
    const { shareToken, expenseId } = await createExpense(db, alice.id, {
      groupId,
      paidByMemberId: members.Bob,
      merchant: "Taxi",
      date: "2026-10-03",
      items: [{ name: "Ride", amount: 2000, assignees: [members.Alice, members.Bob].map((memberId) => ({ memberId, weight: 1 })) }],
    });
    const shared = await getSharedExpense(db, shareToken);
    expect(shared?.paidBy).toBe("Bob");
    expect(JSON.stringify(shared)).not.toMatch(/example\.com|u_alice|u_bob/);
    expect(await getSharedExpense(db, "nope")).toBeNull();

    await expect(deleteExpense(db, bob.id, expenseId)).rejects.toThrow(/Only the person/);
    await deleteExpense(db, alice.id, expenseId);
    expect(await getSharedExpense(db, shareToken)).toBeNull();
  });
});

describe("single-amount expenses", () => {
  it("splits by shares (one item, weighted assignees) and keeps the category", async () => {
    const { groupId, members } = await setupGroup();
    const { expenseId, total } = await createExpense(db, alice.id, {
      groupId,
      paidByMemberId: members.Alice,
      merchant: "Airbnb",
      category: "accommodation",
      date: "2026-10-05",
      items: [
        {
          name: "Airbnb",
          amount: 60000,
          assignees: [
            { memberId: members.Alice, weight: 2 },
            { memberId: members.Bob, weight: 1 },
            { memberId: members.Chris, weight: 1 },
          ],
        },
      ],
    });
    expect(total).toBe(60000);
    const { expense } = await getExpense(db, alice.id, expenseId);
    expect(expense.category).toBe("accommodation");
    const byMember = Object.fromEntries(expense.shares.map((s) => [s.memberId, s.amount]));
    expect(byMember[members.Alice]).toBe(30000);
    expect(byMember[members.Bob]).toBe(15000);
    expect(byMember[members.Chris]).toBe(15000);
  });

  it("splits by exact amounts (one item per person)", async () => {
    const { groupId, members } = await setupGroup();
    const { shareToken } = await createExpense(db, alice.id, {
      groupId,
      paidByMemberId: members.Bob,
      merchant: "Festival tickets",
      category: "tickets",
      date: "2026-10-06",
      items: [
        { name: "Alice", amount: 8999, assignees: [{ memberId: members.Alice, weight: 1 }] },
        { name: "Bob", amount: 12000, assignees: [{ memberId: members.Bob, weight: 1 }] },
      ],
    });
    const shared = await getSharedExpense(db, shareToken);
    expect(shared?.category).toBe("tickets");
    expect(shared?.total).toBe(20999);
    expect(shared?.shares).toEqual([
      { name: "Bob", amount: 12000 },
      { name: "Alice", amount: 8999 },
    ]);
  });

  it("rejects unknown categories", async () => {
    const { groupId, members } = await setupGroup();
    await expect(
      createExpense(db, alice.id, {
        groupId,
        paidByMemberId: members.Alice,
        merchant: "Thing",
        // @ts-expect-error invalid on purpose
        category: "spaceships",
        date: "2026-10-06",
        items: [{ name: "Thing", amount: 100, assignees: [{ memberId: members.Alice, weight: 1 }] }],
      }),
    ).rejects.toThrow();
  });

  it("rejects impossible dates and fake currencies", async () => {
    const { groupId, members } = await setupGroup();
    await expect(
      createExpense(db, alice.id, {
        groupId,
        paidByMemberId: members.Alice,
        merchant: "Bad date",
        date: "2026-99-99",
        items: [{ name: "X", amount: 100, assignees: [{ memberId: members.Alice, weight: 1 }] }],
      }),
    ).rejects.toThrow(/real date/);
    await expect(createGroup(db, alice, { name: "Fake", currency: "ZZZ" })).rejects.toThrow(/currency/i);
  });

  it("stores the group kind", async () => {
    const id = await createGroup(db, alice, { name: "Ski week", kind: "trip", currency: "CHF" });
    expect((await getGroupDetail(db, alice.id, id)).group.kind).toBe("trip");
  });
});

describe("settlements", () => {
  it("settling up clears balances; only the recipient confirms", async () => {
    const { groupId, members } = await setupGroup();
    await createExpense(db, alice.id, {
      groupId,
      paidByMemberId: members.Alice,
      merchant: "Groceries",
      date: "2026-10-04",
      items: [{ name: "Food", amount: 3000, assignees: [members.Alice, members.Bob].map((memberId) => ({ memberId, weight: 1 })) }],
    });
    const { id } = await recordSettlement(db, bob.id, {
      groupId,
      fromMemberId: members.Bob,
      toMemberId: members.Alice,
      amount: 1500,
    });
    const detail = await getGroupDetail(db, alice.id, groupId);
    expect(detail.balances.every((b) => b.amount === 0)).toBe(true);
    expect(detail.transfers).toEqual([]);

    await expect(confirmSettlement(db, bob.id, id)).rejects.toThrow(/Only the person who was paid/);
    await confirmSettlement(db, alice.id, id);
    await expect(deleteSettlement(db, mallory.id, id)).rejects.toThrow(AppError);
    await expect(
      recordSettlement(db, alice.id, { groupId, fromMemberId: members.Alice, toMemberId: members.Alice, amount: 1 }),
    ).rejects.toThrow(/different/);
  });
});
