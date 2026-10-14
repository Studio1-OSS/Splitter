"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Eyebrow, Field, Input, Select } from "@/components/ui/primitives";
import { GROUP_KIND_KEYS, GROUP_KINDS, type GroupKind } from "@/config/categories";
import { site } from "@/config/site";
import { COMMON_CURRENCIES } from "@/lib/money";
import { cn } from "@/lib/utils";
import { createGroupAction } from "@/server/actions";

export function CreateGroupDialog({ trigger }: { trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<GroupKind>("trip");
  const [friends, setFriends] = React.useState<string[]>([]);
  const [friend, setFriend] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const addFriend = () => {
    const name = friend.trim();
    if (name && !friends.includes(name)) setFriends([...friends, name]);
    setFriend("");
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    const pendingFriend = friend.trim();
    const res = await createGroupAction({
      name: String(form.get("name") ?? ""),
      currency: String(form.get("currency") ?? site.defaultCurrency),
      kind,
      emoji: GROUP_KINDS[kind].emoji,
      friends: pendingFriend && !friends.includes(pendingFriend) ? [...friends, pendingFriend] : friends,
    });
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    setOpen(false);
    router.push(`/groups/${res.data.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus /> New group
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title="New group" description="One group per trip, party, event or household.">
        <form onSubmit={onSubmit} className="grid gap-5">
          <div className="grid gap-2">
            <Eyebrow>Type</Eyebrow>
            <div role="radiogroup" aria-label="Group type" className="grid grid-cols-3 gap-2">
              {GROUP_KIND_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-0.5 rounded-sm border text-sm transition",
                    kind === k ? "border-foreground bg-foreground text-background" : "border-hairline hover:border-foreground/40",
                  )}
                >
                  <span className="text-lg" aria-hidden>
                    {GROUP_KINDS[k].emoji}
                  </span>
                  {GROUP_KINDS[k].label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label="Name">
              <Input name="name" required maxLength={60} placeholder={GROUP_KINDS[kind].example} />
            </Field>
            <Field label="Currency">
              <Select name="currency" defaultValue={site.defaultCurrency}>
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="People" hint="Add names now; they can claim their spot later with the invite link.">
            <div className="flex gap-2">
              <Input
                value={friend}
                maxLength={60}
                placeholder="Sam"
                onChange={(e) => setFriend(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addFriend();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addFriend} disabled={!friend.trim()} className="h-12 md:h-11">
                Add
              </Button>
            </div>
          </Field>
          {friends.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {friends.map((f) => (
                <span key={f} className="inline-flex h-10 items-center gap-1 rounded-full border border-hairline pl-4 pr-1 text-sm">
                  {f}
                  <button type="button" onClick={() => setFriends(friends.filter((x) => x !== f))} aria-label={`Remove ${f}`} className="flex size-8 items-center justify-center rounded-full hover:bg-muted">
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Button type="submit" size="lg" loading={pending}>
            Create group
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
