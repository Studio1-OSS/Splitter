"use client";

import * as React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** Bill thumbnail that opens the stored copy full size. Long bills show every page in order. */
export function BillImage({
  thumb,
  full,
  pages,
  alt,
  className,
}: {
  thumb: string;
  full: string;
  /** Full-size URLs of every page; defaults to just `full`. */
  pages?: string[];
  alt: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const all = pages?.length ? pages : [full];
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={`View ${alt}`} className={className ?? "relative size-14 overflow-hidden rounded-sm bg-muted"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumb} alt={alt} loading="lazy" className="size-full object-cover object-top" />
        {all.length > 1 && (
          <span className="absolute bottom-0.5 right-0.5 rounded-xs bg-black/70 px-1 text-[10px] text-white">{all.length}p</span>
        )}
      </button>
      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent title={alt} description={all.length > 1 ? `${all.length} pages` : undefined} className="sm:max-w-2xl">
            <div className="grid max-h-[75dvh] gap-3 overflow-y-auto">
              {all.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={`${alt}, page ${i + 1}`} className="w-full rounded-sm object-contain" />
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
