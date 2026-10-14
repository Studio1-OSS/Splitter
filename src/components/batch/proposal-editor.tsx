"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MoneyInput } from "@/components/ui/money";
import { CategoryChip, Eyebrow, Field, Input, Select } from "@/components/ui/primitives";
import { CATEGORY_KEYS } from "@/config/categories";
import { formatMoney } from "@/lib/money";
import { SplitFields } from "../split/amount-step";
import { ItemAssigner } from "../split/assign-step";
import { draftTotal, type Draft } from "../split/draft";
import { proposalProblem, type Proposal } from "./normalize";

/** Edits one proposed expense in place. Reuses the same split editors as the normal add-expense flow. */
export function ProposalEditor({
  proposal,
  onChange,
  onClose,
}: {
  proposal: Proposal | null;
  onChange: (p: Proposal) => void;
  onClose: () => void;
}) {
  if (!proposal) return null;
  const p = proposal;
  const c = p.currency;
  const update = (patch: Partial<Draft> | ((d: Draft) => Draft)) =>
    onChange({ ...p, ...(typeof patch === "function" ? patch(p) : patch), warnings: [] } as Proposal);
  const problem = proposalProblem(p);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Edit expense" description={p.explanation || undefined} className="sm:max-w-2xl">
        <div className="grid gap-5">
          <Field label="Description">
            <Input value={p.merchant} onChange={(e) => update({ merchant: e.target.value })} maxLength={120} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {p.kind === "amount" ? (
              <Field label="Amount">
                <MoneyInput currency={c} value={p.amount} onChange={(amount) => update({ amount })} aria-label="Amount" />
              </Field>
            ) : (
              <Field label="Total (from lines)">
                <Input value={formatMoney(draftTotal(p), c)} disabled />
              </Field>
            )}
            <Field label="Date">
              <Input type="date" value={p.date} onChange={(e) => update({ date: e.target.value })} />
            </Field>
          </div>
          <Field label="Who paid?">
            <Select value={p.paidBy ?? ""} onChange={(e) => update({ paidBy: e.target.value || null })}>
              <option value="">Choose…</option>
              {p.people.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-2">
            <Eyebrow>Category</Eyebrow>
            <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
              {CATEGORY_KEYS.map((key) => (
                <CategoryChip key={key} category={key} active={p.category === key} onClick={() => update({ category: key })} />
              ))}
            </div>
          </div>

          {p.kind === "amount" ? (
            <SplitFields draft={p} update={update} />
          ) : (
            <section className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <Eyebrow>Who had each line</Eyebrow>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() =>
                    update((d) => ({
                      ...d,
                      kind: "amount",
                      amount: draftTotal(d),
                      splitMode: "equal",
                      shares: Object.fromEntries(d.people.map((m) => [m.id, 1])),
                    }))
                  }
                >
                  Use one total instead
                </Button>
              </div>
              <ItemAssigner draft={p} update={update} />
            </section>
          )}

          <div className="flex items-center gap-3 border-t border-border pt-4">
            <p className={`min-w-0 flex-1 text-sm ${problem ? "text-warning" : "text-positive"}`}>{problem ?? "Ready to publish"}</p>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
