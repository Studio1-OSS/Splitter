import { and, asc, eq, sql } from "drizzle-orm";
import type { DB } from "../db";
import * as schema from "../db/schema";
import { AppError } from "./errors";

/**
 * Every group-scoped read or write goes through this check.
 * Returns the group and the caller's member row, or throws a 404 (no existence leak).
 */
export async function requireMember(db: DB, groupId: string, userId: string) {
  const [row] = await db
    .select({ group: schema.groups, member: schema.members })
    .from(schema.members)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.members.groupId))
    .where(and(eq(schema.members.groupId, groupId), eq(schema.members.userId, userId)))
    .limit(1);
  if (!row) throw new AppError("Group not found", 404);
  return row;
}

export async function groupMemberIds(db: DB, groupId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: schema.members.id })
    .from(schema.members)
    .where(eq(schema.members.groupId, groupId))
    // The same order the group page shows (and the client previews with): spare cents go to the first member,
    // so the saved split matches the preview to the cent.
    .orderBy(asc(schema.members.createdAt), sql`rowid`);
  return new Set(rows.map((r) => r.id));
}
