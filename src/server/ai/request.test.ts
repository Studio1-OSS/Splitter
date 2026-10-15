import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/env", () => ({ env: {}, features: { scanning: true } }));
vi.mock("../auth", () => ({ getSessionUser: async () => null }));
vi.mock("../rate-limit", () => ({}));
vi.mock("../db", () => ({ isUnmigratedError: () => false, UNMIGRATED_MESSAGE: "" }));

const { readImages, sniffImageType } = await import("./request");

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const req = (files: File[]) => {
  const form = new FormData();
  for (const f of files) form.append("image", f);
  return new Request("http://x/api/extract", { method: "POST", body: form });
};

describe("upload boundaries", () => {
  it("sniffs real image types", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
  });

  it("rejects renamed files, wrong types, empty files and too many images", async () => {
    const fake = new File([new TextEncoder().encode("hello not an image")], "x.png", { type: "image/png" });
    expect((await readImages(req([fake]), 4)).ok).toBe(false);
    const pdf = new File([new TextEncoder().encode("%PDF-1.7")], "x.pdf", { type: "application/pdf" });
    const r1 = await readImages(req([pdf]), 4);
    expect(r1.ok || r1.response.status).toBe(415);
    const empty = new File([], "x.png", { type: "image/png" });
    expect((await readImages(req([empty]), 4)).ok).toBe(false);
    const ok = new File([PNG], "x.png", { type: "image/png" });
    const many = await readImages(req([ok, ok, ok, ok, ok]), 4);
    expect(many.ok || many.response.status).toBe(400);
  });

  it("accepts real images", async () => {
    const r = await readImages(req([new File([PNG], "a.png", { type: "image/png" }), new File([JPEG], "b.jpg", { type: "image/jpeg" })]), 4);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dataUrls[0]).toMatch(/^data:image\/png;base64,/);
  });
});
