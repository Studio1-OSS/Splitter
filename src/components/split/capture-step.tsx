"use client";

import { ArrowRight, Camera, Files, Hash, ImageUp, Layers, ListPlus, LogIn, Sparkles } from "lucide-react";
import Link from "next/link";
import { site } from "@/config/site";
import * as React from "react";
import { toast } from "sonner";
import { CameraScanner } from "@/components/camera/camera-scanner";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/primitives";
import { compressImage, FOR_STORAGE, FOR_THUMB } from "@/lib/image";
import { isPdf, pdfToImages } from "@/lib/pdf";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ExtractedReceipt, ReceiptIssue } from "@/server/ai/receipt";
import type { ToolCall } from "@/server/ai/tools";
import { applyReceipt, draftTotal, usableItems, withBills, type Draft } from "./draft";
import { mergeReceipts } from "./merge-receipts";

const SCAN_MESSAGES = ["Reading the receipt…", "Finding every line…", "Checking tax and fees…", "Adding it all up…"];

export function CaptureStep({
  draft,
  update,
  scanEnabled,
  lockCurrency,
  imageOnly = false,
  signInRequired = false,
  image,
  setImage,
  batchHref = null,
  storeInGroup = null,
  onItemized,
  onAmount,
  onContinue,
  credits: initialCredits,
}: {
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  scanEnabled: boolean;
  lockCurrency: boolean;
  /** Quick split: only the scanned-receipt path (no single amount, no typing). */
  imageOnly?: boolean;
  /** Signed-out visitors see a sign-in prompt instead of the upload buttons. */
  signInRequired?: boolean;
  image: string[];
  setImage: (urls: string[]) => void;
  /** In a group: where several separate bills should go instead (Settle with AI). */
  batchHref?: string | null;
  /** Group id: keep a members-only copy of the scanned bill with the expense. */
  storeInGroup?: string | null;
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

  /** Photos and PDF pages for one bill, resized in the browser (max 4 pages). */
  async function prepare(files: File[]) {
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
    const pages = sources.slice(0, 4);
    const model = await Promise.all(pages.map((b) => compressImage(b)));
    return { model, pages };
  }

  /** In a group, stores small copies of the bill so members can open it from the expense. Never blocks saving. */
  async function storeCopies(pages: Blob[]): Promise<string[]> {
    if (!storeInGroup || !pages.length) return [];
    try {
      return await Promise.all(
        pages.map(async (page, i) => {
          const [stored, thumb] = await Promise.all([compressImage(page, FOR_STORAGE), compressImage(page, FOR_THUMB)]);
          const form = new FormData();
          form.append("groupId", storeInGroup);
          form.append("page", String(i + 1));
          form.append("image", stored, "bill.jpg");
          form.append("thumb", thumb, "thumb.jpg");
          const res = await fetch("/api/bills", { method: "POST", body: form });
          const body = (await res.json().catch(() => ({}))) as { id?: string };
          if (!res.ok || !body.id) throw new Error("upload failed");
          return body.id;
        }),
      );
    } catch {
      toast.warning("The bill photo couldn't be saved", { description: "The expense will still save, just without the photo." });
      return [];
    }
  }

  type ExtractBody = { receipt?: ExtractedReceipt; issues?: ReceiptIssue[]; checks?: ToolCall[]; error?: string; code?: string; creditsLeft?: number };
  async function read(blobs: Blob[]): Promise<ExtractBody & { ok: boolean; status: number }> {
    const form = new FormData();
    blobs.forEach((b, i) => form.append("image", b, `page-${i + 1}.jpg`));
    const res = await fetch("/api/extract", { method: "POST", body: form, signal: abort.current?.signal });
    const body = (await res.json().catch(() => ({}))) as ExtractBody;
    if (typeof body.creditsLeft === "number") setCredits((c) => (c ? { ...c, left: body.creditsLeft! } : c));
    return { ...body, ok: res.ok, status: res.status };
  }

  async function run(work: () => Promise<void>) {
    setScanning(true);
    setMessage(0);
    abort.current = new AbortController();
    try {
      await work();
    } catch (e) {
      setImage([]);
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error(
        e instanceof Error ? e.message : "Could not read the bill",
        imageOnly ? undefined : { action: { label: "Type it in", onClick: onItemized } },
      );
    } finally {
      setScanning(false);
    }
  }

  /** One bill: a single photo, several photos (pages), or a PDF (first pages rendered in the browser). */
  const scan = (files: File[]) =>
    run(async () => {
      const { model, pages } = await prepare(files);
      setImage(model.map((b) => URL.createObjectURL(b)));
      const [body, imageIds] = await Promise.all([read(model), storeCopies(pages)]);
      if (body.code === "multiple_bills") {
        // The AI saw separate bills: ask whether they belong to the same occasion instead of failing.
        setImage([]);
        setUnrelated(files);
        return;
      }
      if (!body.ok || !body.receipt) throw new Error(body.error ?? `Could not read the bill (error ${body.status})`);
      update((d) => ({ ...applyReceipt(d, body.receipt!, body.issues ?? [], { lockCurrency }), checks: body.checks ?? [], imageIds }));
      toast.success(`Found ${body.receipt.items.length} lines`, { description: "Check them over before splitting." });
      onItemized();
    });

  /** Same occasion, separate bills: read each one, then combine them into one expense. */
  const combine = (files: File[]) =>
    run(async () => {
      const prepared = await Promise.all(files.map((f) => prepare([f])));
      setImage(prepared.flatMap((p) => p.model).map((b) => URL.createObjectURL(b)));
      const [bodies, imageIds] = await Promise.all([
        Promise.all(prepared.map((p) => read(p.model))),
        storeCopies(prepared.flatMap((p) => p.pages).slice(0, 4)),
      ]);
      const failed = bodies.find((b) => !b.ok || !b.receipt);
      if (failed) throw new Error(failed.error ?? "One of the bills couldn't be read");
      const merged = mergeReceipts(bodies.map((b) => ({ receipt: b.receipt!, issues: b.issues ?? [] })));
      if ("error" in merged) throw new Error(merged.error);
      // Each bill keeps its own stored photos (pages are stored in bill order, at most 4 in all).
      let at = 0;
      const billImageIds = prepared.map((p) => {
        const ids = imageIds.slice(at, at + p.pages.length);
        at += p.pages.length;
        return ids;
      });
      update((d) => ({
        ...withBills(
          applyReceipt(d, merged.receipt, merged.issues, { lockCurrency }),
          bodies.map((b) => b.receipt!),
          billImageIds,
        ),
        // Number each bill's arithmetic check by its place in the combined expense.
        checks: bodies.flatMap((b, i) => (b.checks ?? []).map((c) => ({ ...c, args: { bill: i + 1 }, result: { ...(c.result as object), bill: i + 1 } }))),
        imageIds,
      }));
      toast.success(`Combined ${files.length} bills · ${merged.receipt.items.length} lines`, { description: "Each line is labelled with its bill." });
      onItemized();
    });

  // Several files picked at once could be pages of one bill or separate bills: ask instead of guessing.
  const [choice, setChoice] = React.useState<File[] | null>(null);
  const [unrelated, setUnrelated] = React.useState<File[] | null>(null);
  const onFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    if (fileInput.current) fileInput.current.value = "";
    if (list.length > 1) setChoice(list);
    else void scan(list);
  };

  if (unrelated) {
    const n = unrelated.length;
    return (
      <div className="mx-auto grid max-w-md gap-6 py-4">
        <div>
          <h1 className="text-3xl leading-tight sm:text-4xl">These look like {n} different bills</h1>
          <p className="mt-3 text-muted-foreground">
            Are they for the same occasion, like dinner and the taxi home? Splitter can read each one and combine them into one expense, with every line
            labelled by its bill.
          </p>
        </div>
        <div className="grid gap-3">
          <Button
            size="lg"
            onClick={() => {
              setUnrelated(null);
              void combine(unrelated);
            }}
          >
            <Files /> Yes, combine into one expense
          </Button>
          {batchHref && (
            <Button size="lg" variant="outline" asChild>
              <Link href={batchHref}>
                <Layers /> Split them separately with Settle with AI
              </Link>
            </Button>
          )}
          <Button variant="link" onClick={() => setUnrelated(null)}>
            Start over
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">Reading each bill uses 1 AI credit.</p>
      </div>
    );
  }

  if (choice) {
    const n = choice.length;
    return (
      <div className="mx-auto grid max-w-md gap-6 py-4">
        <div>
          <h1 className="text-3xl leading-tight sm:text-4xl">You picked {n} files</h1>
          <p className="mt-3 text-muted-foreground">Are they pages of one long bill, or {n} different bills?</p>
        </div>
        <div className="grid gap-3">
          <Button
            size="lg"
            onClick={() => {
              setChoice(null);
              void scan(choice);
            }}
          >
            <Files /> Pages of one bill
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              setChoice(null);
              void combine(choice);
            }}
          >
            <Layers /> {n} bills, same occasion: combine into one expense
          </Button>
          {batchHref ? (
            <Button size="lg" variant="outline" asChild>
              <Link href={batchHref}>
                {n} bills to split separately: use Settle with AI
              </Link>
            </Button>
          ) : (
            <Button size="lg" variant="outline" onClick={() => setChoice(null)}>
              Separate expenses: pick one bill at a time
            </Button>
          )}
          <Button variant="link" onClick={() => setChoice(null)}>
            Cancel
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {batchHref
            ? "Settle with AI reads many bills at once and works out the whole split."
            : "Quick split handles one bill. For a trip or party with several bills, create a group and use Settle with AI."}
        </p>
      </div>
    );
  }

  if (scanning) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-6 py-4 text-center">
        <div className="relative w-full overflow-hidden rounded-lg bg-stone">
          {image[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image[0]} alt="Your receipt" className="max-h-[55dvh] w-full object-cover object-top opacity-85" />
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
        <p className="mt-4 text-lg text-muted-foreground">
          A dinner bill, a hotel, festival tickets, a taxi, groceries for the party — anything.
        </p>
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

      <div className={cn("grid gap-4", !imageOnly && "md:grid-cols-2")}>
        {/* Receipt */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (scanEnabled && !signInRequired) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (scanEnabled && !signInRequired) onFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col gap-6 rounded-lg border border-glass-border bg-stone/70 p-6 shadow-[inset_0_1px_0_var(--glass-shine),0_24px_60px_-24px_rgb(0_0_0/0.35)] backdrop-blur-2xl transition sm:p-8",
            dragging && "outline-2 outline-dashed outline-offset-[-8px] outline-foreground/40",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="flex size-12 items-center justify-center rounded-full border border-glass-border bg-card/70 shadow-[inset_0_1px_0_var(--glass-shine)] backdrop-blur-md">
              <Camera className="size-5" />
            </span>
            {scanEnabled && (
              <span className="eyebrow rounded-pill border border-glass-border bg-card/50 px-3 py-1.5 text-muted-foreground backdrop-blur-md">
                AI · {site.model}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl">Itemized receipt</h2>
            <p className="mt-2 text-muted-foreground">
              {signInRequired
                ? "Sign in (it's free) and AI reads every line, tax and fee from a photo or PDF, checks the maths, then you tap who had what."
                : scanEnabled
                  ? "Snap it (or pick a PDF, or several photos of a long bill) and AI reads every line, tax and fee. Then tap who had what."
                  : "Type each line, then tap who had what. (Scanning isn't configured on this server.)"}
            </p>
          </div>
          <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center">
            {signInRequired && (
              <>
                <Button size="lg" asChild>
                  <Link href="/sign-in?next=/split">
                    <LogIn /> Sign in to scan
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/sign-up?next=/split">Create a free account</Link>
                </Button>
              </>
            )}
            {scanEnabled && !signInRequired && (
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
            {!imageOnly && (
              <Button
                variant={scanEnabled ? "link" : "default"}
                size={scanEnabled ? "default" : "lg"}
                onClick={onItemized}
                className={cn(scanEnabled && "self-center sm:self-auto")}
              >
                <ListPlus className={cn(scanEnabled && "hidden")} /> Type items instead
              </Button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>

        {/* Single amount */}
        {!imageOnly && (
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
        )}
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
        <p>{storeInGroup ? "A small copy of the bill is kept with the expense, visible only to group members." : "Quick-split photos are read once and never stored."}</p>
        {scanEnabled && !signInRequired && credits && (
          <p className="tabular">
            {credits.left} of {credits.limit} AI scans left today
          </p>
        )}
      </div>
    </div>
  );
}
