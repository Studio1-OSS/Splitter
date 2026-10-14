import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { DB } from "../db";
import * as schema from "../db/schema";
import { sniffImageType } from "@/lib/image-sniff";
import { AppError } from "./errors";

export const MAX_AVATAR_BYTES = 200 * 1024;
const MIMES = new Set(["image/jpeg", "image/webp", "image/png"]);

/** The URL stored in `user.image`; the version busts caches after a change. */
export const avatarUrl = (userId: string, version: number) => `/api/avatar/${userId}?v=${version}`;

/** Saves the caller's profile photo and returns its new URL. */
export async function setAvatar(db: DB, userId: string, input: { mime: string; bytes: Buffer }) {
  if (!MIMES.has(input.mime)) throw new AppError("Use a JPEG, PNG or WebP photo");
  if (input.bytes.length === 0 || input.bytes.length > MAX_AVATAR_BYTES) throw new AppError("That photo is too large");
  // Check the real bytes, not just the declared type.
  if (sniffImageType(input.bytes) !== input.mime) throw new AppError("That file isn't a real image");

  const row = { userId, mime: input.mime, bytes: input.bytes, updatedAt: new Date() };
  await db.insert(schema.userAvatars).values(row).onConflictDoUpdate({ target: schema.userAvatars.userId, set: row });
  const url = avatarUrl(userId, row.updatedAt.getTime());
  await db.update(schema.user).set({ image: url }).where(eq(schema.user.id, userId));
  return url;
}

export async function removeAvatar(db: DB, userId: string) {
  await db.delete(schema.userAvatars).where(eq(schema.userAvatars.userId, userId));
  await db.update(schema.user).set({ image: null }).where(eq(schema.user.id, userId));
}

/** A profile photo is visible to its owner and to people who share a group with them; 404 otherwise. */
export async function getAvatar(db: DB, viewerId: string, userId: string) {
  if (viewerId !== userId) {
    const mine = alias(schema.members, "mine");
    const theirs = alias(schema.members, "theirs");
    const [shared] = await db
      .select({ groupId: mine.groupId })
      .from(mine)
      .innerJoin(theirs, eq(theirs.groupId, mine.groupId))
      .where(and(eq(mine.userId, viewerId), eq(theirs.userId, userId)))
      .limit(1);
    if (!shared) throw new AppError("Not found", 404);
  }
  const avatar = await db.query.userAvatars.findFirst({ where: eq(schema.userAvatars.userId, userId) });
  if (!avatar) throw new AppError("Not found", 404);
  return { mime: avatar.mime, data: avatar.bytes };
}
