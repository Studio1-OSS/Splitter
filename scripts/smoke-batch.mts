// End-to-end check of "Settle with AI" against your Nebius key:
// stage 1 reads real receipt photos (vision), stage 2 plans the split from the bills + notes (reasoning).
//
//   pnpm smoke:batch
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { extractReceiptWithNebius } from "../src/server/ai/nebius.ts";
import { planSettlement } from "../src/server/ai/planner.ts";

const config = {
  apiKey: process.env.NEBIUS_API_KEY ?? "",
  baseURL: process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/",
  model: process.env.NEBIUS_MODEL || "Qwen/Qwen3.8-27B",
};
if (!config.apiKey) {
  console.error("✗ NEBIUS_API_KEY is not set");
  process.exit(1);
}

const BILLS = ["receipt-beach-shack.png", "hotel-invoice-page-1.png,hotel-invoice-page-2.png", "taxi-1.png", "taxi-2.png", "note-handwritten.png"];
const toDataUrl = async (file: string) =>
  `data:image/png;base64,${(await readFile(new URL(`../evals/fixtures/${file}`, import.meta.url))).toString("base64")}`;

console.log("Stage 1 · reading bills with vision…");
const bills = await Promise.all(
  BILLS.map(async (files, i) => {
    const t = Date.now();
    const receipt = await extractReceiptWithNebius(config, await Promise.all(files.split(",").map(toDataUrl)));
    console.log(`  #${i + 1} ${receipt.merchant} · ${receipt.currency} ${receipt.total} · ${receipt.items.length} lines · ${receipt.kind} (${Date.now() - t}ms)`);
    return { no: i + 1, receipt };
  }),
);

const members = [
  { ref: "m1", name: "Aman", isMe: false },
  { ref: "m2", name: "Rakesh", isMe: false },
  { ref: "m3", name: "Mahima", isMe: true },
  { ref: "m4", name: "Priya", isMe: false },
];
const scenarios = [
  { groupName: "Goa trip", groupKind: "trip", notes: "Aman paid #1 and #2. Rakesh paid both taxis. Priya didn't drink, leave her out of the Kingfishers." },
  { groupName: "Goa trip (no notes)", groupKind: "trip", notes: "" },
];

for (const s of scenarios) {
  console.log(`\nStage 2 · planning "${s.groupName}" (${s.groupKind})\n  notes: ${s.notes}`);
  const t = Date.now();
  const plan = await planSettlement(config, {
    ...s,
    currency: "INR",
    members,
    bills,
    answers: [],
    recentExpenses: [],
    today: new Date().toISOString().slice(0, 10),
  });
  const name = (ref: string | null) => members.find((m) => m.ref === ref)?.name ?? "?";
  console.log(`  planned in ${Date.now() - t}ms · ${plan.summary}`);
  for (const e of plan.expenses) {
    const who = e.split.participants.map((p) => `${name(p.member)}${p.shares ? `×${p.shares}` : ""}${p.amount != null ? ` ${p.amount}` : ""}`).join(", ");
    console.log(`  - ${e.description}: ${e.amount} paid by ${name(e.paidBy)} · ${e.split.mode} [${who || `${e.split.lines.length} lines`}] bills ${JSON.stringify(e.billRefs)}`);
  }
  for (const p of plan.payments) console.log(`  · payment ${name(p.from)} → ${name(p.to)} ${p.amount}`);
  for (const q of plan.questions) console.log(`  ? ${q}`);
}
