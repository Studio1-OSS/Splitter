import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { SplitWizard } from "@/components/split/split-wizard";
import { site } from "@/config/site";
import { features } from "@/env";
import { myCreditsLeft } from "@/server/ai/request";

export const metadata: Metadata = { title: "Quick split" };

export default async function QuickSplitPage() {
  const credits = features.scanning ? await myCreditsLeft() : null;
  return (
    <>
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 pt-[env(safe-area-inset-top)] sm:px-6">
        <Logo />
        <Link href="/sign-in" className="text-sm underline-offset-4 hover:underline">
          Sign in
        </Link>
      </header>
      <SplitWizard mode={{ kind: "guest", defaultCurrency: site.defaultCurrency }} scanEnabled={features.scanning && (credits?.limit ?? 0) > 0} credits={credits} />
    </>
  );
}
