"use client";

import * as React from "react";
import { toast } from "sonner";
import { setBatchShareImagesAction } from "@/server/actions";

export function ShareImagesToggle({ batchId, initial }: { batchId: string; initial: boolean }) {
  const [on, setOn] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <input
        type="checkbox"
        className="size-5 accent-[#17171c]"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          startTransition(async () => {
            const res = await setBatchShareImagesAction(batchId, next);
            if (!res.ok) {
              setOn(!next);
              toast.error(res.error);
            }
          });
        }}
      />
      Show bill photos and notes on the share link
    </label>
  );
}
