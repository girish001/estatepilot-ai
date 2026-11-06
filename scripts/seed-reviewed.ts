import { seedReviewedBaselineData } from "../apps/web/app/lib/repositories.ts";
import { closeDatabaseConnections } from "../apps/web/app/lib/db.ts";

async function main() {
  if (!process.argv.includes("--confirm-seed")) {
    console.error(
      "ABORTED: To prevent accidental demo data injection into production, pass --confirm-seed explicitly:\n" +
      "  npm run db:seed -- --confirm-seed"
    );
    process.exit(1);
  }

  console.log("=== EstatePilot AI — Seeding Reviewed Baseline Inventory & Sample Leads ===");
  const result = await seedReviewedBaselineData("cli:seed-reviewed");
  console.log(`Seeded ${result.propertiesSeeded} properties and ${result.leadsSeeded} leads.`);
  await closeDatabaseConnections();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
