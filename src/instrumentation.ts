// Runs once when the server starts: a cheap check that the database has been migrated,
// so a fresh deploy or a new DATABASE_URL fails with a clear message instead of random 500s.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { db, isUnmigratedError, UNMIGRATED_MESSAGE } = await import("./server/db");
  const { sql } = await import("drizzle-orm");
  try {
    await db.run(sql`select 1 from scan_usage limit 1`);
  } catch (e) {
    console.error(isUnmigratedError(e) ? `\n✗ ${UNMIGRATED_MESSAGE}\n` : `\n✗ Can't reach the database (DATABASE_URL): ${(e as Error).message}\n`);
  }
}
