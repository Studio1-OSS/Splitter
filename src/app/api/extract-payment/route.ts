import { extractPayment } from "@/server/ai/assistants";
import { ExtractionError } from "@/server/ai/nebius";
import { aiConfig, aiGuard, apiError, readImages } from "@/server/ai/request";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Reads a payment-app screenshot to prefill "Record a payment". */
export async function POST(request: Request) {
  const images = await readImages(request, 1);
  if (!images.ok) return images.response;
  const guard = await aiGuard("readPayment", { requireUser: true });
  if (!guard.ok) return guard.response;
  try {
    return Response.json({ payment: await extractPayment(aiConfig(), images.dataUrls[0]) });
  } catch (e) {
    if (e instanceof ExtractionError) return apiError(e.kind === "provider" ? 502 : 422, e.message);
    throw e;
  }
}
