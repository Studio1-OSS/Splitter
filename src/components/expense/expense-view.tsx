import { Avatar, Eyebrow } from "@/components/ui/primitives";
import { categoryOf } from "@/config/categories";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export type ExpenseViewData = {
  merchant: string;
  category: string;
  date: string;
  currency: string;
  subtotal: number;
  tax: number;
  tip: number;
  serviceCharge: number;
  discount: number;
  total: number;
  paidBy: string;
  items: { name: string; quantity: number; amount: number; people: string[] }[];
  shares: { name: string; amount: number }[];
};

/** Shared by the private expense page and public share links. */
export function ExpenseView({ data, highlight }: { data: ExpenseViewData; highlight?: string }) {
  const c = data.currency;
  const category = categoryOf(data.category);
  const extras = [
    ["Tax", data.tax],
    ["Tip", data.tip],
    ["Fees", data.serviceCharge],
    ["Discount", -data.discount],
  ].filter(([, v]) => v !== 0) as [string, number][];
  const showLines = data.items.length > 1 || extras.length > 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
        <div className="rounded-lg bg-band px-6 py-8 text-band-foreground sm:px-10 sm:py-12">
          <p className="eyebrow inline-flex items-center gap-2 text-white/70">
            <category.icon className="size-3.5" /> {category.label} · {formatDate(data.date)}
          </p>
          <h1 className="mt-3 text-4xl leading-tight sm:text-5xl">{data.merchant}</h1>
          <p className="tabular mt-5 font-display text-5xl sm:text-6xl">{formatMoney(data.total, c)}</p>
          <p className="mt-3 text-sm text-white/70">Paid by {data.paidBy}</p>
        </div>

        {showLines && (
          <section>
            <Eyebrow className="mb-2">Lines</Eyebrow>
            <ul className="divide-y divide-border border-y border-border">
              {data.items.map((item, i) => (
                <li key={i} className="grid grid-cols-[1fr_auto] gap-x-4 py-3">
                  <span className="truncate">
                    {item.quantity > 1 && `${item.quantity}× `}
                    {item.name}
                  </span>
                  <span className="tabular">{formatMoney(item.amount, c)}</span>
                  <span className="col-span-2 text-xs text-muted-foreground">{item.people.join(", ")}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid gap-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular">{formatMoney(data.subtotal, c)}</span>
              </div>
              {extras.map(([label, value]) => (
                <div key={label} className="flex justify-between text-muted-foreground">
                  <span>{label}</span>
                  <span className="tabular">{formatMoney(value, c)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-1">
                <span>Total</span>
                <span className="tabular">{formatMoney(data.total, c)}</span>
              </div>
            </div>
          </section>
        )}
      </div>

      <div className="rounded-md bg-stone p-5 sm:p-6 lg:sticky lg:top-24">
        <Eyebrow>Who owes what</Eyebrow>
        <ul className="mt-4 grid gap-3">
          {data.shares.map((s, i) => (
            <li key={`${s.name}-${i}`} className="flex items-center gap-3">
              <Avatar name={s.name} />
              <span className={`min-w-0 flex-1 truncate ${highlight === s.name ? "underline underline-offset-4" : ""}`}>
                {s.name}
                {s.name === data.paidBy && <span className="text-muted-foreground"> · paid</span>}
              </span>
              <span className="tabular">{formatMoney(s.amount, c)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
