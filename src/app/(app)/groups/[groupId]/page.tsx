import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, HandCoins, Plus, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AskSplitter } from "@/components/group/ask-splitter";
import { AddMemberDialog, InviteLink, SettleUpDialog, SettlementActions } from "@/components/group/group-actions";
import { GroupBanner } from "@/components/group/group-banner";
import { Button } from "@/components/ui/button";
import { AiSparkIcon } from "@/components/ui/icons";
import { Amount } from "@/components/ui/money";
import { Avatar, Badge, CategoryIcon, EmptyState, Eyebrow } from "@/components/ui/primitives";
import { isBannerArt, isBannerColor } from "@/config/banners";
import { categoryOf, GROUP_KINDS, isGroupKind } from "@/config/categories";
import { features } from "@/env";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { loadOr404 } from "@/server/load";
import { listBatches } from "@/server/services/batches";
import { getGroupDetail } from "@/server/services/groups";

type Props = { params: Promise<{ groupId: string }> };

export const metadata: Metadata = { title: "Group" };

export default async function GroupPage({ params }: Props) {
  const { groupId } = await params;
  const user = await requireUser(`/groups/${groupId}`);
  const { group, me, members, balances, transfers, expenses, settlements } = await loadOr404(() => getGroupDetail(db, user.id, groupId));
  const batches = await listBatches(db, user.id, group.id);
  const c = group.currency;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? "Someone";
  const myBalance = balances.find((b) => b.member.id === me.id)?.amount ?? 0;
  const myTransfer = transfers.find((t) => t.fromMemberId === me.id);

  const byCategory = [...Map.groupBy(expenses, (e) => e.category)]
    .map(([category, rows]) => ({ category, total: rows.reduce((a, e) => a + e.total, 0) }))
    .sort((a, b) => b.total - a.total);
  const spent = byCategory.reduce((a, b) => a + b.total, 0);

  const banner =
    isBannerColor(group.bannerColor) && isBannerArt(group.bannerArt) ? { color: group.bannerColor, art: group.bannerArt } : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      <div>
        <Link href="/dashboard" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> All groups
        </Link>
        {banner && <GroupBanner wide color={banner.color} art={banner.art} className="mt-2 h-28 rounded-lg sm:h-40" />}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {!banner && (
            <span className="flex size-14 items-center justify-center rounded-sm bg-stone text-3xl">{group.emoji}</span>
          )}
          <div className="min-w-0 flex-1">
            <h1 title={group.name} className="truncate text-4xl leading-tight sm:text-5xl">{group.name}</h1>
            <p className="eyebrow mt-1 text-muted-foreground">
              {isGroupKind(group.kind) ? `${GROUP_KINDS[group.kind].label} · ` : ""}
              {members.length} people · {c}
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <InviteLink groupId={group.id} inviteToken={group.inviteToken} />
            <AddMemberDialog groupId={group.id} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col justify-between gap-6 rounded-lg bg-band p-6 text-band-foreground sm:p-8">
          <div>
            <p className="eyebrow text-white/60">Your balance</p>
            {myBalance === 0 ? (
              <p className="mt-2 flex items-center gap-2 font-display text-4xl">
                <CheckCircle2 className="size-8 text-[#5fd3a8]" /> All settled
              </p>
            ) : (
              <p className="mt-2 font-display text-4xl sm:text-5xl">
                {myBalance > 0 ? "You're owed " : "You owe "}
                <span className="tabular">{formatMoney(Math.abs(myBalance), c)}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="inverse" size="lg" asChild>
              <Link href={`/groups/${group.id}/batch`}>
                <AiSparkIcon /> Settle with AI
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-white/30 text-white hover:bg-white/10">
              <Link href={`/groups/${group.id}/new`}>
                <Plus /> Add expense
              </Link>
            </Button>
            {myTransfer && (
              <SettleUpDialog
                groupId={group.id}
                currency={c}
                members={members}
                defaults={{ from: myTransfer.fromMemberId, to: myTransfer.toMemberId, amount: myTransfer.amount }}
                trigger={
                  <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10">
                    <HandCoins /> Settle up
                  </Button>
                }
              />
            )}
          </div>
        </div>

        <div className="rounded-md bg-stone p-5 sm:p-6">
          <Eyebrow>Balances</Eyebrow>
          <ul className="mt-4 grid gap-3">
            {balances.map(({ member, amount }) => (
              <li key={member.id} className="flex items-center gap-3">
                <Avatar name={member.displayName} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {member.displayName}
                  {member.id === me.id && <span className="text-muted-foreground"> (you)</span>}
                  {!member.userId && <span className="text-muted-foreground"> · not joined</span>}
                </span>
                <Amount value={amount} currency={c} signed className="text-sm" />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {transfers.length > 0 && (
        <section>
          <h2 className="text-3xl">Suggested payments</h2>
          <p className="mt-1 text-sm text-muted-foreground">The fewest payments that square everyone up.</p>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {transfers.map((t) => (
              <li key={`${t.fromMemberId}-${t.toMemberId}`} className="flex min-h-16 items-center gap-3 py-2">
                <Avatar name={nameOf(t.fromMemberId)} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {nameOf(t.fromMemberId)} pays {nameOf(t.toMemberId)}
                </span>
                <span className="tabular text-sm">{formatMoney(t.amount, c)}</span>
                <SettleUpDialog
                  groupId={group.id}
                  currency={c}
                  members={members}
                  defaults={{ from: t.fromMemberId, to: t.toMemberId, amount: t.amount }}
                  trigger={
                    <Button size="icon" variant="ghost" aria-label={`Record ${nameOf(t.fromMemberId)} paying ${nameOf(t.toMemberId)}`}>
                      <ArrowRight />
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {batches.length > 0 && (
        <section>
          <h2 className="text-3xl">Settled with AI</h2>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {batches.map((b) => (
              <li key={b.id}>
                <Link href={`/groups/${group.id}/batches/${b.id}`} className="group flex min-h-16 items-center gap-3 py-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-band text-white">
                    <AiSparkIcon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate group-hover:underline group-hover:underline-offset-4">{b.title}</span>
                    <span className="text-sm text-muted-foreground">{b.createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · bills, notes and how it was split</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {expenses.length > 0 && (
        <AskSplitter
          groupId={group.id}
          enabled={features.scanning}
          suggestions={[myBalance < 0 ? "Why do I owe this much?" : "Who still owes me?", "What did I pay for?", "Which was the biggest expense?"]}
        />
      )}

      {byCategory.length > 1 && (
        <section>
          <h2 className="text-3xl">Spending by category</h2>
          <p className="mt-1 text-sm text-muted-foreground">{formatMoney(spent, c)} in total.</p>
          <ul className="mt-5 grid gap-4">
            {byCategory.map(({ category, total }) => {
              const { label, icon: Icon } = categoryOf(category);
              return (
                <li key={category} className="grid grid-cols-[1.5rem_7rem_minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[1.5rem_9rem_minmax(0,1fr)_auto]">
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="truncate">{label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-stone">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(3, (total / spent) * 100)}%` }} />
                  </span>
                  <span className="tabular w-24 text-right">{formatMoney(total, c)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-3xl">Activity</h2>
        {expenses.length === 0 && settlements.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Receipt />}
              title="No expenses yet"
              action={
                <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
                  <Button asChild>
                    <Link href={`/groups/${group.id}/batch`}>
                      <AiSparkIcon /> Settle with AI
                    </Link>
                  </Button>
                  <Button variant="link" asChild>
                    <Link href={`/groups/${group.id}/new`}>Add one expense</Link>
                  </Button>
                </div>
              }
            >
              Drop all the bills into Settle with AI, or add one expense at a time. Everyone&apos;s share is worked out for you.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {[
              ...expenses.map((e) => ({ kind: "expense" as const, at: e.createdAt, e })),
              ...settlements.map((s) => ({ kind: "settlement" as const, at: s.createdAt, s })),
            ]
              .sort((a, b) => b.at.getTime() - a.at.getTime())
              .map((row) =>
                row.kind === "expense" ? (
                  <li key={row.e.id}>
                    <Link href={`/expenses/${row.e.id}`} className="group flex min-h-16 items-center gap-3 py-3">
                      <CategoryIcon category={row.e.category} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate group-hover:underline group-hover:underline-offset-4">{row.e.merchant}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {nameOf(row.e.paidByMemberId)} paid {formatMoney(row.e.total, c)} · {formatDate(row.e.date)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-sm">
                        {row.e.paidByMemberId === me.id ? (
                          <>
                            <p className="text-xs text-muted-foreground">you lent</p>
                            <Amount value={row.e.total - row.e.myShare} currency={c} className="text-positive" />
                          </>
                        ) : row.e.myShare > 0 ? (
                          <>
                            <p className="text-xs text-muted-foreground">your share</p>
                            <Amount value={row.e.myShare} currency={c} className="text-negative" />
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">not involved</p>
                        )}
                      </div>
                    </Link>
                  </li>
                ) : (
                  <li key={row.s.id} className="flex min-h-16 flex-wrap items-center gap-3 py-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-positive-soft text-positive">
                      <HandCoins className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        {nameOf(row.s.fromMemberId)} paid {nameOf(row.s.toMemberId)} {formatMoney(row.s.amount, c)}
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                        {row.s.createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        {row.s.status === "confirmed" ? <Badge tone="positive">Confirmed</Badge> : <Badge tone="warning">Awaiting confirmation</Badge>}
                      </p>
                    </div>
                    <SettlementActions
                      id={row.s.id}
                      canConfirm={row.s.status === "reported" && row.s.toMemberId === me.id}
                      canDelete={row.s.createdBy === user.id || row.s.toMemberId === me.id}
                    />
                  </li>
                ),
              )}
          </ul>
        )}
      </section>
    </div>
  );
}
