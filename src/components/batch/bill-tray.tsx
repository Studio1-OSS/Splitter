"use client";

import { AlertTriangle, Camera, Check, Copy, FileUp, Layers, Loader2, RotateCcw, X } from "lucide-react";
import * as React from "react";
import { CameraScanner } from "@/components/camera/camera-scanner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { formatMoney, isValidCurrency, toMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { MAX_BILLS, type Bill } from "./use-bills";

export function BillTray({
  bills,
  onFiles,
  onRemove,
  onRetry,
  onMerge,
  disabled,
}: {
  bills: Bill[];
  onFiles: (files: FileList | File[]) => void;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
  onMerge: (key: string) => void;
  disabled?: boolean;
}) {
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [scanner, setScanner] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const full = bills.length >= MAX_BILLS;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      className={cn("rounded-lg bg-stone p-4 transition sm:p-6", dragging && "outline-2 outline-dashed outline-offset-[-8px] outline-foreground/40")}
    >
      {bills.length > 0 && (
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {bills.map((b, i) => (
            <li key={b.key} className="relative flex flex-col overflow-hidden rounded-sm bg-card">
              <div className="relative aspect-[4/3] bg-muted">
                {b.pages[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.pages[0].previewUrl} alt={`Bill ${b.no}`} className="size-full object-cover object-top" />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                <span className="eyebrow absolute left-2 top-2 rounded-xs bg-[#17171c] px-1.5 py-0.5 text-[11px] text-white">#{b.no}</span>
                {b.pages.length > 1 && (
                  <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-xs bg-card/90 px-1.5 py-0.5 text-[11px]">
                    <Layers className="size-3" /> {b.pages.length} pages
                  </span>
                )}
                <button
                  onClick={() => onRemove(b.key)}
                  aria-label={`Remove bill ${b.no}`}
                  className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-full bg-card/90 hover:bg-card"
                >
                  <X className="size-4" />
                </button>
                {b.status === "reading" && <div className="animate-scan-line absolute inset-x-0 h-[3px] bg-accent" />}
              </div>
              <div className="grid min-h-16 content-start gap-1 p-2.5 text-sm">
                <BillStatus bill={b} />
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {(b.status === "error" || b.status === "duplicate") && (
                    <button onClick={() => onRetry(b.key)} className="inline-flex items-center gap-1 text-xs underline underline-offset-2">
                      <RotateCcw className="size-3" /> {b.status === "duplicate" ? "Read anyway" : "Retry"}
                    </button>
                  )}
                  {i > 0 && b.pages.length > 0 && b.status !== "reading" && (
                    <button onClick={() => onMerge(b.key)} className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2">
                      <Layers className="size-3" /> Page of #{bills[i - 1].no}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={cn("flex flex-col items-center gap-4 text-center", bills.length === 0 ? "py-8" : "py-2")}>
        {bills.length === 0 && (
          <div>
            <p className="font-display text-2xl">Drop every bill here</p>
            <p className="mt-1 text-sm text-muted-foreground">Receipts, hotel invoices (PDF), ride or payment screenshots, even a handwritten note.</p>
          </div>
        )}
        <div className="flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row">
          <Button size="lg" onClick={() => setScanner(true)} disabled={disabled || full} className="sm:hidden">
            <Camera /> {bills.length ? "Scan more bills" : "Scan bills with camera"}
          </Button>
          <Button size="lg" variant={bills.length ? "outline" : "default"} onClick={() => fileInput.current?.click()} disabled={disabled || full} className="bg-card max-sm:bg-transparent">
            <FileUp /> {bills.length ? "Add more" : "Choose files"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {bills.length}/{MAX_BILLS} bills · JPEG, PNG, WebP or PDF
        </p>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <CameraScanner
        open={scanner}
        mode="bills"
        max={MAX_BILLS - bills.length}
        onClose={() => setScanner(false)}
        onDone={(files) => {
          setScanner(false);
          onFiles(files);
        }}
      />
    </div>
  );
}

function BillStatus({ bill: b }: { bill: Bill }) {
  if (b.status === "preparing") return <span className="text-muted-foreground">Preparing…</span>;
  if (b.status === "queued" || b.status === "reading")
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Reading…
      </span>
    );
  if (b.status === "duplicate")
    return (
      <span className="inline-flex items-center gap-1.5 text-warning">
        <Copy className="size-3.5" /> Same file as #{b.duplicateOf}
      </span>
    );
  if (b.status === "error")
    return (
      <span className="inline-flex items-start gap-1.5 text-negative">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> <span className="line-clamp-2">{b.error}</span>
      </span>
    );
  const r = b.receipt!;
  const currency = r.currency && isValidCurrency(r.currency.toUpperCase()) ? r.currency.toUpperCase() : null;
  const total = r.total ?? r.items.reduce((a, i) => a + i.totalPrice, 0);
  return (
    <>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Check className="size-3.5 shrink-0 text-positive" />
        <span className="truncate">{r.merchant ?? "Bill"}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="tabular">{currency ? formatMoney(toMinor(total, currency), currency) : total.toFixed(2)}</span>
        {r.kind !== "receipt" && <Badge>{r.kind.replace("_", " ")}</Badge>}
        {b.issues && b.issues.length > 0 && <Badge tone="warning">check</Badge>}
      </span>
    </>
  );
}
