import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ExpenseView } from "@/components/expense/expense-view";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { site } from "@/config/site";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import { getSharedExpense } from "@/server/services/expenses";

type Props = { params: Promise<{ shareToken: string }> };

const load = cache((token: string) => getSharedExpense(db, token));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const expense = await load((await params).shareToken);
  if (!expense) return { title: "Split not found" };
  return {
    title: `${expense.merchant} · ${formatMoney(expense.total, expense.currency)}`,
    description: `Split by ${expense.shares.length} people in ${expense.groupName}.`,
    robots: { index: false },
  };
}

export default async function SharedExpensePage({ params }: Props) {
  const expense = await load((await params).shareToken);
  if (!expense) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
      <header className="flex h-16 items-center justify-between pt-[env(safe-area-inset-top)]">
        <Logo />
        <Button size="sm" variant="outline" asChild>
          <Link href="/split">Split something</Link>
        </Button>
      </header>
      <p className="eyebrow mb-6 mt-6 text-muted-foreground">
        {expense.groupEmoji} Shared from {expense.groupName} on {site.name}
      </p>
      <ExpenseView data={expense} />
    </div>
  );
}
