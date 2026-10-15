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
    .default("https://api.tokenfactory.us-north1.nebius.com/v1/"),
  NEBIUS_MODEL: z.string().default("nvidia/Nemotron-3.5-Super-VL"),
  /** How reasoning is switched on/off: "chat_template_kwargs" (enable_thinking) or "none" to never send it. Read in ai/nebius.ts. */
  AI_REASONING_PARAM: z.enum(["chat_template_kwargs", "none"]).default("chat_template_kwargs"),
  DATABASE_URL: z.string().default("file:local.db"),
  DATABASE_AUTH_TOKEN: optional,
  BETTER_AUTH_SECRET: optional,
  BETTER_AUTH_URL: optional,
  NOVU_SECRET_KEY: optional,
  /** Novu Application Identifier. Read on the server and passed to the bell; no NEXT_PUBLIC_ prefix needed. */
  NOVU_APP_ID: optional,
  NOVU_WORKFLOW_ID: z.string().default("splitter-activity"),
  /** Daily AI credits per signed-in account (a bill read or a question = 1, a "Settle with AI" plan = 3). */
  AI_CREDITS_PER_USER_PER_DAY: z.coerce.number().int().min(0).default(30),
});

// Vercel preview deployments get a new URL each time: fall back to it when BETTER_AUTH_URL isn't set.
const vercelPreviewUrl =
  process.env.VERCEL_ENV === "preview" && (process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL)
    ? `https://${process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL}`
    : undefined;

export const env = schema.parse({
  ...process.env,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || vercelPreviewUrl,
  // Older setups used NEXT_PUBLIC_NOVU_APP_ID; still accepted.
  NOVU_APP_ID: process.env.NOVU_APP_ID || process.env.NEXT_PUBLIC_NOVU_APP_ID,
});

const isProdRuntime = process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";

/** Settings production can't run safely without. Development warns instead. */
function requireInProd(ok: boolean, msg: string) {
  if (ok) return;
  if (isProdRuntime) throw new Error(msg);
  console.warn(`⚠ ${msg}`);
}

// Notifications are part of the product: members learn their share from them.
requireInProd(
  Boolean(env.NOVU_SECRET_KEY && env.NOVU_APP_ID),
  "NOVU_SECRET_KEY and NOVU_APP_ID are required for notifications (see README → Notifications).",
);
if (process.env.NODE_ENV === "production") {
  requireInProd((env.BETTER_AUTH_SECRET?.length ?? 0) >= 32, "BETTER_AUTH_SECRET must be set to a random value of 32+ characters (openssl rand -base64 32).");
  requireInProd(Boolean(env.BETTER_AUTH_URL?.startsWith("https://")), "BETTER_AUTH_URL must be your public https:// URL.");
  requireInProd(!env.DATABASE_URL.startsWith("file:"), "DATABASE_URL must point at Turso (libsql://…) in production; serverless disks are not persistent.");
}

export const features = {
  scanning: Boolean(env.NEBIUS_API_KEY),
  notifications: Boolean(env.NOVU_SECRET_KEY && env.NOVU_APP_ID),
};
