# EstatePilot AI — production data readiness

## Current deployment boundary

EstatePilot is connected to the existing Amplify app in Mumbai. The existing
RDS instance `aurelia-timeflow-db-mumbai` was inspected read-only. Its security
group currently has no ingress rules. No RDS, security-group, database, or
Aurelia TimeFlow changes are authorized by the current approval.

The web lead/property route handlers currently use process memory. This is
not durable and must not be used to collect real customer enquiries.

## Required isolated database setup (not yet executed)

After explicit authorization for SQL-level RDS changes:

1. Create a separate database named `estatepilot_ai` on the existing RDS
   instance. Do not use or alter the Aurelia TimeFlow database.
2. Create a dedicated application role with a generated secret stored only
   in the approved secret store. Do not reuse the RDS master account.
3. Connect as a migration/admin role and apply
   `migrations/001_estatepilot_schema.sql` to the new database.
4. Grant the application role only the required schema/table privileges.
   Keep migration privileges separate from runtime privileges.
5. Validate backup/restore and retention requirements before accepting
   production personal data.

The SQL migration creates an isolated `estatepilot` schema containing
properties, leads, and audit events. It intentionally does not seed demo
records or alter existing schemas.

## Network and runtime architecture (not yet configured)

The current RDS security group has no ingress. A secure connection requires
a private runtime with network reachability to the RDS VPC and a narrowly
scoped security-group rule from that runtime. Do not expose PostgreSQL to
the public internet. Amplify hosting configuration alone does not create
private VPC connectivity to RDS.

Before implementing connectivity, choose a supported private compute
architecture that fits the approved monthly cost ceiling. No new paid AWS
resources or network/security-group changes are authorized yet.

## Application work still required

- Replace in-memory lead/property state with parameterized PostgreSQL queries.
- Add authenticated, role-based access to administrative write endpoints.
- Add tenant isolation if the product is offered to multiple agencies.
- Persist consent evidence and append-only audit events for state changes.
- Add pagination, rate limiting, request-size limits, and PII-safe logging.
- Restrict CSV exports to authenticated authorized users.
- Add automated migration, integration, and restore tests.
- Verify the actual production build and deployment before announcing launch.

## Environment configuration

Use a connection string supplied through the approved secret mechanism.
Never commit credentials or put them in client-exposed `NEXT_PUBLIC_*`
variables. Runtime connections should use TLS with certificate validation
and a bounded connection pool. Do not enable SSL verification bypasses.

## Launch gate

Do not accept real customer data until database provisioning, private
network connectivity, durable API integration, authentication, and a
successful production smoke test are complete.
