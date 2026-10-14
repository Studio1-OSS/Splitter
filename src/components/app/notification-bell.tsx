"use client";

import { Inbox } from "@novu/nextjs";
import { useRouter } from "next/navigation";
import { BellIcon } from "@/components/ui/icons";

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
        renderBell={({ total }) => (
          <span className="relative inline-flex size-9 items-center justify-center rounded-pill text-foreground transition-colors hover:bg-muted max-md:size-11">
            <BellIcon className="size-[19px]" />
            {total > 0 && (
              <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-[10px] leading-none text-white tabular ring-2 ring-background max-md:right-2 max-md:top-2">
                {total > 9 ? "9+" : total}
              </span>
            )}
            <span className="sr-only">{total > 0 ? `${total} unread notifications` : "Notifications"}</span>
          </span>
        )}
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
