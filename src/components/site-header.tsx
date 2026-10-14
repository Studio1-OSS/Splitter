import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
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

/** Three-zone nav from DESIGN.md: logo left, links centred, actions right; compact menu on phones. */
export async function SiteHeader() {
  const user = await getSessionUser();
  return (
    <header className="sticky top-0 z-40 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
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
            <Button asChild size="sm">
              <Link href="/dashboard">Open app</Link>
            </Button>
          ) : (
            <>
              <Link href="/sign-in" className="text-sm max-md:hidden">
                Sign in
              </Link>
              <Button asChild size="sm" className="max-md:hidden">
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
