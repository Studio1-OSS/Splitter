"use client";

import { ArrowLeft } from "lucide-react";
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
    { id: "assign", label: "Who had what" },
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
  credits,
}: {
  mode: WizardMode;
  scanEnabled: boolean;
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
  const [image, setImage] = React.useState<string | null>(null);
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
    setImage(null);
    setStep("start");
  };

  const flow = FLOWS[draft.kind];
  const index = Math.max(0, flow.findIndex((s) => s.id === step));
  const go = (id: StepId) => {
    setStep(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => (index === 0 ? undefined : go(flow[index - 1].id));
  const backHref = mode.kind === "group" ? `/groups/${mode.groupId}` : "/";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-2 sm:px-6 sm:pt-4">
      <div className="mb-8 flex items-center gap-3">
        {index === 0 ? (
          <Link href={backHref} className="flex size-11 items-center justify-center rounded-full hover:bg-muted" aria-label="Back">
            <ArrowLeft className="size-5" />
          </Link>
        ) : (
          <button onClick={back} className="flex size-11 items-center justify-center rounded-full hover:bg-muted" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="eyebrow truncate text-muted-foreground">
            {mode.kind === "group" ? `New expense · ${mode.groupName}` : "Quick split"}
          </p>
          <ol className="mt-2 flex gap-1.5" aria-label="Progress">
            {flow.map((s, i) => (
              <li key={s.id} className="flex-1" aria-current={i === index ? "step" : undefined}>
                <div className={cn("h-1 rounded-full transition-colors", i <= index ? "bg-foreground" : "bg-hairline")} />
                <span className={cn("mt-1.5 hidden text-xs sm:block", i === index ? "text-foreground" : "text-subtle")}>{s.label}</span>
              </li>
            ))}
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
              image={image}
              setImage={setImage}
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
              onRemoveImage={() => setImage(null)}
              onReplace={() => {
                // Wrong bill: start over with a new one, keeping who's splitting and the currency.
                setImage(null);
                update((d) => ({ ...emptyDraft(d.currency, { people: d.people, paidBy: d.paidBy, category: d.category }) }));
                go("start");
              }}
            />
          )}
          {step === "assign" && (
            <AssignStep draft={draft} update={update} editablePeople={mode.kind === "guest"} onNext={() => go("summary")} />
          )}
          {step === "amount" && (
            <AmountStep
              draft={draft}
              update={update}
              editablePeople={mode.kind === "guest"}
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
