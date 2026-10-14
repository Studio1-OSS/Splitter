"use client";

import { Check, Copy, HandCoins, Link2, Loader2, RefreshCw, ScanLine, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { MoneyInput } from "@/components/ui/money";
import { Field, Input, Select } from "@/components/ui/primitives";
import { compressImage } from "@/lib/image";
import { isValidCurrency, toMinor } from "@/lib/money";
import {
  addMemberAction,
  confirmSettlementAction,
  deleteSettlementAction,
  recordSettlementAction,
  resetInviteAction,
} from "@/server/actions";

type Member = { id: string; displayName: string };

export function InviteLink({ groupId, inviteToken }: { groupId: string; inviteToken: string }) {
  const [copied, setCopied] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();

  const copy = async () => {
    const url = `${window.location.origin}/join/${inviteToken}`;
    try {
      if (navigator.share && /Mobi/i.test(navigator.userAgent)) {
        await navigator.share({ title: "Join my group", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Invite link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // share sheet dismissed
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? <Check /> : <Link2 />} Invite link
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Reset invite link"
        title="Reset invite link (old links stop working)"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await resetInviteAction(groupId);
            if (!res.ok) return void toast.error(res.error);
            toast.success("New invite link created. Old links no longer work.");
            router.refresh();
          })
        }
      >
        {!pending && <RefreshCw />}
      </Button>
    </div>
  );
}

export function AddMemberDialog({ groupId }: { groupId: string }) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus /> Add person
        </Button>
      </DialogTrigger>
      <DialogContent title="Add someone" description="They'll show up in splits right away and can claim their spot with the invite link.">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            const res = await addMemberAction(groupId, String(new FormData(e.currentTarget).get("name") ?? ""));
            setPending(false);
            if (!res.ok) return toast.error(res.error);
            setOpen(false);
          }}
        >
          <Field label="Name">
            <Input name="name" required maxLength={60} autoFocus placeholder="Jordan" />
          </Field>
          <Button type="submit" loading={pending}>
            Add to group
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Best-effort match of a name printed on a payment screenshot to a group member. */
function matchMember(name: string | null, members: Member[]) {
  if (!name) return undefined;
  const tokens = name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  return members.find((m) => {
    const mt = m.displayName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return mt.some((t) => tokens.includes(t));
  });
}

export function SettleUpDialog({
  groupId,
  currency,
  members,
  defaults,
  trigger,
}: {
  groupId: string;
  currency: string;
  members: Member[];
  defaults: { from: string; to: string; amount: number };
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [from, setFrom] = React.useState(defaults.from);
  const [to, setTo] = React.useState(defaults.to);
  const [amount, setAmount] = React.useState(defaults.amount);
  const [pending, setPending] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const screenshot = React.useRef<HTMLInputElement>(null);

  async function scanScreenshot(file: File) {
    setScanning(true);
    try {
      const form = new FormData();
      form.append("image", await compressImage(file), "payment.jpg");
      const res = await fetch("/api/extract-payment", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as {
        payment?: { isPayment: boolean; amount: number | null; currency: string | null; fromName: string | null; toName: string | null; app: string | null };
        error?: string;
      };
      if (!res.ok || !body.payment) throw new Error(body.error ?? "Couldn't read the screenshot");
      const p = body.payment;
      if (!p.isPayment || p.amount == null) throw new Error("That doesn't look like a payment confirmation");
      const cur = p.currency?.toUpperCase();
      if (cur && isValidCurrency(cur) && cur !== currency) toast.warning(`The screenshot is in ${cur}; this group uses ${currency}.`);
      setAmount(toMinor(p.amount, currency));
      const fromM = matchMember(p.fromName, members);
      const toM = matchMember(p.toName, members);
      if (fromM) setFrom(fromM.id);
      if (toM) setTo(toM.id);
      toast.success(`Read ${p.app ?? "payment"} screenshot`, {
        description: [p.fromName && `From ${p.fromName}`, p.toName && `to ${p.toName}`].filter(Boolean).join(" ") || "Check who paid whom.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read the screenshot");
    } finally {
      setScanning(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setFrom(defaults.from);
          setTo(defaults.to);
          setAmount(defaults.amount);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title="Record a payment" description="Paid back in cash, bank transfer or an app? Log it here to update balances.">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            const res = await recordSettlementAction({ groupId, fromMemberId: from, toMemberId: to, amount });
            setPending(false);
            if (!res.ok) return toast.error(res.error);
            toast.success("Payment recorded");
            setOpen(false);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Who paid">
              <Select value={from} onChange={(e) => setFrom(e.target.value)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Paid to">
              <Select value={to} onChange={(e) => setTo(e.target.value)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="button" variant="outline" onClick={() => screenshot.current?.click()} disabled={scanning}>
            {scanning ? <Loader2 className="animate-spin" /> : <ScanLine />} {scanning ? "Reading screenshot…" : "Fill from a payment screenshot"}
          </Button>
          <input
            ref={screenshot}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void scanScreenshot(f);
              e.target.value = "";
            }}
          />
          <Field label={`Amount (${currency})`}>
            <MoneyInput currency={currency} value={amount} onChange={setAmount} className="h-16 text-left font-display text-3xl md:h-16 md:text-3xl" />
          </Field>
          <Button type="submit" size="lg" loading={pending} disabled={amount <= 0 || from === to}>
            <HandCoins /> Record payment
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SettlementActions({ id, canConfirm, canDelete }: { id: string; canConfirm: boolean; canDelete: boolean }) {
  const [pending, startTransition] = React.useTransition();
  return (
    <div className="flex gap-1">
      {canConfirm && (
        <Button
          size="sm"
          variant="outline"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await confirmSettlementAction(id);
              if (!res.ok) toast.error(res.error);
            })
          }
        >
          <Check /> Confirm
        </Button>
      )}
      {canDelete && (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Remove payment"
          disabled={pending}
          onClick={() => {
            if (!confirm("Remove this payment? Balances will be recalculated.")) return;
            startTransition(async () => {
              const res = await deleteSettlementAction(id);
              if (!res.ok) toast.error(res.error);
            });
          }}
        >
          <Trash2 className="text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="outline"
      onClick={async () => {
        const value = text.startsWith("/") ? `${window.location.origin}${text}` : text;
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Couldn't copy");
        }
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : label}
    </Button>
  );
}
