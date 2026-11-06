# EstatePilot AI — Complete Production Launch & Readiness Report

## 1. Architecture Diagram & Deployment Topology

```text
+-----------------------------------------------------------------------------------+
| Public Internet / Customers & Authenticated EstatePilot Staff                     |
+-----------------------------------------+-----------------------------------------+
                                          | HTTPS (TLS 1.3)
                                          v
+-----------------------------------------------------------------------------------+
| AWS Amplify Hosting (WEB_COMPUTE SSR, ap-south-1 Mumbai)                          |
| App ID: d1mw2d2fqe4y6x | Monorepo Root: apps/web | Next.js 15 + React 19          |
| - Public Routes: /enquire, /receptionist, POST /api/leads, POST /api/ai/chat      |
| - Protected Routes (HTTP-Only Cookie + CSRF + RBAC):                              |
|   GET/PATCH /api/leads, POST/PATCH /api/properties, GET /api/reports/export,      |
|   POST /api/auth/users, POST /api/admin/seed                                      |
+-----------------------------------------+-----------------------------------------+
                                          | Private VPC Connectivity (Option A or B)
                                          | Port 5432 (Security Group Scoped, TLS)
                                          v
+-----------------------------------------------------------------------------------+
| Private VPC (ap-south-1 Mumbai) — RDS PostgreSQL 18.3 (db.t3.micro, 20 GB gp3)    |
| Instance: aurelia-timeflow-db-mumbai (Encrypted, Private)                         |
|                                                                                   |
|  +-----------------------------------+   +-------------------------------------+  |
|  | Database: aurelia_timeflow        |   | Database: estatepilot_ai (ISOLATED) |  |
|  | (Aurelia TimeFlow Project)        |   | Schema: estatepilot                 |  |
|  | STRICTLY UNTOUCHED & BLOCKED      |   | Runtime Role: estatepilot_app       |  |
|  | BY RUNTIME SAFETY GUARD           |   | Migration Role: estatepilot_migrator|  |
|  +-----------------------------------+   +-------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Database Isolation & Safety Enforcement (Workstream 1)

1. **Zero Impact on Aurelia TimeFlow**:
   - Runtime safety check `assertSafeDatabaseUrl()` in `apps/web/app/lib/db.ts` inspects `DATABASE_URL` before any connection is opened and throws a hard error if the database name contains `aurelia`, `timeflow`, `postgres`, or `template`, or if the username is a master account (`postgres`, `rdsadmin`, `master`, `admin`).
2. **SQL Provisioning & Least-Privilege Roles (`migrations/000_provision_isolated_database_and_roles.sql`)**:
   - `estatepilot_migrator`: Owns database `estatepilot_ai` and schema `estatepilot`; used exclusively during controlled schema migrations.
   - `estatepilot_app`: Least-privilege application role with `NOSUPERUSER NOCREATEDB NOCREATEROLE`, `REVOKE ALL ON DATABASE estatepilot_ai FROM PUBLIC`, `SELECT, INSERT, UPDATE` on operational tables, and append-only `SELECT, INSERT` on `estatepilot.audit_events` (cannot delete or alter audit history).
3. **Production Schema (`migrations/001_estatepilot_schema.sql`)**:
   - `estatepilot.schema_migrations`: Tracks applied migration versions and SHA-256 checksums.
   - `estatepilot.properties`: Stores RERA-verified and pending-audit inventory (`approved_rate_per_sqft`, `is_verified`, `verified_by`, `verified_at`).
   - `estatepilot.leads`: Stores customer enquiries, explicit consent channel/evidence/timestamp, language preference (`English`, `Kannada`, `Telugu`, `Hindi`), and executive assignment.
   - `estatepilot.site_visits`: Tracks scheduled and completed site visits.
   - `estatepilot.calls`: Stores voice/AI call logs and transcripts.
   - `estatepilot.admin_users`: Stores staff credentials (`scrypt` password hashes, role, failed login counter, lockout timestamp).
   - `estatepilot.admin_sessions`: Stores SHA-256 session token hashes, CSRF tokens, IP/user-agent metadata, and expiry/revocation timestamps.
   - `estatepilot.audit_events`: Append-only compliance audit trail for every lead, property, and auth event.

---

## 3. Private VPC Connectivity Options & AWS Monthly Cost Analysis (Workstream 2 & 8)

Because `aurelia-timeflow-db-mumbai` is private inside the Mumbai VPC and AWS Amplify `WEB_COMPUTE` SSR compute runs in AWS-managed accounts outside your private VPC by default, PostgreSQL **must never** be exposed to `0.0.0.0/0`. Choose one of the two private connectivity options below (both keep total AWS spend well within the **$25/month** ceiling):

| Option | Architecture | Monthly AWS Cost (`ap-south-1`) | Recommendation |
| :--- | :--- | :--- | :--- |
| **Option A (Recommended — $0 extra compute)** | Keep frontend + API on **AWS Amplify WEB_COMPUTE** and attach an **AWS Lambda VPC Function URL / API Gateway HTTP API** in the same private VPC subnets as `aurelia-timeflow-db-mumbai` (or configure Amplify custom compute in VPC) with Security Group rule allowing TCP `5432` **only** from the Lambda Security Group `sg-estatepilot-runtime`. | **~$1.50 – $4.00 / month** (Amplify build/SSR + Secrets Manager `$0.40`/secret + CloudWatch Logs; existing `db.t3.micro` is already running). | **Best fit (< $5/mo incremental)** |
| **Option B (Dedicated Container/EC2 Runtime)** | Run `apps/api` or Next.js standalone on a `t4g.nano` / `t4g.micro` EC2 instance inside the private VPC behind an Application Load Balancer or CloudFront VPC Origin, allowing TCP `5432` only from the EC2 Security Group. | **~$6.50 – $14.00 / month** (`t4g.micro` ~$4.80/mo + EBS + Secrets Manager). | Use if persistent WebSockets/voice worker co-location is desired |

*Note: Avoid AWS NAT Gateway (~$32+/month) and AWS App Runner VPC Connector (~$25+/month) to stay strictly under the $25/month budget.*

---

## 4. Authentication, RBAC & Security Hardening (Workstream 4 & 5)

- **Zero Default Production Credentials**: No hardcoded admin passwords exist in code. First-time setup uses either:
  - CLI: `ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run db:provision-admin`
  - Web UI: `/login` One-Time Initial `SUPER_ADMIN` Setup (automatically disabled and returns `403 BOOTSTRAP_LOCKED` as soon as 1 admin user exists).
- **Roles Enforced Server-Side**:
  - `SUPER_ADMIN`: Full access, user/role provisioning (`/api/auth/users`), explicit baseline seeding (`/api/admin/seed`), property verification, lead management, and CSV exports.
  - `ADMIN`: Lead management, property upload & verification approval (`PATCH /api/properties`), and CSV report exports.
  - `MANAGER`: Lead management, executive assignment, property brochure upload (saved as `isVerified: false`), and CSV report exports; cannot approve property verification (`403`).
  - `EXECUTIVE`: Row-level scoped to leads assigned to their executive name; can update lead status/summary on their assigned leads; cannot reassign executives (`403`), cannot upload/verify properties (`403`), and cannot export bulk CSV reports (`403`).
- **Defense-in-Depth**:
  - Passwords hashed with Node `crypto.scryptSync` + 16-byte random salt and verified with `timingSafeEqual`.
  - Sessions stored as SHA-256 hashes in `estatepilot.admin_sessions` with `HttpOnly; SameSite=Lax; Secure` cookies (`ep_session`).
  - Mutating routes (`POST`/`PATCH` on admin endpoints) require matching `x-csrf-token`.
  - Brute-force protection: IP sliding-window rate limit + 5-strike account lockout (`locked_until` for 15 minutes).
  - Public enquiry protection: IP rate limiting, 5-minute duplicate submission guard (`409 DUPLICATE_LEAD`), phone/email validation, mandatory consent check, and Zero-Budget Compliance Rule rejecting any payload containing budget/salary/income fields (`400 COMPLIANCE_VIOLATION`).

---

## 5. Backup, Recovery & Operations Runbook (Workstream 7)

### Pre-Migration RDS Snapshot Command
Before running `000_provision_isolated_database_and_roles.sql` on `aurelia-timeflow-db-mumbai`:
```bash
aws rds create-db-snapshot \
  --region ap-south-1 \
  --db-instance-identifier aurelia-timeflow-db-mumbai \
  --db-snapshot-identifier aurelia-timeflow-pre-estatepilot-$(date +%Y%m%d-%H%M)
```

### Logical Backup of Isolated `estatepilot_ai` Database
```bash
pg_dump --dbname="$DATABASE_URL" \
  --schema=estatepilot \
  --format=custom \
  --file="estatepilot_ai_$(date +%Y%m%d_%H%M).dump"
```

### Restore Drill (into Isolated Staging Database `estatepilot_ai_restore_test`)
```bash
pg_restore --dbname="$STAGING_DATABASE_URL" \
  --clean --if-exists \
  "estatepilot_ai_YYYYMMDD_HHMM.dump"
```

### Rollback Procedure
- Schema changes in `migrations/001_estatepilot_schema.sql` are strictly additive inside the `estatepilot` schema.
- Application code rollback: Revert the Amplify deployment in `ap-south-1` (`d1mw2d2fqe4y6x`) to the previous immutable build artifact.

---

## 6. Production Readiness Checklist

- [x] Isolated PostgreSQL schema (`estatepilot`) & role provisioning SQL (`estatepilot_migrator`, `estatepilot_app`) prepared.
- [x] Runtime safety guard blocks any connection to `aurelia_timeflow` or RDS master user.
- [x] Durable PostgreSQL repositories replace in-memory state for leads, properties, site visits, calls, users, sessions, and audit logs.
- [x] Server-enforced authentication (`scrypt`, HTTP-only cookies, CSRF tokens, 5-strike lockout) and 4-role RBAC (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `EXECUTIVE`).
- [x] Unverified properties excluded from public inventory and AI Receptionist recommendations.
- [x] Automated test suite (`npm test`) verifying 22 end-to-end database, RBAC, security, and compliance assertions.
- [ ] **Pending User Authorization**: Execute `migrations/000_provision_isolated_database_and_roles.sql` on `aurelia-timeflow-db-mumbai` after taking pre-change RDS snapshot, and attach private VPC ingress rule + `DATABASE_URL` secret in `ap-south-1`.
