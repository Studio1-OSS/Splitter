import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BatchSummary } from "@/components/batch/batch-summary";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { site } from "@/config/site";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import { getSharedBatch } from "@/server/services/batches";

type Props = { params: Promise<{ token: string }> };
const load = cache((token: string) => getSharedBatch(db, token));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const batch = await load((await params).token);
  if (!batch) return { title: "Not found" };
  const total = batch.expenses.reduce((a, e) => a + e.total, 0);
  return { title: `${batch.title} · ${formatMoney(total, batch.currency)}`, description: batch.summary, robots: { index: false } };
}

/** Public, read-only context for a "Settle with AI" batch. Names and amounts only. */
export default async function SharedBatchPage({ params }: Props) {
  const { token } = await params;
  const batch = await load(token);
  if (!batch) notFound();
  // All pages per expense, in order.
  const imagesFor = new Map<string, string[]>();
  for (const i of batch.images) if (i.expenseId) imagesFor.set(i.expenseId, [...(imagesFor.get(i.expenseId) ?? []), i.id]);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
      <header className="flex h-16 items-center justify-between pt-[env(safe-area-inset-top)]">
        <Logo />
        <Button size="sm" variant="outline" asChild>
          <Link href="/split">Split something</Link>
        </Button>
      </header>
      <p className="eyebrow mb-6 mt-6 text-muted-foreground">
        {batch.groupEmoji} Shared from {batch.groupName} on {site.name}
      </p>
      <BatchSummary
        data={{
          ...batch,
          expenses: batch.expenses.map((e) => {
            const ids = imagesFor.get(e.id) ?? [];
            const img = ids[0];
            return {
              ...e,
              imageSrc: img ? `/api/s/b/${token}/bills/${img}?v=thumb` : undefined,
              imageFull: img ? `/api/s/b/${token}/bills/${img}` : undefined,
              imagePages: ids.map((id) => `/api/s/b/${token}/bills/${id}`),
            };
          }),
        }}
      />
    </div>
  );
}
