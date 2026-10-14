"use client";

import { ArrowLeft, Check, Hash, Loader2, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Eyebrow, Field, Input } from "@/components/ui/primitives";
import { GROUP_KINDS, isGroupKind, type CategoryKey } from "@/config/categories";
import { todayISO } from "@/lib/utils";
import { publishBatchAction } from "@/server/actions";
import type { Plan } from "@/server/ai/planner";
import { draftTotal, emptyDraft, expenseLines, type Person } from "../split/draft";
import { StepBar } from "../split/people";
import { BillTray } from "./bill-tray";
import { normalizePlan, proposalProblem, type NormalizedPlan, type Proposal, type ProposedPayment } from "./normalize";
import { ProposalEditor } from "./proposal-editor";
import { ReviewBoard } from "./review-board";
import { site } from "@/config/site";
import type { ToolCall } from "@/server/ai/tools";
import { useBills } from "./use-bills";

type Group = { id: string; name: string; kind: string; currency: string };

const WORKING = ["Reading every bill", "Matching your notes to who paid", "Looking for duplicates", "Balancing the split"];
const DEMO_NAMES = ["Aman", "Rakesh", "Mahima", "Leo", "Priya"];

/** Swap the demo names in example notes for this group's real members. */
function personalise(example: string, names: string[]) {
  let i = 0;
  const map = new Map<string, string>();
  return example.replace(new RegExp(`\\b(${DEMO_NAMES.join("|")})\\b`, "g"), (n) => {
    if (!map.has(n)) map.set(n, names[i++ % Math.max(1, names.length)] ?? n);
    return map.get(n)!;
  });
}

export function BatchFlow({
  group,
  members,
  meId,
  scanEnabled,
  quotaLeft,
}: {
  group: Group;
  members: Person[];
  meId: string;
  scanEnabled: boolean;
  quotaLeft: number;
}) {
  const router = useRouter();
  const [credits, setCredits] = React.useState(quotaLeft);
  const { bills, addFiles, remove, retry, retryUpload, mergeIntoPrevious } = useBills(group.id, setCredits);
  const [notes, setNotes] = React.useState("");
  const [stage, setStage] = React.useState<"collect" | "planning" | "review">("collect");
  const [working, setWorking] = React.useState(0);
  const [plan, setPlan] = React.useState<NormalizedPlan | null>(null);
  const [checks, setChecks] = React.useState<{ trace: ToolCall[]; toolMode: "native" | "app" }>({ trace: [], toolMode: "native" });
  const [proposals, setProposals] = React.useState<Proposal[]>([]);
  const [payments, setPayments] = React.useState<ProposedPayment[]>([]);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [replanning, setReplanning] = React.useState(false);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [publishing, setPublishing] = React.useState(false);
  const notesRef = React.useRef<HTMLTextAreaElement>(null);

  const kind = isGroupKind(group.kind) ? GROUP_KINDS[group.kind] : GROUP_KINDS.other;
  const defaultCategory: CategoryKey = kind.defaultCategory;
  const [title, setTitle] = React.useState(() => `${group.name} · ${new Date().toLocaleDateString(undefined, { month: "short", year: "numeric" })}`);
  const names = members.filter((m) => m.id !== meId).map((m) => m.name);

  const readable = bills.filter((b) => b.status === "done");
  const busy = bills.some((b) => b.status === "preparing" || b.status === "queued" || b.status === "reading");
  const canPlan = scanEnabled && !busy && credits >= 3 && (readable.length > 0 || notes.trim().length > 0);

  // Don't lose a pile of bills to an accidental back-swipe.
  React.useEffect(() => {
    if (bills.length === 0 || publishing) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [bills.length, publishing]);

  React.useEffect(() => {
    if (stage !== "planning") return;
    const t = setInterval(() => setWorking((w) => Math.min(WORKING.length - 1, w + 1)), 4500);
    return () => clearInterval(t);
  }, [stage]);

  const insert = (text: string) => {
    const el = notesRef.current;
    const at = el?.selectionStart ?? notes.length;
    const before = notes.slice(0, at);
    const spacer = before && !/\s$/.test(before) ? " " : "";
    setNotes(before + spacer + text + " " + notes.slice(at));
    requestAnimationFrame(() => el?.focus());
  };

  async function runPlan(withAnswers = false) {
    if (withAnswers) setReplanning(true);
    else {
      setStage("planning");
      setWorking(0);
    }
    try {
      const res = await fetch("/api/batch/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: group.id,
          notes,
          bills: readable.map((b) => ({ no: b.no, receipt: b.receipt })),
          answers: withAnswers ? Object.entries(answers).filter(([, a]) => a.trim()).map(([question, answer]) => ({ question, answer })) : [],
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { plan?: Plan; trace?: ToolCall[]; toolMode?: "native" | "app"; error?: string; creditsLeft?: number };
      if (typeof body.creditsLeft === "number") setCredits(body.creditsLeft);
      if (!res.ok || !body.plan) throw new Error(body.error ?? "Splitter couldn't work this out. Try again.");
      const normalized = normalizePlan(body.plan, {
        members,
        currency: group.currency,
        bills: readable.map((b) => ({ no: b.no, receipt: b.receipt! })),
        defaultCategory,
        today: todayISO(),
      });
      setPlan(normalized);
      setChecks({ trace: body.trace ?? [], toolMode: body.toolMode ?? "native" });
      setProposals(normalized.proposals);
      setPayments(normalized.payments);
      setAnswers({});
      setStage("review");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      if (!withAnswers) setStage("collect");
    } finally {
      setReplanning(false);
    }
  }

  async function publish() {
    const bad = proposals.find((p) => proposalProblem(p));
    if (bad) {
      toast.error(`${bad.merchant}: ${proposalProblem(bad)}`);
      setEditing(bad.pid);
      return;
    }
    setPublishing(true);
    const res = await publishBatchAction({
      groupId: group.id,
      title,
      context: notes,
      summary: plan?.summary ?? "",
      expenses: proposals.map((p) => ({
        paidByMemberId: p.paidBy!,
        merchant: p.merchant,
        category: p.category,
        date: p.date,
        note: p.explanation || undefined,
        items: expenseLines(p).map(({ name, quantity, amount, assignees }) => ({ name, quantity, amount, assignees })),
        ...(p.kind === "itemized" ? { tax: p.tax, tip: p.tip, serviceCharge: p.serviceCharge, discount: p.discount } : {}),
        billNos: p.billRefs,
      })),
      payments: payments
        .filter((p) => p.include && p.fromMemberId && p.toMemberId)
        .map((p) => ({ fromMemberId: p.fromMemberId!, toMemberId: p.toMemberId!, amount: p.amount })),
      bills: readable.filter((b) => b.upload === "done" && b.imageIds?.length).map((b) => ({ no: b.no, imageIds: b.imageIds! })),
    });
    if (!res.ok) {
      setPublishing(false);
      toast.error(res.error);
      return;
    }
    toast.success("Published", { description: "Everyone in the group can see it now." });
    router.push(`/groups/${group.id}/batches/${res.data.batchId}`);
  }

  const addBlank = () => {
    const d = emptyDraft(group.currency, { people: members, paidBy: meId, category: defaultCategory });
    const p: Proposal = { ...d, kind: "amount", merchant: "", pid: crypto.randomUUID(), billRefs: [], explanation: "", confidence: "high", warnings: [] };
    setProposals((l) => [...l, p]);
    setEditing(p.pid);
  };

  const editingProposal = proposals.find((p) => p.pid === editing) ?? null;
  const ready = proposals.filter((p) => !proposalProblem(p)).length;
  const savingCopies = readable.some((b) => b.upload === "pending");
  const failedCopies = readable.filter((b) => b.upload === "failed");

  return (
    <div className="mx-auto w-full max-w-5xl pb-6">
      <div className="mb-8 flex items-center gap-3">
        {stage === "review" ? (
          <button onClick={() => setStage("collect")} className="flex size-11 items-center justify-center rounded-full hover:bg-muted" aria-label="Back to bills">
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <Link href={`/groups/${group.id}`} className="flex size-11 items-center justify-center rounded-full hover:bg-muted" aria-label="Back">
            <ArrowLeft className="size-5" />
          </Link>
        )}
        <Eyebrow className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-accent-ink" /> Settle with AI · {group.name}
        </Eyebrow>
      </div>

      <AnimatePresence mode="wait">
        {stage === "collect" && (
          <motion.div key="collect" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-8">
            <div className="max-w-2xl">
              <h1 className="text-4xl leading-none sm:text-6xl">Drop the bills. Splitter does the rest.</h1>
              <p className="mt-4 text-lg text-muted-foreground">
                Add every bill from {kind.label === "Other" ? "this group" : `the ${kind.label.toLowerCase()}`}, say who paid what in your own words, and
                {site.model} works out one fair split for everyone. You review it before anything is saved.
              </p>
            </div>

            <section className="grid gap-3">
              <Eyebrow>1 · Bills</Eyebrow>
              <BillTray bills={bills} onFiles={addFiles} onRemove={remove} onRetry={retry} onMerge={mergeIntoPrevious} disabled={!scanEnabled} />
              {!scanEnabled && <p className="text-sm text-warning">AI isn&apos;t configured on this server (NEBIUS_API_KEY), so bills can&apos;t be read.</p>}
            </section>

            <section className="grid gap-3">
              <Eyebrow>2 · Who paid what (optional)</Eyebrow>
              <textarea
                ref={notesRef}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={4000}
                rows={4}
                placeholder={personalise(kind.noteExamples[0], names)}
                className="w-full rounded-xs border border-input bg-card p-3.5 text-base outline-none placeholder:text-subtle focus-visible:border-[#9b60aa] focus-visible:ring-2 focus-visible:ring-[#9b60aa]/20 md:text-sm"
                aria-label="Notes about who paid what"
              />
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <button key={m.id} onClick={() => insert(m.id === meId ? "I" : m.name)} className="h-10 rounded-full border border-hairline px-3.5 text-sm hover:border-foreground/40">
                    {m.id === meId ? `Me (${m.name})` : m.name}
                  </button>
                ))}
                {bills.map((b) => (
                  <button key={b.key} onClick={() => insert(`#${b.no}`)} className="inline-flex h-10 items-center gap-1 rounded-full border border-dashed border-hairline px-3 text-sm text-muted-foreground hover:border-foreground/40">
                    <Hash className="size-3.5" />
                    {b.no}
                  </button>
                ))}
              </div>
              <div className="grid gap-1.5">
                <p className="text-xs text-muted-foreground">Try something like:</p>
                {kind.noteExamples.map((ex) => {
                  const text = personalise(ex, names);
                  return (
                    <button key={ex} onClick={() => insert(text)} className="text-left text-sm text-muted-foreground underline decoration-hairline underline-offset-4 hover:text-foreground">
                      “{text}”
                    </button>
                  );
                })}
              </div>
            </section>

            <StepBar>
              <div className="min-w-0 flex-1 text-sm">
                {busy ? (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Reading bills…
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {readable.length} bill{readable.length === 1 ? "" : "s"} ready · {credits} AI credits left (this uses 3)
                  </span>
                )}
              </div>
              <Button size="lg" disabled={!canPlan} onClick={() => runPlan(false)}>
                <Sparkles /> Work it out
              </Button>
            </StepBar>
          </motion.div>
        )}

        {stage === "planning" && (
          <motion.div key="planning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto grid max-w-md gap-8 py-10">
            <div className="flex flex-wrap justify-center gap-2">
              {readable.slice(0, 8).map((b, i) => (
                <motion.img
                  key={b.key}
                  src={b.pages[0]?.previewUrl}
                  alt=""
                  initial={{ opacity: 0, y: -20, rotate: (i % 2 ? 1 : -1) * 6 }}
                  animate={{ opacity: 1, y: 0, rotate: (i % 2 ? 1 : -1) * 3 }}
                  transition={{ delay: i * 0.08 }}
                  className="size-16 rounded-sm object-cover object-top"
                />
              ))}
            </div>
            <div className="rounded-lg bg-[#17171c] p-6 text-white">
              <p className="font-display text-2xl">Splitter is working it out</p>
              <ul className="mt-5 grid gap-3 text-sm">
                {WORKING.map((w, i) => (
                  <li key={w} className={i <= working ? "text-white" : "text-white/35"}>
                    <span className="inline-flex items-center gap-2">
                      {i < working ? <Check className="size-4 text-[#5fd3a8]" /> : i === working ? <Loader2 className="size-4 animate-spin" /> : <span className="size-4" />}
                      {w}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs text-white/50">{site.model} is reasoning over {readable.length} bills and your notes, checking the maths with calculator tools. Usually 15–40 seconds.</p>
            </div>
          </motion.div>
        )}

        {stage === "review" && plan && (
          <motion.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-8">
            <div className="grid gap-4">
              <h1 className="text-4xl leading-none sm:text-5xl">Here&apos;s the plan</h1>
              <Field label="Name" className="max-w-md">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
              </Field>
            </div>
            <ReviewBoard
              plan={plan}
              checks={checks}
              proposals={proposals}
              payments={payments}
              bills={bills}
              answers={answers}
              setAnswers={setAnswers}
              replanning={replanning}
              onReplan={() => runPlan(true)}
              onEdit={setEditing}
              onRemove={(pid) => setProposals((l) => l.filter((p) => p.pid !== pid))}
              onAdd={addBlank}
              onTogglePayment={(pid) => setPayments((l) => l.map((p) => (p.pid === pid ? { ...p, include: !p.include } : p)))}
            />
            <StepBar>
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-muted-foreground">
                  {ready === proposals.length ? `${proposals.length} expenses ready` : `${proposals.length - ready} need a look`}
                </p>
                {failedCopies.length > 0 && (
                  <p className="text-warning">
                    {failedCopies.length} bill photo{failedCopies.length === 1 ? "" : "s"} didn&apos;t save.{" "}
                    <button className="underline underline-offset-2" onClick={() => failedCopies.forEach((b) => retryUpload(b.key))}>
                      Retry
                    </button>{" "}
                    or publish without {failedCopies.length === 1 ? "it" : "them"}.
                  </p>
                )}
              </div>
              <Button size="lg" loading={publishing || savingCopies} disabled={!proposals.length || !title.trim() || savingCopies} onClick={publish}>
                {savingCopies ? "Saving bill copies…" : "Publish & notify"}
              </Button>
            </StepBar>
            <ProposalEditor
              proposal={editingProposal}
              onChange={(p) => setProposals((l) => l.map((x) => (x.pid === p.pid ? p : x)))}
              onClose={() => {
                setProposals((l) => l.filter((p) => p.pid !== editing || p.merchant.trim() || draftTotal(p) > 0));
                setEditing(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
