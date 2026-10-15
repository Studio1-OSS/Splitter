import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BatchSummary } from "@/components/batch/batch-summary";
import { ShareImagesToggle } from "@/components/batch/share-images-toggle";
import { AskSplitter } from "@/components/group/ask-splitter";
import { CopyButton } from "@/components/group/group-actions";
import { features } from "@/env";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { loadOr404 } from "@/server/load";
import { getBatch } from "@/server/services/batches";

export const metadata: Metadata = { title: "Settled with AI" };

export default async function BatchSummaryPage({ params }: { params: Promise<{ groupId: string; batchId: string }> }) {
  const { groupId, batchId } = await params;
  const user = await requireUser(`/groups/${groupId}/batches/${batchId}`);
  const { batch, me, members, payments, totals, transfers } = await loadOr404(() => getBatch(db, user.id, batchId));
  const nameOf = new Map(members.map((m) => [m.id, m.displayName]));
  const name = (id: string) => nameOf.get(id) ?? "Someone";
  // All pages per expense, in order.
  const imagesFor = new Map<string, string[]>();
  for (const i of batch.images) if (i.expenseId) imagesFor.set(i.expenseId, [...(imagesFor.get(i.expenseId) ?? []), i.id]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <Link href={`/groups/${batch.groupId}`} className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {batch.group.emoji} {batch.group.name}
      </Link>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <CopyButton text={`/s/b/${batch.shareToken}`} label="Copy share link" />
        <ShareImagesToggle batchId={batch.id} initial={batch.shareImages} />
      </div>

      <BatchSummary
        me={me.displayName}
        data={{
          title: batch.title,
          currency: batch.group.currency,
          context: batch.context,
          summary: batch.summary,
          expenses: batch.expenses.map((e) => {
            const ids = imagesFor.get(e.id) ?? [];
            const img = ids[0];
            return {
              id: e.id,
              merchant: e.merchant,
              category: e.category,
              date: e.date,
              total: e.total,
              paidBy: name(e.paidByMemberId),
              note: e.note,
              people: e.shares.map((s) => ({ name: name(s.memberId), amount: s.amount })),
              imageSrc: img ? `/api/bills/${img}?v=thumb` : undefined,
              imageFull: img ? `/api/bills/${img}` : undefined,
              imagePages: ids.map((id) => `/api/bills/${id}`),
              href: `/expenses/${e.id}`,
            };
          }),
          payments: payments.map((p) => ({ from: name(p.fromMemberId), to: name(p.toMemberId), amount: p.amount })),
          totals: totals.filter((t) => t.share || t.paid).map(({ name, share, paid, net }) => ({ name, share, paid, net })),
          transfers: transfers.map((t) => ({ from: name(t.fromMemberId), to: name(t.toMemberId), amount: t.amount })),
        }}
      />

      <AskSplitter
        groupId={batch.groupId}
        enabled={features.scanning}
        suggestions={["Why do I owe this much?", "What did each person pay for?", "Which bills were split unevenly?"]}
      />
    </div>
  );
}
