import { cn } from "@/lib/utils";

// Realistic documents for the landing's "What it reads" section: printed receipt, hotel invoice,
// ride and payment screenshots, a sticky note and an event ticket. Purely decorative.
export type ReadKind = "receipt" | "invoice" | "ride" | "payment" | "note" | "ticket";

const PAPER = "bg-white text-[#17171c] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.8),0_2px_8px_rgb(0_0_0/0.35)]";
const PHONE = "w-[8.5rem] rounded-[22px] border-[5px] border-[#2a2a30] bg-white text-[#17171c] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.8),0_0_0_1px_rgb(255_255_255/0.08)]";

function Row({ l, r, className }: { l: string; r: string; className?: string }) {
  return (
    <p className={cn("flex justify-between gap-2", className)}>
      <span className="truncate">{l}</span>
      <span className="tabular">{r}</span>
    </p>
  );
}

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-3 pt-1.5 text-[7px] font-semibold">
      <span>9:41</span>
      <span className="h-2.5 w-9 rounded-full bg-[#2a2a30]" />
      <span>5G</span>
    </div>
  );
}

export function MiniDoc({ kind, className }: { kind: ReadKind; className?: string }) {
  switch (kind) {
    case "receipt":
      return (
        <div className={cn("receipt-edge w-40 px-3.5 pb-5 pt-4 font-mono text-[8.5px] leading-[1.55]", PAPER, className)}>
          <p className="text-center text-[10px] font-bold tracking-[0.08em]">BEACH SHACK</p>
          <p className="text-center text-[7px] text-[#8a8a8f]">Calangute, Goa · 14/10 21:42</p>
          <div className="mt-2 border-t border-dashed border-[#cfcfd4] pt-1.5 text-[#3a3a40]">
            <Row l="Prawn curry ×2" r="1,180" />
            <Row l="Fish thali" r="420" />
            <Row l="Kingfisher ×4" r="1,400" />
          </div>
          <div className="mt-1.5 border-t border-dashed border-[#cfcfd4] pt-1.5 text-[#6b6b70]">
            <Row l="GST 5%" r="150" />
            <Row l="Service" r="252" />
          </div>
          <Row l="TOTAL" r="₹3,402" className="mt-1.5 border-t border-[#17171c] pt-1.5 text-[10px] font-bold" />
        </div>
      );
    case "invoice":
      return (
        <div className={cn("w-44 rounded-[3px] p-3.5 text-[8px]", PAPER, className)}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold tracking-[-0.02em]">Casa Anjuna</p>
              <p className="text-[7px] text-[#8a8a8f]">Folio #2231 · 12–14 Oct</p>
            </div>
            <span className="rounded-[3px] bg-[#c81e1e] px-1 py-0.5 text-[6.5px] font-bold text-white">PDF</span>
          </div>
          <p className="mt-3 font-mono text-[7px] uppercase tracking-[0.1em] text-[#8a8a8f]">Invoice</p>
          <div className="mt-1 grid gap-1 border-y border-[#ececef] py-1.5 text-[#3a3a40]">
            <Row l="Deluxe room × 2 nights" r="8,000" />
            <Row l="Breakfast × 4" r="960" />
            <Row l="City tax" r="448" />
          </div>
          <Row l="Amount due" r="₹9,408" className="mt-1.5 text-[10px] font-bold" />
        </div>
      );
    case "ride":
      return (
        <div className={cn(PHONE, className)}>
          <StatusBar />
          <div className="relative mx-2 mt-2 h-14 overflow-hidden rounded-xl bg-[#eef0f3]">
            <svg viewBox="0 0 120 56" className="absolute inset-0 size-full" aria-hidden>
              <path d="M0 18h120M0 40h120M30 0v56M78 0v56" stroke="#dde1e7" strokeWidth="5" />
              <path d="M14 46C34 44 30 26 52 24s40 6 54-14" fill="none" stroke="#17171c" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="14" cy="46" r="3.5" fill="#17171c" />
              <circle cx="106" cy="10" r="3.5" fill="#fff" stroke="#17171c" strokeWidth="2" />
            </svg>
          </div>
          <div className="px-3 pb-3 pt-2">
            <p className="text-[8px] text-[#6b6b70]">Trip to Calangute · 4.2 km</p>
            <p className="mt-0.5 text-xl font-semibold leading-none tracking-[-0.03em]">₹200</p>
            <p className="mt-2 text-[7.5px] text-[#6b6b70]">Paid with UPI · Rakesh</p>
          </div>
        </div>
      );
    case "payment":
      return (
        <div className={cn(PHONE, className)}>
          <StatusBar />
          <div className="flex flex-col items-center px-3 pb-3.5 pt-3 text-center">
            <span className="flex size-9 items-center justify-center rounded-full bg-[#0f9d6b] text-white">
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="mt-2 text-[8px] text-[#6b6b70]">Paid to Aman</p>
            <p className="text-xl font-semibold leading-tight tracking-[-0.03em]">₹300</p>
            <p className="mt-2 w-full whitespace-nowrap rounded-md bg-[#f3f4f6] px-1.5 py-1 font-mono text-[6px] text-[#6b6b70]">UPI ref 4218 9930 1107</p>
          </div>
        </div>
      );
    case "note":
      return (
        <div className={cn("relative", className)}>
          <span aria-hidden className="absolute -top-2.5 left-1/2 z-10 h-5 w-14 -translate-x-1/2 -rotate-3 bg-white/40 backdrop-blur-sm" />
          <div
            className="w-44 rotate-[-2deg] bg-[#fdf3c4] px-4 pb-5 pt-5 text-[#2f2a1c] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.8),inset_0_-16px_24px_-18px_rgb(0_0_0/0.25)]"
            style={{ fontFamily: "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive" }}
          >
            <p className="whitespace-nowrap text-[13px] leading-[1.6]">Mahima 500 drinks</p>
            <p className="whitespace-nowrap text-[13px] leading-[1.6]">Aman 1200 cab</p>
            <p className="whitespace-nowrap text-[13px] leading-[1.6] line-through decoration-[#2f2a1c]/60">Priya 300</p>
          </div>
        </div>
      );
    case "ticket":
      return (
        <div className={cn("flex w-48 overflow-hidden rounded-lg", PAPER, className)}>
          <div className="flex-1 p-3">
            <p className="font-mono text-[7px] uppercase tracking-[0.12em] text-[#8a8a8f]">Admit one · Sat 18 Oct</p>
            <p className="mt-1 text-[12px] font-bold leading-tight tracking-[-0.02em]">Sunburn Festival</p>
            <p className="text-[7.5px] text-[#6b6b70]">Vagator · General pass</p>
            <p className="mt-2 text-base font-semibold leading-none tracking-[-0.03em]">₹2,500</p>
          </div>
          <div className="relative flex w-10 items-center justify-center border-l border-dashed border-[#cfcfd4] bg-[#f6f6f8]">
            <span aria-hidden className="absolute -left-1.5 -top-1.5 size-3 rounded-full bg-black" />
            <span aria-hidden className="absolute -bottom-1.5 -left-1.5 size-3 rounded-full bg-black" />
            <div className="flex h-20 w-5 flex-col justify-between">
              {[3, 1, 2, 1, 3, 2, 1, 2, 1, 3].map((w, i) => (
                <span key={i} className="block bg-[#17171c]" style={{ height: w }} />
              ))}
            </div>
          </div>
        </div>
      );
  }
}
