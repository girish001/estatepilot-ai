import { runSchemaMigrations, checkDatabaseHealth, closeDatabaseConnections } from "../apps/web/app/lib/db.ts";

async function main() {
  console.log("=== EstatePilot AI — Explicit PostgreSQL Schema Migration Job ===");
  process.env.ALLOW_SCHEMA_MIGRATION = "true";
  const migrationResult = await runSchemaMigrations();
  console.log("Migration applied:", JSON.stringify(migrationResult, null, 2));
  const health = await checkDatabaseHealth();
  console.log("Database health check:", JSON.stringify(health, null, 2));
  if (!health.healthy) {
    process.exitCode = 1;
  }
  await closeDatabaseConnections();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
