"use client";

import { LogOut, Zap } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { CreditMeter } from "@/components/ui/credit-meter";
import { Avatar } from "@/components/ui/primitives";
import { authClient } from "@/lib/auth-client";

const NotificationBell = dynamic(() => import("./notification-bell").then((m) => m.NotificationBell), { ssr: false });

export function AppHeader({
  user,
  novu,
  credits,
}: {
  user: { id: string; name: string };
  novu: { appId: string; subscriberHash: string } | null;
  credits: { left: number; limit: number } | null;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:h-16 sm:px-6">
        <Logo href="/dashboard" />
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="sm" asChild className="max-md:hidden">
            <Link href="/split">
              <Zap /> Quick split
            </Link>
          </Button>
          {credits && <CreditMeter compact left={credits.left} limit={credits.limit} />}
          {novu && <NotificationBell userId={user.id} appId={novu.appId} subscriberHash={novu.subscriberHash} />}
          <div className="ml-1 flex items-center gap-2 border-l border-border pl-3 max-md:hidden">
            <Avatar name={user.name} />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Sign out"
              onClick={async () => {
                await authClient.signOut();
                router.push("/");
                router.refresh();
              }}
            >
              <LogOut />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
