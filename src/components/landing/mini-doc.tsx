import { cn } from "@/lib/utils";
import type { DocKind } from "./scenes";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Tiny illustrations of the kinds of documents Splitter reads. Purely decorative. */
export function MiniDoc({
  kind,
  label,
  amount,
  lines,
  no,
  className,
}: {
  kind: DocKind;
  label: string;
  amount: number;
  lines?: string[];
  no?: number;
  className?: string;
}) {
  const badge = no ? (
    <span className="eyebrow absolute -left-1.5 -top-1.5 z-10 rounded-xs bg-[#17171c] px-1.5 py-0.5 text-[10px] text-white">#{no}</span>
  ) : null;

  if (kind === "screenshot") {
    return (
      <div className={cn("relative w-28 rounded-[14px] border-[3px] border-[#17171c] bg-white p-2 text-[#17171c]", className)}>
        {badge}
        <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-[#d9d9dd]" />
        <p className="truncate text-[9px] text-[#616161]">{label}</p>
        <p className="mt-1 font-display text-lg leading-none">{rupees(amount)}</p>
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#edfce9] px-1.5 py-0.5 text-[8px] text-[#0f6b57]">● Paid</p>
      </div>
    );
  }
  if (kind === "note") {
    return (
      <div className={cn("relative w-28 rotate-2 bg-[#fdf4c8] p-2.5 text-[#3a3320] shadow-[inset_0_-12px_18px_-14px_rgba(0,0,0,0.2)]", className)}>
        {badge}
        <p className="text-[13px] leading-tight" style={{ fontFamily: "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', cursive" }}>
          {label}
        </p>
      </div>
    );
  }
  if (kind === "ticket") {
    return (
      <div className={cn("relative flex w-32 overflow-hidden rounded-sm bg-[#17171c] text-white", className)}>
        {badge}
        <div className="flex-1 p-2">
          <p className="eyebrow text-[8px] text-[#ff9d86]">Ticket</p>
          <p className="mt-0.5 truncate text-[10px]">{label}</p>
          <p className="mt-1 font-display text-base leading-none">{rupees(amount)}</p>
        </div>
        <div className="w-5 border-l border-dashed border-white/30 bg-white/5" />
      </div>
    );
  }
  if (kind === "invoice") {
    return (
      <div className={cn("relative w-28 rounded-xs border border-[#e5e7eb] bg-white p-2 pt-4 text-[#17171c]", className)}>
        {badge}
        <div className="flex items-center justify-between">
          <span className="eyebrow text-[8px]">Invoice</span>
          <span className="rounded-xs bg-[#b30000] px-1 text-[7px] font-medium text-white">PDF</span>
        </div>
        <p className="mt-1.5 truncate text-[9px] text-[#616161]">{label}</p>
        <div className="mt-1.5 grid gap-1">
          <div className="h-1 w-full rounded-full bg-[#eeece7]" />
          <div className="h-1 w-3/4 rounded-full bg-[#eeece7]" />
        </div>
        <p className="mt-1.5 text-right font-mono text-[10px]">{rupees(amount)}</p>
      </div>
    );
  }
  return (
    <div className={cn("receipt-edge relative w-28 bg-white px-2 pb-3 pt-4 font-mono text-[#17171c]", className)}>
      {badge}
      <p className="truncate text-center text-[9px]">{label}</p>
      <div className="mt-1.5 grid gap-0.5 text-[8px] text-[#616161]">
        {(lines ?? ["Item", "Item"]).slice(0, 3).map((l) => (
          <p key={l} className="truncate">
            {l}
          </p>
        ))}
      </div>
      <p className="mt-1.5 border-t border-dashed border-[#d9d9dd] pt-1 text-right text-[10px]">{rupees(amount)}</p>
    </div>
  );
}
