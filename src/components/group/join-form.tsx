"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { joinGroupAction } from "@/server/actions";

export function JoinForm({
  inviteToken,
  placeholders,
  userName,
}: {
  inviteToken: string;
  placeholders: { id: string; displayName: string }[];
  userName: string;
}) {
  const router = useRouter();
  const guess = placeholders.find((p) => p.displayName.toLowerCase() === userName.split(" ")[0]?.toLowerCase());
  const [choice, setChoice] = React.useState<string>(guess?.id ?? "new");
  const [pending, setPending] = React.useState(false);

  async function join() {
    setPending(true);
    const res = await joinGroupAction(inviteToken, choice === "new" ? undefined : choice);
    if (!res.ok) {
      setPending(false);
      return toast.error(res.error);
    }
    router.push(`/groups/${res.data.groupId}`);
  }

  return (
    <div className="mt-8 grid gap-4 text-left">
      {placeholders.length > 0 && (
        <div className="grid gap-2">
          <p className="text-sm">Are you one of these people?</p>
          {[...placeholders, { id: "new", displayName: `No, join as ${userName}` }].map((p) => (
            <button
              key={p.id}
              onClick={() => setChoice(p.id)}
              className={cn(
                "flex min-h-14 items-center gap-3 rounded-sm border bg-card p-3 text-left transition",
                choice === p.id ? "border-foreground" : "border-hairline hover:border-foreground/40",
              )}
            >
              {p.id !== "new" && <Avatar name={p.displayName} />}
              <span className="flex-1 text-sm">{p.displayName}</span>
              {choice === p.id && <Check className="size-4" />}
            </button>
          ))}
          <p className="text-xs text-muted-foreground">Claiming a name keeps everything already split with you.</p>
        </div>
      )}
      <Button size="lg" loading={pending} onClick={join}>
        Join group
      </Button>
    </div>
  );
}
