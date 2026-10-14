import { requireUserForApi } from "@/server/auth";
import { apiError } from "@/server/ai/request";
import { db } from "@/server/db";
import { getBillImage } from "@/server/services/bills";
import { AppError } from "@/server/services/errors";

export const runtime = "nodejs";

/** Bill image for group members. `?v=thumb` for the small version. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserForApi();
  if (!user) return apiError(404, "Not found");
  const variant = new URL(request.url).searchParams.get("v") === "thumb" ? "thumb" : "full";
  try {
    const { mime, data } = await getBillImage(db, user.id, (await params).id, variant);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=86400" } });
  } catch (e) {
    if (e instanceof AppError) return apiError(404, "Not found");
    throw e;
  }
}
