"use client";

import { ArrowRight, Camera, Hash, ImageUp, ListPlus, Sparkles } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { CameraScanner } from "@/components/camera/camera-scanner";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/primitives";
import { compressImage } from "@/lib/image";
import { isPdf, pdfToImages } from "@/lib/pdf";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ExtractedReceipt, ReceiptIssue } from "@/server/ai/receipt";
import { applyReceipt, draftTotal, usableItems, type Draft } from "./draft";

const SCAN_MESSAGES = ["Reading the receipt…", "Finding every line…", "Checking tax and fees…", "Adding it all up…"];

export function CaptureStep({
  draft,
  update,
  scanEnabled,
  lockCurrency,
  image,
  setImage,
  onItemized,
  onAmount,
  onContinue,
  credits: initialCredits,
}: {
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  scanEnabled: boolean;
  lockCurrency: boolean;
  image: string | null;
  setImage: (url: string | null) => void;
  onItemized: () => void;
  onAmount: () => void;
  onContinue: () => void;
  credits?: { left: number; limit: number } | null;
}) {
  const [scanning, setScanning] = React.useState(false);
  const [credits, setCredits] = React.useState(initialCredits ?? null);
  const abort = React.useRef<AbortController | null>(null);
  const [message, setMessage] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [scanner, setScanner] = React.useState(false);
  const hasDraft = draft.kind === "amount" ? draft.amount > 0 || draft.merchant !== "" : usableItems(draft).length > 0;

  React.useEffect(() => {
    if (!scanning) return;
    const t = setInterval(() => setMessage((m) => (m + 1) % SCAN_MESSAGES.length), 2200);
    return () => clearInterval(t);
  }, [scanning]);

  /** One bill: a single photo, several photos (pages), or a PDF (first pages rendered in the browser). */
  async function scan(files: File[]) {
    setScanning(true);
    setMessage(0);
    abort.current = new AbortController();
    try {
      const sources: Blob[] = [];
      let total = 0;
      for (const f of files.slice(0, 4)) {
        if (isPdf(f)) {
          const pdf = await pdfToImages(f);
          sources.push(...pdf.pages);
          total += pdf.totalPages;
        } else {
          sources.push(f);
          total += 1;
        }
      }
      if (files.length > 4 || total > 4) toast.info("Only the first 4 pages are read.");
      const blobs = await Promise.all(sources.slice(0, 4).map((b) => compressImage(b)));
      setImage(URL.createObjectURL(blobs[0]));
      const form = new FormData();
      blobs.forEach((b, i) => form.append("image", b, `page-${i + 1}.jpg`));
      const res = await fetch("/api/extract", { method: "POST", body: form, signal: abort.current.signal });
      const body = (await res.json().catch(() => ({}))) as { receipt?: ExtractedReceipt; issues?: ReceiptIssue[]; error?: string; creditsLeft?: number };
      if (typeof body.creditsLeft === "number") setCredits((c) => (c ? { ...c, left: body.creditsLeft! } : c));
      if (!res.ok || !body.receipt) throw new Error(body.error ?? `Could not read the bill (error ${res.status})`);
      update((d) => applyReceipt(d, body.receipt!, body.issues ?? [], { lockCurrency }));
      toast.success(`Found ${body.receipt.items.length} lines`, { description: "Check them over before splitting." });
      onItemized();
    } catch (e) {
      setImage(null);
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error(e instanceof Error ? e.message : "Could not read the bill", {
        action: { label: "Type it in", onClick: onItemized },
      });
    } finally {
      setScanning(false);
    }
  }

  const onFiles = (files: FileList | null) => {
    if (files?.length) void scan([...files]);
  };

  if (scanning) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-6 py-4 text-center">
        <div className="relative w-full overflow-hidden rounded-lg bg-stone">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="Your receipt" className="max-h-[55dvh] w-full object-cover object-top opacity-85" />
          ) : (
            <div className="h-80" />
          )}
          <div className="animate-scan-line absolute inset-x-0 h-[3px] bg-accent" />
        </div>
        <div>
          <p className="flex items-center justify-center gap-2 font-display text-2xl">
            <Sparkles className="size-5 text-accent-ink" /> {SCAN_MESSAGES[message]}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Usually 5–15 seconds.</p>
        </div>
        <Button variant="outline" onClick={() => abort.current?.abort()}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <div className="max-w-2xl">
        <h1 className="text-4xl leading-none sm:text-6xl">What are we splitting?</h1>
        <p className="mt-4 text-lg text-muted-foreground">A dinner bill, a hotel, festival tickets, a taxi, groceries for the party — anything.</p>
      </div>

      {hasDraft && (
        <button
          onClick={onContinue}
          className="flex items-center gap-4 rounded-md border border-hairline p-4 text-left transition hover:border-foreground/40"
        >
          <div className="min-w-0 flex-1">
            <Eyebrow>Draft</Eyebrow>
            <p className="mt-1 truncate">
              {draft.merchant || "Untitled"} · {formatMoney(draftTotal(draft), draft.currency)}
            </p>
          </div>
          <span className="flex items-center gap-1 text-sm underline underline-offset-4">
            Continue <ArrowRight className="size-4" />
          </span>
        </button>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Receipt */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (scanEnabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (scanEnabled) onFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col gap-6 rounded-lg bg-stone p-6 transition sm:p-8",
            dragging && "outline-2 outline-dashed outline-offset-[-8px] outline-foreground/40",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="flex size-12 items-center justify-center rounded-full bg-card">
              <Camera className="size-5" />
            </span>
            {scanEnabled && <span className="eyebrow text-muted-foreground">AI · Qwen3.8</span>}
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl">Itemized receipt</h2>
            <p className="mt-2 text-muted-foreground">
              {scanEnabled
                ? "Snap it (or pick a PDF, or several photos of a long bill) and AI reads every line, tax and fee. Then tap who had what."
                : "Type each line, then tap who had what. (Scanning isn't configured on this server.)"}
            </p>
          </div>
          <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center">
            {scanEnabled && (
              <>
                <Button size="lg" onClick={() => setScanner(true)} className="sm:hidden">
                  <Camera /> Scan with camera
                </Button>
                <Button size="lg" variant="outline" onClick={() => fileInput.current?.click()} className="sm:hidden">
                  <ImageUp /> From library
                </Button>
                <Button size="lg" onClick={() => fileInput.current?.click()} className="max-sm:hidden">
                  <ImageUp /> Upload receipt
                </Button>
              </>
            )}
            <Button variant={scanEnabled ? "link" : "default"} size={scanEnabled ? "default" : "lg"} onClick={onItemized} className={cn(scanEnabled && "self-center sm:self-auto")}>
              <ListPlus className={cn(scanEnabled && "hidden")} /> Type items instead
            </Button>
          </div>
          <input ref={fileInput} type="file" accept="image/*,application/pdf,.pdf" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        </div>

        {/* Single amount */}
        <div className="flex flex-col gap-6 rounded-lg bg-band p-6 text-band-foreground sm:p-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-white/10">
            <Hash className="size-5" />
          </span>
          <div>
            <h2 className="text-2xl sm:text-3xl">Just an amount</h2>
            <p className="mt-2 opacity-75">
              Hotel, Airbnb, fuel, tickets, a gift. Enter the total and split it equally, by shares, or exact amounts.
            </p>
          </div>
          <Button size="lg" variant="inverse" onClick={onAmount} className="mt-auto self-start max-sm:w-full">
            Enter an amount <ArrowRight />
          </Button>
        </div>
      </div>
      <CameraScanner
        open={scanner}
        mode="pages"
        onClose={() => setScanner(false)}
        onDone={(files) => {
          setScanner(false);
          void scan(files);
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>Quick-split photos are read once and never stored.</p>
        {scanEnabled && credits && <p className="tabular">{credits.left} of {credits.limit} AI scans left today</p>}
      </div>
    </div>
  );
}
