import { AppHeader } from "@/components/app/app-header";
import { MobileNav } from "@/components/app/mobile-nav";
import { LiveRefresh } from "@/components/app/live-refresh";
import { env, features } from "@/env";
import { getSessionUser } from "@/server/auth";
import { db } from "@/server/db";
import { myCreditsLeft } from "@/server/ai/request";
import { subscriberHash } from "@/server/notify";
import { listGroupsForUser } from "@/server/services/groups";

// Pages inside (app) check auth themselves so /join can show a friendly page to signed-out visitors.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const novu =
    user && features.notifications ? { appId: env.NOVU_APP_ID!, subscriberHash: subscriberHash(user.id)! } : null;
  const groups = user ? (await listGroupsForUser(db, user.id)).map(({ id, name, emoji }) => ({ id, name, emoji })) : [];
  const credits = user && features.scanning ? await myCreditsLeft() : null;

  const live = user && novu ? { appId: novu.appId, subscriberId: user.id, subscriberHash: novu.subscriberHash } : null;

  return (
    <LiveRefresh novu={live}>
      {user && <AppHeader user={user} novu={novu} credits={credits} />}
      <main className="mx-auto w-full max-w-5xl px-4 pb-tabbar pt-6 sm:px-6 sm:pt-10 md:pb-24">{children}</main>
      {user && <MobileNav user={user} groups={groups} credits={credits} />}
    </LiveRefresh>
  );
}
