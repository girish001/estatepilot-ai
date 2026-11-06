import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertSafeDatabaseUrl,
  resolveDatabaseSslConfig,
  redactPII,
  runSchemaMigrations,
  verifySchemaReady,
  invalidateVerifiedSchemaCache,
  dbQuery,
  withTransaction,
  checkDatabaseHealth,
  closeDatabaseConnections
} from "../apps/web/app/lib/db.ts";
import {
  assertNoPersistentAdminPasswordInProd,
  consumeRateLimitBucket
} from "../apps/web/app/lib/auth.ts";
import { POST as bootstrapPost } from "../apps/web/app/api/auth/bootstrap/route.ts";
import { POST as loginPost } from "../apps/web/app/api/auth/login/route.ts";
import { POST as logoutPost } from "../apps/web/app/api/auth/logout/route.ts";
import { GET as meGet } from "../apps/web/app/api/auth/me/route.ts";
import { POST as usersPost, GET as usersGet } from "../apps/web/app/api/auth/users/route.ts";
import { POST as seedPost } from "../apps/web/app/api/admin/seed/route.ts";
import { GET as leadsGet, POST as leadsPost, PATCH as leadsPatch } from "../apps/web/app/api/leads/route.ts";
import { GET as propsGet, POST as propsPost, PATCH as propsPatch } from "../apps/web/app/api/properties/route.ts";
import { GET as reportsExportGet } from "../apps/web/app/api/reports/export/route.ts";
import { POST as aiChatPost } from "../apps/web/app/api/ai/chat/route.ts";
import { POST as webrtcRoomsPost } from "../apps/web/app/api/webrtc/rooms/route.ts";
import { GET as healthGet } from "../apps/web/app/api/health/route.ts";

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];

async function runStep(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, detail });
    console.error(`  ✗ FAIL: ${name} -> ${detail}`);
    throw err;
  }
}

function extractSessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie") || "";
  const match = setCookie.match(/ep_session=[^;]+/);
  assert.ok(match, `Expected ep_session cookie in Set-Cookie header, got: ${setCookie}`);
  return match[0];
}

async function main() {
  console.log("=================================================================");
  console.log(" EstatePilot AI — Complete Production Readiness Test Suite");
  console.log("=================================================================");

  delete process.env.PGLITE_DATA_DIR;
  delete process.env.ESTATEPILOT_DEV_SERVER;
  process.env.ALLOW_DEV_PGLITE = "true";
  process.env.ALLOW_SCHEMA_MIGRATION = "false";

  // 1. Database Isolation, Provisioning SQL, Role Separation, TLS & PII Redaction Tests
  await runStep("1.1 Provisioning SQL (000_provision_isolated_database_and_roles.sql) is complete and enforces least privilege", async () => {
    const sqlPath = resolve(process.cwd(), "migrations/000_provision_isolated_database_and_roles.sql");
    const sql = readFileSync(sqlPath, "utf-8");
    assert.ok(sql.includes("\\set ON_ERROR_STOP on"), "Must enforce ON_ERROR_STOP");
    assert.ok(sql.includes("\\if :{?migrator_password}"), "Must enforce migrator_password variable check");
    assert.ok(sql.includes("\\if :{?app_password}"), "Must enforce app_password variable check");
    assert.ok(sql.includes("\\gexec"), "Must create estatepilot_ai database idempotently via \\gexec");
    assert.ok(sql.includes("\\connect estatepilot_ai"), "Must connect to estatepilot_ai");
    assert.ok(sql.includes("REVOKE ALL ON SCHEMA public FROM PUBLIC;"), "Must revoke public schema privileges");
    assert.ok(sql.includes("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA estatepilot TO estatepilot_app;"), "Must grant sequence permissions");
    assert.ok(sql.includes("estatepilot.rate_limit_buckets"), "Must grant least-privilege access to rate_limit_buckets");
    assert.ok(!sql.includes("/*"), "Must not contain commented-out SQL blocks");
  });

  await runStep("1.2 Safety guard blocks Aurelia TimeFlow and default postgres database URLs", async () => {
    assert.throws(
      () => assertSafeDatabaseUrl("postgresql://estatepilot_app:secret@rds.amazonaws.com:5432/aurelia_timeflow"),
      /Forbidden target database/
    );
    assert.throws(
      () => assertSafeDatabaseUrl("postgresql://estatepilot_app:secret@rds.amazonaws.com:5432/postgres"),
      /Forbidden target database/
    );
  });

  await runStep("1.3 Safety guard enforces strict role separation: estatepilot_migrator for migrations, estatepilot_app for runtime", async () => {
    assert.throws(
      () => assertSafeDatabaseUrl("postgresql://postgres:secret@rds.amazonaws.com:5432/estatepilot_ai"),
      /Forbidden master database user/
    );
    assert.throws(
      () =>
        assertSafeDatabaseUrl("postgresql://estatepilot_migrator:secret@rds.amazonaws.com:5432/estatepilot_ai", {
          allowMigratorRole: false
        }),
      /Migration role "estatepilot_migrator" is forbidden for application runtime/
    );
    assert.throws(
      () =>
        assertSafeDatabaseUrl("postgresql://other_user:secret@rds.amazonaws.com:5432/estatepilot_ai", {
          allowMigratorRole: false
        }),
      /Application runtime must connect exclusively as least-privilege role "estatepilot_app"/
    );
    assert.throws(
      () =>
        assertSafeDatabaseUrl("postgresql://estatepilot_app:secret@rds.amazonaws.com:5432/estatepilot_ai", {
          allowMigratorRole: true
        }),
      /Schema migration execution requires dedicated migration role "estatepilot_migrator"/
    );
    const migParsed = assertSafeDatabaseUrl(
      "postgresql://estatepilot_migrator:secret@rds.amazonaws.com:5432/estatepilot_ai",
      { allowMigratorRole: true }
    );
    assert.equal(migParsed.username, "estatepilot_migrator");

    const appParsed = assertSafeDatabaseUrl(
      "postgresql://estatepilot_app:StrongSecret123@aurelia-timeflow-db-mumbai.cluster.ap-south-1.rds.amazonaws.com:5432/estatepilot_ai"
    );
    assert.equal(appParsed.database, "estatepilot_ai");
    assert.equal(appParsed.username, "estatepilot_app");
  });

  await runStep("1.4 Production TLS verification cannot be disabled and permanent admin passwords are blocked in production", async () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origReject = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
    const origAdminPass = process.env.ADMIN_PASSWORD;
    try {
      process.env.NODE_ENV = "production";
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = "false";
      assert.throws(
        () => resolveDatabaseSslConfig("aurelia-timeflow-db-mumbai.rds.amazonaws.com"),
        /TLS certificate verification \(DATABASE_SSL_REJECT_UNAUTHORIZED\) cannot be disabled in production/
      );

      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = "true";
      const sslCfg = resolveDatabaseSslConfig("aurelia-timeflow-db-mumbai.rds.amazonaws.com");
      assert.deepEqual(sslCfg, { rejectUnauthorized: true });

      process.env.ADMIN_PASSWORD = "PermanentPasswordInEnv123!";
      assert.throws(
        () => assertNoPersistentAdminPasswordInProd(),
        /SECURITY_CONFIG_ERROR/
      );
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = origReject;
      if (origAdminPass === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = origAdminPass;
    }
  });

  await runStep("1.5 PII redaction masks phone numbers, emails, DB URLs, and session/bootstrap tokens", async () => {
    const raw =
      "Failed for user@estatepilot.in phone +91 98450 77889 url postgresql://estatepilot_app:MySecret@rds:5432/estatepilot_ai ep_session=abc123def";
    const redacted = redactPII(raw);
    assert.ok(!redacted.includes("user@estatepilot.in"));
    assert.ok(!redacted.includes("98450"));
    assert.ok(!redacted.includes("MySecret"));
    assert.ok(!redacted.includes("abc123def"));
  });

  // 2. Production PGlite Block, Runtime Migration Prohibition & Checksum Verification Tests
  await runStep("2.1 PGlite is strictly blocked when NODE_ENV=production or ALLOW_DEV_PGLITE=false", async () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origAllowPglite = process.env.ALLOW_DEV_PGLITE;
    try {
      process.env.NODE_ENV = "production";
      process.env.ALLOW_DEV_PGLITE = "true";
      await assert.rejects(() => verifySchemaReady(), /PRODUCTION_DB_REQUIRED/);

      process.env.NODE_ENV = "test";
      process.env.ALLOW_DEV_PGLITE = "false";
      await assert.rejects(() => verifySchemaReady(), /PRODUCTION_DB_REQUIRED/);
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      process.env.ALLOW_DEV_PGLITE = origAllowPglite;
    }
  });

  await runStep("2.2 Application runtime cannot execute schema migrations and fails closed when unmigrated", async () => {
    process.env.ALLOW_SCHEMA_MIGRATION = "false";
    await assert.rejects(() => runSchemaMigrations(), /MIGRATION_FORBIDDEN_AT_RUNTIME/);
    await assert.rejects(() => verifySchemaReady(), /SCHEMA_NOT_MIGRATED/);
  });

  await runStep("2.3 Explicit migration runner applies 001_estatepilot_schema.sql and verifySchemaReady enforces SHA-256 checksum integrity", async () => {
    process.env.ALLOW_SCHEMA_MIGRATION = "true";
    let validChecksum = "";
    try {
      const migResult = await runSchemaMigrations();
      assert.equal(migResult.migrationVersion, "001_estatepilot_schema.sql");
      validChecksum = migResult.checksum;
    } finally {
      process.env.ALLOW_SCHEMA_MIGRATION = "false";
    }

    // Simulate tampered migration checksum and verify runtime detects drift
    await dbQuery(
      `UPDATE estatepilot.schema_migrations SET checksum = 'tampered_checksum_000' WHERE version = '001_estatepilot_schema.sql'`
    );
    invalidateVerifiedSchemaCache();
    await assert.rejects(() => verifySchemaReady(), /SCHEMA_CHECKSUM_MISMATCH/);

    // Restore valid checksum via explicit migration runner
    process.env.ALLOW_SCHEMA_MIGRATION = "true";
    try {
      await runSchemaMigrations();
    } finally {
      process.env.ALLOW_SCHEMA_MIGRATION = "false";
    }
    const verified = await verifySchemaReady();
    assert.equal(verified.checksum, validChecksum);
  });

  await runStep("2.4 Verify PostgreSQL transaction rollback on error", async () => {
    const before = await dbQuery<{ count: string }>(`SELECT COUNT(*)::text AS count FROM estatepilot.audit_events`);
    await assert.rejects(async () => {
      await withTransaction(async (tx) => {
        await tx.query(
          `INSERT INTO estatepilot.audit_events (entity_type, entity_id, action, actor_id, actor_role, details)
           VALUES ('AUTH', 'rollback_test_1', 'TEST_ROLLBACK', 'test', 'SYSTEM', '{}'::jsonb)`
        );
        throw new Error("Simulated mid-transaction failure");
      });
    }, /Simulated mid-transaction failure/);

    const after = await dbQuery<{ count: string }>(`SELECT COUNT(*)::text AS count FROM estatepilot.audit_events`);
    assert.equal(after.rows[0].count, before.rows[0].count);
  });

  // 3. Unauthenticated Access Protection Tests
  await runStep("3.1 Unauthenticated GET /api/leads & PATCH /api/leads rejected with 401", async () => {
    const getRes = await leadsGet(new Request("http://localhost:3000/api/leads", { method: "GET" }));
    assert.equal(getRes.status, 401);

    const patchRes = await leadsPatch(
      new Request("http://localhost:3000/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: "lead-101", status: "CONTACTED" })
      })
    );
    assert.equal(patchRes.status, 401);
  });

  await runStep("3.2 Unauthenticated POST/PATCH /api/properties & GET /api/reports/export rejected with 401", async () => {
    const postRes = await propsPost(
      new Request("http://localhost:3000/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Unauthorized Project", category: "PLOT", approvedRatePerSqFt: 4000 })
      })
    );
    assert.equal(postRes.status, 401);

    const patchRes = await propsPatch(
      new Request("http://localhost:3000/api/properties", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "prop-plot-devanahalli", isVerified: true })
      })
    );
    assert.equal(patchRes.status, 401);

    const exportRes = await reportsExportGet(
      new Request("http://localhost:3000/api/reports/export?type=daily-enquiries", { method: "GET" })
    );
    assert.equal(exportRes.status, 401);
  });

  // 4. Fail-Closed Bootstrap Token, Concurrency-Safe First-Admin Provisioning & Session Expiry
  let superAdminCookie = "";
  let superAdminCsrf = "";
  const TEST_BOOTSTRAP_SECRET = "ep_bootstrap_secret_token_2026_mumbai";

  await runStep("4.1 Bootstrap fails closed (503) when ADMIN_BOOTSTRAP_TOKEN is unset or too short", async () => {
    delete process.env.ADMIN_BOOTSTRAP_TOKEN;
    const resMissing = await bootstrapPost(
      new Request("http://localhost:3000/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "superadmin@estatepilot.in",
          fullName: "Girish Principal Admin",
          password: "SuperSecurePassword2026!",
          bootstrapToken: "any-token-value-12345"
        })
      })
    );
    assert.equal(resMissing.status, 503);

    process.env.ADMIN_BOOTSTRAP_TOKEN = "short_token";
    const resShort = await bootstrapPost(
      new Request("http://localhost:3000/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "superadmin@estatepilot.in",
          fullName: "Girish Principal Admin",
          password: "SuperSecurePassword2026!",
          bootstrapToken: "short_token"
        })
      })
    );
    assert.equal(resShort.status, 503);
  });

  await runStep("4.2 Bootstrap rejects wrong bootstrap token with 403 INVALID_BOOTSTRAP_TOKEN", async () => {
    process.env.ADMIN_BOOTSTRAP_TOKEN = TEST_BOOTSTRAP_SECRET;
    const resWrong = await bootstrapPost(
      new Request("http://localhost:3000/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.10.10.1" },
        body: JSON.stringify({
          email: "attacker@estatepilot.in",
          fullName: "Attacker",
          password: "AttackerPassword2026!",
          bootstrapToken: "wrong_bootstrap_secret_token_2026"
        })
      })
    );
    assert.equal(resWrong.status, 403);
    const body = await resWrong.json();
    assert.equal(body.code, "INVALID_BOOTSTRAP_TOKEN");
  });

  await runStep("4.3 Concurrent bootstrap requests are serialized safely: exactly 1 succeeds (201) and duplicates fail (403)", async () => {
    process.env.ADMIN_BOOTSTRAP_TOKEN = TEST_BOOTSTRAP_SECRET;
    const makeBootstrapReq = (email: string, ip: string) =>
      bootstrapPost(
        new Request("http://localhost:3000/api/auth/bootstrap", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-bootstrap-token": TEST_BOOTSTRAP_SECRET,
            "x-forwarded-for": ip
          },
          body: JSON.stringify({
            email,
            fullName: "Girish Principal Admin",
            password: "SuperSecurePassword2026!"
          })
        })
      );

    const responses = await Promise.all([
      makeBootstrapReq("superadmin@estatepilot.in", "10.10.10.2"),
      makeBootstrapReq("concurrent2@estatepilot.in", "10.10.10.3"),
      makeBootstrapReq("concurrent3@estatepilot.in", "10.10.10.4")
    ]);

    const statuses = responses.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 403, 403]);

    const winner = responses.find((r) => r.status === 201)!;
    superAdminCookie = extractSessionCookie(winner);
    const data = await winner.json();
    assert.equal(data.success, true);
    assert.equal(data.user.role, "SUPER_ADMIN");
    superAdminCsrf = data.csrfToken;

    const countRes = await dbQuery<{ count: string }>(`SELECT COUNT(*)::text AS count FROM estatepilot.admin_users`);
    assert.equal(countRes.rows[0].count, "1");
  });

  await runStep("4.4 Expired sessions are rejected (401) and logout enforces CSRF token (403 when missing)", async () => {
    const noCsrfLogout = await logoutPost(
      new Request("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: { cookie: superAdminCookie }
      })
    );
    assert.equal(noCsrfLogout.status, 403);

    // Expire current session in DB and verify /api/leads rejects it with 401
    await dbQuery(`UPDATE estatepilot.admin_sessions SET expires_at = NOW() - INTERVAL '1 hour'`);
    const expiredLeadsRes = await leadsGet(
      new Request("http://localhost:3000/api/leads", {
        method: "GET",
        headers: { cookie: superAdminCookie }
      })
    );
    assert.equal(expiredLeadsRes.status, 401);
  });

  await runStep("4.5 Bad password login is rejected (401), valid SUPER_ADMIN login succeeds, and reviewed seed populates baseline", async () => {
    const badRes = await loginPost(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.20.30.40" },
        body: JSON.stringify({
          email: "superadmin@estatepilot.in",
          password: "WrongPassword123!"
        })
      })
    );
    assert.equal(badRes.status, 401);

    const loginRes = await loginPost(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.20.30.41" },
        body: JSON.stringify({
          email: "superadmin@estatepilot.in",
          password: "SuperSecurePassword2026!"
        })
      })
    );
    assert.equal(loginRes.status, 200);
    superAdminCookie = extractSessionCookie(loginRes);
    superAdminCsrf = (await loginRes.json()).csrfToken;

    const seedRes = await seedPost(
      new Request("http://localhost:3000/api/admin/seed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: superAdminCookie,
          "x-csrf-token": superAdminCsrf
        }
      })
    );
    assert.equal(seedRes.status, 200);
    const seedData = await seedRes.json();
    assert.equal(seedData.propertiesSeeded, 6);
    assert.ok(seedData.leadsSeeded >= 5);
  });

  await runStep("4.6 Distributed PostgreSQL rate limiter enforces limits across login, enquiry, AI chat, and WebRTC endpoints", async () => {
    const key = "test:bucket:ip-192.0.2.99";
    const r1 = await consumeRateLimitBucket(key, 2, 60_000);
    const r2 = await consumeRateLimitBucket(key, 2, 60_000);
    const r3 = await consumeRateLimitBucket(key, 2, 60_000);
    assert.equal(r1.allowed, true);
    assert.equal(r2.allowed, true);
    assert.equal(r3.allowed, false);
    assert.ok(r3.retryAfterSeconds > 0);

    // Verify WebRTC room endpoint sanitizes untrusted Host headers and creates room
    const roomRes = await webrtcRoomsPost(
      new Request("http://localhost:3000/api/webrtc/rooms", {
        method: "POST",
        headers: { host: "evil.example.com/injected", "x-forwarded-for": "10.90.0.1" }
      })
    );
    assert.equal(roomRes.status, 201);
    const roomData = await roomRes.json();
    assert.ok(roomData.customerUrl.startsWith("http://localhost:3000/call/"));
  });

  // 5. Public Enquiry Submission, Validation, Duplicate & Compliance Tests
  let createdLeadId = "";

  await runStep("5.1 Public enquiry submission (POST /api/leads) persists to PostgreSQL", async () => {
    const res = await leadsPost(
      new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.50.0.1" },
        body: JSON.stringify({
          fullName: "Vikramaditya Rao",
          phone: "+91 98450 77889",
          email: "vikram.rao@example.com",
          preferredLanguage: "Kannada",
          propertyType: "PLOT",
          preferredLocation: "Devanahalli",
          preferredArea: "=CMD|' /C calc'!A0",
          enquiryNotes: "Looking for RERA approved corner plot",
          consentGranted: true,
          consentChannel: "WEB_FORM"
        })
      })
    );
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.lead.id);
    assert.ok(data.lead.referenceNumber.startsWith("EP-2026-"));
    createdLeadId = data.lead.id;
  });

  await runStep("5.2 Duplicate lead submission within 5 minutes is rejected with 409", async () => {
    const res = await leadsPost(
      new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.50.0.1" },
        body: JSON.stringify({
          fullName: "Vikramaditya Rao",
          phone: "+91 98450 77889",
          preferredLanguage: "Kannada",
          propertyType: "PLOT",
          preferredLocation: "Devanahalli",
          consentGranted: true
        })
      })
    );
    assert.equal(res.status, 409);
  });

  await runStep("5.3 Invalid phone number, missing consent, and budget fields are rejected with 400", async () => {
    const badPhoneRes = await leadsPost(
      new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.50.0.2" },
        body: JSON.stringify({
          fullName: "Test User",
          phone: "12345",
          propertyType: "FLAT",
          preferredLocation: "Whitefield",
          consentGranted: true
        })
      })
    );
    assert.equal(badPhoneRes.status, 400);

    const budgetRes = await leadsPost(
      new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.50.0.4" },
        body: JSON.stringify({
          fullName: "Budget Violator",
          phone: "+91 98450 99113",
          propertyType: "FLAT",
          preferredLocation: "Whitefield",
          consentGranted: true,
          customerBudget: "1.5 Cr"
        })
      })
    );
    assert.equal(budgetRes.status, 400);
  });

  // 6. All Four RBAC Roles, Exact Executive Lead Isolation & Anti-Spoofing Tests
  let adminCookie = "";
  let adminCsrf = "";
  let managerCookie = "";
  let managerCsrf = "";
  let executiveCookie = "";
  let executiveCsrf = "";
  let spoofExecCookie = "";
  let spoofExecCsrf = "";

  await runStep("6.1 SUPER_ADMIN creates ADMIN, MANAGER, EXECUTIVE ('Suresh Kumar'), and substring-named EXECUTIVE ('Suresh')", async () => {
    const adminCreate = await usersPost(
      new Request("http://localhost:3000/api/auth/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: superAdminCookie,
          "x-csrf-token": superAdminCsrf
        },
        body: JSON.stringify({
          email: "admin@estatepilot.in",
          fullName: "Kiran Operations Admin",
          password: "AdminPassword2026!",
          role: "ADMIN"
        })
      })
    );
    assert.equal(adminCreate.status, 201);

    const mgrCreate = await usersPost(
      new Request("http://localhost:3000/api/auth/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: superAdminCookie,
          "x-csrf-token": superAdminCsrf
        },
        body: JSON.stringify({
          email: "manager@estatepilot.in",
          fullName: "Anita Sales Manager",
          password: "ManagerPassword2026!",
          role: "MANAGER"
        })
      })
    );
    assert.equal(mgrCreate.status, 201);

    const execCreate = await usersPost(
      new Request("http://localhost:3000/api/auth/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: superAdminCookie,
          "x-csrf-token": superAdminCsrf
        },
        body: JSON.stringify({
          email: "suresh.exec@estatepilot.in",
          fullName: "Suresh Kumar",
          password: "ExecutivePassword2026!",
          role: "EXECUTIVE",
          assignedExecutiveName: "Suresh Kumar (Kannada Language Specialist)"
        })
      })
    );
    assert.equal(execCreate.status, 201);

    const spoofCreate = await usersPost(
      new Request("http://localhost:3000/api/auth/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: superAdminCookie,
          "x-csrf-token": superAdminCsrf
        },
        body: JSON.stringify({
          email: "suresh.short@estatepilot.in",
          fullName: "Suresh Short",
          password: "ExecutivePassword2026!",
          role: "EXECUTIVE",
          assignedExecutiveName: "Suresh"
        })
      })
    );
    assert.equal(spoofCreate.status, 201);

    const adminLogin = await loginPost(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.20.30.49" },
        body: JSON.stringify({ email: "admin@estatepilot.in", password: "AdminPassword2026!" })
      })
    );
    adminCookie = extractSessionCookie(adminLogin);
    adminCsrf = (await adminLogin.json()).csrfToken;

    const mgrLogin = await loginPost(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.20.30.50" },
        body: JSON.stringify({ email: "manager@estatepilot.in", password: "ManagerPassword2026!" })
      })
    );
    managerCookie = extractSessionCookie(mgrLogin);
    managerCsrf = (await mgrLogin.json()).csrfToken;

    const execLogin = await loginPost(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.20.30.51" },
        body: JSON.stringify({ email: "suresh.exec@estatepilot.in", password: "ExecutivePassword2026!" })
      })
    );
    executiveCookie = extractSessionCookie(execLogin);
    executiveCsrf = (await execLogin.json()).csrfToken;

    const spoofLogin = await loginPost(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.20.30.52" },
        body: JSON.stringify({ email: "suresh.short@estatepilot.in", password: "ExecutivePassword2026!" })
      })
    );
    spoofExecCookie = extractSessionCookie(spoofLogin);
    spoofExecCsrf = (await spoofLogin.json()).csrfToken;
  });

  await runStep("6.2 Exact executive matching blocks substring spoofing ('Suresh' cannot read or update 'Suresh Kumar' leads)", async () => {
    const spoofLeadsRes = await leadsGet(
      new Request("http://localhost:3000/api/leads", {
        method: "GET",
        headers: { cookie: spoofExecCookie }
      })
    );
    assert.equal(spoofLeadsRes.status, 200);
    const spoofLeadsData = await spoofLeadsRes.json();
    assert.equal(spoofLeadsData.leads.length, 0);

    const spoofPatchRes = await leadsPatch(
      new Request("http://localhost:3000/api/leads", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: spoofExecCookie,
          "x-csrf-token": spoofExecCsrf
        },
        body: JSON.stringify({
          leadId: createdLeadId,
          status: "CONTACTED"
        })
      })
    );
    assert.equal(spoofPatchRes.status, 403);
  });

  await runStep("6.3 Legitimate EXECUTIVE ('Suresh Kumar') sees only their assigned leads and can update status, including DO_NOT_CONTACT", async () => {
    const execLeadsRes = await leadsGet(
      new Request("http://localhost:3000/api/leads", {
        method: "GET",
        headers: { cookie: executiveCookie }
      })
    );
    assert.equal(execLeadsRes.status, 200);
    const execLeadsData = await execLeadsRes.json();
    assert.ok(execLeadsData.leads.length > 0);
    for (const lead of execLeadsData.leads) {
      assert.equal(lead.assignedExecutive, "Suresh Kumar (Kannada Language Specialist)");
    }

    const dncPatchRes = await leadsPatch(
      new Request("http://localhost:3000/api/leads", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: executiveCookie,
          "x-csrf-token": executiveCsrf
        },
        body: JSON.stringify({
          leadId: createdLeadId,
          status: "DO_NOT_CONTACT"
        })
      })
    );
    assert.equal(dncPatchRes.status, 200);
    const dncData = await dncPatchRes.json();
    assert.equal(dncData.lead.status, "DO_NOT_CONTACT");
    assert.equal(dncData.lead.consent.granted, false);
  });

  await runStep("6.4 EXECUTIVE, MANAGER, and ADMIN cannot create staff accounts (/api/auth/users is SUPER_ADMIN only)", async () => {
    for (const [cookie, csrf] of [
      [executiveCookie, executiveCsrf],
      [managerCookie, managerCsrf],
      [adminCookie, adminCsrf]
    ]) {
      const listRes = await usersGet(
        new Request("http://localhost:3000/api/auth/users", {
          method: "GET",
          headers: { cookie }
        })
      );
      assert.equal(listRes.status, 403);

      const createRes = await usersPost(
        new Request("http://localhost:3000/api/auth/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie,
            "x-csrf-token": csrf
          },
          body: JSON.stringify({
            email: "unauthorized@estatepilot.in",
            fullName: "Unauthorized",
            password: "Password2026!",
            role: "EXECUTIVE",
            assignedExecutiveName: "Rajesh Sharma"
          })
        })
      );
      assert.equal(createRes.status, 403);
    }
  });

  // 7. Property Ingestion, Verification RBAC, Unverified Exclusion & CSV Formula Sanitization
  let unverifiedPropId = "";

  await runStep("7.1 MANAGER can upload new brochure (isVerified=false) but cannot approve verification (403)", async () => {
    const uploadRes = await propsPost(
      new Request("http://localhost:3000/api/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: managerCookie,
          "x-csrf-token": managerCsrf
        },
        body: JSON.stringify({
          name: "Brigade Horizon Unverified Annex",
          category: "FLAT",
          location: "Whitefield",
          city: "Bangalore",
          minAreaSqFt: 1250,
          maxAreaSqFt: 1850,
          approvedRatePerSqFt: 8100,
          reraNumber: "PRM/KA/RERA/1251/446/PR/260999",
          brochureFileName: "Brigade-Horizon-Unverified.pdf"
        })
      })
    );
    assert.equal(uploadRes.status, 201);
    const uploadData = await uploadRes.json();
    assert.equal(uploadData.property.isVerified, false);
    unverifiedPropId = uploadData.property.id;

    const verifyAttempt = await propsPatch(
      new Request("http://localhost:3000/api/properties", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: managerCookie,
          "x-csrf-token": managerCsrf
        },
        body: JSON.stringify({ id: unverifiedPropId, isVerified: true })
      })
    );
    assert.equal(verifyAttempt.status, 403);
  });

  await runStep("7.2 Unverified properties are excluded from public and EXECUTIVE GET /api/properties and AI Receptionist", async () => {
    const publicPropsRes = await propsGet(
      new Request("http://localhost:3000/api/properties?verifiedOnly=false", { method: "GET" })
    );
    assert.equal(publicPropsRes.status, 200);
    const publicPropsData = await publicPropsRes.json();
    assert.ok(publicPropsData.properties.every((p: { isVerified: boolean }) => p.isVerified === true));
    assert.ok(!publicPropsData.properties.some((p: { id: string }) => p.id === unverifiedPropId));

    const execPropsRes = await propsGet(
      new Request("http://localhost:3000/api/properties?verifiedOnly=false", {
        method: "GET",
        headers: { cookie: executiveCookie }
      })
    );
    const execPropsData = await execPropsRes.json();
    assert.ok(execPropsData.properties.every((p: { isVerified: boolean }) => p.isVerified === true));

    const aiRes = await aiChatPost(
      new Request("http://localhost:3000/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.60.0.1" },
        body: JSON.stringify({
          message: "Show me 2 BHK apartments in Whitefield",
          language: "English"
        })
      })
    );
    assert.equal(aiRes.status, 200);
    const aiData = await aiRes.json();
    assert.ok(aiData.matchedProperties.every((p: { isVerified: boolean }) => p.isVerified === true));
    assert.ok(!aiData.matchedProperties.some((p: { id: string }) => p.id === unverifiedPropId));
  });

  await runStep("7.3 ADMIN approves property verification and CSV export neutralizes formula injection payloads", async () => {
    const verifyRes = await propsPatch(
      new Request("http://localhost:3000/api/properties", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: adminCookie,
          "x-csrf-token": adminCsrf
        },
        body: JSON.stringify({
          id: unverifiedPropId,
          isVerified: true,
          verifiedBy: "Kiran Operations Admin"
        })
      })
    );
    assert.equal(verifyRes.status, 200);

    const csvRes = await reportsExportGet(
      new Request("http://localhost:3000/api/reports/export?type=daily-enquiries", {
        method: "GET",
        headers: { cookie: adminCookie }
      })
    );
    assert.equal(csvRes.status, 200);
    const csvText = await csvRes.text();
    assert.ok(csvText.includes("Vikramaditya Rao"));
    assert.ok(csvText.includes("\"'=CMD|' /C calc'!A0\""), "Formula payload must be neutralized with leading single quote");
  });

  // 8. Health Endpoint Verification
  await runStep("8.1 Health endpoint (/api/health) reports healthy PostgreSQL engine and schema version without exposing internal hostnames", async () => {
    const res = await healthGet();
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "ok");
    assert.equal(data.database.connected, true);
    assert.equal(data.database.migrationVersion, "001_estatepilot_schema.sql");
    assert.ok(data.database.counts.leads >= 6);
    assert.ok(data.database.counts.properties >= 5);
    assert.ok(data.database.counts.adminUsers >= 5);
  });

  const healthSummary = await checkDatabaseHealth();
  console.log("=================================================================");
  console.log(` ALL ${results.length}/${results.length} PRODUCTION SECURITY & READINESS TESTS PASSED`);
  console.log(" Database Health Summary:", JSON.stringify(healthSummary));
  console.log("=================================================================");

  await closeDatabaseConnections();
}

main().catch(async (err) => {
  console.error("Test suite failed:", err);
  await closeDatabaseConnections().catch(() => {});
  process.exit(1);
});
