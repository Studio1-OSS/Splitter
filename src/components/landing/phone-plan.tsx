import { BedDouble, Car, ChevronLeft, UtensilsCrossed, Wine, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/primitives";

export type PlanRow = { label: string; sub: string; amount: string };

/** An expense's icon from its label, so the mockup reads like a real expense list. */
export function expenseIcon(label: string): { Icon: LucideIcon; tint: string } {
  const l = label.toLowerCase();
  if (/taxi|cab|ride/.test(l)) return { Icon: Car, tint: "bg-[#e8f0ff] text-[#2257d6]" };
  if (/drink|bar|beer/.test(l)) return { Icon: Wine, tint: "bg-[#f6e9ff] text-[#8a2be2]" };
  if (/casa|hotel|villa|room/.test(l)) return { Icon: BedDouble, tint: "bg-[#e7f7ef] text-[#0f7a52]" };
  return { Icon: UtensilsCrossed, tint: "bg-[#fff0e8] text-[#c2410c]" };
}

function StatusBar({ dark }: { dark?: boolean }) {
  return (
    <div className={`relative flex h-11 shrink-0 items-center justify-between px-7 text-[13px] font-semibold ${dark ? "text-white" : ""}`}>
      <span>9:41</span>
      <span aria-hidden className="absolute left-1/2 top-2.5 h-[26px] w-[88px] -translate-x-1/2 rounded-full bg-black" />
      <span aria-hidden className="flex items-center gap-1">
        <svg viewBox="0 0 18 12" className="h-2.5 w-4">
          <rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor" />
          <rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor" />
          <rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor" />
        </svg>
        <svg viewBox="0 0 26 12" className="h-2.5 w-6">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.4" />
          <rect x="2" y="2" width="17" height="8" rx="1.8" fill="currentColor" />
          <rect x="23.5" y="4" width="2" height="4" rx="1" fill="currentColor" fillOpacity="0.4" />
        </svg>
      </span>
    </div>
  );
}

/** iPhone-style frame: titanium edge, side buttons, Dynamic Island and status bar around a fixed-height screen. */
export function PhoneFrame({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <div className="relative w-[19rem] rounded-[3.1rem] bg-[linear-gradient(145deg,#4a4a52,#1c1c20_40%,#3a3a40)] p-[3px] shadow-[0_60px_120px_-30px_rgb(0_0_0/0.9),0_0_0_1px_rgb(255_255_255/0.06)]">
      <span aria-hidden className="absolute -left-[3px] top-28 h-8 w-[3px] rounded-l-sm bg-[#2a2a30]" />
      <span aria-hidden className="absolute -left-[3px] top-40 h-12 w-[3px] rounded-l-sm bg-[#2a2a30]" />
      <span aria-hidden className="absolute -right-[3px] top-36 h-16 w-[3px] rounded-r-sm bg-[#2a2a30]" />
      <div className="overflow-hidden rounded-[2.9rem] bg-black p-[7px]">
        <div
          className={`relative flex h-[38rem] flex-col overflow-hidden rounded-[2.5rem] ${dark ? "bg-[radial-gradient(ellipse_at_30%_0%,#3b3b52,#0d0d14_70%)] text-white" : "bg-[#f4f4f6] text-[#111114]"}`}
        >
          <StatusBar dark={dark} />
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">{children}</div>
          <span aria-hidden className={`mx-auto mb-2 block h-1 w-28 shrink-0 rounded-full ${dark ? "bg-white" : "bg-[#111114]"}`} />
        </div>
      </div>
    </div>
  );
}

/** In-app header: back button, the group's people, its title. */
export function PhoneHeader({ title, people, caption }: { title: string; people: string[]; caption?: string }) {
  return (
    <div className="shrink-0">
      <div className="flex items-center justify-between pt-1">
        <span className="flex size-8 items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.08)]">
          <ChevronLeft className="size-4" />
        </span>
        <div className="flex -space-x-2">
          {people.map((p) => (
            <Avatar key={p} name={p} size="sm" className="ring-2 ring-[#f4f4f6]" />
          ))}
        </div>
      </div>
      <p className="mt-3 text-[22px] font-semibold leading-tight tracking-[-0.035em]">{title}</p>
      {caption && <p className="text-[12px] text-[#8a8a8f]">{caption}</p>}
    </div>
  );
}
