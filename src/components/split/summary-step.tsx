"use client";

import { ArrowRight, Check, ChevronDown, Copy, MessageCircle, RotateCcw, Share2 } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, Eyebrow } from "@/components/ui/primitives";
import { categoryOf } from "@/config/categories";
import { site } from "@/config/site";
import { allocate, computeSplit, formatMoney, SplitError, type MemberShare } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { createExpenseAction } from "@/server/actions";
import { expenseLines, toSplitInput, type Draft } from "./draft";
import { StepBar } from "./people";
import type { WizardMode } from "./split-wizard";

export function SummaryStep({
  draft,
  mode,
  onEdit,
  onReset,
}: {
  draft: Draft;
  mode: WizardMode;
  onEdit: () => void;
  onReset: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const c = draft.currency;

  const result = React.useMemo(() => {
    try {
      return { split: computeSplit(toSplitInput(draft)) };
    } catch (e) {
      if (e instanceof SplitError) return { error: e.message };
      throw e;
    }
  }, [draft]);

  // Per-person line breakdown, using the same weighted allocation as the totals.
  const breakdown = React.useMemo(() => {
    const map = new Map<string, { name: string; amount: number }[]>();
    for (const line of expenseLines(draft)) {
      if (!line.assignees.length) continue;
      const parts = allocate(line.amount, line.assignees.map((a) => a.weight));
      const totalWeight = line.assignees.reduce((a, b) => a + b.weight, 0);
      line.assignees.forEach((a, i) => {
        const list = map.get(a.memberId) ?? [];
        const label =
          line.assignees.length === 1
            ? draft.kind === "amount" && draft.splitMode === "exact"
              ? "Exact amount"
              : line.name
            : draft.kind === "amount" && draft.splitMode === "shares"
              ? `${line.name} (${a.weight} of ${totalWeight} shares)`
              : `${line.name} (1/${line.assignees.length})`;
        list.push({ name: label, amount: parts[i] });
        map.set(a.memberId, list);
      });
    }
    return map;
  }, [draft]);

  if ("error" in result) {
    return (
      <div className="mx-auto max-w-md rounded-md bg-stone p-6 text-center">
        <p>{result.error}</p>
        <Button className="mt-4" onClick={onEdit}>
          Fix it
        </Button>
      </div>
    );
  }

  const { split } = result;
  const nameOf = (id: string) => draft.people.find((p) => p.id === id)?.name ?? "Someone";
  const payer = draft.paidBy ? nameOf(draft.paidBy) : null;
  const shares = [...split.shares].filter((s) => s.total !== 0).sort((a, b) => b.total - a.total);
  const title = draft.merchant.trim() || "Shared expense";
  const category = categoryOf(draft.category);

  const shareText = [
    `${title} · ${formatMoney(split.total, c)}${payer ? ` (paid by ${payer})` : ""}`,
    ...shares.map((s) => `• ${nameOf(s.memberId)}: ${formatMoney(s.total, c)}${s.memberId === draft.paidBy ? " (paid)" : ""}`),
    "",
    `Split with ${site.name}`,
  ].join("\n");

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${title} split`, text: shareText });
        return;
      } catch {
        // cancelled: fall through to copy
      }
    }
    await copy();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy. Select the text and copy it manually.");
    }
  }

  async function publish() {
    if (mode.kind !== "group" || !draft.paidBy) return;
    setSaving(true);
    const res = await createExpenseAction({
      groupId: mode.groupId,
      paidByMemberId: draft.paidBy,
      merchant: title,
      category: draft.category,
      date: draft.date,
      items: expenseLines(draft).map(({ name, quantity, amount, assignees }) => ({ name, quantity, amount, assignees })),
      ...(draft.kind === "itemized"
        ? { tax: draft.tax, tip: draft.tip, serviceCharge: draft.serviceCharge, discount: draft.discount }
        : {}),
    });
    if (!res.ok) {
      setSaving(false);
      toast.error(res.error);
      return;
    }
    toast.success("Expense saved");
    router.push(`/expenses/${res.data.expenseId}?created=1`);
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg bg-band px-6 py-8 text-center text-band-foreground sm:py-10">
        <p className="eyebrow inline-flex items-center gap-2 opacity-75">
          <category.icon className="size-3.5" /> {category.label} · {formatDate(draft.date)}
        </p>
        <h1 className="mt-3 text-3xl sm:text-4xl">{title}</h1>
        <p className="tabular mt-4 font-display text-5xl sm:text-6xl">{formatMoney(split.total, c)}</p>
        {payer && <p className="mt-3 text-sm opacity-75">Paid by {payer}</p>}
      </motion.div>

      <div>
        <Eyebrow className="mb-2">Who owes what</Eyebrow>
        <ul className="divide-y divide-border border-y border-border">
          {shares.map((s, i) => (
            <motion.li key={s.memberId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.04 * i }}>
              <PersonRow
                share={s}
                name={nameOf(s.memberId)}
                currency={c}
                isPayer={s.memberId === draft.paidBy}
                payer={payer}
                lines={breakdown.get(s.memberId) ?? []}
              />
            </motion.li>
          ))}
        </ul>
      </div>

      {mode.kind === "group" ? (
        <StepBar>
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">Adds this to {mode.groupName}&apos;s balances.</p>
          <Button size="lg" loading={saving} onClick={publish}>
            <Check /> Save expense
          </Button>
        </StepBar>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button size="lg" onClick={share}>
              <Share2 /> Share
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
            <Button size="lg" variant="outline" onClick={copy}>
              <Copy /> Copy
            </Button>
          </div>
          <div className="flex flex-col gap-4 rounded-md bg-stone p-5 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-lg">Sharing more than one cost?</p>
              <p className="text-sm text-muted-foreground">Make a group for the trip, party or flat to keep running balances and settle up once.</p>
            </div>
            <Button variant="outline" asChild className="bg-card">
              <Link href="/sign-up?next=/dashboard">
                Create a group <ArrowRight />
              </Link>
            </Button>
          </div>
          <Button variant="link" onClick={onReset} className="justify-self-center">
            <RotateCcw /> Start a new split
          </Button>
        </>
      )}
    </div>
  );
}

function PersonRow({
  share,
  name,
  currency,
  isPayer,
  payer,
  lines,
}: {
  share: MemberShare;
  name: string;
  currency: string;
  isPayer: boolean;
  payer: string | null;
  lines: { name: string; amount: number }[];
}) {
  const extras = [
    ["Tax", share.tax],
    ["Tip", share.tip],
    ["Fees", share.serviceCharge],
    ["Discount", -share.discount],
  ].filter(([, v]) => v !== 0) as [string, number][];

  return (
    <details className="group">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 py-3">
        <Avatar name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate">{name}</p>
          <p className="text-sm text-muted-foreground">{isPayer ? "Paid" : payer ? `Owes ${payer}` : ""}</p>
        </div>
        <span className="tabular font-display text-xl">{formatMoney(share.total, currency)}</span>
        <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <div className="mb-3 grid gap-1 rounded-sm bg-muted px-4 py-3 text-sm">
        {lines.map((l, i) => (
          <div key={i} className="flex justify-between gap-3">
            <span className="truncate text-muted-foreground">{l.name}</span>
            <span className="tabular">{formatMoney(l.amount, currency)}</span>
          </div>
        ))}
        {extras.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular">{formatMoney(value, currency)}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
