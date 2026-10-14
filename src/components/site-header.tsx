import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { site } from "@/config/site";
import { getSessionUser } from "@/server/auth";
import { GitHubIcon } from "./github-icon";
import { MobileMenu } from "./site-mobile-menu";

export const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#reads", label: "What it reads" },
  { href: "/#features", label: "Features" },
  { href: "/#faq", label: "FAQ" },
];

/**
 * Three-zone nav from the design system: logo left, links centred, actions right; compact menu on phones.
 * `overlay` makes it translucent glass, for pages that start with a full-bleed photo.
 */
export async function SiteHeader({ overlay }: { overlay?: boolean } = {}) {
  const user = await getSessionUser();
  return (
    <header className={cn("sticky top-0 z-40 pt-[env(safe-area-inset-top)]", overlay ? "bg-background/30 backdrop-blur-xl" : "bg-background/90 backdrop-blur")}>
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden justify-center gap-7 text-sm md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-foreground/80 hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="col-start-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="max-md:hidden">
            <a href={site.repoUrl} target="_blank" rel="noreferrer">
              <GitHubIcon /> GitHub
            </a>
          </Button>
          {user ? (
            <Button asChild size="sm" variant={overlay ? "glass" : "default"}>
              <Link href="/dashboard">Open app</Link>
            </Button>
          ) : (
            <>
              <Link href="/sign-in" className="text-sm max-md:hidden">
                Sign in
              </Link>
              <Button asChild size="sm" variant={overlay ? "glass" : "default"} className="max-md:hidden">
                <Link href="/split">Start splitting</Link>
              </Button>
            </>
          )}
          <MobileMenu signedIn={Boolean(user)} links={NAV} repoUrl={site.repoUrl} />
        </div>
      </div>
    </header>
  );
}
