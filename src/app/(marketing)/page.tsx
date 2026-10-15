import { ArrowRight, Bell, BookOpen, Calculator, Check, HandCoins, Lock, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { GitHubIcon } from "@/components/github-icon";
import { BillPile } from "@/components/landing/bill-pile";
import { MiniDoc, type ReadKind } from "@/components/landing/mini-doc";
import { computeScene, CURRENCY, SCENES } from "@/components/landing/scenes";
import { SettleSteps } from "@/components/landing/settle-steps";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { GroupKindIcon } from "@/components/ui/icons";
import type { GroupKind } from "@/config/categories";
import { site } from "@/config/site";
import { formatMoney, toMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

const reads: { kind: ReadKind; title: string; body: string }[] = [
  { kind: "receipt", title: "Restaurant & shop receipts", body: "Every line, tax, tip and service charge." },
  { kind: "invoice", title: "Invoices & PDFs", body: "Hotel folios, rentals, utility bills, multi-page PDFs." },
  { kind: "ride", title: "Ride & app screenshots", body: "Cabs, food delivery, booking confirmations." },
  { kind: "payment", title: "Payment proof", body: "Paid someone back? Splitter records it." },
  { kind: "note", title: "Handwritten notes", body: "A scribbled list becomes separate expenses." },
  { kind: "ticket", title: "Tickets", body: "Concerts, events, trains and flights." },
];

// Solid white glyphs on a 48px grid, sized to sit above the pillar titles.
const PILLAR_ICONS = {
  free: (
    <svg viewBox="0 0 48 48" aria-hidden className="size-12">
      <circle cx="24" cy="24" r="22" fill="#fff" />
      <path d="M16 15h16M16 21h16M16 15h4.5a6 6 0 0 1 0 12H17l11 9" fill="none" stroke="#000" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  reads: (
    <svg viewBox="0 0 48 48" aria-hidden className="size-12">
      <path d="M10 4h28a2 2 0 0 1 2 2v38l-5-3.5-5 3.5-5-3.5-5 3.5-5-3.5-5 3.5V6a2 2 0 0 1 2-2Z" fill="#fff" />
      <path d="M16 14h16M16 21h16M16 28h9" stroke="#000" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  ),
  group: (
    <svg viewBox="0 0 48 48" aria-hidden className="size-12">
      <circle cx="17" cy="14" r="8" fill="#fff" />
      <circle cx="34" cy="17" r="6" fill="#fff" />
      <path d="M3 38c0-8 6-13 14-13s14 5 14 13v4H3Z" fill="#fff" />
      <path d="M34 42v-4c0-4-1.3-7.6-3.6-10.2A11 11 0 0 1 45 38v4Z" fill="#fff" />
    </svg>
  ),
};

const pillars = [
  { icon: PILLAR_ICONS.free, title: "Free for everyone", body: "No plans and no limits on groups or people. Open source under the MIT licence." },
  { icon: PILLAR_ICONS.reads, title: "Reads any bill", body: "Receipts, invoices, screenshots and notes, in any language. Duplicates are caught." },
  { icon: PILLAR_ICONS.group, title: "Works for the whole group", body: "Friends, flatmates, teammates, families. They join by name with an invite link." },
];

const occasions: { kind: GroupKind; title: string; body: string; lines: [string, string, string][]; span: string }[] = [
  {
    kind: "trip",
    title: "Trips",
    body: "Hotel by room, fuel equally, the surf lesson only for the two who went.",
    lines: [
      ["Villa, 3 nights", "by room", "₹24,000"],
      ["Fuel", "equally · 4", "₹3,200"],
      ["Surf lesson", "Aman, Priya", "₹4,000"],
    ],
    span: "lg:col-span-3",
  },
  {
    kind: "party",
    title: "Parties",
    body: "Venue, decorations, drinks. Leave out whoever didn't drink.",
    lines: [
      ["Venue", "equally · 12", "₹18,000"],
      ["Drinks", "not Priya, Sam", "₹9,600"],
      ["Cake", "equally · 12", "₹1,800"],
    ],
    span: "lg:col-span-3",
  },
  { kind: "event", title: "Events", body: "Tickets at different prices? Exact amounts per person.", lines: [["Festival passes", "exact", "₹12,500"]], span: "lg:col-span-2" },
  { kind: "dinner", title: "Dinners", body: "Tap what you had. Tax and tip follow what you ordered.", lines: [["Beach Shack", "by item", "₹3,402"]], span: "lg:col-span-2" },
  { kind: "home", title: "Home", body: "Rent by room size, bills equally, one running balance.", lines: [["October rent", "by room", "₹42,000"]], span: "lg:col-span-2" },
];

const features = [
  { icon: Calculator, title: "Every cent adds up", body: "Equal, by shares, exact amounts or line by line. Rounding never leaves a cent behind." },
  { icon: HandCoins, title: "Settle in fewer payments", body: "The fewest transfers to square everyone up, and it reads payment screenshots." },
  { icon: Bell, title: "Everyone stays in the loop", body: "Members get a notification with their share and the bills behind it." },
  { icon: Lock, title: "Private by default", body: "Bill photos are visible only to your group unless you choose to share them." },
];

const faqs: { topic: string; q: string; a: string }[] = [
  { topic: "General", q: "Is it only for restaurant bills?", a: "No. Trips, parties, events, households, gifts: anything a few people pay for together. Drop in any bill or just type an amount." },
  { topic: "General", q: "Do I need an account?", a: "Not for a quick one-off split. Create a free account for groups, running balances, notifications and Settle with AI." },
  { topic: "AI", q: "How does Settle with AI work?", a: "Add all the bills from an occasion and a sentence about who paid what. Splitter reads every bill, matches your notes, flags duplicates and proposes one split. You review and edit it before anything is saved." },
  { topic: "AI", q: "What if it gets something wrong?", a: "Nothing is final until you publish. Every expense is editable, unclear points come back as questions, and totals are checked against the printed bill." },
  { topic: "Privacy", q: "Who can see my bills?", a: "Bill photos are stored with the expense and only members of that group can see them. Share links show names and amounts, and photos only if you choose." },
  { topic: "Pricing", q: "Is it free?", a: "Yes. Splitter is free and open source under the MIT licence. Use it here or run your own copy." },
];

/**
 * Glass pill buttons. `solid` is frosted white for the main action; `clear` is see-through glass for the rest.
 * Both carry a bright top edge and a soft shadow so they lift off photos and dark panels alike.
 */
function Cta({
  href,
  children,
  tone = "solid",
  size = "md",
  external,
  className,
}: {
  href: string;
  children: React.ReactNode;
  tone?: "solid" | "clear";
  size?: "md" | "xl";
  external?: boolean;
  className?: string;
}) {
  const classes = cn(
    "inline-flex items-center justify-center gap-2.5 rounded-pill border font-semibold tracking-[-0.02em] backdrop-blur-xl transition duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
    tone === "solid"
      ? "border-white/70 bg-[linear-gradient(180deg,rgb(255_255_255/0.96),rgb(255_255_255/0.78))] text-[#111114] shadow-[inset_0_1px_0_#fff,inset_0_-10px_20px_-12px_rgb(0_0_0/0.25),0_12px_40px_-10px_rgb(255_255_255/0.28)] hover:shadow-[inset_0_1px_0_#fff,inset_0_-10px_20px_-12px_rgb(0_0_0/0.25),0_16px_50px_-8px_rgb(255_255_255/0.4)]"
      : "border-white/20 bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_10px_30px_-12px_rgb(0_0_0/0.6)] hover:border-white/35 hover:bg-white/[0.14]",
    size === "md" ? "h-12 px-7 text-[15px]" : "h-16 px-9 text-xl sm:h-20 sm:px-12 sm:text-3xl",
    className,
  );
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={classes}>
      {children}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}

/** Mono section label, the same everywhere on the page. */
function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("eyebrow text-[11px] text-white/55", className)}>{children}</p>;
}

/** Section heading: large, semibold, tight. */
function Heading({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("text-[clamp(2.25rem,5vw,4rem)] font-semibold leading-[0.95] tracking-[-0.045em]", className)}>{children}</h2>;
}

export default function LandingPage() {
  // The demo boards are computed from the trip scene, so their numbers are real.
  const trip = SCENES[0];
  const tripResult = computeScene(trip);
  const asker = "Priya";
  const askerNet = tripResult.people.find((p) => p.name === asker)!.net;
  const askerLines = tripResult.splits
    .map((s) => ({ label: s.label, paidBy: s.paidBy, share: s.split.shares.find((x) => x.memberId === asker)?.total ?? 0 }))
    .filter((l) => l.share > 0);
  const m = (n: number) => formatMoney(n, CURRENCY, "en-IN");

  return (
    <div className="theme-ink relative isolate min-h-dvh bg-background text-foreground">
      <SiteHeader overlay />
      <main>
        {/* Hero: full-bleed photo, darkened most behind the headline. */}
        <section className="relative isolate -mt-16 flex min-h-[min(92svh,58rem)] items-center overflow-hidden pt-16">
          {/* Photo: Fumiaki Hayashi on Unsplash (Unsplash License). */}
          <Image src="/hero.webp" alt="" fill loading="eager" fetchPriority="high" sizes="100vw" className="-z-20 object-cover" />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_55%_at_50%_50%,rgb(0_0_0/0.78),rgb(0_0_0/0.45)_70%),linear-gradient(180deg,rgb(0_0_0/0.5)_0%,transparent_30%,transparent_70%,var(--background)_100%)]"
          />
          <div className="mx-auto w-full max-w-6xl px-4 py-24 text-center sm:px-6">
            <Label className="text-white/70">Shared expenses, sorted by AI</Label>
            <h1 className="mx-auto mt-6 max-w-5xl text-[clamp(3rem,10vw,7.5rem)] font-semibold leading-[0.9] tracking-[-0.055em] text-white">
              Drop the bills. Splitter settles it.
            </h1>
            <p className="mx-auto mt-7 max-w-xl text-lg text-white/80">{site.description}</p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Cta href="/sign-up" className="max-sm:w-full">
                Start splitting <ArrowRight className="size-4" />
              </Cta>
              <Cta href="/split" tone="clear" className="max-sm:w-full">
                Try a quick split
              </Cta>
            </div>
            <Label className="mt-7 text-white/50">No card · No spreadsheet · Open source</Label>
          </div>
        </section>

        {/* The bill pile demo */}
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <BillPile />
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Bill reading powered by{" "}
            <a href={site.modelUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
              {site.model}
            </a>{" "}
            on{" "}
            <a href={site.nebiusUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
              Nebius Token Factory
            </a>
          </p>
        </section>

        {/* Settle with AI: white card, steps on the left, phone over a photo on the right */}
        <section id="how" className="scroll-mt-20 px-4 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-6 rounded-[28px] bg-white p-5 text-[#111114] shadow-[0_40px_100px_-40px_rgb(255_255_255/0.15)] sm:p-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-10">
            <SettleSteps
              demo={{
                title: trip.title,
                people: tripResult.people.map((p) => p.name),
                bills: trip.bills.map((b) => ({ label: b.label, kind: b.kind, amount: m(toMinor(b.amount, CURRENCY)) })),
                note: trip.notes,
                rows: tripResult.splits.map((s) => ({ label: s.label, sub: `${s.paidBy} paid · ${s.ruleLabel}`, amount: m(s.split.total) })),
                total: m(tripResult.splits.reduce((sum, s) => sum + s.split.total, 0)),
                transfers: tripResult.transfers.map((t) => ({ from: t.fromMemberId, to: t.toMemberId, amount: m(t.amount) })),
              }}
            />
          </div>
        </section>

        {/* Three pillars */}
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-24 sm:grid-cols-3 sm:gap-0 sm:px-6">
          {pillars.map((p) => (
            <div key={p.title} className="border-l border-white/15 pl-8 sm:pr-8 sm:first:border-l-white/15">
              {p.icon}
              <h3 className="mt-10 font-sans text-xl font-semibold tracking-[-0.025em] text-white">{p.title}</h3>
              <p className="mt-1.5 text-xl leading-snug tracking-[-0.02em] text-white/55">{p.body}</p>
            </div>
          ))}
        </section>

        {/* Ask Splitter: full-photo card, headline over the photo, solid dark panel on the right */}
        <section className="px-4 sm:px-6">
          <div className="relative isolate mx-auto grid max-w-6xl gap-6 overflow-hidden rounded-[28px] border border-white/10 p-5 sm:p-8 lg:min-h-[40rem] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            {/* Photo: Fumiaki Hayashi on Unsplash (Unsplash License). */}
            <Image src="/hero.webp" alt="" fill sizes="(min-width: 1152px) 1152px, 100vw" className="-z-20 scale-[1.35] object-cover object-[80%_20%]" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(0_0_0/0.45),rgb(0_0_0/0.15)_45%,rgb(0_0_0/0.55))]" />
            <div className="flex flex-col justify-between gap-10 p-2 sm:p-4">
              <h2 className="max-w-xl text-[clamp(3rem,7vw,5.75rem)] font-semibold leading-[0.9] tracking-[-0.055em] text-white [text-shadow:0_2px_40px_rgb(0_0_0/0.4)]">
                “Wait, why do I owe that?”
              </h2>
              {/* The question, asked in the group */}
              <div className="glass-card max-w-md rounded-2xl p-4">
                <p className="ml-auto w-fit rounded-2xl rounded-br-md bg-white px-3.5 py-2 text-sm text-[#111114]">Why do I owe {m(-askerNet)}?</p>
                <p className="mt-3 text-sm leading-relaxed text-white/85">
                  Your share of {askerLines.length} bills from {trip.title}. You weren&apos;t charged for the drinks: the note said you didn&apos;t drink.
                </p>
              </div>
            </div>
            <div className="flex flex-col rounded-[20px] bg-[#141414] p-6 sm:p-9">
              <p className="text-[clamp(2rem,3.5vw,2.75rem)] font-semibold leading-[0.95] tracking-[-0.045em] text-white">Introducing Ask Splitter</p>
              <p className="mt-2 text-lg tracking-[-0.015em] text-white/50">No more group-chat maths</p>
              <ul className="mt-6 border-t border-white/10">
                {["Answers from your group's own bills", "Every number shown to check", "Understands notes in plain words", "Anyone in the group can ask"].map((f) => (
                  <li key={f} className="flex items-center gap-4 border-b border-white/10 py-4 text-[17px] tracking-[-0.015em] text-white">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-[#111114]">
                      <Check className="size-4" strokeWidth={3} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Cta href="/sign-up" className="mt-10 h-16 w-full text-lg lg:mt-auto">
                Try it free
              </Cta>
            </div>
          </div>
        </section>

        {/* Occasions: a bento of glass cards with a real example in each */}
        <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <Label>For every shared tab</Label>
            <Heading className="mt-4">Built for trips, parties, dinners and homes</Heading>
          </div>
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {occasions.map((o) => (
              <article key={o.kind} className={cn("glass-card flex flex-col rounded-lg p-6", o.span)}>
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full border border-white/15 bg-white/10">
                    <GroupKindIcon kind={o.kind} className="size-[18px]" />
                  </span>
                  <h3 className="text-2xl font-semibold tracking-[-0.035em]">{o.title}</h3>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{o.body}</p>
                <ul className="mt-6 grid gap-px overflow-hidden rounded-md border border-white/[0.07] bg-white/[0.07] lg:mt-auto">
                  {o.lines.map(([label, rule, amount]) => (
                    <li key={label} className="flex items-center gap-3 bg-black/70 px-3.5 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <span className="eyebrow hidden text-[10px] text-white/45 sm:inline">{rule}</span>
                      <span className="tabular text-white/90">{amount}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* What it reads + features */}
        <section id="reads" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 sm:pb-32">
            <div className="grid gap-6 md:grid-cols-[1fr_1fr] md:items-end">
              <div>
                <Label>What it reads</Label>
                <Heading className="mt-4">If it&apos;s a bill, Splitter can read it.</Heading>
              </div>
              <p className="text-lg text-muted-foreground md:pb-1.5">Snap it, upload it or forward the screenshot. Photos of anything else are politely turned away.</p>
            </div>
            <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {reads.map((r) => (
                <li
                  key={r.title}
                  className="group flex items-center gap-5 rounded-2xl border border-white/[0.06] bg-[#141417] p-4 pr-5 transition-colors hover:border-white/[0.12] hover:bg-[#18181c]"
                >
                  <div className="flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden">
                    <MiniDoc kind={r.kind} className="shrink-0 scale-[0.62] transition-transform duration-500 group-hover:scale-[0.66]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-sans text-base font-semibold tracking-[-0.015em]">{r.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/55">{r.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div id="features" className="mt-3 grid scroll-mt-20 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((f) => (
                <div key={f.title} className="glass-card rounded-lg p-6">
                  <f.icon className="size-5 text-accent" />
                  <h3 className="mt-4 font-sans text-base font-semibold tracking-[-0.01em]">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ: intro on the left, glass accordion on the right */}
        <section id="faq" className="scroll-mt-20 px-4 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <Label>FAQ</Label>
              <Heading className="mt-4">Questions, answered</Heading>
              <p className="mt-5 max-w-sm text-muted-foreground">Everything about splitting, the AI and your privacy. Still curious? The docs cover the rest.</p>
              <Cta href={`${site.repoUrl}#readme`} external tone="clear" className="mt-8">
                <BookOpen className="size-4" /> Read the docs
              </Cta>
            </div>
            <div className="grid gap-2">
              {faqs.map((f) => (
                <details key={f.q} className="glass-card group rounded-lg [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center gap-4 rounded-lg px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:px-6">
                    <span className="min-w-0 flex-1">
                      <span className="eyebrow block text-[10px] text-white/45">{f.topic}</span>
                      <span className="mt-1 block text-base font-medium tracking-[-0.01em] sm:text-lg">{f.q}</span>
                    </span>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] transition duration-300 group-open:rotate-45 group-open:bg-white group-open:text-[#111114]">
                      <Plus className="size-4" />
                    </span>
                  </summary>
                  <p className="px-5 pb-5 leading-relaxed text-muted-foreground sm:px-6 sm:pr-20">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="px-4 py-24 sm:px-6 sm:py-32">
          <div className="glass-card mx-auto flex max-w-6xl flex-col items-center rounded-xl px-6 py-16 text-center sm:py-24">
            <Heading className="max-w-4xl text-[clamp(2.5rem,7vw,5.5rem)]">The next trip is already on someone&apos;s card.</Heading>
            <p className="mt-5 text-muted-foreground">Every bill in one place. Free forever, open source.</p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
              <Cta href="/sign-up" size="xl">
                Get started <ArrowRight className="size-[0.85em]" strokeWidth={2.5} />
              </Cta>
              <Cta href={site.repoUrl} external tone="clear" size="xl">
                <GitHubIcon /> GitHub
              </Cta>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
