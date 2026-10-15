"use client";

import { ArrowLeft, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import type { CategoryKey } from "@/config/categories";
import { cn } from "@/lib/utils";
import { AmountStep } from "./amount-step";
import { AssignStep } from "./assign-step";
import { CaptureStep } from "./capture-step";
import { emptyDraft, upgradeDraft, type Draft, type Person } from "./draft";
import { ReviewStep } from "./review-step";
import { SummaryStep } from "./summary-step";

export type WizardMode =
  | { kind: "guest"; defaultCurrency: string }
  | {
      kind: "group";
      groupId: string;
      groupName: string;
      currency: string;
      members: Person[];
      meId: string;
      defaultCategory: CategoryKey;
    };

export type StepId = "start" | "review" | "assign" | "amount" | "summary";

const FLOWS: Record<Draft["kind"], { id: StepId; label: string }[]> = {
  itemized: [
    { id: "start", label: "Start" },
    { id: "review", label: "Items" },
    { id: "assign", label: "Who paid & shares" },
    { id: "summary", label: "Split" },
  ],
  amount: [
    { id: "start", label: "Start" },
    { id: "amount", label: "Details" },
    { id: "summary", label: "Split" },
  ],
};

const GUEST_KEY = "splitter:guest-split";

export function SplitWizard({
  mode,
  scanEnabled,
  signedIn = true,
  credits,
}: {
  mode: WizardMode;
  scanEnabled: boolean;
  /** Quick split needs an account: signed-out visitors are asked to sign in before scanning. */
  signedIn?: boolean;
  credits?: { left: number; limit: number } | null;
}) {
  const initial = React.useCallback(
    () =>
      mode.kind === "group"
        ? emptyDraft(mode.currency, { people: mode.members, paidBy: mode.meId, category: mode.defaultCategory })
        : emptyDraft(mode.defaultCurrency),
    [mode],
  );
  const [draft, setDraft] = React.useState<Draft>(initial);
  const [step, setStep] = React.useState<StepId>("start");
  const [image, setImage] = React.useState<string[]>([]);
  const [restored, setRestored] = React.useState(false);

  // Guest drafts survive a refresh; group drafts start fresh.
  React.useEffect(() => {
    if (mode.kind === "guest") {
      try {
        const saved = JSON.parse(localStorage.getItem(GUEST_KEY) ?? "null");
        if (saved?.draft) {
          setDraft(upgradeDraft(saved.draft, initial()));
          setStep(saved.step ?? "start");
        }
      } catch {
        // ignore unreadable drafts
      }
    }
    setRestored(true);
  }, [mode.kind, initial]);

  React.useEffect(() => {
    if (mode.kind !== "guest" || !restored) return;
    try {
      localStorage.setItem(GUEST_KEY, JSON.stringify({ draft, step }));
    } catch {
      // Storage unavailable (private mode): the flow still works, it just won't survive a refresh.
    }
  }, [draft, step, mode.kind, restored]);

  const update = React.useCallback((patch: Partial<Draft> | ((d: Draft) => Draft)) => {
    setDraft((d) => (typeof patch === "function" ? patch(d) : { ...d, ...patch }));
  }, []);

  const reset = () => {
    setDraft(initial());
    setImage([]);
    setStep("start");
  };

  const flow = FLOWS[draft.kind];
  const index = Math.max(
    0,
    flow.findIndex((s) => s.id === step),
  );
  const meId = mode.kind === "group" ? mode.meId : undefined;
  const go = (id: StepId) => {
    // Lines start shared by everyone, so people only tap the exceptions.
    if (id === "assign")
      update((d) =>
        d.people.length
          ? { ...d, assignments: Object.fromEntries(d.items.map((i) => [i.id, d.assignments[i.id]?.length ? d.assignments[i.id] : d.people.map((p) => p.id)])) }
          : d,
      );
    setStep(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => (index === 0 ? undefined : go(flow[index - 1].id));
  const backHref = mode.kind === "group" ? `/groups/${mode.groupId}` : "/";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-2 sm:px-6 sm:pt-4">
      <div className="mb-8 flex items-center gap-3">
        {index === 0 ? (
          <Link href={backHref} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-glass-border bg-glass-fill shadow-[inset_0_1px_0_var(--glass-shine)] backdrop-blur-md transition-colors hover:bg-muted" aria-label="Back">
            <ArrowLeft className="size-5" />
          </Link>
        ) : (
          <button onClick={back} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-glass-border bg-glass-fill shadow-[inset_0_1px_0_var(--glass-shine)] backdrop-blur-md transition-colors hover:bg-muted" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="eyebrow truncate text-muted-foreground">
            {mode.kind === "group" ? `New expense · ${mode.groupName}` : "Quick split"}
          </p>
          <ol className="mt-2 flex items-center gap-1 rounded-pill border border-glass-border bg-glass-fill p-1 shadow-[inset_0_1px_0_var(--glass-shine),0_10px_30px_-14px_rgb(0_0_0/0.6)] backdrop-blur-xl" aria-label="Progress">
            {flow.map((s, i) => {
              const done = i < index;
              const current = i === index;
              return (
                <li
                  key={s.id}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex h-9 min-w-0 items-center justify-center gap-2 rounded-pill px-2.5 text-sm transition-all duration-300",
                    current
                      ? "flex-[2] border border-white/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_97%,white),color-mix(in_srgb,var(--foreground)_80%,transparent))] font-medium text-background shadow-[inset_0_1px_0_rgb(255_255_255/0.8),0_6px_20px_-6px_color-mix(in_srgb,var(--foreground)_35%,transparent)] sm:flex-1"
                      : "flex-1",
                    done && "text-foreground",
                    !done && !current && "text-subtle",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular",
                      current ? "bg-background text-foreground" : done ? "bg-foreground text-background" : "border border-hairline",
                    )}
                  >
                    {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={cn("truncate", !current && "max-sm:hidden")}>{s.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
        >
          {step === "start" && (
            <CaptureStep
              draft={draft}
              update={update}
              scanEnabled={scanEnabled}
              lockCurrency={mode.kind === "group"}
              imageOnly={mode.kind === "guest"}
              signInRequired={!signedIn}
              image={image}
              setImage={setImage}
              batchHref={mode.kind === "group" ? `/groups/${mode.groupId}/batch` : null}
              storeInGroup={mode.kind === "group" ? mode.groupId : null}
              onItemized={() => {
                update({ kind: "itemized" });
                go("review");
              }}
              onAmount={() => {
                update({ kind: "amount" });
                go("amount");
              }}
              onContinue={() => go(draft.kind === "amount" ? "amount" : "review")}
              credits={credits}
            />
          )}
          {step === "review" && (
            <ReviewStep
              draft={draft}
              update={update}
              image={image}
              lockCurrency={mode.kind === "group"}
              onNext={() => go("assign")}
              scanEnabled={scanEnabled}
              onRemoveImage={() => {
                setImage([]);
                update({ imageIds: [] });
              }}
              onReplace={() => {
                // Wrong bill: start over with a new one, keeping who's splitting and the currency.
                setImage([]);
                update((d) => ({ ...emptyDraft(d.currency, { people: d.people, paidBy: d.paidBy, category: d.category }) }));
                go("start");
              }}
            />
          )}
          {step === "assign" && (
            <AssignStep draft={draft} update={update} editablePeople={mode.kind === "guest"} meId={meId} onNext={() => go("summary")} />
          )}
          {step === "amount" && (
            <AmountStep
              draft={draft}
              update={update}
              editablePeople={mode.kind === "guest"}
              meId={meId}
              lockCurrency={mode.kind === "group"}
              onNext={() => go("summary")}
            />
          )}
          {step === "summary" && (
            <SummaryStep draft={draft} mode={mode} onEdit={() => go(draft.kind === "amount" ? "amount" : "assign")} onReset={reset} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
