// Standalone, local-only dashboard. Deliberately exposes a small allowlist;
// neither .env nor source files are served, and no AI calls run from the UI.
import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeSplit } from "../src/lib/money/allocate.ts";
import { toMinor } from "../src/lib/money/format.ts";

const DIR = path.dirname(fileURLToPath(import.meta.url));
type DatasetCase = {
  id: string; file: string; set?: string; source?: string; people: string[]; note: string; planted: boolean;
  truth: {
    merchant: string | null; currency: string; items: { name: string; quantity: number; totalPrice: number }[];
    assignment: string[][]; total: number; correctTotal: number;
    tax: number | null; tip: number | null; serviceCharge: number | null; discount: number | null;
  };
};

export async function dashboardData() {
  const [resultsText, reasoningText, syntheticText, realText, holdoutText] = await Promise.all([
    readFile(path.join(DIR, "results.json"), "utf8"),
    readFile(path.join(DIR, "results-reasoning.json"), "utf8").catch(() => null),
    readFile(path.join(DIR, "dataset/cases.json"), "utf8"),
    readFile(path.join(DIR, "dataset/real/cases.json"), "utf8").catch(() => "[]"),
    readFile(path.join(DIR, "dataset/holdout/cases.json"), "utf8").catch(() => "[]"),
  ]);
  const cases: DatasetCase[] = [
    ...JSON.parse(syntheticText).map((c: DatasetCase) => ({ ...c, set: "synthetic" })),
    ...JSON.parse(realText).map((c: DatasetCase) => ({ ...c, set: "real" })),
    ...JSON.parse(holdoutText).map((c: DatasetCase) => ({ ...c, set: "holdout" })),
  ];
  return {
    ...JSON.parse(resultsText),
    // The same bills with the model's reasoning on, for the off/on comparison (when it has been run).
    reasoningOn: reasoningText ? JSON.parse(reasoningText) : null,
    cases: cases.map((c) => {
      const minor = (value: number | null) => toMinor(value ?? 0, c.truth.currency);
      const split = computeSplit({
        memberIds: c.people,
        items: c.truth.items.map((item, i) => ({
          id: String(i), amount: minor(item.totalPrice),
          assignees: [...c.truth.assignment[i]].sort((x, y) => c.people.indexOf(x) - c.people.indexOf(y)).map((memberId) => ({ memberId, weight: 1 })),
        })),
        tax: minor(c.truth.tax), tip: minor(c.truth.tip),
        serviceCharge: minor(c.truth.serviceCharge), discount: minor(c.truth.discount),
      });
      return { ...c, expected: split, printedTotalMinor: minor(c.truth.total) };
    }),
  };
}

const assets: Record<string, [string, string]> = {
  "/": ["web/index.html", "text/html; charset=utf-8"],
  "/app.js": ["web/app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["web/styles.css", "text/css; charset=utf-8"],
  "/icons.svg": ["web/icons.svg", "image/svg+xml"],
  "/results.json": ["results.json", "application/json; charset=utf-8"],
  "/results-reasoning.json": ["results-reasoning.json", "application/json; charset=utf-8"],
  "/results.md": ["results.md", "text/plain; charset=utf-8"],
  "/README.md": ["README.md", "text/plain; charset=utf-8"],
  "/favicon.svg": ["web/favicon.svg", "image/svg+xml"],
  // The app's self-hosted fonts (SIL OFL), shared with the dashboard.
  "/fonts/Geist-Variable.ttf": ["../src/fonts/Geist-Variable.ttf", "font/ttf"],
  "/fonts/FragmentMono-Regular.ttf": ["../src/fonts/FragmentMono-Regular.ttf", "font/ttf"],
};

export function createDashboardServer() {
  return createHttpServer(async (req, res) => {
    const headers = {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    };
    // The server is loopback-only; reject rebinding hosts as well.
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? "")) {
      res.writeHead(403, headers).end("Localhost only"); return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { ...headers, Allow: "GET, HEAD" }).end(); return;
    }
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    try {
      if (pathname === "/api/data" || pathname === "/data.json") {
        const data = JSON.stringify(await dashboardData());
        res.writeHead(200, { ...headers, "Content-Type": "application/json; charset=utf-8" });
        res.end(req.method === "HEAD" ? undefined : data); return;
      }
      const asset = (Object.hasOwn(assets, pathname) ? assets[pathname] : undefined) ?? (/^\/dataset\/[a-z]+-\d{2}\.png$/.test(pathname)
        ? [pathname.slice(1), "image/png"] : /^\/dataset\/(real\/real|holdout\/holdout)-\d{3}\.jpg$/.test(pathname) ? [pathname.slice(1), "image/jpeg"] : undefined);
      if (!asset) { res.writeHead(404, headers).end("Not found"); return; }
      const body = await readFile(path.join(DIR, asset[0]));
      res.writeHead(200, { ...headers, "Content-Type": asset[1] });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      res.writeHead(missing ? 404 : 500, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
      res.end(missing ? "Saved data or asset missing. See benchmark/README.md." : "Unable to load dashboard data.");
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portFlag = process.argv.indexOf("--port");
  const port = Number(portFlag >= 0 ? process.argv[portFlag + 1] : process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Choose a port from 1 to 65535.");
  const server = createDashboardServer();
  server.on("error", (error) => { console.error(`Could not start bench: ${error.message}`); process.exit(1); });
  server.listen(port, "127.0.0.1", () => console.log(`\n  Receipt Lab → http://localhost:${port}\n  Saved benchmark results · no AI calls\n`));
}
