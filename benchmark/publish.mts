// Publishes Receipt Lab as static files in public/benchmark/, so the deployed app serves it at /benchmark.
// Runs before `next build` (see package.json). Reads the saved results; makes no model calls.
//
//   pnpm bench:publish
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dashboardData } from "./server.mts";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..");
const OUT = path.join(ROOT, "public", "benchmark");
const BASE = "/benchmark/";

await rm(OUT, { recursive: true, force: true });
await mkdir(path.join(OUT, "dataset"), { recursive: true });
await mkdir(path.join(OUT, "fonts"), { recursive: true });

// The page, pointed at /benchmark/ instead of the local server's root.
const html = (await readFile(path.join(DIR, "web/index.html"), "utf8"))
  .replace('data-base="/"', `data-base="${BASE}"`)
  .replace(/(href|src)="\/(?!\/)/g, `$1="${BASE}`);
await writeFile(path.join(OUT, "index.html"), html);

for (const f of ["app.js", "styles.css", "icons.svg", "favicon.svg"]) await cp(path.join(DIR, "web", f), path.join(OUT, f));
for (const f of ["Geist-Variable.ttf", "FragmentMono-Regular.ttf"]) await cp(path.join(ROOT, "src/fonts", f), path.join(OUT, "fonts", f));

// The same data the local server builds for /api/data, plus the raw results for download.
await writeFile(path.join(OUT, "data.json"), JSON.stringify(await dashboardData()));
await cp(path.join(DIR, "results.json"), path.join(OUT, "results.json"));

const images = (await readdir(path.join(DIR, "dataset"))).filter((f) => f.endsWith(".png"));
await Promise.all(images.map((f) => cp(path.join(DIR, "dataset", f), path.join(OUT, "dataset", f))));

console.log(`Published Receipt Lab to public/benchmark/ (${images.length} bills) → served at ${BASE}`);
