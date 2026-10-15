import { requireUserForApi } from "@/server/auth";
import { apiError } from "@/server/ai/request";
import { db } from "@/server/db";
import { uploadBillImage } from "@/server/services/bills";
import { AppError } from "@/server/services/errors";

export const runtime = "nodejs";

/** Stores a compressed bill copy while "Settle with AI" is in progress (multipart: groupId, image, thumb). */
export async function POST(request: Request) {
  const user = await requireUserForApi();
  if (!user) return apiError(401, "Sign in first");
  const form = await request.formData().catch(() => null);
  const groupId = form?.get("groupId");
  const image = form?.get("image");
  const thumb = form?.get("thumb");
  if (typeof groupId !== "string" || !(image instanceof File) || !(thumb instanceof File)) return apiError(400, "Missing image");
  try {
    const id = await uploadBillImage(db, user.id, {
      groupId,
      mime: image.type,
      bytes: Buffer.from(await image.arrayBuffer()),
      thumb: Buffer.from(await thumb.arrayBuffer()),
      page: Number(form?.get("page") ?? 1) || 1,
    });
    return Response.json({ id });
  } catch (e) {
    if (e instanceof AppError) return apiError(e.status, e.message);
    throw e;
  }
}
