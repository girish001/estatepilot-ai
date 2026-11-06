import assert from "node:assert/strict";
import {
  assertSafeDatabaseUrl,
  ensureSchemaMigrated,
  dbQuery,
  withTransaction,
  checkDatabaseHealth,
  closeDatabaseConnections
} from "../apps/web/app/lib/db.ts";
import { POST as bootstrapPost } from "../apps/web/app/api/auth/bootstrap/route.ts";
import { POST as loginPost } from "../apps/web/app/api/auth/login/route.ts";
import { GET as meGet } from "../apps/web/app/api/auth/me/route.ts";
import { POST as usersPost, GET as usersGet } from "../apps/web/app/api/auth/users/route.ts";
import { POST as seedPost } from "../apps/web/app/api/admin/seed/route.ts";
import { GET as leadsGet, POST as leadsPost, PATCH as leadsPatch } from "../apps/web/app/api/leads/route.ts";
import { GET as propsGet, POST as propsPost, PATCH as propsPatch } from "../apps/web/app/api/properties/route.ts";
import { GET as reportsExportGet } from "../apps/web/app/api/reports/export/route.ts";
import { POST as aiChatPost } from "../apps/web/app/api/ai/chat/route.ts";
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
  console.log(" EstatePilot AI — Production Readiness Automated Test Suite");
  console.log("=================================================================");

  // 1. Database Isolation & Safety Guard Tests
  await runStep("1.1 Safety guard blocks Aurelia TimeFlow database URLs", async () => {
    assert.throws(
      () => assertSafeDatabaseUrl("postgresql://estatepilot_app:secret@rds.amazonaws.com:5432/aurelia_timeflow"),
      /Forbidden target database/
    );
    assert.throws(
      () => assertSafeDatabaseUrl("postgresql://estatepilot_app:secret@rds.amazonaws.com:5432/postgres"),
      /Forbidden target database/
    );
  });

  await runStep("1.2 Safety guard blocks RDS master user connections", async () => {
    assert.throws(
      () => assertSafeDatabaseUrl("postgresql://postgres:secret@rds.amazonaws.com:5432/estatepilot_ai"),
      /Forbidden master database user/
    );
  });

  await runStep("1.3 Safety guard permits isolated estatepilot_ai database and estatepilot_app role", async () => {
    const parsed = assertSafeDatabaseUrl(
      "postgresql://estatepilot_app:StrongSecret123@aurelia-timeflow-db-mumbai.cluster.ap-south-1.rds.amazonaws.com:5432/estatepilot_ai"
    );
    assert.equal(parsed.database, "estatepilot_ai");
    assert.equal(parsed.username, "estatepilot_app");
  });

  // 2. Schema Migration & Transaction Rollback Tests
  await runStep("2.1 Apply idempotent PostgreSQL schema migration (001_estatepilot_schema.sql)", async () => {
    await ensureSchemaMigrated();
    const mig = await dbQuery<{ version: string }>(
      `SELECT version FROM estatepilot.schema_migrations WHERE version = '001_estatepilot_schema.sql'`
    );
    assert.equal(mig.rowCount, 1);
  });

  await runStep("2.2 Verify PostgreSQL transaction rollback on error", async () => {
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
  await runStep("3.1 Unauthenticated GET /api/leads is rejected with 401", async () => {
    const req = new Request("http://localhost:3000/api/leads", { method: "GET" });
    const res = await leadsGet(req);
    assert.equal(res.status, 401);
  });

  await runStep("3.2 Unauthenticated PATCH /api/leads is rejected with 401", async () => {
    const req = new Request("http://localhost:3000/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: "lead-101", status: "CONTACTED" })
    });
    const res = await leadsPatch(req);
    assert.equal(res.status, 401);
  });

  await runStep("3.3 Unauthenticated POST /api/properties & PATCH /api/properties rejected with 401", async () => {
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
  });

  await runStep("3.4 Unauthenticated GET /api/reports/export rejected with 401", async () => {
    const res = await reportsExportGet(
      new Request("http://localhost:3000/api/reports/export?type=daily-enquiries", { method: "GET" })
    );
    assert.equal(res.status, 401);
  });

  // 4. Bootstrap First SUPER_ADMIN, Auth, Session & Seed Tests
  let superAdminCookie = "";
  let superAdminCsrf = "";

  await runStep("4.1 Bootstrap first SUPER_ADMIN account via POST /api/auth/bootstrap", async () => {
    const res = await bootstrapPost(
      new Request("http://localhost:3000/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "superadmin@estatepilot.in",
          fullName: "Girish Principal Admin",
          password: "SuperSecurePassword2026!"
        })
      })
    );
    assert.equal(res.status, 201);
    superAdminCookie = extractSessionCookie(res);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.user.role, "SUPER_ADMIN");
    assert.ok(data.csrfToken);
    superAdminCsrf = data.csrfToken;
  });

  await runStep("4.2 Duplicate bootstrap attempt is blocked with 403", async () => {
    const res = await bootstrapPost(
      new Request("http://localhost:3000/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "attacker@estatepilot.in",
          fullName: "Attacker",
          password: "AttackerPassword2026!"
        })
      })
    );
    assert.equal(res.status, 403);
  });

  await runStep("4.3 Bad password login is rejected with 401 and audited", async () => {
    const res = await loginPost(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.20.30.40" },
        body: JSON.stringify({
          email: "superadmin@estatepilot.in",
          password: "WrongPassword123!"
        })
      })
    );
    assert.equal(res.status, 401);
  });

  await runStep("4.4 Valid SUPER_ADMIN login succeeds and GET /api/auth/me validates session", async () => {
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
    const loginData = await loginRes.json();
    superAdminCsrf = loginData.csrfToken;

    const meRes = await meGet(
      new Request("http://localhost:3000/api/auth/me", {
        method: "GET",
        headers: { cookie: superAdminCookie }
      })
    );
    assert.equal(meRes.status, 200);
    const meData = await meRes.json();
    assert.equal(meData.authenticated, true);
    assert.equal(meData.user.email, "superadmin@estatepilot.in");
  });

  await runStep("4.5 Explicit reviewed baseline seed via POST /api/admin/seed", async () => {
    const res = await seedPost(
      new Request("http://localhost:3000/api/admin/seed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: superAdminCookie,
          "x-csrf-token": superAdminCsrf
        }
      })
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.propertiesSeeded, 6);
    assert.ok(data.leadsSeeded >= 5);
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
          preferredArea: "1500 sq.ft.",
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

  await runStep("5.3 Invalid phone number and missing consent are rejected with 400", async () => {
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

    const noConsentRes = await leadsPost(
      new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.50.0.3" },
        body: JSON.stringify({
          fullName: "Test User",
          phone: "+91 98450 99112",
          propertyType: "FLAT",
          preferredLocation: "Whitefield",
          consentGranted: false
        })
      })
    );
    assert.equal(noConsentRes.status, 400);
  });

  await runStep("5.4 Zero-Budget Compliance Rule rejects any payload containing budget/income fields with 400", async () => {
    const res = await leadsPost(
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
    assert.equal(res.status, 400);
  });

  // 6. Role-Based Access Control (RBAC) & CSRF Enforcement Tests
  let managerCookie = "";
  let managerCsrf = "";
  let executiveCookie = "";
  let executiveCsrf = "";

  await runStep("6.1 SUPER_ADMIN creates MANAGER and EXECUTIVE accounts", async () => {
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

    // Login as MANAGER
    const mgrLogin = await loginPost(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.20.30.50" },
        body: JSON.stringify({ email: "manager@estatepilot.in", password: "ManagerPassword2026!" })
      })
    );
    assert.equal(mgrLogin.status, 200);
    managerCookie = extractSessionCookie(mgrLogin);
    managerCsrf = (await mgrLogin.json()).csrfToken;

    // Login as EXECUTIVE
    const execLogin = await loginPost(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.20.30.51" },
        body: JSON.stringify({ email: "suresh.exec@estatepilot.in", password: "ExecutivePassword2026!" })
      })
    );
    assert.equal(execLogin.status, 200);
    executiveCookie = extractSessionCookie(execLogin);
    executiveCsrf = (await execLogin.json()).csrfToken;
  });

  await runStep("6.2 Missing CSRF token on mutating PATCH /api/leads is rejected with 403", async () => {
    const res = await leadsPatch(
      new Request("http://localhost:3000/api/leads", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: superAdminCookie
        },
        body: JSON.stringify({ leadId: createdLeadId, status: "CONTACTED" })
      })
    );
    assert.equal(res.status, 403);
  });

  await runStep("6.3 EXECUTIVE only sees leads assigned to their executive scope", async () => {
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
  });

  await runStep("6.4 EXECUTIVE cannot reassign executives (403) or export bulk CSV reports (403) or list admin users (403)", async () => {
    const reassignRes = await leadsPatch(
      new Request("http://localhost:3000/api/leads", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: executiveCookie,
          "x-csrf-token": executiveCsrf
        },
        body: JSON.stringify({
          leadId: createdLeadId,
          assignedExecutive: "Rajesh Sharma (Senior Property Specialist)"
        })
      })
    );
    assert.equal(reassignRes.status, 403);

    const exportRes = await reportsExportGet(
      new Request("http://localhost:3000/api/reports/export?type=daily-enquiries", {
        method: "GET",
        headers: { cookie: executiveCookie }
      })
    );
    assert.equal(exportRes.status, 403);

    const usersListRes = await usersGet(
      new Request("http://localhost:3000/api/auth/users", {
        method: "GET",
        headers: { cookie: executiveCookie }
      })
    );
    assert.equal(usersListRes.status, 403);
  });

  // 7. Property Ingestion, Verification RBAC, and Unverified Recommendation Prevention
  let unverifiedPropId = "";

  await runStep("7.1 MANAGER can upload new brochure (starts as isVerified=false) but cannot approve verification (403)", async () => {
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

    // Manager tries to verify -> 403
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

  await runStep("7.2 Unverified properties are excluded from public GET /api/properties and AI Receptionist recommendations", async () => {
    const publicPropsRes = await propsGet(
      new Request("http://localhost:3000/api/properties", { method: "GET" })
    );
    assert.equal(publicPropsRes.status, 200);
    const publicPropsData = await publicPropsRes.json();
    assert.ok(publicPropsData.properties.every((p: { isVerified: boolean }) => p.isVerified === true));
    assert.ok(!publicPropsData.properties.some((p: { id: string }) => p.id === unverifiedPropId));

    const aiRes = await aiChatPost(
      new Request("http://localhost:3000/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  await runStep("7.3 SUPER_ADMIN approves property verification and exports CSV report", async () => {
    const verifyRes = await propsPatch(
      new Request("http://localhost:3000/api/properties", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: superAdminCookie,
          "x-csrf-token": superAdminCsrf
        },
        body: JSON.stringify({
          id: unverifiedPropId,
          isVerified: true,
          verifiedBy: "Girish Principal Admin"
        })
      })
    );
    assert.equal(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.property.isVerified, true);

    const csvRes = await reportsExportGet(
      new Request("http://localhost:3000/api/reports/export?type=daily-enquiries", {
        method: "GET",
        headers: { cookie: superAdminCookie }
      })
    );
    assert.equal(csvRes.status, 200);
    const csvText = await csvRes.text();
    assert.ok(csvText.includes("Vikramaditya Rao"));
  });

  // 8. Health Endpoint & Append-Only Audit Trail Verification
  await runStep("8.1 Health endpoint (/api/health) reports healthy PostgreSQL engine and schema version", async () => {
    const res = await healthGet();
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "ok");
    assert.equal(data.database.connected, true);
    assert.equal(data.database.migrationVersion, "001_estatepilot_schema.sql");
    assert.ok(data.database.counts.leads >= 6);
    assert.ok(data.database.counts.properties >= 5);
    assert.ok(data.database.counts.adminUsers >= 3);
  });

  const healthSummary = await checkDatabaseHealth();
  console.log("=================================================================");
  console.log(` ALL ${results.length}/${results.length} PRODUCTION READINESS TESTS PASSED`);
  console.log(" Database Health Summary:", JSON.stringify(healthSummary));
  console.log("=================================================================");

  await closeDatabaseConnections();
}

main().catch(async (err) => {
  console.error("Test suite failed:", err);
  await closeDatabaseConnections().catch(() => {});
  process.exit(1);
});
