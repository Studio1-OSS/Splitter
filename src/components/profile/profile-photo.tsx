"use client";

import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/primitives";
import { compressImage, FOR_AVATAR } from "@/lib/image";
import { cn } from "@/lib/utils";

/** The signed-in user's photo beside the dashboard greeting; tap to upload, change or remove it. */
export function ProfilePhoto({ name, image }: { name: string; image: string | null }) {
  const router = useRouter();
  const input = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<"upload" | "remove" | null>(null);

  async function upload(file: File) {
    setPending("upload");
    try {
      const body = new FormData();
      body.set("image", await compressImage(file, FOR_AVATAR), "avatar.jpg");
      const res = await fetch("/api/avatar", { method: "POST", body });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't save your photo");
      toast.success("Profile photo updated");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your photo");
    } finally {
      setPending(null);
    }
  }

  async function remove() {
    setPending("remove");
    const res = await fetch("/api/avatar", { method: "DELETE" });
    setPending(null);
    if (!res.ok) return toast.error("Couldn't remove your photo");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={image ? "Change profile photo" : "Add a profile photo"}
          className="group relative -m-1.5 shrink-0 rounded-full p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar name={name} src={image} className="size-9" />
          {/* Camera hint on hover, so the photo itself stays clean. */}
          <span className="absolute inset-1.5 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Camera className="size-3.5" />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent glass title="Profile photo" description="People in your groups see it next to your name.">
        <div className="flex justify-center py-2">
          <Avatar name={name} src={image} size="lg" className="size-28 text-3xl" />
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
        <div className={cn("grid gap-2", image && "sm:grid-cols-2")}>
          <Button size="lg" loading={pending === "upload"} disabled={pending !== null} onClick={() => input.current?.click()}>
            <ImagePlus /> {image ? "Change photo" : "Upload photo"}
          </Button>
          {image && (
            <Button size="lg" variant="outline" loading={pending === "remove"} disabled={pending !== null} onClick={remove}>
              <Trash2 /> Remove
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
