import type { Metadata } from "next";
import Link from "next/link";
import { JoinForm } from "@/components/group/join-form";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { getSessionUser } from "@/server/auth";
import { db } from "@/server/db";
import { loadOr404 } from "@/server/load";
import { getInvite } from "@/server/services/groups";

export const metadata: Metadata = { title: "Join group" };

export default async function JoinPage({ params }: { params: Promise<{ inviteToken: string }> }) {
  const { inviteToken } = await params;
  const [invite, user] = await Promise.all([loadOr404(() => getInvite(db, inviteToken)), getSessionUser()]);
  const next = encodeURIComponent(`/join/${inviteToken}`);

  return (
    <div className="mx-auto grid max-w-md gap-6 py-6">
      {!user && <Logo className="justify-self-center" />}
      <Card tone="stone" className="rounded-lg p-6 text-center sm:p-10">
        <span className="mx-auto flex size-16 items-center justify-center rounded-sm bg-card text-4xl">{invite.group.emoji}</span>
        <p className="eyebrow mt-6 text-muted-foreground">You&apos;re invited to join</p>
        <h1 className="mt-2 text-4xl">{invite.group.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{invite.memberCount} people splitting expenses</p>

        {user ? (
          <JoinForm inviteToken={inviteToken} placeholders={invite.placeholders} userName={user.name} />
        ) : (
          <div className="mt-8 grid gap-2">
            <Button size="lg" asChild>
              <Link href={`/sign-up?next=${next}`}>Create account & join</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="bg-card">
              <Link href={`/sign-in?next=${next}`}>I already have an account</Link>
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
