import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))] sm:px-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <div className="hidden p-4 lg:block">
        <div className="flex h-full flex-col justify-end rounded-lg bg-band p-12 text-band-foreground">
          <p className="eyebrow text-white/60">Trips · Parties · Events · Home · Dinners</p>
          <p className="mt-5 font-display text-5xl leading-[1.05]">Drop the bills. Splitter settles it.</p>
          <p className="mt-4 max-w-sm text-white/70">Say who paid in your own words, and the whole group's split is worked out for you.</p>
        </div>
      </div>
    </div>
  );
}
