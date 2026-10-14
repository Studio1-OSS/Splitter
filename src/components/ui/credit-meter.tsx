import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** "18 of 30 AI credits left today". Turns amber when nearly out. */
export function CreditMeter({ left, limit, compact, className }: { left: number; limit: number; compact?: boolean; className?: string }) {
  if (limit <= 0) return null;
  const low = left <= Math.max(2, Math.round(limit * 0.15));
  if (compact) {
    return (
      <span
        title={`${left} of ${limit} AI credits left today. Resets at midnight UTC.`}
        className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs tabular", low ? "border-warning/50 text-warning" : "border-hairline text-muted-foreground", className)}
      >
        <Sparkles className="size-3.5" /> {left}/{limit}
      </span>
    );
  }
  return (
    <div className={cn("grid gap-1.5", className)}>
      <p className={cn("text-sm", low && "text-warning")}>
        {left} of {limit} AI credits left today
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-hairline">
        <div className={cn("h-full rounded-full", low ? "bg-warning" : "bg-foreground")} style={{ width: `${Math.round((left / limit) * 100)}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">Reading a bill or asking a question uses 1, settling a batch uses 3. Resets at midnight UTC.</p>
    </div>
  );
}
