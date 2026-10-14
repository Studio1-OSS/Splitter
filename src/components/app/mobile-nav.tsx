"use client";

import { ChevronRight, Home, LogOut, Plus, Sparkles, UserRound, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CreditMeter } from "@/components/ui/credit-meter";
import { Avatar } from "@/components/ui/primitives";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type GroupLink = { id: string; name: string; emoji: string };

/** Bottom tab bar for phones. Hidden on md+ (the header covers it) and inside the focused new-expense flow. */
export function MobileNav({
  user,
  groups,
  credits,
}: {
  user: { name: string; email: string };
  groups: GroupLink[];
  credits: { left: number; limit: number } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sheet, setSheet] = React.useState<"add" | "account" | null>(null);

  if (/^\/groups\/[^/]+\/(new|batch)\/?$/.test(pathname)) return null;
  const groupId = pathname.match(/^\/groups\/([^/]+)/)?.[1];

  const tab = "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] h-16";
  const close = () => setSheet(null);

  return (
    <>
      <nav
        aria-label="App"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="mx-auto flex max-w-md items-center px-6">
          <Link href="/dashboard" className={cn(tab, pathname === "/dashboard" ? "text-foreground" : "text-muted-foreground")}>
            <Home className="size-5" />
            Home
          </Link>
          <div className="flex flex-1 justify-center">
            <button
              onClick={() => setSheet("add")}
              aria-label="Add expense"
              className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background"
            >
              <Plus className="size-6" />
            </button>
          </div>
          <button onClick={() => setSheet("account")} className={cn(tab, "text-muted-foreground")}>
            <UserRound className="size-5" />
            Account
          </button>
        </div>
      </nav>

      <Dialog open={sheet === "add"} onOpenChange={(o) => !o && close()}>
        <DialogContent title="Add an expense" description={groupId ? "Drop a pile of bills, or add one." : "Pick a group, or split something one-off."}>
          {groupId && (
            <div className="grid gap-2">
              <Link href={`/groups/${groupId}/batch`} onClick={close} className="flex min-h-16 items-center gap-3 rounded-sm bg-band px-4 text-white">
                <Sparkles className="size-5 text-[#ffad9b]" />
                <span className="flex-1">
                  <span className="block">Settle with AI</span>
                  <span className="text-xs text-white/70">Many bills + who paid what</span>
                </span>
                <ChevronRight className="size-4" />
              </Link>
              <Link href={`/groups/${groupId}/new`} onClick={close} className="flex h-14 items-center gap-3 rounded-sm border border-hairline px-4">
                <Plus className="size-5" />
                <span className="flex-1">One expense</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <p className="eyebrow mt-3 text-muted-foreground">Or another group</p>
            </div>
          )}
          <ul className="-mx-2 grid">
            {groups.filter((g) => g.id !== groupId).map((g) => (
              <li key={g.id}>
                <Link href={`/groups/${g.id}/new`} onClick={close} className="flex h-14 items-center gap-3 rounded-sm px-2 hover:bg-muted">
                  <span className="flex size-10 items-center justify-center rounded-sm bg-stone text-lg">{g.emoji}</span>
                  <span className="flex-1 truncate">{g.name}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
            <li>
              <Link href="/split" onClick={close} className="flex h-14 items-center gap-3 rounded-sm px-2 hover:bg-muted">
                <span className="flex size-10 items-center justify-center rounded-sm bg-stone">
                  <Zap className="size-4" />
                </span>
                <span className="flex-1">Quick split, no group</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={sheet === "account"} onOpenChange={(o) => !o && close()}>
        <DialogContent title="Account">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size="lg" />
            <div className="min-w-0">
              <p className="truncate">{user.name}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          {credits && <CreditMeter left={credits.left} limit={credits.limit} />}
          <Button
            variant="outline"
            size="lg"
            onClick={async () => {
              await authClient.signOut();
              close();
              router.push("/");
              router.refresh();
            }}
          >
            <LogOut /> Sign out
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
