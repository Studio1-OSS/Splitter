"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import * as React from "react";
import { formatMoney } from "@/lib/money";
import { avatarColor, cn } from "@/lib/utils";
import { MiniDoc } from "./mini-doc";
import { computeScene, CURRENCY, SCENES } from "./scenes";

const PHASE_MS = [1300, 2200, 1400]; // bills drop → notes type → Qwen reads → result
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" onMouseEnter={() => setPaused(true)}>
      {/* Left: the pile and the note */}
      <div className="flex flex-col gap-4 rounded-lg bg-stone p-5 sm:p-7">
        <div role="tablist" aria-label="Occasion" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
          {SCENES.map((s, i) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={i === index}
              onClick={() => {
                setPaused(true);
                setIndex(i);
              }}
              className={cn(
                "h-10 shrink-0 rounded-sm border px-3.5 text-sm transition",
                i === index ? "border-accent bg-accent text-[#17171c]" : "border-accent/40 text-accent-ink hover:border-accent",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="relative flex min-h-56 flex-wrap content-start items-start justify-center gap-3 py-2 sm:min-h-64">
          <AnimatePresence mode="popLayout">
            {scene.bills.map((b, i) => (
              <motion.div
                key={`${scene.key}-${i}`}
                initial={reduce ? false : { opacity: 0, y: -40, rotate: (i % 2 ? 8 : -8) }}
                animate={{ opacity: 1, y: 0, rotate: (i % 2 ? 2.5 : -2.5) * (phase >= 3 ? 0.4 : 1), scale: phase >= 3 ? 0.92 : 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: reduce ? 0 : i * 0.16, type: "spring", stiffness: 260, damping: 20 }}
              >
                <MiniDoc kind={b.kind} label={b.label} amount={b.amount} lines={b.lines} no={i + 1} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className={cn("rounded-md bg-card p-4 transition-opacity", phase >= 1 ? "opacity-100" : "opacity-40")}>
          <p className="eyebrow text-muted-foreground">Your note</p>
          <p className="mt-1.5 min-h-[3.5rem] text-sm leading-relaxed">
            {phase === 1 && !reduce ? <Typewriter key={scene.key} text={typed} ms={PHASE_MS[1] - 300} /> : typed}
            {phase === 0 && <span className="text-subtle">Who paid what, in your own words…</span>}
          </p>
        </div>
      </div>

      {/* Right: the settlement */}
      <div className="relative min-h-[26rem] overflow-hidden rounded-lg bg-[#17171c] p-5 text-white sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-2xl">{scene.title}</p>
          <span
            className={cn(
              "eyebrow inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition",
              phase === 2 ? "bg-[#ff7759] text-[#17171c]" : phase >= 3 ? "bg-white/10 text-[#5fd3a8]" : "bg-white/5 text-white/40",
            )}
          >
            <Sparkles className={cn("size-3", phase === 2 && "animate-pulse")} />
            {phase < 2 ? "Waiting for bills" : phase === 2 ? `Qwen3.8 reading ${scene.bills.length} bills` : "Settled"}
          </span>
        </div>

        <AnimatePresence mode="wait">
          {phase >= 3 ? (
            <motion.div key={scene.key} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 grid gap-5">
              <ul className="divide-y divide-white/10 border-y border-white/10 text-sm">
                {result.splits.map((e, i) => (
                  <motion.li
                    key={e.label}
                    initial={reduce ? false : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reduce ? 0 : 0.06 * i }}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <span className="eyebrow w-6 text-[10px] text-white/40">{e.bill ? `#${e.bill}` : "note"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{e.label}</span>
                      <span className="eyebrow text-[10px] text-white/45">
                        {e.paidBy} paid · {e.ruleLabel}
                      </span>
                    </span>
                    <span className="tabular">{m(e.split.total)}</span>
                  </motion.li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {result.people.map((p) => (
                  <div key={p.name} className="rounded-sm bg-white/5 p-3">
                    <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-[10px] font-medium", avatarColor(p.name))}>{p.name[0]}</span>
                    <p className="mt-1.5 text-xs text-white/60">{p.name}</p>
                    <p className={cn("tabular text-sm", p.net > 0 ? "text-[#5fd3a8]" : p.net < 0 ? "text-[#ff9d86]" : "text-white/70")}>
                      {p.net > 0 ? "+" : ""}
                      {m(p.net)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid gap-1.5 text-sm">
                {result.transfers.map((t) => (
                  <p key={`${t.fromMemberId}-${t.toMemberId}`} className="flex items-center gap-2 text-white/80">
                    <span className="flex-1">
                      {t.fromMemberId} <ArrowRight className="inline size-3.5" /> {t.toMemberId}
                    </span>
                    <span className="tabular text-white">{m(t.amount)}</span>
                  </p>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-6 grid gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={cn("h-10 rounded-sm bg-white/5", phase === 2 && "animate-pulse")} style={{ animationDelay: `${i * 120}ms` }} />
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
      <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-foreground align-middle" />
    </>
  );
}
