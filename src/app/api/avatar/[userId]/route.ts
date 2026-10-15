import { requireUserForApi } from "@/server/auth";
import { apiError } from "@/server/ai/request";
import { db } from "@/server/db";
import { getAvatar } from "@/server/services/avatars";
import { AppError } from "@/server/services/errors";

export const runtime = "nodejs";

/** Profile photo for its owner and people who share a group with them. URLs are versioned, so cache hard. */
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const user = await requireUserForApi();
  if (!user) return apiError(404, "Not found");
  try {
    const { mime, data } = await getAvatar(db, user.id, (await params).userId);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=31536000, immutable" } });
  } catch (e) {
    if (e instanceof AppError) return apiError(404, "Not found");
    throw e;
  }
}
