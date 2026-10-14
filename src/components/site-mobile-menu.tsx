"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { GitHubIcon } from "./github-icon";

export function MobileMenu({ signedIn, links, repoUrl }: { signedIn: boolean; links: { href: string; label: string }[]; repoUrl: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Menu" className="md:hidden">
          <Menu className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent title="Menu">
        <nav className="-mx-2 grid">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex h-12 items-center rounded-sm px-2 text-lg hover:bg-muted">
              {l.label}
            </Link>
          ))}
          <a href={repoUrl} target="_blank" rel="noreferrer" className="flex h-12 items-center gap-2 rounded-sm px-2 text-lg hover:bg-muted">
            <GitHubIcon className="size-5" /> GitHub
          </a>
        </nav>
        <div className="grid gap-2">
          {signedIn ? (
            <Button asChild size="lg">
              <Link href="/dashboard">Open app</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="lg">
                <Link href="/split">Start splitting</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
