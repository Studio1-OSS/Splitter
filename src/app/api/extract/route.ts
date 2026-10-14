import { ExtractionError, extractReceiptWithNebius } from "@/server/ai/nebius";
import { reconcileReceipt } from "@/server/ai/receipt";
import { aiConfig, aiGuard, apiError, readImages } from "@/server/ai/request";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Reads one bill. Send several `image` fields when they're pages of the same bill (max 4). */
export async function POST(request: Request) {
  const images = await readImages(request, 4);
  if (!images.ok) return images.response;
  const guard = await aiGuard("readBill");
  if (!guard.ok) return guard.response;

  // The images are only held in memory for this request; storing a copy is the client's choice at publish.
  const started = Date.now();
  try {
    const receipt = await extractReceiptWithNebius(aiConfig(), images.dataUrls);
    if (receipt.kind === "not_a_bill") {
      // Still costs a credit: the model did the work, and it discourages spamming random photos.
      return apiError(422, "This doesn't look like a bill. Upload a receipt, invoice, ticket or payment screenshot.");
    }
    console.info(`Bill read in ${Date.now() - started}ms (${images.dataUrls.length} page(s), ${receipt.items.length} lines)`);
    return Response.json({ receipt, issues: reconcileReceipt(receipt), creditsLeft: guard.creditsLeft });
  } catch (e) {
    if (e instanceof ExtractionError) return apiError(e.kind === "provider" ? 502 : 422, e.message);
    console.error("Unexpected extraction failure", e);
    return apiError(500, "Something went wrong reading the bill");
  }
}
