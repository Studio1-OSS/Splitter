import Link from "next/link";
import { site } from "@/config/site";
import { GitHubIcon } from "./github-icon";

/** Dark footer on the landing page's black canvas, divided off by a hairline. Fixed colours so it stays dark in both themes. */
export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-14 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr]">
        <div>
          <p className="eyebrow text-[#ff7759]">Free and open source</p>
          <p className="mt-3 max-w-sm font-display text-3xl leading-tight">Split anything with anyone. No spreadsheets, no awkward maths.</p>
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-pill border border-white/20 bg-white/[0.08] px-5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] backdrop-blur-xl transition hover:border-white/35 hover:bg-white/[0.14]"
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
          <a href={site.studioUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-white">
            <Studio1Logo className="size-5" />
            Built by the Studio1 team
          </a>
        </div>
      </div>
    </footer>
  );
}

/** The Studio1 mark. */
function Studio1Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" aria-hidden className={className}>
      <defs>
        <linearGradient id="studio1-mark" x1="0" y1="0" x2="160" y2="160" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 35C0 16.6807 14.0744 1.64844 32 0.126953V141H51.0523C52.4308 137.344 54.7446 133.689 57.9938 130.033C61.1446 126.508 64.6892 123.44 68.6277 120.829C72.5662 118.349 76.3569 116.782 80 116.129V86.7544C75.4708 87.9292 71.3846 89.6919 67.7415 92.0415C64 94.5225 60.7508 97.46 57.9938 100.854C56.5345 102.72 55.2545 104.659 54.1539 106.671V0H125C144.33 0 160 15.6699 160 35V125C160 144.33 144.33 160 125 160H124V18H104.948C103.569 21.6816 101.255 25.3628 98.0062 29.0444C94.8554 32.5942 91.3108 35.6841 87.3723 38.314C83.4338 40.812 79.6431 42.3896 76 43.0474V72.6304C80.5292 71.4473 84.6154 69.6724 88.2585 67.3057C92 64.8076 95.2492 61.8491 98.0062 58.4307C99.4655 56.5513 100.745 54.5986 101.846 52.5723V160H35C15.67 160 0 144.33 0 125V35Z"
        fill="url(#studio1-mark)"
      />
    </svg>
  );
}
