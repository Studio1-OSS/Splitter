"use client";

import { Bell, Check, FileText, Receipt, Smartphone, Sparkles, StickyNote, Ticket, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import * as React from "react";
import { cn } from "@/lib/utils";
import { expenseIcon, PhoneFrame, PhoneHeader, type PlanRow } from "./phone-plan";
import type { DocKind } from "./scenes";

const STEP_MS = 5000;

const KIND_ICON: Record<DocKind, LucideIcon> = { receipt: Receipt, invoice: FileText, screenshot: Smartphone, note: StickyNote, ticket: Ticket };

export type SettleDemo = {
  title: string;
  people: string[];
  bills: { label: string; kind: DocKind; amount: string }[];
  note: string;
  rows: PlanRow[];
  total: string;
  transfers: { from: string; to: string; amount: string }[];
};

const STEPS = [
  { title: "Drop every bill", body: "Photos, PDFs, screenshots. As many as the occasion produced, all at once." },
  { title: "Say who paid, your way", body: "“Aman paid #1 and #2, Rakesh paid 200 twice, Priya didn't drink.” That's all it needs." },
  { title: "Review the plan", body: "Each expense with its bill, payer and split. Splitter asks when something's unclear." },
  { title: "Everyone's notified", body: "One tap publishes it. Each person sees their share and the bills behind it." },
];

/**
 * The "how it works" card body: steps on the left that auto-advance (each with a filling progress bar),
 * and a phone on the right whose screen follows the active step. Hovering or clicking a step takes over.
 */
export function SettleSteps({ demo }: { demo: SettleDemo }) {
  const reduce = useReducedMotion();
  const [step, setStep] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (paused || reduce) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS);
    return () => clearTimeout(t);
  }, [step, paused, reduce]);

  return (
    <>
      <div className="flex flex-col gap-10 p-2 sm:p-4 lg:pr-0">
        <h2 className="text-[clamp(2.5rem,5vw,4rem)] font-semibold leading-[0.95] tracking-[-0.05em]">One app to read, split and settle every bill</h2>
        <ol className="lg:mt-auto" onMouseLeave={() => setPaused(false)}>
          {STEPS.map((s, i) => {
            const active = i === step;
            return (
              <li key={s.title} className="relative border-t border-[#e5e5e5] first:border-t-0">
                {/* Progress track: fills over the step's time while it's active. */}
                <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px] overflow-hidden rounded-full", active ? "bg-[#e5e5e5]" : "bg-transparent")}>
                  {active && (
                    <motion.span
                      key={`${step}-${paused}`}
                      className="block h-full rounded-full bg-[#111114]"
                      initial={{ width: paused || reduce ? "100%" : "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: paused || reduce ? 0 : STEP_MS / 1000, ease: "linear" }}
                    />
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setStep(i);
                    setPaused(true);
                  }}
                  aria-expanded={active}
                  className="w-full py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111114]/30"
                >
                  <span className={cn("block text-xl tracking-[-0.025em] transition-colors", active ? "text-[#111114]" : "text-[#111114]/45 hover:text-[#111114]/75")}>{s.title}</span>
                  <AnimatePresence initial={false}>
                    {active && (
                      <motion.span
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        className="block overflow-hidden"
                      >
                        <span className="block pt-1.5 text-lg leading-snug tracking-[-0.015em] text-[#8a8a8f]">{s.body}</span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="relative flex min-h-[36rem] items-start justify-center overflow-hidden rounded-[20px] bg-black px-6 pt-10 sm:px-10">
        {/* Photo: Fumiaki Hayashi on Unsplash (Unsplash License). */}
        <Image src="/hero.webp" alt="" fill sizes="(min-width: 1024px) 640px, 100vw" className="scale-110 object-cover object-[35%_60%]" />
        <div aria-hidden className="absolute inset-0 bg-black/35" />
        <div className="relative translate-y-[12%]">
          <PhoneFrame dark={step === 3}>
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="flex min-h-0 flex-1 flex-col"
              >
                {step === 0 && <DropScreen demo={demo} reduce={!!reduce} />}
                {step === 1 && <NoteScreen demo={demo} reduce={!!reduce} />}
                {step === 2 && <PlanScreen demo={demo} reduce={!!reduce} />}
                {step === 3 && <NotifyScreen demo={demo} reduce={!!reduce} />}
              </motion.div>
            </AnimatePresence>
          </PhoneFrame>
        </div>
      </div>
    </>
  );
}

type ScreenProps = { demo: SettleDemo; reduce: boolean };

/** Step 1: the bills upload one after another. */
function DropScreen({ demo, reduce }: ScreenProps) {
  return (
    <>
      <PhoneHeader title={demo.title} people={demo.people} caption="Adding bills" />
      <ul className="mt-4 grid gap-2">
        {demo.bills.map((b, i) => {
          const Icon = KIND_ICON[b.kind];
          return (
            <motion.li
              key={b.label}
              initial={reduce ? false : { opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: reduce ? 0 : 0.15 + i * 0.35, duration: 0.35 }}
              className="rounded-2xl bg-white p-2.5 shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-[10px] bg-[#f1f1f4]">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{b.label}</span>
                <span className="tabular text-[12px] text-[#6b6b70]">{b.amount}</span>
              </div>
              <span className="mt-2 block h-1 overflow-hidden rounded-full bg-[#ececef]">
                <motion.span
                  className="block h-full rounded-full bg-[#111114]"
                  initial={{ width: reduce ? "100%" : "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ delay: reduce ? 0 : 0.3 + i * 0.35, duration: reduce ? 0 : 0.7, ease: "easeOut" }}
                />
              </span>
            </motion.li>
          );
        })}
      </ul>
    </>
  );
}

/** Step 2: the note is typed, then Splitter starts reading. */
function NoteScreen({ demo, reduce }: ScreenProps) {
  const [n, setN] = React.useState(reduce ? demo.note.length : 0);
  React.useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setN((x) => Math.min(demo.note.length, x + 1)), 2600 / demo.note.length);
    return () => clearInterval(t);
  }, [demo.note, reduce]);
  const done = n >= demo.note.length;
  return (
    <>
      <PhoneHeader title={demo.title} people={demo.people} caption={`${demo.bills.length} bills added`} />
      <div className="mt-auto grid gap-2 pb-1">
        <div className="flex flex-wrap gap-1">
          {demo.bills.map((b, i) => (
            <span key={b.label} className="rounded-full bg-white px-2 py-0.5 font-mono text-[10px] text-[#6b6b70] shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
              #{i + 1} {b.amount}
            </span>
          ))}
        </div>
        <p className="ml-6 rounded-2xl rounded-br-md bg-[#111114] px-3.5 py-2.5 text-[13px] leading-snug text-white">
          {demo.note.slice(0, n)}
          {!done && <span className="ml-0.5 inline-block h-3.5 w-px animate-pulse bg-white align-middle" />}
        </p>
        <AnimatePresence>
          {done && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mr-10 inline-flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13px] shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
            >
              <Sparkles className="size-3.5 text-[#c2410c]" /> Reading {demo.bills.length} bills
              <span className="flex gap-0.5">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="size-1 animate-bounce rounded-full bg-[#8a8a8f]" style={{ animationDelay: `${d * 120}ms` }} />
                ))}
              </span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/** Step 3: the plan, expense by expense. */
function PlanScreen({ demo, reduce }: ScreenProps) {
  return (
    <>
      <PhoneHeader title={demo.title} people={demo.people} />
      <div className="mt-3 rounded-2xl bg-[#111114] p-3.5 text-white">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-white/50">Plan ready</p>
        <p className="mt-0.5 text-[26px] font-semibold leading-none tracking-[-0.04em]">{demo.total}</p>
        <p className="mt-1.5 text-[11px] text-white/60">
          {demo.rows.length} expenses · {demo.transfers.length} payments to settle
        </p>
      </div>
      <ul className="mt-3 divide-y divide-[#ececef] overflow-hidden rounded-2xl bg-white">
        {demo.rows.map((r, i) => {
          const { Icon, tint } = expenseIcon(r.label);
          return (
            <motion.li
              key={r.label}
              initial={reduce ? false : { opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduce ? 0 : 0.1 + i * 0.08 }}
              className="flex items-center gap-2.5 px-3 py-2.5"
            >
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-[10px]", tint)}>
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium tracking-[-0.01em]">{r.label}</span>
                <span className="block truncate text-[11px] text-[#8a8a8f]">{r.sub}</span>
              </span>
              <span className="tabular text-[13px] font-medium">{r.amount}</span>
            </motion.li>
          );
        })}
      </ul>
      <span className="mt-auto flex h-11 shrink-0 items-center justify-center rounded-full bg-[#111114] text-[14px] font-semibold text-white">Publish &amp; notify</span>
    </>
  );
}

/** Step 4: the lock screen fills with each person's notification. */
function NotifyScreen({ demo, reduce }: ScreenProps) {
  return (
    <>
      <div className="pt-4 text-center">
        <p className="text-[13px] font-medium text-white/70">Saturday 18 October</p>
        <p className="text-[64px] font-semibold leading-none tracking-[-0.04em]">9:41</p>
      </div>
      <ul className="mt-auto grid gap-2 pb-2">
        <motion.li
          initial={reduce ? false : { opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: reduce ? 0 : 0.2, type: "spring", stiffness: 300, damping: 26 }}
          className="rounded-[18px] border border-white/15 bg-white/15 p-3 backdrop-blur-xl"
        >
          <NotificationHead />
          <p className="mt-1 text-[13px] font-semibold">{demo.title} is settled</p>
          <p className="text-[12px] text-white/75">
            {demo.rows.length} expenses, {demo.total}. <Check className="inline size-3" strokeWidth={3} />
          </p>
        </motion.li>
        {demo.transfers.map((t, i) => (
          <motion.li
            key={`${t.from}-${t.to}`}
            initial={reduce ? false : { opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: reduce ? 0 : 0.55 + i * 0.35, type: "spring", stiffness: 300, damping: 26 }}
            className="rounded-[18px] border border-white/15 bg-white/15 p-3 backdrop-blur-xl"
          >
            <NotificationHead />
            <p className="mt-1 text-[13px]">
              <span className="font-semibold">{t.from}</span>, you owe {t.to} <span className="font-semibold">{t.amount}</span>
            </p>
          </motion.li>
        ))}
      </ul>
    </>
  );
}

function NotificationHead() {
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-white/70">
      <span className="flex size-4 items-center justify-center rounded-[5px] bg-white text-[#111114]">
        <Bell className="size-2.5" />
      </span>
      SPLITTER
      <span className="ml-auto">now</span>
    </p>
  );
}
