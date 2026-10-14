import { ArrowRight, HandCoins, Quote, Sparkles } from "lucide-react";
import Link from "next/link";
import { Avatar, CategoryIcon, Eyebrow } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { cn, formatDate } from "@/lib/utils";
import { BillImage } from "./bill-image";

export type BatchSummaryData = {
  title: string;
  currency: string;
  context: string;
  summary: string;
  expenses: {
    id: string;
    merchant: string;
    category: string;
    date: string;
    total: number;
    paidBy: string;
    note: string | null;
    people: { name: string; amount: number }[];
    imageSrc?: string;
    imageFull?: string;
    imagePages?: string[];
    href?: string;
  }[];
  payments: { from: string; to: string; amount: number }[];
  totals: { name: string; share: number; paid: number; net: number }[];
  transfers: { from: string; to: string; amount: number }[];
};

/** The shared context for a "Settle with AI" batch: notes, AI summary, each expense with its bill, totals. */
export function BatchSummary({ data, me }: { data: BatchSummaryData; me?: string }) {
  const c = data.currency;
  const total = data.expenses.reduce((a, e) => a + e.total, 0);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
        <div className="rounded-lg bg-band px-6 py-8 text-band-foreground sm:px-10 sm:py-10">
          <p className="eyebrow flex items-center gap-2 text-white/70">
            <Sparkles className="size-3.5 text-[#ffad9b]" /> Settled with AI · {data.expenses.length} expenses
          </p>
          <h1 className="mt-3 text-4xl leading-tight sm:text-5xl">{data.title}</h1>
          <p className="tabular mt-4 font-display text-5xl">{formatMoney(total, c)}</p>
          {data.summary && <p className="mt-5 max-w-2xl text-sm leading-relaxed text-white/80">{data.summary}</p>}
        </div>

        {data.context.trim() && (
          <section className="flex gap-3 rounded-md bg-stone p-5">
            <Quote className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
              <Eyebrow>The group&apos;s notes</Eyebrow>
              <p className="mt-2 whitespace-pre-wrap">{data.context}</p>
            </div>
          </section>
        )}

        <section>
          <h2 className="border-b border-hairline pb-3 text-3xl">Expenses</h2>
          <ul className="divide-y divide-border">
            {data.expenses.map((e) => {
              const mine = me ? e.people.find((p) => p.name === me)?.amount : undefined;
              const row = (
                <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-2 py-4">
                  {e.imageSrc ? (
                    <BillImage thumb={e.imageSrc} full={e.imageFull!} pages={e.imagePages} alt={`Bill for ${e.merchant}`} />
                  ) : (
                    <CategoryIcon category={e.category} className="size-14" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate">
                      {e.href ? (
                        <Link href={e.href} className="hover:underline hover:underline-offset-4">
                          {e.merchant}
                        </Link>
                      ) : (
                        e.merchant
                      )}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {e.paidBy} paid · {formatDate(e.date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular">{formatMoney(e.total, c)}</p>
                    {mine !== undefined && <p className="tabular text-xs text-muted-foreground">you {formatMoney(mine, c)}</p>}
                  </div>
                  <div className="col-span-3 grid gap-1.5 text-sm sm:col-start-2">
                    {e.note && <p className="text-muted-foreground">{e.note}</p>}
                    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {e.people.map((p) => (
                        <span key={p.name} className={cn(p.name === me && "text-foreground")}>
                          {p.name} {formatMoney(p.amount, c)}
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
              );
              return <li key={e.id}>{row}</li>;
            })}
          </ul>
        </section>

        {data.payments.length > 0 && (
          <section>
            <h2 className="border-b border-hairline pb-3 text-3xl">Payments recorded</h2>
            <ul className="divide-y divide-border">
              {data.payments.map((p, i) => (
                <li key={i} className="flex min-h-14 items-center gap-3 text-sm">
                  <HandCoins className="size-4 text-muted-foreground" />
                  <span className="flex-1">
                    {p.from} paid {p.to}
                  </span>
                  <span className="tabular">{formatMoney(p.amount, c)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="grid gap-4 rounded-md bg-stone p-5 lg:sticky lg:top-24">
        <Eyebrow>Per person</Eyebrow>
        <ul className="grid gap-3">
          {data.totals.map((t) => (
            <li key={t.name} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 text-sm">
              <Avatar name={t.name} size="sm" />
              <span className={cn("truncate", t.name === me && "underline underline-offset-4")}>{t.name}</span>
              <span className={cn("tabular", t.net > 0 ? "text-positive" : t.net < 0 ? "text-negative" : "text-muted-foreground")}>
                {t.net > 0 ? "+" : ""}
                {formatMoney(t.net, c)}
              </span>
              <span className="col-start-2 col-end-4 text-xs text-muted-foreground">
                share {formatMoney(t.share, c)} · paid {formatMoney(t.paid, c)}
              </span>
            </li>
          ))}
        </ul>
        {data.transfers.length > 0 && (
          <div className="grid gap-2 border-t border-hairline pt-4">
            <Eyebrow>To settle this batch</Eyebrow>
            {data.transfers.map((t, i) => (
              <p key={i} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">
                  {t.from} <ArrowRight className="inline size-3.5" /> {t.to}
                </span>
                <span className="tabular">{formatMoney(t.amount, c)}</span>
              </p>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
