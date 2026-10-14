import "server-only";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v : undefined));

const schema = z.object({
  NEBIUS_API_KEY: optional,
  NEBIUS_BASE_URL: z
    .string()
    .url()
    .default("https://api.tokenfactory.nebius.com/v1/"),
  NEBIUS_MODEL: z.string().default("Qwen/Qwen3.8-27B"),
  DATABASE_URL: z.string().default("file:local.db"),
  DATABASE_AUTH_TOKEN: optional,
  BETTER_AUTH_SECRET: optional,
  BETTER_AUTH_URL: optional,
  NOVU_SECRET_KEY: optional,
  NEXT_PUBLIC_NOVU_APP_ID: optional,
  NOVU_WORKFLOW_ID: z.string().default("splitter-activity"),
  /** Daily AI credits per signed-in account (a bill read or a question = 1, a "Settle with AI" plan = 3). */
  AI_CREDITS_PER_USER_PER_DAY: z.coerce.number().int().min(0).default(30),
  /** Daily AI credits per guest (by IP), for quick-split scans. 0 turns guest scanning off. */
  AI_CREDITS_PER_GUEST_PER_DAY: z.coerce.number().int().min(0).default(3),
});

export const env = schema.parse(process.env);

const isProdRuntime = process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";

/** Settings production can't run safely without. Development warns instead. */
function requireInProd(ok: boolean, msg: string) {
  if (ok) return;
  if (isProdRuntime) throw new Error(msg);
  console.warn(`⚠ ${msg}`);
}

// Notifications are part of the product: members learn their share from them.
requireInProd(
  Boolean(env.NOVU_SECRET_KEY && env.NEXT_PUBLIC_NOVU_APP_ID),
  "NOVU_SECRET_KEY and NEXT_PUBLIC_NOVU_APP_ID are required for notifications (see README → Notifications).",
);
if (process.env.NODE_ENV === "production") {
  requireInProd((env.BETTER_AUTH_SECRET?.length ?? 0) >= 32, "BETTER_AUTH_SECRET must be set to a random value of 32+ characters (openssl rand -base64 32).");
  requireInProd(Boolean(env.BETTER_AUTH_URL?.startsWith("https://")), "BETTER_AUTH_URL must be your public https:// URL.");
  requireInProd(!env.DATABASE_URL.startsWith("file:"), "DATABASE_URL must point at Turso (libsql://…) in production; serverless disks are not persistent.");
}

export const features = {
  scanning: Boolean(env.NEBIUS_API_KEY),
  notifications: Boolean(env.NOVU_SECRET_KEY && env.NEXT_PUBLIC_NOVU_APP_ID),
};
