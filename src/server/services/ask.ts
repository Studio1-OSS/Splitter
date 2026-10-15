import { asc, desc, eq } from "drizzle-orm";
import { categoryOf } from "@/config/categories";
import { formatMoney } from "@/lib/money";
import type { DB } from "../db";
import * as schema from "../db/schema";
import { getGroupDetail } from "./groups";

const MAX_EXPENSES = 120;

/**
 * Everything "Ask Splitter" may know about one group, as plain text: members, balances, suggested payments,
 * expenses (with lines, who shared them and notes), payments and batch notes. Only for members (checked
 * by getGroupDetail); nothing outside this group is included.
 */
export async function buildGroupLedger(db: DB, userId: string, groupId: string) {
  const detail = await getGroupDetail(db, userId, groupId);
  const { group, me, members, balances, transfers, settlements } = detail;
  const c = group.currency;
  const money = (n: number) => formatMoney(n, c, "en-US");
  const nameOf = new Map(members.map((m) => [m.id, m.displayName]));
  const name = (id: string) => nameOf.get(id) ?? "Someone";

  const [expenses, batches] = await Promise.all([
    db.query.expenses.findMany({
      where: eq(schema.expenses.groupId, group.id),
      orderBy: [desc(schema.expenses.date)],
      limit: MAX_EXPENSES,
      with: { shares: true, items: { orderBy: [asc(schema.expenseItems.position)], with: { assignments: true } }, batch: { columns: { title: true } } },
    }),
    db.select().from(schema.batches).where(eq(schema.batches.groupId, group.id)).orderBy(desc(schema.batches.createdAt)).limit(10),
  ]);

  const lines: string[] = [];
  lines.push(`Group: ${group.name} · currency ${c} · ${members.length} members`);
  lines.push(`The person asking is ${me.displayName}.`);
  lines.push("", "Balances (positive = is owed money, negative = owes):");
  for (const b of balances) lines.push(`- ${b.member.displayName}: ${b.amount >= 0 ? "+" : ""}${money(b.amount)}`);
  // Per-person totals across all expenses, so the model never has to add them up itself.
  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  for (const e of expenses) {
    paid.set(e.paidByMemberId, (paid.get(e.paidByMemberId) ?? 0) + e.total);
    for (const s of e.shares) share.set(s.memberId, (share.get(s.memberId) ?? 0) + s.amount);
  }
  lines.push("", "Per person (paid for the group / their share of expenses):");
  for (const m of members) lines.push(`- ${m.displayName}: paid ${money(paid.get(m.id) ?? 0)}, share ${money(share.get(m.id) ?? 0)}`);
  lines.push("", "Suggested payments to settle up:");
  lines.push(...(transfers.length ? transfers.map((t) => `- ${name(t.fromMemberId)} pays ${name(t.toMemberId)} ${money(t.amount)}`) : ["- none, everyone is settled"]));

  lines.push("", `Expenses (${expenses.length}, newest first):`);
  for (const e of expenses) {
    lines.push(
      `[E${e.id.slice(0, 5)}] ${e.date} · ${e.merchant} · ${categoryOf(e.category).label} · total ${money(e.total)} · paid by ${name(e.paidByMemberId)}${e.batch ? ` · from "${e.batch.title}"` : ""}`,
    );
    if (e.items.length > 1 || e.tax || e.tip || e.serviceCharge || e.discount) {
      for (const i of e.items) lines.push(`    line: ${i.name} ${money(i.amount)} — ${i.assignments.map((a) => name(a.memberId)).join(", ")}`);
      const extras = [e.tax && `tax ${money(e.tax)}`, e.tip && `tip ${money(e.tip)}`, e.serviceCharge && `fees ${money(e.serviceCharge)}`, e.discount && `discount ${money(e.discount)}`].filter(Boolean);
      if (extras.length) lines.push(`    ${extras.join(", ")} (shared in proportion to lines)`);
    }
    lines.push(`    shares: ${e.shares.map((s) => `${name(s.memberId)} ${money(s.amount)}`).join(", ")}`);
    if (e.note) lines.push(`    note: ${e.note}`);
  }

  if (settlements.length) {
    lines.push("", "Payments recorded between members:");
    for (const s of settlements)
      lines.push(`- ${s.createdAt.toISOString().slice(0, 10)} ${name(s.fromMemberId)} paid ${name(s.toMemberId)} ${money(s.amount)} (${s.status})`);
  }
  if (batches.length) {
    lines.push("", "Notes the group gave when settling with AI:");
    for (const b of batches) lines.push(`- "${b.title}": ${b.context.trim() || "(no notes)"}${b.summary ? ` | summary: ${b.summary}` : ""}`);
  }
  return { ledger: lines.join("\n"), group, me };
}
