import { and, eq, isNull, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DB } from "../db";
import * as schema from "../db/schema";
import { requireMember } from "./access";
import { sniffImageType } from "@/lib/image-sniff";
import { AppError } from "./errors";

export const MAX_BILL_BYTES = 400 * 1024;
export const MAX_THUMB_BYTES = 60 * 1024;
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const MIMES = new Set(["image/jpeg", "image/webp", "image/png"]);

/**
 * Stores a compressed bill copy uploaded during "Settle with AI". It stays pending (no batch, no expense)
 * until the batch is published; pending copies older than a day are cleaned up on the next upload.
 */
export async function uploadBillImage(
  db: DB,
  userId: string,
  input: { groupId: string; mime: string; bytes: Buffer; thumb: Buffer; page?: number },
) {
  await requireMember(db, input.groupId, userId);
  if (!MIMES.has(input.mime)) throw new AppError("Unsupported image type");
  if (input.bytes.length === 0 || input.bytes.length > MAX_BILL_BYTES) throw new AppError("Bill image is too large");
  if (input.thumb.length === 0 || input.thumb.length > MAX_THUMB_BYTES) throw new AppError("Thumbnail is too large");
  // Check the real bytes, not just the declared type.
  if (sniffImageType(input.bytes) !== input.mime) throw new AppError("That file isn't a real image");
  if (!["image/jpeg", "image/webp"].includes(sniffImageType(input.thumb) ?? "")) throw new AppError("The thumbnail isn't a real image");

  await db
    .delete(schema.billImages)
    .where(
      and(
        eq(schema.billImages.groupId, input.groupId),
        isNull(schema.billImages.batchId),
        isNull(schema.billImages.expenseId),
        lt(schema.billImages.createdAt, new Date(Date.now() - PENDING_TTL_MS)),
      ),
    );

  const id = nanoid();
  await db.insert(schema.billImages).values({
    id,
    groupId: input.groupId,
    page: Math.min(4, Math.max(1, Math.trunc(input.page ?? 1))),
    mime: input.mime,
    bytes: input.bytes,
    thumb: input.thumb,
    uploadedBy: userId,
  });
  return id;
}

async function loadImage(db: DB, id: string, variant: "full" | "thumb") {
  const [row] = await db
    .select({
      groupId: schema.billImages.groupId,
      batchId: schema.billImages.batchId,
      mime: schema.billImages.mime,
      data: variant === "thumb" ? schema.billImages.thumb : schema.billImages.bytes,
    })
    .from(schema.billImages)
    .where(eq(schema.billImages.id, id))
    .limit(1);
  return row;
}

/** Members only. Same 404 for "missing" and "not yours". */
export async function getBillImage(db: DB, userId: string, id: string, variant: "full" | "thumb") {
  const row = await loadImage(db, id, variant);
  if (!row) throw new AppError("Not found", 404);
  await requireMember(db, row.groupId, userId);
  return { mime: variant === "thumb" ? "image/jpeg" : row.mime, data: row.data as Buffer };
}

/** For public batch share pages, only when the batch owner turned image sharing on. */
export async function getSharedBillImage(db: DB, shareToken: string, id: string, variant: "full" | "thumb") {
  const batch = await db.query.batches.findFirst({ where: eq(schema.batches.shareToken, shareToken) });
  const row = await loadImage(db, id, variant);
  if (!batch || !batch.shareImages || !row || row.batchId !== batch.id) throw new AppError("Not found", 404);
  return { mime: variant === "thumb" ? "image/jpeg" : row.mime, data: row.data as Buffer };
}
