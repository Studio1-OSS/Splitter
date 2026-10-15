"use client";

import { NovuProvider, useNovu } from "@novu/nextjs/hooks";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

// Pages where a refresh could wipe what someone is typing or reviewing (new expense, Settle with AI).
const BUSY = [/\/new$/, /\/batch$/, /^\/split/];

/** Re-fetches the current page's server data (no full reload), skipping pages with work in progress. */
function useSoftRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const last = React.useRef(0);
  return React.useCallback(() => {
    if (BUSY.some((r) => r.test(pathname)) || Date.now() - last.current < 2000) return;
    last.current = Date.now();
    router.refresh();
  }, [router, pathname]);
}

/** When a notification arrives (someone added a bill, recorded a payment, joined), show the new data. */
function OnNotification() {
  const novu = useNovu();
  const refresh = useSoftRefresh();
  React.useEffect(() => novu.on("notifications.notification_received", () => refresh()), [novu, refresh]);
  return null;
}

/** Back to the tab or app after a while: catch up on anything that changed meanwhile. */
function OnReturn() {
  const refresh = useSoftRefresh();
  React.useEffect(() => {
    let hiddenAt = 0;
    const onChange = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 30_000) refresh();
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [refresh]);
  return null;
}

/**
 * One Novu connection for the whole signed-in app: the bell's Inbox reuses this provider instead of opening
 * its own session, and the page refreshes when a notification arrives or when you come back to the tab.
 */
export function LiveRefresh({
  novu,
  children,
}: {
  novu: { appId: string; subscriberId: string; subscriberHash: string } | null;
  children: React.ReactNode;
}) {
  if (!novu) {
    return (
      <>
        <OnReturn />
        {children}
      </>
    );
  }
  return (
    <NovuProvider applicationIdentifier={novu.appId} subscriber={novu.subscriberId} subscriberHash={novu.subscriberHash}>
      <OnReturn />
      <OnNotification />
      {children}
    </NovuProvider>
  );
}
