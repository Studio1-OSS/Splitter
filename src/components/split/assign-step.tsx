"use client";

import { Check, Users } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/primitives";
import { computeSplit, formatMoney, SplitError } from "@/lib/money";
import { cn } from "@/lib/utils";
import { toSplitInput, usableItems, type Draft } from "./draft";
import { PayerPicker, PeopleEditor, StepBar } from "./people";

export function AssignStep({
  draft,
  update,
  editablePeople,
  meId,
  onNext,
}: {
  draft: Draft;
  update: (patch: Partial<Draft> | ((d: Draft) => Draft)) => void;
  editablePeople: boolean;
  /** The signed-in member (group mode), shown as "You". */
  meId?: string;
  onNext: () => void;
}) {
  const c = draft.currency;
  const items = usableItems(draft);
  const people = draft.people;
  const unassigned = items.filter((i) => !draft.assignments[i.id]?.length);

  // Live totals while tapping; unassigned items are left out of the preview.
  const totals = React.useMemo(() => {
    if (people.length === 0) return undefined;
    try {
      const input = toSplitInput(draft);
      const split = computeSplit({ ...input, items: input.items.filter((i) => i.assignees.length > 0) });
      return new Map(split.shares.map((s) => [s.memberId, s.total]));
    } catch (e) {
      if (e instanceof SplitError) return undefined;
      throw e;
    }
  }, [draft, people.length]);

  const splitAllEqually = () =>
    update((d) => ({ ...d, assignments: Object.fromEntries(usableItems(d).map((i) => [i.id, d.people.map((p) => p.id)])) }));

  return (
    <div className="mx-auto grid max-w-3xl gap-8">
      <div>
        <h1 className="text-4xl leading-none sm:text-5xl">Who paid, who had what</h1>
        <p className="mt-3 text-muted-foreground">
          Every line starts shared by everyone. Only change the exceptions: tap a name to take them off a line.
        </p>
      </div>

      <PayerPicker draft={draft} update={update} meId={meId} />

      <section className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>{editablePeople ? "Who's sharing" : "Sharing · running totals"}</Eyebrow>
          {people.length > 1 && items.length > 0 && unassigned.length > 0 && (
            <Button variant="link" size="sm" onClick={splitAllEqually}>
              <Users /> Share the rest with everyone
            </Button>
          )}
        </div>
        <PeopleEditor draft={draft} update={update} editable={editablePeople} totals={totals} />
      </section>

      <ItemAssigner draft={draft} update={update} />

      <StepBar>
        <div className="min-w-0 flex-1 text-sm">
          {people.length === 0 ? (
            <span className="text-muted-foreground">Add at least one person</span>
          ) : unassigned.length > 0 ? (
            <span className="text-warning">
              {unassigned.length} line{unassigned.length === 1 ? "" : "s"} left to assign
            </span>
          ) : (
            <span className="text-positive">Everything is assigned</span>
          )}
        </div>
        <Button size="lg" disabled={people.length === 0 || unassigned.length > 0 || !draft.paidBy} onClick={onNext}>
          See the split
        </Button>
      </StepBar>
    </div>
  );
}

/** Per-line "who had this" chips for an itemized expense. */
export function ItemAssigner({
  draft,
  update,
}: {
  draft: Draft;
  update: (patch: Partial<Draft> | ((d: Draft) => Draft)) => void;
}) {
  const c = draft.currency;
  const items = usableItems(draft);
  const people = draft.people;
  const toggle = (itemId: string, personId: string) =>
    update((d) => {
      const current = d.assignments[itemId] ?? [];
      const next = current.includes(personId) ? current.filter((x) => x !== personId) : [...current, personId];
      return { ...d, assignments: { ...d.assignments, [itemId]: next } };
    });
  const everyone = (itemId: string) =>
    update((d) => ({
      ...d,
      assignments: {
        ...d.assignments,
        [itemId]: (d.assignments[itemId]?.length ?? 0) === d.people.length ? [] : d.people.map((p) => p.id),
      },
    }));

  return (
    <>
    {people.length > 0 && (
      <ul className="grid gap-3">
        {items.map((item) => {
          const assigned = draft.assignments[item.id] ?? [];
          const all = assigned.length === people.length;
          return (
            <li key={item.id} className={cn("rounded-md border p-4", assigned.length === 0 ? "border-warning/50" : "border-border")}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate">
                    {item.quantity > 1 && <span className="text-muted-foreground">{item.quantity}× </span>}
                    {item.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {assigned.length === 0
                      ? "Not assigned yet"
                      : assigned.length === 1
                        ? "1 person"
                        : `${assigned.length} people · ${formatMoney(Math.round(item.amount / assigned.length), c)} each`}
                  </p>
                </div>
                <span className="tabular">{formatMoney(item.amount, c)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {people.map((p) => {
                  const on = assigned.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggle(item.id, p.id)}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition active:scale-95",
                        on ? "border-foreground bg-foreground text-background" : "border-hairline text-muted-foreground hover:border-foreground/40",
                      )}
                    >
                      {on && <Check className="size-3.5" />}
                      {p.name}
                    </button>
                  );
                })}
                {people.length > 1 && (
                  <button
                    onClick={() => everyone(item.id)}
                    className={cn(
                      "h-11 rounded-full border border-dashed px-4 text-sm transition",
                      all ? "border-foreground text-foreground" : "border-hairline text-muted-foreground hover:border-foreground/40",
                    )}
                  >
                    Everyone
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    )}
    </>
  );
}
