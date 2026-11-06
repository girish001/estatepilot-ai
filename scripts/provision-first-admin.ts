import { bootstrapFirstSuperAdmin, validatePasswordStrength, verifyBootstrapTokenOrThrow } from "../apps/web/app/lib/auth.ts";
import { closeDatabaseConnections } from "../apps/web/app/lib/db.ts";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const fullName = process.env.ADMIN_NAME?.trim() || "Principal Administrator";
  const password = process.env.ADMIN_PASSWORD || "";
  const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN || "";

  if (!email || !password || !bootstrapToken) {
    console.error(
      "Usage: ADMIN_BOOTSTRAP_TOKEN='<min-16-char-secret>' ADMIN_EMAIL=admin@estatepilot.in ADMIN_NAME='Principal Admin' ADMIN_PASSWORD='<strong-password>' npm run db:provision-admin"
    );
    process.exit(1);
  }

  verifyBootstrapTokenOrThrow(bootstrapToken);

  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    console.error(`Password validation failed: ${strengthError}`);
    process.exit(1);
  }

  const user = await bootstrapFirstSuperAdmin({
    email,
    fullName,
    password,
    bootstrapToken,
    ipAddress: "127.0.0.1"
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
