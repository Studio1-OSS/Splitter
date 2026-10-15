"use client";

import { MessageCircle, Share2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/group/group-actions";
import { Button } from "@/components/ui/button";
import { deleteExpenseAction } from "@/server/actions";

export function ExpenseToolbar({
  expenseId,
  sharePath,
  shareText,
  canDelete,
}: {
  expenseId: string;
  sharePath: string;
  shareText: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const url = () => `${window.location.origin}${sharePath}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={async () => {
          if (navigator.share) {
            try {
              await navigator.share({ title: shareText, url: url() });
              return;
            } catch {
              // dismissed
            }
          }
          await navigator.clipboard.writeText(url()).then(
            () => toast.success("Share link copied"),
            () => toast.error("Couldn't copy"),
          );
        }}
      >
        <Share2 /> Share
      </Button>
      <Button variant="outline" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url()}`)}`, "_blank")}>
        <MessageCircle /> WhatsApp
      </Button>
      <CopyButton text={sharePath} />
      {canDelete && (
        <Button
          variant="ghost"
          className="text-negative sm:ml-auto"
          loading={pending}
          onClick={() => {
            if (!confirm("Delete this expense for everyone? Balances will be recalculated.")) return;
            startTransition(async () => {
              const res = await deleteExpenseAction(expenseId);
              if (!res.ok) return void toast.error(res.error);
              toast.success("Expense deleted");
              router.push(`/groups/${res.data.groupId}`);
            });
          }}
        >
          <Trash2 /> Delete
        </Button>
      )}
    </div>
  );
}
