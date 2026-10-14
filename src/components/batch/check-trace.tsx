"use client";

import { CheckCircle2, ChevronDown, Wrench, XCircle } from "lucide-react";
import type { ToolCall } from "@/server/ai/tools";

const LABEL: Record<string, string> = {
  check_receipt: "Checked a bill's arithmetic",
  allocate_tax_tip: "Split a bill by line, with tax and tip",
  calculate_split: "Calculated a split",
  validate_total: "Checked shares add up to the total",
};

function summary(c: ToolCall): string {
  const r = c.result as Record<string, unknown>;
  if (typeof r?.error === "string") return r.error;
  if (c.tool === "check_receipt") {
    const issues = (r.issues as string[] | undefined) ?? [];
    return `Bill #${r.bill}: ${issues.length ? issues.join(" ") : `adds up (${r.printedTotal ?? r.linesTotal})`}`;
  }
  if (c.tool === "validate_total")
    return r.ok ? `${r.sharesSum} = ${r.total}` : `Off by ${r.diff} (shares ${r.sharesSum}, total ${r.total})`;
  const shares = r.shares as Record<string, number> | undefined;
  const who = shares
    ? Object.entries(shares)
        .map(([n, v]) => `${n} ${v}`)
        .join(" · ")
    : "";
  return `${c.tool === "allocate_tax_tip" ? `Bill #${r.bill}` : String(r.amount ?? "")}: ${who}${r.unassigned ? ` (unassigned ${r.unassigned})` : ""}`;
}

/** "How this was checked": every calculator tool call behind the plan, in order. */
export function CheckTrace({ trace, toolMode, note }: { trace: ToolCall[]; toolMode: "native" | "app"; note?: string }) {
  if (!trace.length) return null;
  const failed = trace.filter((c) => !c.ok).length;
  return (
    <details className="group rounded-md border border-border">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 text-sm">
        <Wrench className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="font-medium">How this was checked</span>
          <span className="text-muted-foreground">
            {" "}
            · {trace.length} calculator {trace.length === 1 ? "call" : "calls"}
            {failed ? ` · ${failed} flagged` : " · all passed"}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-3 border-t border-border p-4">
        <p className="text-xs text-muted-foreground">
          {note ??
            (toolMode === "native"
              ? "The AI decided who shares what and called these tools to do the maths. Calls marked “app” are extra checks the app ran on the final plan."
              : "This model route doesn't support tool calls, so the app ran these checks itself and gave the results to the AI.")}
        </p>
        <ol className="grid gap-2">
          {trace.map((c, i) => (
            <li key={i} className="flex gap-2.5 text-sm">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />
              )}
              <div className="min-w-0">
                <p>
                  {LABEL[c.tool] ?? c.tool}{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {c.tool} · {c.by} · {c.ms}ms
                  </span>
                </p>
                <p className="break-words text-muted-foreground">{summary(c)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
