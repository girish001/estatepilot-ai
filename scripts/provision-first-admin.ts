import { countAdminUsers, createAdminUser, validatePasswordStrength } from "../apps/web/app/lib/auth.ts";
import { closeDatabaseConnections } from "../apps/web/app/lib/db.ts";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const fullName = process.env.ADMIN_NAME?.trim() || "Principal Administrator";
  const password = process.env.ADMIN_PASSWORD || "";

  if (!email || !password) {
    console.error(
      "Usage: ADMIN_EMAIL=admin@estatepilot.in ADMIN_NAME='Principal Admin' ADMIN_PASSWORD='<strong-password>' npm run db:provision-admin"
    );
    process.exit(1);
  }

  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    console.error(`Password validation failed: ${strengthError}`);
    process.exit(1);
  }

  const existingCount = await countAdminUsers();
  if (existingCount > 0) {
    console.error(
      `ABORTED: ${existingCount} admin user(s) already exist in estatepilot.admin_users. Use SUPER_ADMIN session to manage additional staff.`
    );
    process.exit(1);
  }

  const user = await createAdminUser({
    email,
    fullName,
    password,
    role: "SUPER_ADMIN",
    actorId: "cli:provision-first-admin"
  });

  console.log("Successfully provisioned initial SUPER_ADMIN:", {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role
  });

  await closeDatabaseConnections();
}

main().catch((err) => {
  console.error("Failed to provision first admin:", err);
  process.exit(1);
});
