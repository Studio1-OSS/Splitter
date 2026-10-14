import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ExtractionError } from "@/server/ai/nebius";
import { planSettlement, type Plan } from "@/server/ai/planner";
import { receiptSchema } from "@/server/ai/receipt";
import { aiConfig, aiGuard, apiError } from "@/server/ai/request";
import { db, schema } from "@/server/db";
import { requireMember } from "@/server/services/access";
import { getSessionUser } from "@/server/auth";
import { AppError } from "@/server/services/errors";
import { fromMinor } from "@/lib/money";
import { todayISO } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

const input = z.object({
  groupId: z.string().min(1),
  notes: z.string().max(4000).default(""),
  bills: z.array(z.object({ no: z.number().int().positive(), receipt: receiptSchema })).max(20),
  answers: z.array(z.object({ question: z.string().max(500), answer: z.string().max(1000) })).max(10).default([]),
});

/**
 * Stage 2 of "Settle with AI": plans the settlement (with calculator tool calls) from bills the model already read plus the group's notes.
 * Members are sent to the model as short refs (m1, m2…) and mapped back here, so unknown refs become null.
 */
export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid request");
  if (parsed.data.bills.length === 0 && !parsed.data.notes.trim()) return apiError(400, "Add at least one bill or a note");
  // Check membership before spending credits: a wrong or stale group costs nothing.
  const user = await getSessionUser();
  if (!user) return apiError(401, "Sign in to use this");
  let membership;
  try {
    membership = await requireMember(db, parsed.data.groupId, user.id);
  } catch (e) {
    if (e instanceof AppError) return apiError(e.status, e.message);
    throw e;
  }
  const guard = await aiGuard("plan");
  if (!guard.ok) return guard.response;

  try {
    const { group, member: me } = membership;
    const [members, recent] = await Promise.all([
      db.select().from(schema.members).where(eq(schema.members.groupId, group.id)),
      db
        .select({ merchant: schema.expenses.merchant, date: schema.expenses.date, total: schema.expenses.total })
        .from(schema.expenses)
        .where(eq(schema.expenses.groupId, group.id))
        .orderBy(desc(schema.expenses.createdAt))
        .limit(40),
    ]);
    const refs = members.map((m, i) => ({ ref: `m${i + 1}`, id: m.id, name: m.displayName, isMe: m.id === me.id }));
    const toId = new Map(refs.map((r) => [r.ref, r.id]));
    const resolve = (ref: string | null) => (ref ? (toId.get(ref.trim()) ?? null) : null);

    const started = Date.now();
    const { plan, trace, toolMode } = await planSettlement(aiConfig(), {
      groupName: group.name,
      groupKind: group.kind,
      currency: group.currency,
      members: refs,
      bills: parsed.data.bills,
      notes: parsed.data.notes,
      answers: parsed.data.answers,
      recentExpenses: recent.map((e) => ({ ...e, total: fromMinor(e.total, group.currency) })),
      today: todayISO(),
    });
    console.info(
      `Settlement planned in ${Date.now() - started}ms: ${plan.expenses.length} expenses, ${plan.questions.length} questions, ${trace.length} tool calls (${toolMode})`,
    );

    // Safety net: the model should write names in prose, but swap any stray refs (m1, m2…) for names.
    const nameOfRef = new Map(refs.map((r) => [r.ref, r.name]));
    const prose = (t: string) => t.replace(/\bm(\d{1,2})\b/g, (ref) => nameOfRef.get(ref) ?? ref);
    const resolved: Plan = {
      ...plan,
      summary: prose(plan.summary),
      questions: plan.questions.map(prose),
      duplicates: plan.duplicates.map((d) => ({ ...d, reason: prose(d.reason) })),
      expenses: plan.expenses.map((e) => ({
        ...e,
        explanation: prose(e.explanation),
        description: prose(e.description),
        paidBy: resolve(e.paidBy),
        split: {
          ...e.split,
          participants: e.split.participants.map((p) => ({ ...p, member: resolve(p.member) ?? "" })).filter((p) => p.member),
          lines: e.split.lines.map((l) => ({ ...l, members: l.members.map(resolve).filter((x): x is string => !!x) })),
        },
      })),
      payments: plan.payments.map((p) => ({ ...p, explanation: prose(p.explanation), from: resolve(p.from), to: resolve(p.to) })),
    };
    // Tool calls use refs too; show names to people.
    const namedTrace = JSON.parse(prose(JSON.stringify(trace))) as typeof trace;
    return Response.json({ plan: resolved, trace: namedTrace, toolMode, creditsLeft: guard.creditsLeft });
  } catch (e) {
    if (e instanceof AppError) return apiError(e.status, e.message);
    if (e instanceof ExtractionError) return apiError(e.kind === "provider" ? 502 : 422, e.message);
    throw e;
  }
}
