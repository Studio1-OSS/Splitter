"use client";

import { Plus, X } from "lucide-react";
import { nanoid } from "nanoid";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Avatar, Field, Input, Select } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import type { Draft } from "./draft";

/** People list with optional add/remove (guest) and the "who paid" picker. */
export function PeopleEditor({
  draft,
  update,
  editable,
  totals,
}: {
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  editable: boolean;
  totals?: Map<string, number>;
}) {
  const [name, setName] = React.useState("");
  const people = draft.people;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = nanoid(8);
    update((d) => ({
      ...d,
      people: [...d.people, { id, name: trimmed }],
      shares: { ...d.shares, [id]: 1 },
      paidBy: d.paidBy ?? id,
    }));
    setName("");
  };

  const remove = (id: string) =>
    update((d) => {
      const { [id]: _s, ...shares } = d.shares;
      const { [id]: _e, ...exact } = d.exact;
      return {
        ...d,
        people: d.people.filter((p) => p.id !== id),
        shares,
        exact,
        paidBy: d.paidBy === id ? (d.people.find((p) => p.id !== id)?.id ?? null) : d.paidBy,
        assignments: Object.fromEntries(Object.entries(d.assignments).map(([k, v]) => [k, v.filter((x) => x !== id)])),
      };
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {people.map((p) => (
          <span key={p.id} className="inline-flex h-11 items-center gap-2 rounded-full border border-hairline bg-card pl-1.5 pr-2 text-sm">
            <Avatar name={p.name} size="sm" />
            {p.name}
            {totals && <span className="tabular text-muted-foreground">{formatMoney(totals.get(p.id) ?? 0, draft.currency)}</span>}
            {editable && (
              <button onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`} className="-mr-1 flex size-8 items-center max-md:size-11 justify-center rounded-full hover:bg-muted">
                <X className="size-3.5" />
              </button>
            )}
          </span>
        ))}
        {people.length === 0 && <p className="text-sm text-muted-foreground">Add everyone who&apos;s sharing this cost.</p>}
      </div>
      {editable && (
        <form onSubmit={add} className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a name, e.g. Sam" maxLength={60} aria-label="Person's name" />
          <Button type="submit" variant="outline" disabled={!name.trim()} className="h-12 md:h-11">
            <Plus /> Add
          </Button>
        </form>
      )}
      {people.length > 0 && (
        <Field label="Who paid?" className="sm:max-w-xs">
          <Select value={draft.paidBy ?? ""} onChange={(e) => update((d) => ({ ...d, paidBy: e.target.value }))}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </div>
  );
}

/** Sticky footer for each step. Sits above the iPhone home indicator. */
export function StepBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-10 mt-2 flex items-center gap-4 rounded-md border border-hairline bg-card/95 p-3 pl-4 backdrop-blur sm:p-4 sm:pl-5">
      {children}
    </div>
  );
}
