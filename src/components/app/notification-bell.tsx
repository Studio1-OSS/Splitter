"use client";

import { Inbox } from "@novu/nextjs";
import { useRouter } from "next/navigation";

/** Novu in-app inbox. Only rendered when NOVU keys are configured. */
export function NotificationBell({ userId, appId, subscriberHash }: { userId: string; appId: string; subscriberHash: string }) {
  const router = useRouter();
  return (
    <div role="region" aria-label="Notifications" className="flex items-center">
      <Inbox
        applicationIdentifier={appId}
        subscriber={userId}
        subscriberHash={subscriberHash}
        routerPush={(path: string) => {
          // Notification URLs are absolute; keep navigation in-app.
          try {
            const url = new URL(path, window.location.origin);
            router.push(url.origin === window.location.origin ? url.pathname + url.search : path);
          } catch {
            router.push(path);
          }
        }}
        appearance={{
          variables: {
            colorPrimary: "var(--primary)",
            colorForeground: "var(--foreground)",
            colorSecondaryForeground: "var(--muted-foreground)",
            colorBackground: "var(--card)",
            colorNeutral: "var(--border)",
            colorCounter: "#ff7759",
            borderRadius: "8px",
          },
        }}
      />
    </div>
  );
}
