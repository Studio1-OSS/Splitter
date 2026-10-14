import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";

/** What each AI call costs, in daily credits. Planning a whole batch reasons over every bill, so it costs more. */
export const AI_COSTS = { readBill: 1, readPayment: 1, ask: 1, plan: 3 } as const;
export type AiAction = keyof typeof AI_COSTS;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Atomically spends `cost` credits from today's allowance for `key`.
 * If that would go over `limit`, the credits are given back and false is returned.
 */
export async function spendCredits(key: string, cost: number, limit: number): Promise<boolean> {
  const day = today();
  const [row] = await db
    .insert(schema.scanUsage)
    .values({ key, day, count: cost })
    .onConflictDoUpdate({
      target: [schema.scanUsage.key, schema.scanUsage.day],
      set: { count: sql`${schema.scanUsage.count} + ${cost}` },
    })
    .returning({ count: schema.scanUsage.count });
  if (row.count <= limit) return true;
  await db
    .update(schema.scanUsage)
    .set({ count: sql`${schema.scanUsage.count} - ${cost}` })
    .where(and(eq(schema.scanUsage.key, key), eq(schema.scanUsage.day, day)));
  return false;
}

/** Credits `key` has left today (for the meter in the UI). */
export async function creditsLeft(key: string, limit: number): Promise<number> {
  const row = await db.query.scanUsage.findFirst({ where: and(eq(schema.scanUsage.key, key), eq(schema.scanUsage.day, today())) });
  return Math.max(0, limit - (row?.count ?? 0));
}

export async function hashKey(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(bytes).toString("hex").slice(0, 32);
}
