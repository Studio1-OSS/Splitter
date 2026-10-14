import { ChevronRight, Users, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CreateGroupDialog } from "@/components/group/create-group-dialog";
import { GroupBanner } from "@/components/group/group-banner";
import { ProfilePhoto } from "@/components/profile/profile-photo";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/ui/money";
import { AvatarStack, EmptyState, Eyebrow } from "@/components/ui/primitives";
import { isBannerArt, isBannerColor } from "@/config/banners";
import { GROUP_KINDS, isGroupKind } from "@/config/categories";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { listGroupsForUser } from "@/server/services/groups";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const groups = await listGroupsForUser(db, user.id);

  // Totals per currency (balances in different currencies are never added together).
  const totals = new Map<string, { owed: number; owe: number }>();
  for (const g of groups) {
    const t = totals.get(g.currency) ?? { owed: 0, owe: 0 };
    if (g.myBalance > 0) t.owed += g.myBalance;
    else t.owe -= g.myBalance;
    totals.set(g.currency, t);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <ProfilePhoto name={user.name} image={user.image} />
            <Eyebrow>Hi {user.name.split(" ")[0]}</Eyebrow>
          </div>
          <h1 className="mt-3 text-5xl leading-none">Your groups</h1>
        </div>
        {groups.length > 0 && <CreateGroupDialog />}
      </div>

      {groups.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[...totals].map(([currency, t]) => (
            <div key={currency} className="grid grid-cols-2 rounded-md bg-stone">
              <div className="p-5">
                <Eyebrow>You&apos;re owed</Eyebrow>
                <Amount value={t.owed} currency={currency} className={`mt-2 block font-display text-3xl ${t.owed ? "text-positive" : "text-muted-foreground"}`} />
              </div>
              <div className="border-l border-hairline p-5">
                <Eyebrow>You owe</Eyebrow>
                <Amount value={t.owe} currency={currency} className={`mt-2 block font-display text-3xl ${t.owe ? "text-negative" : "text-muted-foreground"}`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Start your first group"
          action={
            <div className="mt-2 flex flex-col items-center gap-4 sm:flex-row">
              <CreateGroupDialog />
              <Button variant="link" asChild>
                <Link href="/split">
                  <Zap /> One-off quick split
                </Link>
              </Button>
            </div>
          }
        >
          One group per trip, party, event or household keeps running balances for everyone in it.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/groups/${g.id}`} className="group flex min-h-20 items-center gap-4 py-4">
                {isBannerColor(g.bannerColor) && isBannerArt(g.bannerArt) ? (
                  <GroupBanner color={g.bannerColor} art={g.bannerArt} className="h-12 w-20 shrink-0 rounded-sm" />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-sm bg-stone text-2xl">{g.emoji}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg group-hover:underline group-hover:underline-offset-4">{g.name}</p>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <AvatarStack names={g.memberNames} />
                    <span className="truncate">
                      {isGroupKind(g.kind) ? `${GROUP_KINDS[g.kind].label} · ` : ""}
                      {g.memberCount} people
                      <span className="max-sm:hidden">
                        {" "}
                        · {g.expenseCount} {g.expenseCount === 1 ? "expense" : "expenses"}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  {g.myBalance === 0 ? (
                    <span className="text-sm text-muted-foreground">Settled</span>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">{g.myBalance > 0 ? "you're owed" : "you owe"}</p>
                      <Amount value={Math.abs(g.myBalance)} currency={g.currency} className={g.myBalance > 0 ? "text-positive" : "text-negative"} />
                    </>
                  )}
                </div>
                <ChevronRight className="size-4 text-muted-foreground max-sm:hidden" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
