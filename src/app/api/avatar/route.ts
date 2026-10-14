import { headers } from "next/headers";
import { auth, requireUserForApi } from "@/server/auth";
import { apiError } from "@/server/ai/request";
import { db } from "@/server/db";
import { removeAvatar, setAvatar } from "@/server/services/avatars";
import { AppError } from "@/server/services/errors";

export const runtime = "nodejs";

/** Refresh the cached session so the header shows the new photo straight away. */
async function syncSession(image: string | null) {
  await auth.api.updateUser({ body: { image }, headers: await headers() });
}

/** Sets the caller's profile photo (multipart: image, compressed in the browser). */
export async function POST(request: Request) {
  const user = await requireUserForApi();
  if (!user) return apiError(401, "Sign in first");
  const image = (await request.formData().catch(() => null))?.get("image");
  if (!(image instanceof File)) return apiError(400, "Missing image");
  try {
    const url = await setAvatar(db, user.id, { mime: image.type, bytes: Buffer.from(await image.arrayBuffer()) });
    await syncSession(url);
    return Response.json({ image: url });
  } catch (e) {
    if (e instanceof AppError) return apiError(e.status, e.message);
    throw e;
  }
}

export async function DELETE() {
  const user = await requireUserForApi();
  if (!user) return apiError(401, "Sign in first");
  await removeAvatar(db, user.id);
  await syncSession(null);
  return Response.json({ image: null });
}
