import "server-only";
import { headers } from "next/headers";
import { env, features } from "@/env";
import { getSessionUser, type SessionUser } from "../auth";
import { isUnmigratedError, UNMIGRATED_MESSAGE } from "../db";
import { AI_COSTS, creditsLeft, hashKey, spendCredits, type AiAction } from "../rate-limit";
import type { NebiusConfig } from "./nebius";
import { sniffImageType } from "@/lib/image-sniff";

export { sniffImageType };

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request body limit is 4.5 MB.
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const apiError = (status: number, message: string) => Response.json({ error: message }, { status });

export const aiConfig = (): NebiusConfig => ({
  apiKey: env.NEBIUS_API_KEY!,
  baseURL: env.NEBIUS_BASE_URL,
  model: env.NEBIUS_MODEL,
});

/** The quota key and daily limit for the current visitor: per account, or per IP for guests. */
export async function creditAccount(user: SessionUser | null) {
  if (user) return { key: `user:${user.id}`, limit: env.AI_CREDITS_PER_USER_PER_DAY, guest: false };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return { key: `ip:${await hashKey(ip)}`, limit: env.AI_CREDITS_PER_GUEST_PER_DAY, guest: true };
}

/** Credits the signed-in user (or guest) has left today. */
export async function myCreditsLeft() {
  const account = await creditAccount(await getSessionUser());
  return { left: await creditsLeft(account.key, account.limit), limit: account.limit };
}

/**
 * Shared gate for every AI endpoint: feature flag, optional sign-in requirement and the daily credit
 * allowance. Call it only after validating the request, so rejected uploads don't use credits.
 */
export async function aiGuard(
  action: AiAction,
  opts: { requireUser?: boolean } = {},
): Promise<{ ok: true; user: SessionUser | null; creditsLeft: number } | { ok: false; response: Response }> {
  if (!features.scanning) {
    return { ok: false, response: apiError(503, "AI features are not configured. Set NEBIUS_API_KEY, or enter details manually.") };
  }
  const user = await getSessionUser();
  if (opts.requireUser && !user) return { ok: false, response: apiError(401, "Sign in to use this") };

  const account = await creditAccount(user);
  const cost = AI_COSTS[action];
  let spent: boolean;
  try {
    spent = await spendCredits(account.key, cost, account.limit);
  } catch (e) {
    if (isUnmigratedError(e)) return { ok: false, response: apiError(503, UNMIGRATED_MESSAGE) };
    throw e;
  }
  if (!spent) {
    const left = await creditsLeft(account.key, account.limit);
    return {
      ok: false,
      response: apiError(
        429,
        account.guest
          ? account.limit === 0
            ? "Sign in to use AI scanning. You can still enter items manually."
            : "Guest AI limit reached for today. Sign in for more, or enter items manually."
          : `Not enough AI credits today (${left} left, this needs ${cost}). Credits reset at midnight UTC; you can still enter things manually.`,
      ),
    };
  }
  return { ok: true, user, creditsLeft: await creditsLeft(account.key, account.limit) };
}

/** Reads `image` fields from multipart form data and returns base64 data URLs. */
export async function readImages(
  request: Request,
  max: number,
): Promise<{ ok: true; dataUrls: string[]; form: FormData } | { ok: false; response: Response }> {
  const form = await request.formData().catch(() => null);
  const files = (form?.getAll("image") ?? []).filter((f): f is File => f instanceof File);
  if (!form || files.length === 0) return { ok: false, response: apiError(400, "Attach an image") };
  if (files.length > max) return { ok: false, response: apiError(400, `At most ${max} images at a time`) };
  let total = 0;
  for (const f of files) {
    if (!TYPES.has(f.type)) return { ok: false, response: apiError(415, "Use JPEG, PNG or WebP images") };
    if (f.size === 0) return { ok: false, response: apiError(400, "An image is empty") };
    total += f.size;
  }
  if (total > MAX_BYTES) return { ok: false, response: apiError(413, "The images are too large (4 MB max in total).") };
  const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
  // Check the real file signature, not just the declared type, so renamed files are rejected.
  if (buffers.some((b, i) => sniffImageType(b) !== files[i].type)) {
    return { ok: false, response: apiError(415, "That file isn't a real JPEG, PNG or WebP image") };
  }
  const dataUrls = buffers.map((b, i) => `data:${files[i].type};base64,${b.toString("base64")}`);
  return { ok: true, dataUrls, form };
}
