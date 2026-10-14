"use client";

import { AlertTriangle, ArrowRight, Copy, HandCoins, MessageCircleQuestion, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, CategoryIcon, Eyebrow, Input } from "@/components/ui/primitives";
import { computeBalances, computeSplit, formatMoney, simplifyDebts, SplitError } from "@/lib/money";
import { cn } from "@/lib/utils";
import { draftTotal, toSplitInput } from "../split/draft";
import { proposalProblem, type NormalizedPlan, type Proposal, type ProposedPayment } from "./normalize";
import type { Bill } from "./use-bills";

export function splitLabel(p: Proposal, nameOf: (id: string) => string) {
  if (p.kind === "itemized") return `Per line · ${p.items.length} lines`;
  const included = p.people.filter((m) => (p.shares[m.id] ?? 0) > 0);
  if (p.splitMode === "exact") return `Exact · ${p.people.filter((m) => (p.exact[m.id] ?? 0) > 0).map((m) => m.name).join(", ")}`;
  if (p.splitMode === "shares") return `Shares · ${included.map((m) => `${nameOf(m.id)} ${p.shares[m.id]}`).join(" · ")}`;
  return included.length === p.people.length ? `Equally · everyone (${included.length})` : `Equally · ${included.map((m) => m.name).join(", ")}`;
}

export function ReviewBoard({
  plan,
  proposals,
  payments,
  bills,
  answers,
  setAnswers,
  replanning,
  onReplan,
  onEdit,
  onRemove,
  onAdd,
  onTogglePayment,
}: {
  plan: NormalizedPlan;
  proposals: Proposal[];
  payments: ProposedPayment[];
  bills: Bill[];
  answers: Record<string, string>;
  setAnswers: (a: Record<string, string>) => void;
  replanning: boolean;
  onReplan: () => void;
  onEdit: (pid: string) => void;
  onRemove: (pid: string) => void;
  onAdd: () => void;
  onTogglePayment: (pid: string) => void;
}) {
  const people = proposals[0]?.people ?? [];
  const currency = proposals[0]?.currency ?? "USD";
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? "Someone";
  const billByNo = new Map(bills.map((b) => [b.no, b]));

  // Live totals across everything that's ready to publish.
  const ledger = React.useMemo(() => {
    const ready = proposals.filter((p) => !proposalProblem(p));
    const expenses = ready.flatMap((p) => {
      try {
        const split = computeSplit(toSplitInput(p));
        return [{ paidByMemberId: p.paidBy!, shares: split.shares.map((s) => ({ memberId: s.memberId, amount: s.total })) }];
      } catch (e) {
        if (e instanceof SplitError) return [];
        throw e;
      }
    });
    const pays = payments.filter((p) => p.include && p.fromMemberId && p.toMemberId).map((p) => ({ fromMemberId: p.fromMemberId!, toMemberId: p.toMemberId!, amount: p.amount }));
    const net = computeBalances(people.map((m) => m.id), expenses, pays);
    const share = new Map(people.map((m) => [m.id, 0]));
    for (const e of expenses) for (const s of e.shares) share.set(s.memberId, (share.get(s.memberId) ?? 0) + s.amount);
    return { net, share, transfers: simplifyDebts(net), total: ready.reduce((a, p) => a + draftTotal(p), 0), readyCount: ready.length };
  }, [proposals, payments, people]);

  const pending = Object.keys(answers).filter((q) => answers[q]?.trim()).length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
        {plan.summary && (
          <div className="flex gap-3 rounded-md bg-band p-5 text-band-foreground">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-[#ffad9b]" />
            <p className="text-sm leading-relaxed">{plan.summary}</p>
          </div>
        )}

        {plan.questions.length > 0 && (
          <section className="grid gap-3 rounded-md border border-warning/40 bg-warning-soft p-5">
            <p className="flex items-center gap-2 text-warning">
              <MessageCircleQuestion className="size-4" /> Splitter has {plan.questions.length} question{plan.questions.length === 1 ? "" : "s"}
            </p>
            {plan.questions.map((q) => (
              <label key={q} className="grid gap-1.5 text-sm">
                <span>{q}</span>
                <Input value={answers[q] ?? ""} onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })} placeholder="Your answer" />
              </label>
            ))}
            <Button onClick={onReplan} loading={replanning} disabled={!pending} className="justify-self-start">
              <Sparkles /> Update the plan
            </Button>
          </section>
        )}

        {(plan.duplicates.length > 0 || plan.uncovered.length > 0) && (
          <div className="grid gap-2 text-sm">
            {plan.duplicates.map((d, i) => (
              <p key={i} className="flex items-start gap-2 rounded-sm bg-muted p-3">
                <Copy className="mt-0.5 size-4 shrink-0" />
                <span>
                  {d.billRefs.length > 1
                    ? `Duplicate: ${d.billRefs.map((n) => `#${n}`).join(" and ")}. ${d.reason} Only counted once.`
                    : `#${d.billRefs[0]} looks like an expense already in this group, so it was skipped. ${d.reason}`}
                </span>
              </p>
            ))}
            {plan.uncovered.length > 0 && (
              <p className="flex items-start gap-2 rounded-sm bg-muted p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  {plan.uncovered.map((n) => `#${n}`).join(", ")} {plan.uncovered.length === 1 ? "isn't" : "aren't"} in any expense. Add one if it should count.
                </span>
              </p>
            )}
          </div>
        )}

        <section>
          <div className="flex items-baseline justify-between border-b border-hairline pb-3">
            <h2 className="text-3xl">Expenses</h2>
            <span className="eyebrow text-muted-foreground">
              {ledger.readyCount}/{proposals.length} ready
            </span>
          </div>
          <ul className="divide-y divide-border">
            {proposals.map((p) => {
              const problem = proposalProblem(p);
              const thumb = p.billRefs.map((n) => billByNo.get(n)?.pages[0]?.previewUrl).find(Boolean);
              return (
                <li key={p.pid} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-2 py-4 sm:grid-cols-[4rem_minmax(0,1fr)_auto]">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="size-14 rounded-sm object-cover object-top sm:size-16" />
                  ) : (
                    <CategoryIcon category={p.category} className="size-14 sm:size-16" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate">{p.merchant}</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {p.paidBy ? `${nameOf(p.paidBy)} paid` : "Who paid?"} · {splitLabel(p, nameOf)}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {p.billRefs.length > 0 ? (
                        p.billRefs.map((n) => <Badge key={n}>#{n}</Badge>)
                      ) : (
                        <Badge tone="accent">from your notes</Badge>
                      )}
                      {p.confidence === "low" && <Badge tone="warning">unsure</Badge>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular">{formatMoney(draftTotal(p), currency)}</p>
                    <div className="mt-1 flex justify-end gap-0.5">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.merchant}`} onClick={() => onEdit(p.pid)}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${p.merchant}`} onClick={() => onRemove(p.pid)}>
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                  {(p.explanation || problem || p.warnings.length > 0) && (
                    <div className="col-span-3 grid gap-1 text-sm sm:col-start-2 sm:col-end-4">
                      {p.explanation && <p className="text-muted-foreground">{p.explanation}</p>}
                      {[...new Set([...(problem ? [problem] : []), ...p.warnings])].map((w) => (
                        <button key={w} onClick={() => onEdit(p.pid)} className="flex items-center gap-1.5 text-left text-warning">
                          <AlertTriangle className="size-3.5 shrink-0" /> {w}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <Button variant="outline" className="mt-2 w-full" onClick={onAdd}>
            <Plus /> Add an expense
          </Button>
        </section>

        {payments.length > 0 && (
          <section>
            <h2 className="border-b border-hairline pb-3 text-3xl">Payments already made</h2>
            <ul className="divide-y divide-border">
              {payments.map((p) => (
                <li key={p.pid} className="flex min-h-16 items-center gap-3 py-3">
                  <HandCoins className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {nameOf(p.fromMemberId)} paid {nameOf(p.toMemberId)} {formatMoney(p.amount, currency)}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{p.explanation}</p>
                  </div>
                  <button
                    role="checkbox"
                    aria-checked={p.include}
                    aria-label="Record this payment"
                    disabled={!p.fromMemberId || !p.toMemberId}
                    onClick={() => onTogglePayment(p.pid)}
                    className={cn("h-10 rounded-full border px-4 text-sm", p.include ? "border-foreground bg-foreground text-background" : "border-hairline")}
                  >
                    {p.include ? "Recording" : "Skip"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="grid gap-4 rounded-md bg-stone p-5 lg:sticky lg:top-24">
        <Eyebrow>If you publish</Eyebrow>
        <p className="tabular font-display text-4xl">{formatMoney(ledger.total, currency)}</p>
        <ul className="grid gap-2.5">
          {people.map((m) => {
            const net = ledger.net.get(m.id) ?? 0;
            return (
              <li key={m.id} className="flex items-center gap-2.5 text-sm">
                <Avatar name={m.name} size="sm" />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <span className="tabular text-muted-foreground">{formatMoney(ledger.share.get(m.id) ?? 0, currency)}</span>
                <span className={cn("tabular w-24 text-right", net > 0 ? "text-positive" : net < 0 ? "text-negative" : "text-muted-foreground")}>
                  {net > 0 ? "+" : ""}
                  {formatMoney(net, currency)}
                </span>
              </li>
            );
          })}
        </ul>
        {ledger.transfers.length > 0 && (
          <div className="grid gap-2 border-t border-hairline pt-4">
            <Eyebrow>Who pays whom</Eyebrow>
            {ledger.transfers.map((t) => (
              <p key={`${t.fromMemberId}-${t.toMemberId}`} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">
                  {nameOf(t.fromMemberId)} <ArrowRight className="inline size-3.5" /> {nameOf(t.toMemberId)}
                </span>
                <span className="tabular">{formatMoney(t.amount, currency)}</span>
              </p>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Share = their part of the expenses. The right column is what they get back (+) or owe (−).</p>
      </aside>
    </div>
  );
}
