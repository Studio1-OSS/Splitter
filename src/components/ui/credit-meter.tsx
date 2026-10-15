import { RingGauge } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/** "18 of 30 AI credits left today". Turns amber when nearly out. */
export function CreditMeter({ left, limit, compact, className }: { left: number; limit: number; compact?: boolean; className?: string }) {
  if (limit <= 0) return null;
  const low = left <= Math.max(2, Math.round(limit * 0.15));
  if (compact) {
    return (
      <span
        title={`${left} of ${limit} AI credits left today. Resets at midnight UTC.`}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-pill border pl-2 pr-3 text-xs tabular",
          low ? "border-warning/40 bg-warning-soft text-warning" : "border-hairline text-foreground",
          className,
        )}
      >
        <RingGauge value={left / limit} className={cn("size-[18px]", !low && "text-accent")} />
        <span aria-hidden="true">
          <span>{left}</span>
          <span className={low ? "opacity-70" : "text-muted-foreground"}>/{limit}</span>
        </span>
        <span className="sr-only">
          {left} of {limit} AI credits left today
        </span>
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
