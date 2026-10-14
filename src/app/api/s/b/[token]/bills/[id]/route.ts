import { apiError } from "@/server/ai/request";
import { db } from "@/server/db";
import { getSharedBillImage } from "@/server/services/bills";
import { AppError } from "@/server/services/errors";

export const runtime = "nodejs";

/** Bill image on a public batch page, only when the group turned image sharing on. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const variant = new URL(request.url).searchParams.get("v") === "thumb" ? "thumb" : "full";
  try {
    const { mime, data } = await getSharedBillImage(db, token, id, variant);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    if (e instanceof AppError) return apiError(404, "Not found");
    throw e;
  }
}
