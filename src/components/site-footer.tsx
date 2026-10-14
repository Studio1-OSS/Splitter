import Link from "next/link";
import { site } from "@/config/site";
import { GitHubIcon } from "./github-icon";

/** Dark footer (the design system footer band). Fixed colours so it stays dark in both themes. */
export function SiteFooter() {
  return (
    <footer className="bg-[#17171c] text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-14 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr]">
        <div>
          <p className="eyebrow text-[#ff7759]">Free and open source</p>
          <p className="mt-3 max-w-sm font-display text-3xl leading-tight">Split anything with anyone. No spreadsheets, no awkward maths.</p>
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-pill bg-white px-5 text-sm font-medium text-[#17171c] hover:bg-white/85"
          >
            <GitHubIcon /> Star on GitHub
          </a>
        </div>
        <div className="grid content-start gap-2 text-sm">
          <p className="eyebrow mb-1 text-white/50">Product</p>
          <Link href="/split" className="text-white/70 hover:text-white">
            Quick split
          </Link>
          <Link href="/sign-up" className="text-white/70 hover:text-white">
            Create a group
          </Link>
          <Link href="/#features" className="text-white/70 hover:text-white">
            Features
          </Link>
          <Link href="/sign-in" className="text-white/70 hover:text-white">
            Sign in
          </Link>
        </div>
        <div className="grid content-start gap-2 text-sm">
          <p className="eyebrow mb-1 text-white/50">Open source</p>
          <a href={site.repoUrl} target="_blank" rel="noreferrer" className="text-white/70 hover:text-white">
            GitHub
          </a>
          <a href={`${site.repoUrl}#get-started`} target="_blank" rel="noreferrer" className="text-white/70 hover:text-white">
            Self-host it
          </a>
          <a href={`${site.repoUrl}/blob/main/LICENSE`} target="_blank" rel="noreferrer" className="text-white/70 hover:text-white">
            MIT licence
          </a>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/50 md:col-span-3">
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 64 64" aria-hidden className="size-5">
              <rect width="64" height="64" rx="16" fill="#ffffff" />
              <path d="M30 14A18 18 0 1 0 50 34H30Z" fill="#17171c" />
              <path d="M34.5 10.5A20 20 0 0 1 53.5 29.5H34.5Z" fill="#ff7759" />
            </svg>
            {site.name} · MIT
          </span>
          <a href={site.studioUrl} target="_blank" rel="noreferrer" className="hover:text-white">
            Built by the Studio1 team
          </a>
        </div>
      </div>
    </footer>
  );
}
