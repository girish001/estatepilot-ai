import {
  bootstrapFirstSuperAdmin,
  validatePasswordStrength,
  verifyBootstrapTokenOrThrow
} from "../apps/web/app/lib/auth.ts";
import { closeDatabaseConnections, redactPII } from "../apps/web/app/lib/db.ts";

async function main() {
  const email = (
    process.env.BOOTSTRAP_ADMIN_EMAIL ||
    process.env.FIRST_ADMIN_EMAIL ||
    process.env.ADMIN_EMAIL ||
    ""
  )
    .trim()
    .toLowerCase();
  const fullName = (
    process.env.BOOTSTRAP_ADMIN_NAME ||
    process.env.FIRST_ADMIN_NAME ||
    process.env.ADMIN_NAME ||
    "Principal Administrator"
  ).trim();
  const password =
    process.env.BOOTSTRAP_ADMIN_PASSWORD ||
    process.env.FIRST_ADMIN_INITIAL_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    "";
  const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN || "";

  // Ensure transient CLI ADMIN_PASSWORD env var does not trigger runtime persistent-password guard
  delete process.env.ADMIN_PASSWORD;

  if (!email || !password || !bootstrapToken) {
    console.error(
      "Usage: ADMIN_BOOTSTRAP_TOKEN='<min-16-char-secret>' BOOTSTRAP_ADMIN_EMAIL=admin@estatepilot.in BOOTSTRAP_ADMIN_NAME='Principal Admin' BOOTSTRAP_ADMIN_PASSWORD='<strong-password>' npm run db:provision-admin"
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

main().catch(async (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("Failed to provision first admin:", redactPII(msg));
  await closeDatabaseConnections().catch(() => {});
  process.exit(1);
});
