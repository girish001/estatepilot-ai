import { ensureSchemaMigrated, checkDatabaseHealth, closeDatabaseConnections } from "../apps/web/app/lib/db.ts";

async function main() {
  console.log("=== EstatePilot AI — PostgreSQL Schema Migration ===");
  await ensureSchemaMigrated();
  const health = await checkDatabaseHealth();
  console.log(JSON.stringify(health, null, 2));
  if (!health.healthy) {
    process.exitCode = 1;
  }
  await closeDatabaseConnections();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
