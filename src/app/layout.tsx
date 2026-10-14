import { env } from "@/env";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import { site } from "@/config/site";
import "./globals.css";

// Typefaces from the design system: a display face, a UI face and a mono face for labels.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", weight: ["400", "500"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400"] });

export const metadata: Metadata = {
  metadataBase: new URL(env.BETTER_AUTH_URL ?? "http://localhost:3000"),
  title: { default: `${site.name} — ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
  openGraph: { title: site.name, description: site.description, type: "website" },
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#17171c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster position="top-center" closeButton toastOptions={{ classNames: { toast: "!rounded-sm !shadow-none !border-hairline" } }} />
      </body>
    </html>
  );
}
