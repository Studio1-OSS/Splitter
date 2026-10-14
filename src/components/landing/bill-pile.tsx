"use client";

import { ArrowRight, ArrowUp, Check, FileText, Loader2, type LucideIcon, Receipt, Smartphone, Sparkles, StickyNote, Ticket } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import * as React from "react";
import { formatMoney, toMinor } from "@/lib/money";
import { avatarColor, cn } from "@/lib/utils";
import { computeScene, CURRENCY, type DocKind, SCENES } from "./scenes";

const KIND_ICON: Record<DocKind, LucideIcon> = { receipt: Receipt, invoice: FileText, screenshot: Smartphone, note: StickyNote, ticket: Ticket };
const KIND_LABEL: Record<DocKind, string> = { receipt: "Receipt photo", invoice: "Invoice PDF", screenshot: "Screenshot", note: "Handwritten note", ticket: "Ticket" };

const PHASE_MS = [1300, 2200, 1400]; // bills drop → notes type → AI reads → result
const HOLD_MS = 6500;

/** Hero demo: a pile of bills + one sentence of context becomes one settlement. All numbers are computed. */
export function BillPile() {
  const reduce = useReducedMotion();
  const [index, setIndex] = React.useState(0);
  const [phase, setPhase] = React.useState(reduce ? 3 : 0);
  const [paused, setPaused] = React.useState(false);
  const scene = SCENES[index];
  const result = React.useMemo(() => computeScene(scene), [scene]);
  const m = (n: number) => formatMoney(n, CURRENCY, "en-IN");

  React.useEffect(() => {
    if (reduce) {
      setPhase(3);
      return;
    }
    setPhase(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    PHASE_MS.forEach((d, i) => {
      t += d;
      timers.push(setTimeout(() => setPhase(i + 1), t));
    });
    if (!paused) timers.push(setTimeout(() => setIndex((x) => (x + 1) % SCENES.length), t + HOLD_MS));
    return () => timers.forEach(clearTimeout);
  }, [index, paused, reduce]);

  const typed = phase >= 2 ? scene.notes : phase === 1 ? scene.notes : "";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" onMouseEnter={() => setPaused(true)}>
      {/* Left: occasion, the uploaded bills, the note */}
      <div className="glass-card flex flex-col gap-5 rounded-2xl p-5 sm:p-7">
        <div role="tablist" aria-label="Occasion" className="flex w-full gap-1 overflow-x-auto rounded-pill border border-white/10 bg-white/[0.04] p-1 [scrollbar-width:none]">
          {SCENES.map((s, i) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={i === index}
              onClick={() => {
                setPaused(true);
                setIndex(i);
              }}
              className={cn("relative h-9 flex-1 shrink-0 rounded-pill px-3 text-sm font-medium transition-colors", i === index ? "text-[#111114]" : "text-white/60 hover:text-white")}
            >
              {i === index && (
                <motion.span
                  layoutId="occasion-pill"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="absolute inset-0 rounded-pill bg-white shadow-[inset_0_1px_0_#fff,0_4px_14px_-4px_rgb(255_255_255/0.4)]"
                />
              )}
              <span className="relative">{s.label}</span>
            </button>
          ))}
        </div>

        <div>
          <p className="eyebrow text-[11px] text-white/45">Bills · {scene.bills.length}</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.ul key={scene.key} exit={{ opacity: 0, transition: { duration: 0.15 } }} className="mt-2.5 grid gap-1.5">
              {scene.bills.map((b, i) => {
                const Icon = KIND_ICON[b.kind];
                return (
                  <motion.li
                    key={`${scene.key}-${i}`}
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduce ? 0 : i * 0.12, duration: 0.35, ease: "easeOut" }}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5 pr-3.5"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#111114]">
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{b.label}</span>
                      <span className="block text-xs text-white/45">{KIND_LABEL[b.kind]}</span>
                    </span>
                    <span className="tabular text-sm text-white/85">{m(toMinor(b.amount, CURRENCY))}</span>
                    <span className="flex w-16 justify-end">
                      {phase < 2 ? (
                        <span className="text-[11px] text-white/35">Added</span>
                      ) : phase === 2 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-white/70">
                          <Loader2 className="size-3 animate-spin" /> Reading
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#5fd3a8]">
                          <Check className="size-3" strokeWidth={3} /> Read
                        </span>
                      )}
                    </span>
                  </motion.li>
                );
              })}
            </motion.ul>
          </AnimatePresence>
        </div>

        <div className={cn("mt-auto rounded-xl border border-white/10 bg-black/40 p-3.5 transition-opacity", phase >= 1 ? "opacity-100" : "opacity-50")}>
          <p className="eyebrow text-[11px] text-white/45">Your note</p>
          <div className="mt-1.5 flex items-end gap-3">
            <p className="min-h-[3.25rem] flex-1 text-sm leading-relaxed">
              {phase === 1 && !reduce ? <Typewriter key={scene.key} text={typed} ms={PHASE_MS[1] - 300} /> : typed}
              {phase === 0 && <span className="text-white/35">Who paid what, in your own words…</span>}
            </p>
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full transition", phase >= 2 ? "bg-white text-[#111114]" : "bg-white/10 text-white/40")}>
              <ArrowUp className="size-4" />
            </span>
          </div>
        </div>
      </div>

      {/* Right: the settlement */}
      <div className="glass-card relative flex min-h-[30rem] flex-col rounded-2xl p-5 text-white sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-[11px] text-white/45">Settlement</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.035em]">{scene.title}</p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-xs font-medium transition",
              phase === 2 ? "border-white/20 bg-white/10 text-white" : phase >= 3 ? "border-[#5fd3a8]/30 bg-[#5fd3a8]/10 text-[#5fd3a8]" : "border-white/10 text-white/40",
            )}
          >
            {phase >= 3 ? <Check className="size-3" strokeWidth={3} /> : <Sparkles className={cn("size-3", phase === 2 && "animate-pulse")} />}
            {phase < 2 ? "Waiting for bills" : phase === 2 ? `Reading ${scene.bills.length} bills` : "Settled"}
          </span>
        </div>

        <AnimatePresence mode="wait">
          {phase >= 3 ? (
            <motion.div key={scene.key} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 flex flex-1 flex-col gap-4">
              <ul className="grid gap-1">
                {result.splits.map((e, i) => (
                  <motion.li
                    key={e.label}
                    initial={reduce ? false : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reduce ? 0 : 0.06 * i }}
                    className="flex items-center gap-3 rounded-lg px-1 py-2"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/[0.08] font-mono text-[10px] text-white/60">{e.bill ?? "·"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{e.label}</span>
                      <span className="block truncate text-xs text-white/45">
                        {e.paidBy} paid · {e.ruleLabel}
                      </span>
                    </span>
                    <span className="tabular text-sm">{m(e.split.total)}</span>
                  </motion.li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                {result.people.map((p) => (
                  <span key={p.name} className="inline-flex items-center gap-2 rounded-pill border border-white/10 bg-white/[0.04] py-1 pl-1 pr-3 text-xs">
                    <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-[10px] font-medium", avatarColor(p.name))}>{p.name[0]}</span>
                    {p.name}
                    <span className={cn("tabular", p.net > 0 ? "text-[#5fd3a8]" : p.net < 0 ? "text-[#ff9d86]" : "text-white/60")}>
                      {p.net > 0 ? "+" : ""}
                      {m(p.net)}
                    </span>
                  </span>
                ))}
              </div>
              <div className="mt-auto rounded-xl border border-white/10 bg-black/40 p-3.5">
                <p className="eyebrow text-[11px] text-white/45">Settle up · {result.transfers.length} payments</p>
                <ul className="mt-2 grid gap-2">
                  {result.transfers.map((t) => (
                    <li key={`${t.fromMemberId}-${t.toMemberId}`} className="flex items-center gap-2 text-sm">
                      <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-[10px] font-medium", avatarColor(t.fromMemberId))}>{t.fromMemberId[0]}</span>
                      <ArrowRight className="size-3.5 text-white/40" />
                      <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-[10px] font-medium", avatarColor(t.toMemberId))}>{t.toMemberId[0]}</span>
                      <span className="flex-1 truncate text-white/75">
                        {t.fromMemberId} pays {t.toMemberId}
                      </span>
                      <span className="tabular font-medium">{m(t.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ) : (
            <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-6 grid gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 px-1 py-2">
                  <span className={cn("size-7 rounded-md bg-white/[0.06]", phase === 2 && "animate-pulse")} />
                  <span className="flex-1 space-y-1.5">
                    <span className={cn("block h-2.5 w-2/5 rounded-full bg-white/[0.08]", phase === 2 && "animate-pulse")} style={{ animationDelay: `${i * 120}ms` }} />
                    <span className={cn("block h-2 w-1/4 rounded-full bg-white/[0.05]", phase === 2 && "animate-pulse")} style={{ animationDelay: `${i * 120}ms` }} />
                  </span>
                  <span className={cn("h-2.5 w-14 rounded-full bg-white/[0.08]", phase === 2 && "animate-pulse")} />
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Typewriter({ text, ms }: { text: string; ms: number }) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const step = Math.max(8, ms / text.length);
    const t = setInterval(() => setN((x) => (x >= text.length ? x : x + 1)), step);
    return () => clearInterval(t);
  }, [text, ms]);
  return (
    <>
      {text.slice(0, n)}
      <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-white align-middle" />
    </>
  );
}
