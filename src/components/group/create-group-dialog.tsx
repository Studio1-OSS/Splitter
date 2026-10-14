"use client";

import { Check, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { GroupBanner } from "@/components/group/group-banner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { GroupKindIcon } from "@/components/ui/icons";
import { Eyebrow, Field, Input, Select } from "@/components/ui/primitives";
import { BANNER_ART, BANNER_ART_KEYS, BANNER_COLOR_KEYS, BANNER_COLORS, BANNER_DEFAULTS, type BannerArt, type BannerColor } from "@/config/banners";
import { GROUP_KIND_KEYS, GROUP_KINDS, type GroupKind } from "@/config/categories";
import { site } from "@/config/site";
import { COMMON_CURRENCIES } from "@/lib/money";
import { cn } from "@/lib/utils";
import { createGroupAction } from "@/server/actions";

export function CreateGroupDialog({ trigger }: { trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<GroupKind>("trip");
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState<BannerColor>(BANNER_DEFAULTS.trip.color);
  const [art, setArt] = React.useState<BannerArt>(BANNER_DEFAULTS.trip.art);
  // The banner follows the group type until the user picks one themselves.
  const [bannerPicked, setBannerPicked] = React.useState(false);
  const [friends, setFriends] = React.useState<string[]>([]);
  const [friend, setFriend] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const chooseKind = (k: GroupKind) => {
    setKind(k);
    if (!bannerPicked) {
      setColor(BANNER_DEFAULTS[k].color);
      setArt(BANNER_DEFAULTS[k].art);
    }
  };

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
      name,
      currency: String(form.get("currency") ?? site.defaultCurrency),
      kind,
      emoji: GROUP_KINDS[kind].emoji,
      banner: { color, art },
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
          <Button variant="glass">
            <Plus /> New group
          </Button>
        )}
      </DialogTrigger>
      <DialogContent glass title="New group" description="One group per trip, party, event or household." className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="grid gap-5">
          {/* Live preview of the banner the group page will show. */}
          <GroupBanner wide color={color} art={art} className="h-28 rounded-md shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]">
            <div className="flex h-full max-w-[62%] flex-col justify-between p-4">
              <span className="eyebrow inline-flex items-center gap-1.5 text-[11px] text-white/85">
                <GroupKindIcon kind={kind} className="size-3.5" />
                {GROUP_KINDS[kind].label}
              </span>
              <p className={cn("truncate font-display text-2xl leading-tight [text-shadow:0_1px_12px_rgb(0_0_0/0.25)]", !name.trim() && "text-white/70")}>
                {name.trim() || GROUP_KINDS[kind].example}
              </p>
            </div>
          </GroupBanner>
          <div className="grid gap-2">
            <Eyebrow>Type</Eyebrow>
            <div role="radiogroup" aria-label="Group type" className="grid grid-cols-3 gap-1.5">
              {GROUP_KIND_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => chooseKind(k)}
                  className={cn(
                    "flex h-11 items-center gap-2.5 rounded-sm border px-3 text-sm font-medium transition",
                    kind === k
                      ? "border-foreground bg-foreground text-background"
                      : "border-glass-border bg-glass-fill text-foreground/85 hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  <GroupKindIcon kind={k} className={cn("size-4 shrink-0", kind !== k && "text-muted-foreground")} />
                  {GROUP_KINDS[k].label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label="Name">
              <Input
                name="name"
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={GROUP_KINDS[kind].example}
                className="border-glass-border bg-glass-fill"
              />
            </Field>
            <Field label="Currency">
              <Select name="currency" defaultValue={site.defaultCurrency} className="border-glass-border bg-glass-fill">
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-2">
            <Eyebrow>Banner</Eyebrow>
            <div className="grid gap-3 rounded-md border border-glass-border bg-glass-fill p-3">
              <div role="radiogroup" aria-label="Banner colour" className="grid grid-cols-10 gap-0.5">
                {BANNER_COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={color === key}
                    aria-label={BANNER_COLORS[key].label}
                    title={BANNER_COLORS[key].label}
                    onClick={() => {
                      setColor(key);
                      setBannerPicked(true);
                    }}
                    className="group/swatch flex h-11 items-center justify-center rounded-full focus-visible:outline-none"
                  >
                    <span
                      style={{ background: `linear-gradient(135deg, ${BANNER_COLORS[key].from}, ${BANNER_COLORS[key].to})` }}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35)] transition group-hover/swatch:scale-110 group-focus-visible/swatch:ring-2 group-focus-visible/swatch:ring-ring",
                        color === key && "scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-transparent",
                      )}
                    >
                      {color === key && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                  </button>
                ))}
              </div>
              <div role="radiogroup" aria-label="Banner artwork" className="grid grid-cols-5 gap-2">
                {BANNER_ART_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={art === key}
                    onClick={() => {
                      setArt(key);
                      setBannerPicked(true);
                    }}
                    className="group/art grid gap-1 text-left focus-visible:outline-none"
                  >
                    <GroupBanner
                      color={color}
                      art={key}
                      className={cn(
                        "h-11 rounded-sm ring-offset-2 ring-offset-transparent transition group-focus-visible/art:ring-2 group-focus-visible/art:ring-ring",
                        art === key ? "ring-2 ring-foreground" : "opacity-75 group-hover/art:opacity-100",
                      )}
                    />
                    <span className={cn("truncate text-[11px]", art === key ? "font-medium text-foreground" : "text-muted-foreground")}>
                      {BANNER_ART[key]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Field label="People" hint="Add names now; they can claim their spot later with the invite link.">
            <div className="flex gap-2">
              <Input
                value={friend}
                maxLength={60}
                placeholder="Sam"
                onChange={(e) => setFriend(e.target.value)}
                className="border-glass-border bg-glass-fill"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addFriend();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addFriend} disabled={!friend.trim()} className="h-12 border-glass-border bg-glass-fill md:h-11">
                Add
              </Button>
            </div>
          </Field>
          {friends.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {friends.map((f) => (
                <span key={f} className="inline-flex h-10 items-center gap-1 rounded-full border border-glass-border bg-glass-fill pl-4 pr-1 text-sm">
                  {f}
                  <button type="button" onClick={() => setFriends(friends.filter((x) => x !== f))} aria-label={`Remove ${f}`} className="flex size-8 items-center justify-center rounded-full hover:bg-muted">
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Button type="submit" size="lg" variant="glass" loading={pending}>
            Create group
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
