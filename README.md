# EstatePilot AI

AI-powered real-estate lead engagement and site-visit management.

EstatePilot AI receives property enquiries, places consent-aware outbound calls, understands customer requirements, matches verified inventory, schedules agreed callbacks and site visits, and produces Excel lead reports.

## Core product rules
- Support plots, independent houses, flats, and villas.
- Share only the approved rate per square foot (or approved unit rate where applicable).
- Never ask for, store, infer, or qualify customers by total budget.
- Never negotiate, promise discounts, or quote an unapproved final price. Refer negotiation to a one-to-one meeting with a sales executive.
- Never invent availability, approvals, amenities, possession dates, or property facts. Use verified inventory only and escalate unknowns.
- Follow up only at customer-agreed times, within configured calling hours and retry limits. Stop immediately on opt-out or do-not-contact requests.
- Maintain an audit trail of consent, calls, callbacks, site visits, and status changes.

## Initial architecture
- `apps/web`: Next.js admin dashboard and enquiry intake.
- `apps/api`: Fastify API for leads, inventory, matching, follow-ups, and reporting.
- `packages/shared`: shared types and validation contracts.
- PostgreSQL for persistent data; Redis/BullMQ for scheduled work (to be added).

## Local development
Requirements: Node.js 20+ and pnpm 9+.

```bash
pnpm install
pnpm dev
```

External integrations (telephony, voice AI, WhatsApp, and email) remain disabled until provider credentials, customer consent flows, and compliance settings are configured.

## Current status
This is the foundation commit: product requirements, Next.js dashboard shell, Fastify health endpoint, and implementation roadmap. Next: PostgreSQL schema, tenant-aware authentication, inventory and lead APIs, then voice and follow-up integrations.
