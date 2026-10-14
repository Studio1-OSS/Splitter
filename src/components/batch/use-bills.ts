"use client";

import * as React from "react";
import { toast } from "sonner";
import { fileHash, prepareBillImage } from "@/lib/image";
import { isPdf, MAX_PDF_PAGES, pdfToImages } from "@/lib/pdf";
import type { ExtractedReceipt, ReceiptIssue } from "@/server/ai/receipt";

export const MAX_BILLS = 20;
const CONCURRENCY = 3;

export type BillPage = { model: Blob; stored: Blob; thumb: Blob; previewUrl: string };
export type Bill = {
  key: string;
  /** Stable bill number (#1, #2…) the notes can refer to. Not reused after removal. */
  no: number;
  name: string;
  /** SHA-256 of the uploaded file, to catch the exact same file added twice. */
  hash?: string;
  pages: BillPage[];
  status: "preparing" | "queued" | "reading" | "done" | "error" | "duplicate";
  receipt?: ExtractedReceipt;
  issues?: ReceiptIssue[];
  error?: string;
  duplicateOf?: number;
  /** Stored copies, one per page (in order), for the group to check later. */
  imageIds?: string[];
  upload?: "pending" | "done" | "failed";
};

async function readBill(pages: BillPage[]): Promise<{ receipt: ExtractedReceipt; issues: ReceiptIssue[]; creditsLeft?: number }> {
  const form = new FormData();
  pages.forEach((p, i) => form.append("image", p.model, `page-${i + 1}.jpg`));
  const res = await fetch("/api/extract", { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { receipt?: ExtractedReceipt; issues?: ReceiptIssue[]; error?: string; creditsLeft?: number };
  if (!res.ok || !body.receipt) throw new Error(body.error ?? `Couldn't read this bill (error ${res.status})`);
  return body as { receipt: ExtractedReceipt; issues: ReceiptIssue[]; creditsLeft?: number };
}

async function uploadCopy(groupId: string, page: BillPage, pageNo: number) {
  const form = new FormData();
  form.append("groupId", groupId);
  form.append("page", String(pageNo));
  form.append("image", page.stored, "bill.jpg");
  form.append("thumb", page.thumb, "thumb.jpg");
  const res = await fetch("/api/bills", { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  if (!res.ok || !body.id) throw new Error("upload failed");
  return body.id;
}

/** Bill tray state: preparing images (and PDFs), duplicate checks, reading with the AI model and storing copies. */
export function useBills(groupId: string, onCredits?: (left: number) => void) {
  const [bills, setBills] = React.useState<Bill[]>([]);
  const nextNo = React.useRef(1);
  const billsRef = React.useRef(bills);
  billsRef.current = bills;
  const active = React.useRef(0);

  const patch = React.useCallback((key: string, p: Partial<Bill> | ((b: Bill) => Partial<Bill>)) => {
    setBills((list) => list.map((b) => (b.key === key ? { ...b, ...(typeof p === "function" ? p(b) : p) } : b)));
  }, []);

  // Small queue so a pile of 15 photos doesn't fire 15 vision calls at once.
  const pump = React.useCallback(() => {
    const queued = billsRef.current.filter((b) => b.status === "queued");
    for (const bill of queued) {
      if (active.current >= CONCURRENCY) return;
      active.current++;
      patch(bill.key, { status: "reading", error: undefined });
      readBill(bill.pages)
        .then(({ receipt, issues, creditsLeft }) => {
          patch(bill.key, { status: "done", receipt, issues });
          if (typeof creditsLeft === "number") onCredits?.(creditsLeft);
        })
        .catch((e: Error) => patch(bill.key, { status: "error", error: e.message }))
        .finally(() => {
          active.current--;
          setTimeout(() => pump(), 0);
        });
    }
  }, [patch, onCredits]);

  React.useEffect(() => {
    if (bills.some((b) => b.status === "queued")) pump();
  }, [bills, pump]);

  const addFiles = React.useCallback(
    async (files: FileList | File[]) => {
      const list = [...files];
      const room = MAX_BILLS - billsRef.current.length;
      if (list.length > room) toast.warning(`Up to ${MAX_BILLS} bills at a time. Added the first ${Math.max(0, room)}.`);
      for (const file of list.slice(0, Math.max(0, room))) {
        const key = crypto.randomUUID();
        const no = nextNo.current++;
        setBills((l) => [...l, { key, no, name: file.name, pages: [], status: "preparing" }]);
        try {
          const hash = await fileHash(file);
          let sources: Blob[] = [file];
          if (isPdf(file)) {
            const { pages, totalPages } = await pdfToImages(file);
            if (totalPages > MAX_PDF_PAGES) toast.info(`${file.name}: reading the first ${MAX_PDF_PAGES} of ${totalPages} pages.`);
            sources = pages;
          }
          const pages = await Promise.all(
            sources.map(async (s) => {
              const v = await prepareBillImage(s);
              return { ...v, previewUrl: URL.createObjectURL(v.thumb) };
            }),
          );
          const twin = billsRef.current.find((b) => b.key !== key && b.hash === hash);
          patch(key, { pages, hash, status: twin ? "duplicate" : "queued", duplicateOf: twin?.no });
          void storeCopies(key, pages);
        } catch (e) {
          patch(key, { status: "error", error: e instanceof Error ? e.message : "Couldn't open this file" });
        }
      }
    },
    [groupId, patch],
  );

  /** Saves every page so members can check the whole bill later. Failures are shown with a retry. */
  async function storeCopies(key: string, pages: BillPage[]) {
    patch(key, { upload: "pending", imageIds: undefined });
    try {
      const ids: string[] = [];
      for (const [i, p] of pages.entries()) ids.push(await uploadCopy(groupId, p, i + 1));
      patch(key, { upload: "done", imageIds: ids });
    } catch {
      patch(key, { upload: "failed" });
    }
  }
  const retryUpload = React.useCallback(
    (key: string) => {
      const bill = billsRef.current.find((b) => b.key === key);
      if (bill) void storeCopies(key, bill.pages);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupId],
  );

  const remove = React.useCallback((key: string) => setBills((l) => l.filter((b) => b.key !== key)), []);
  const retry = React.useCallback((key: string) => patch(key, { status: "queued", duplicateOf: undefined }), [patch]);

  /** "This photo is another page of the previous bill": merge and re-read the previous one. */
  const mergeIntoPrevious = React.useCallback((key: string) => {
    setBills((l) => {
      const i = l.findIndex((b) => b.key === key);
      if (i <= 0) return l;
      const prev = l[i - 1];
      const merged: Bill = { ...prev, pages: [...prev.pages, ...l[i].pages].slice(0, 4), status: "queued", receipt: undefined, issues: undefined };
      setTimeout(() => void storeCopies(merged.key, merged.pages), 0);
      return [...l.slice(0, i - 1), merged, ...l.slice(i + 1)];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => () => billsRef.current.forEach((b) => b.pages.forEach((p) => URL.revokeObjectURL(p.previewUrl))), []);

  return { bills, addFiles, remove, retry, retryUpload, mergeIntoPrevious, setBills };
}
