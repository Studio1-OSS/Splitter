import { ArrowRight, Bell, Calculator, Check, HandCoins, Link2, Lock, MessageCircleQuestion, ScanLine, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { GitHubIcon } from "@/components/github-icon";
import { BillPile } from "@/components/landing/bill-pile";
import { MiniDoc } from "@/components/landing/mini-doc";
import { computeScene, CURRENCY, SCENES } from "@/components/landing/scenes";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { site } from "@/config/site";
import { formatMoney } from "@/lib/money";

const reads = [
  { kind: "receipt" as const, label: "Beach Shack", amount: 3402, lines: ["Prawn curry ×2", "Kingfisher ×4"], title: "Restaurant & shop receipts", body: "Every line, tax, tip and service charge." },
  { kind: "invoice" as const, label: "Casa Anjuna", amount: 9408, title: "Invoices & PDFs", body: "Hotel folios, rentals, utility bills, multi-page PDFs." },
  { kind: "screenshot" as const, label: "Taxi · Calangute", amount: 200, title: "Ride & app screenshots", body: "Cabs, food delivery, booking confirmations." },
  { kind: "screenshot" as const, label: "UPI · to Aman", amount: 300, title: "Payment proof", body: "Paid someone back? Splitter records it." },
  { kind: "note" as const, label: "Mahima 500 drinks", amount: 500, title: "Handwritten notes", body: "A scribbled list becomes separate expenses." },
  { kind: "ticket" as const, label: "Festival pass", amount: 2500, title: "Tickets", body: "Concerts, events, trains and flights." },
];

const steps = [
  { title: "Drop every bill", body: "Photos, PDFs, screenshots. As many as the occasion produced, all at once." },
  { title: "Say who paid, your way", body: "“Aman paid #1 and #2, Rakesh paid 200 twice, Priya didn't drink.” That's all it needs." },
  { title: "Review the plan", body: "Each expense with its bill, payer and split. Splitter asks when something's unclear." },
  { title: "Everyone's notified", body: "One tap publishes it. Each person sees their share and the bills behind it." },
];

const occasions = [
  { emoji: "✈️", title: "Trips", body: "Hotel by room, fuel equally, the surf lesson only for the two who went." },
  { emoji: "🎉", title: "Parties", body: "Venue, decorations, drinks. Leave out whoever didn't drink." },
  { emoji: "🎟️", title: "Events", body: "Tickets at different prices? Exact amounts per person." },
  { emoji: "🍽️", title: "Dinners", body: "Tap what you had. Tax and tip follow what you ordered." },
  { emoji: "🏠", title: "Home", body: "Rent by room size, bills equally, one running balance." },
];

const features = [
  { icon: ScanLine, title: "Reads any bill", body: "Receipts, invoices, screenshots and notes, in any language. Duplicates are caught before they count twice." },
  { icon: Calculator, title: "Every cent adds up", body: "Equal, by shares, exact amounts or line by line. Tax and tip are shared fairly, and rounding never leaves a cent behind." },
  { icon: Users, title: "Groups for everything", body: "Trips, parties, flats, dinner clubs. Add friends by name; they claim their spot with an invite link." },
  { icon: HandCoins, title: "Settle in fewer payments", body: "Splitter works out the fewest transfers to square everyone up, and can read payment screenshots." },
  { icon: Bell, title: "Everyone stays in the loop", body: "Members get a notification with their share. Anyone can open a read-only share link, no account needed." },
  { icon: Lock, title: "Private by default", body: "Bill photos are visible only to your group. Nothing is shared publicly unless you share it." },
];

const faqs = [
  { q: "Is it only for restaurant bills?", a: "No. Trips, parties, events, households, gifts: anything a few people pay for together. Drop in any bill or just type an amount." },
  { q: "How does Settle with AI work?", a: "Add all the bills from an occasion and a sentence about who paid what. Splitter reads every bill, matches your notes, flags duplicates and proposes one split. You review and edit it before anything is saved." },
  { q: "What if it gets something wrong?", a: "Nothing is final until you publish. Every expense is editable, unclear points come back as questions, and totals are checked against the printed bill." },
  { q: "Who can see my bills?", a: "Bill photos are stored with the expense and only members of that group can see them. Share links show names and amounts, and photos only if you choose." },
  { q: "Is it free?", a: "Yes. Splitter is free and open source under the MIT licence. Use it here or run your own copy." },
  { q: "Do I need an account?", a: "Not for a quick one-off split. Create a free account for groups, running balances, notifications and Settle with AI." },
];

export default function LandingPage() {
  // The Ask Splitter example is computed from the trip scene, so the answer's numbers are real.
  const trip = SCENES[0];
  const tripResult = computeScene(trip);
  const asker = "Priya";
  const askerNet = tripResult.people.find((p) => p.name === asker)!.net;
  const askerLines = tripResult.splits
    .map((s) => ({ label: s.label, paidBy: s.paidBy, share: s.split.shares.find((x) => x.memberId === asker)?.total ?? 0 }))
    .filter((l) => l.share > 0);
  const m = (n: number) => formatMoney(n, CURRENCY, "en-IN");

  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-4xl text-center">
            <p className="eyebrow text-muted-foreground">Shared expenses, sorted by AI</p>
            <h1 className="mt-6 text-[clamp(2.75rem,9vw,6rem)] leading-[0.95] tracking-[-0.03em]">Drop the bills. Splitter settles it.</h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">{site.description}</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-7">
              <Button size="lg" asChild className="max-sm:w-full">
                <Link href="/sign-up">Start splitting, free</Link>
              </Button>
              <Link href="/split" className="inline-flex items-center gap-1.5 underline underline-offset-4">
                Try a quick split <ArrowRight className="size-4" />
              </Link>
            </div>
            <p className="mt-4 text-sm text-subtle">No card. No spreadsheet. Open source.</p>
          </div>

          <div className="mt-14">
            <BillPile />
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Bill reading powered by{" "}
              <a href={site.nebiusUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
                {site.model} on Nebius Token Factory
              </a>
            </p>
          </div>
        </section>

        {/* What it reads */}
        <section id="reads" className="scroll-mt-20 border-t border-hairline">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <div className="grid gap-6 md:grid-cols-[1fr_1.3fr] md:items-end">
              <h2 className="text-4xl leading-tight sm:text-5xl">If it&apos;s a bill, Splitter can read it.</h2>
              <p className="text-lg text-muted-foreground md:pb-1.5">Snap it, upload it or forward the screenshot. Photos of anything else are politely turned away.</p>
            </div>
            <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {reads.map((r) => (
                <li key={r.title} className="flex items-center gap-5 rounded-md bg-stone p-5">
                  <div className="flex w-32 shrink-0 justify-center">
                    <MiniDoc kind={r.kind} label={r.label} amount={r.amount} lines={r.lines} />
                  </div>
                  <div>
                    <h3 className="font-sans text-base">{r.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Settle with AI */}
        <section id="how" className="scroll-mt-20 px-4 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-12 rounded-lg bg-band px-6 py-14 text-band-foreground sm:px-12 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
            <div>
              <p className="eyebrow flex items-center gap-2 text-white/60">
                <Sparkles className="size-3.5 text-[#ffad9b]" /> Settle with AI
              </p>
              <h2 className="mt-4 text-4xl leading-tight sm:text-5xl">A whole weekend of bills, settled in one go.</h2>
              <ol className="mt-10 grid gap-6">
                {steps.map((s, i) => (
                  <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-3">
                    <span className="eyebrow pt-1 text-white/50">0{i + 1}</span>
                    <div>
                      <h3 className="font-sans text-lg">{s.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-white/70">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-8 flex flex-wrap gap-2">
                {["Trips", "Parties", "Events", "Dinners", "Home"].map((c) => (
                  <span key={c} className="rounded-sm border border-[#ffad9b]/60 px-3 py-1 text-sm text-[#ffad9b]">
                    {c}
                  </span>
                ))}
              </div>
            </div>

            {/* Mini review board, from the computed trip */}
            <div className="rounded-md bg-white p-5 text-[#17171c] sm:p-6">
              <div className="flex items-center justify-between">
                <p className="font-display text-xl">Here&apos;s the plan</p>
                <span className="eyebrow text-[11px] text-[#0f6b57]">5 of 5 ready</span>
              </div>
              <ul className="mt-4 divide-y divide-[#e5e7eb]">
                {tripResult.splits.map((s) => (
                  <li key={s.label} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="eyebrow w-8 text-[10px] text-[#93939f]">{s.bill ? `#${s.bill}` : "note"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{s.label}</span>
                      <span className="text-xs text-[#616161]">
                        {s.paidBy} paid · {s.ruleLabel}
                      </span>
                    </span>
                    <span className="tabular">{m(s.split.total)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid gap-1.5 rounded-sm bg-[#eeece7] p-3 text-sm">
                {tripResult.transfers.map((t) => (
                  <p key={`${t.fromMemberId}-${t.toMemberId}`} className="flex justify-between gap-3">
                    <span>
                      {t.fromMemberId} → {t.toMemberId}
                    </span>
                    <span className="tabular">{m(t.amount)}</span>
                  </p>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <span className="inline-flex h-10 items-center rounded-pill bg-[#17171c] px-5 text-sm text-white">Publish &amp; notify</span>
              </div>
            </div>
          </div>
        </section>

        {/* Occasions */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <h2 className="max-w-2xl text-4xl leading-tight sm:text-5xl">Not just the bill at dinner.</h2>
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {occasions.map((o) => (
              <div key={o.title} className="flex flex-col gap-4 rounded-md bg-stone p-6">
                <span className="text-3xl" aria-hidden>
                  {o.emoji}
                </span>
                <h3 className="text-2xl">{o.title}</h3>
                <p className="text-sm text-muted-foreground">{o.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Ask Splitter */}
        <section className="border-t border-hairline">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-28 md:grid-cols-[1fr_1.2fr] md:items-center">
            <div>
              <p className="eyebrow flex items-center gap-2 text-muted-foreground">
                <MessageCircleQuestion className="size-3.5" /> Ask Splitter
              </p>
              <h2 className="mt-4 text-4xl leading-tight sm:text-5xl">“Wait, why do I owe that?”</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Anyone in the group can ask. Answers come only from that group&apos;s bills, notes and payments, with the numbers to check.
              </p>
            </div>
            <div className="grid gap-4 rounded-lg bg-[#17171c] p-5 text-white sm:p-7">
              <p className="justify-self-end rounded-md rounded-br-xs bg-white/10 px-3.5 py-2 text-sm">Why do I owe {m(-askerNet)} for {trip.title}?</p>
              <div className="grid gap-2 text-sm leading-relaxed text-white/85">
                <p>
                  You didn&apos;t pay for anything on this trip, so your whole share of {m(-askerNet)} is still owed. It comes from:
                </p>
                <ul className="grid gap-1">
                  {askerLines.map((l) => (
                    <li key={l.label} className="flex justify-between gap-3 rounded-sm bg-white/5 px-3 py-2">
                      <span>
                        {l.label} <span className="text-white/50">· {l.paidBy} paid</span>
                      </span>
                      <span className="tabular">{m(l.share)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-white/60">You weren&apos;t charged for the drinks: the note said you didn&apos;t drink.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t border-hairline">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <h2 className="max-w-2xl text-4xl leading-tight sm:text-5xl">Everything a shared tab needs. Nothing it doesn&apos;t.</h2>
            <div className="mt-12 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.title} className="border-t border-foreground pt-6">
                  <f.icon className="size-5" />
                  <h3 className="mt-5 font-sans text-lg">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Free & open source */}
        <section className="px-4 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-10 rounded-lg bg-stone p-8 sm:p-12 md:grid-cols-[1fr_1fr] md:items-center">
            <div>
              <p className="eyebrow text-muted-foreground">Pricing</p>
              <p className="mt-4 font-display text-6xl">Free.</p>
              <p className="mt-3 max-w-md text-lg text-muted-foreground">No plans, no limits on groups or people. Splitter is open source under the MIT licence, so you can also run your own copy.</p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-7">
                <Button size="lg" asChild>
                  <Link href="/sign-up">Create your first group</Link>
                </Button>
                <a href={site.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 underline underline-offset-4">
                  <GitHubIcon /> Star on GitHub
                </a>
              </div>
            </div>
            <ul className="grid gap-3 rounded-md bg-card p-6">
              {["Unlimited groups and people", "Settle with AI for any occasion", "Itemized, equal, shares or exact splits", "Notifications and share links", "Any currency", "Self-host in minutes"].map((f) => (
                <li key={f} className="flex items-center gap-3">
                  <Check className="size-4 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-28 md:grid-cols-[1fr_1.6fr]">
            <h2 className="text-4xl sm:text-5xl">Questions</h2>
            <div className="divide-y divide-hairline border-y border-hairline">
              {faqs.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg">
                    {f.q}
                    <span className="text-2xl font-light text-muted-foreground transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="pb-5 text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-hairline">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 py-20 text-center sm:px-6 sm:py-28">
            <h2 className="max-w-3xl text-[clamp(2.5rem,7vw,4.5rem)] leading-[1]">The next trip is already on someone&apos;s card.</h2>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-7">
              <Button size="lg" asChild className="max-sm:w-full">
                <Link href="/sign-up">Start splitting, free</Link>
              </Button>
              <Link href="/split" className="inline-flex items-center gap-1.5 underline underline-offset-4">
                <Link2 className="size-4" /> Or a quick split of one receipt
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
