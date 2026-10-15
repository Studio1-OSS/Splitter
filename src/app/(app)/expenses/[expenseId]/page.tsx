import { ArrowLeft, PartyPopper, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExpenseToolbar } from "@/components/expense/expense-toolbar";
import { BillImage } from "@/components/batch/bill-image";
import { ExpenseView } from "@/components/expense/expense-view";
import { Eyebrow } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { loadOr404 } from "@/server/load";
import { getExpense } from "@/server/services/expenses";

export const metadata: Metadata = { title: "Expense" };

export default async function ExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ expenseId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { expenseId } = await params;
  const { created } = await searchParams;
  const user = await requireUser(`/expenses/${expenseId}`);
  const { expense, me, members } = await loadOr404(() => getExpense(db, user.id, expenseId));
  const nameOf = new Map(members.map((m) => [m.id, m.displayName]));

  const data = {
    merchant: expense.merchant,
    category: expense.category,
    date: expense.date,
    currency: expense.currency,
    subtotal: expense.subtotal,
    tax: expense.tax,
    tip: expense.tip,
    serviceCharge: expense.serviceCharge,
    discount: expense.discount,
    total: expense.total,
    paidBy: expense.paidBy.displayName,
    items: expense.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      amount: i.amount,
      people: i.assignments.map((a) => nameOf.get(a.memberId) ?? "Someone"),
    })),
    shares: expense.shares.map((s) => ({ name: s.member.displayName, amount: s.amount })).sort((a, b) => b.amount - a.amount),
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Link href={`/groups/${expense.groupId}`} className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {expense.group.emoji} {expense.group.name}
      </Link>

      {created && (
        <div className="flex items-center gap-3 rounded-sm bg-positive-soft p-4 text-sm">
          <PartyPopper className="size-5 shrink-0 text-positive" />
          <p>
            <span className="font-medium">Saved.</span>{" "}Balances are updated. Share the link with anyone who isn&apos;t in the app yet.
          </p>
        </div>
      )}

      <ExpenseToolbar
        expenseId={expense.id}
        sharePath={`/s/${expense.shareToken}`}
        shareText={`${expense.merchant}: ${formatMoney(expense.total, expense.currency)} split`}
        canDelete={expense.createdBy === user.id}
      />

      {(expense.note || expense.batch || expense.images.length > 0) && (
        <div className="flex flex-wrap items-start gap-4 rounded-md bg-stone p-4">
          {expense.images.length > 0 && (
            <BillImage
              thumb={`/api/bills/${expense.images[0].id}?v=thumb`}
              full={`/api/bills/${expense.images[0].id}`}
              pages={expense.images.map((img) => `/api/bills/${img.id}`)}
              alt={`Bill for ${expense.merchant}`}
              className="relative size-20 overflow-hidden rounded-sm bg-muted"
            />
          )}
          <div className="min-w-0 flex-1 text-sm">
            <Eyebrow>How this was split</Eyebrow>
            <p className="mt-1.5">{expense.note ?? "Split as shown below."}</p>
            {expense.batch && (
              <Link href={`/groups/${expense.groupId}/batches/${expense.batch.id}`} className="mt-2 inline-flex items-center gap-1.5 underline underline-offset-4">
                <Sparkles className="size-3.5" /> Part of “{expense.batch.title}”
              </Link>
            )}
          </div>
        </div>
      )}

      <ExpenseView data={data} highlight={me.displayName} />
    </div>
  );
}
