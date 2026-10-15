import { z } from "zod";
import { askSplitter } from "@/server/ai/assistants";
import { ExtractionError } from "@/server/ai/nebius";
import { aiConfig, aiGuard, apiError } from "@/server/ai/request";
import { getSessionUser } from "@/server/auth";
import { requireMember } from "@/server/services/access";
import { db } from "@/server/db";
import { buildGroupLedger } from "@/server/services/ask";
import { AppError } from "@/server/services/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

const input = z.object({ groupId: z.string().min(1), question: z.string().trim().min(3).max(500) });

/** "Ask Splitter": answers a member's question from their group's ledger only. Read-only. */
export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Ask a question (3–500 characters)");
  // Check membership before spending credits: a wrong or stale group costs nothing.
  const user = await getSessionUser();
  if (!user) return apiError(401, "Sign in to use this");
  try {
    await requireMember(db, parsed.data.groupId, user.id);
  } catch (e) {
    if (e instanceof AppError) return apiError(e.status, e.message);
    throw e;
  }
  const guard = await aiGuard("ask");
  if (!guard.ok) return guard.response;
  try {
    const { ledger } = await buildGroupLedger(db, guard.user!.id, parsed.data.groupId);
    const answer = await askSplitter(aiConfig(), ledger, parsed.data.question);
    return Response.json({ answer: answer || "I couldn't find an answer in this group's expenses.", creditsLeft: guard.creditsLeft });
  } catch (e) {
    if (e instanceof AppError) return apiError(e.status, e.message);
    if (e instanceof ExtractionError) return apiError(502, e.message);
    throw e;
  }
}
