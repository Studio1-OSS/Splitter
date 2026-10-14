import "server-only";
import { createHmac } from "node:crypto";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { Novu } from "@novu/api";
import { after } from "next/server";
import { env, features } from "@/env";
import { db, schema } from "./db";

let novu: Novu | undefined;
const client = () => (novu ??= new Novu({ secretKey: env.NOVU_SECRET_KEY! }));

/** HMAC so the Inbox can only load the signed-in user's own feed. */
export function subscriberHash(userId: string): string | undefined {
  if (!features.notifications) return undefined;
  return createHmac("sha256", env.NOVU_SECRET_KEY!).update(userId).digest("hex");
}

/**
 * Sends an in-app notification (and, via the workflow, a follow-up email) to every member of a group who has an account, except the actor.
 * Best effort: failures are logged and never block the action that triggered them.
 * `eventId` is passed as Novu's transactionId so retries don't double-notify.
 */
export async function notifyGroup(opts: {
  groupId: string;
  actorUserId: string;
  eventId: string;
  title: string;
  body: string | ((recipientMemberId: string) => string);
  url: string;
  /** Extra per-recipient template variables (e.g. billTitle, yourShare) for custom Novu workflows. */
  extra?: (recipientMemberId: string) => Record<string, string | number>;
}) {
  if (!features.notifications) return;
  // Deliver after the response is sent, so a slow or failing Novu never delays saving.
  after(() => deliver(opts));
}

async function deliver(opts: Parameters<typeof notifyGroup>[0]) {
  try {
    const recipients = await db
      .select({ memberId: schema.members.id, userId: schema.members.userId, name: schema.members.displayName, email: schema.user.email })
      .from(schema.members)
      .innerJoin(schema.user, eq(schema.user.id, schema.members.userId))
      .where(
        and(
          eq(schema.members.groupId, opts.groupId),
          isNotNull(schema.members.userId),
          ne(schema.members.userId, opts.actorUserId),
        ),
      );
    const base = env.BETTER_AUTH_URL ?? "";
    await Promise.all(
      recipients.map((r) =>
        client().trigger({
          workflowId: env.NOVU_WORKFLOW_ID,
          transactionId: `${opts.eventId}:${r.userId}`,
          // Email on the subscriber lets the workflow's email step reach them; Novu upserts it on each trigger.
          to: { subscriberId: r.userId!, firstName: r.name, email: r.email },
          payload: {
            title: opts.title,
            body: typeof opts.body === "function" ? opts.body(r.memberId) : opts.body,
            url: `${base}${opts.url}`,
            actionUrl: `${base}${opts.url}`,
            ...opts.extra?.(r.memberId),
          },
        }),
      ),
    );
  } catch (error) {
    console.error("Notification delivery failed", error);
  }
}
