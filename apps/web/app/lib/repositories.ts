import { randomUUID } from "node:crypto";
import { dbQuery, withTransaction, recordAuditEvent, type DbClient } from "./db";
import {
  INITIAL_CALLS,
  INITIAL_LEADS,
  INITIAL_PROPERTIES,
  INITIAL_SITE_VISITS,
  type CallLogItem,
  type LeadRecord,
  type LeadStatus,
  type PropertyCategory,
  type PropertyRecord,
  type SiteVisitRecord,
  type SupportedLanguage
} from "./store";
import type { AdminUser } from "./auth";

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
}

export interface LeadMetrics {
  total: number;
  newLeads: number;
  contacted: number;
  interested: number;
  callbacksDue: number;
  siteVisitsScheduled: number;
  siteVisitsCompleted: number;
  converted: number;
  lost: number;
}

/**
 * Queries ONLY verified properties from PostgreSQL for customer recommendations.
 */
export async function matchVerifiedPropertiesFromDb(
  category: PropertyCategory,
  preferredLocation?: string
): Promise<PropertyRecord[]> {
  const res = await dbQuery<{ record: PropertyRecord }>(
    `SELECT record
     FROM estatepilot.properties
     WHERE is_verified = TRUE
       AND category = $1
     ORDER BY created_at DESC`,
    [category]
  );

  const verifiedList = res.rows.map((r) => r.record);
  if (!preferredLocation || preferredLocation.trim().length === 0) {
    return verifiedList;
  }

  const loc = preferredLocation.trim().toLowerCase();
  const locationMatched = verifiedList.filter(
    (p) =>
      p.location.toLowerCase().includes(loc) ||
      p.landmark.toLowerCase().includes(loc) ||
      p.city.toLowerCase().includes(loc) ||
      p.name.toLowerCase().includes(loc)
  );

  return locationMatched.length > 0 ? locationMatched : verifiedList;
}

/**
 * Lists properties from PostgreSQL with filtering, search, and pagination.
 */
export async function listPropertiesFromDb(params: {
  category?: string | null;
  city?: string | null;
  verifiedOnly?: boolean;
  q?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<{
  properties: PropertyRecord[];
  total: number;
  verifiedCount: number;
  pagination: PaginationMeta;
}> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.category && params.category !== "ALL") {
    values.push(params.category);
    conditions.push(`category = $${values.length}`);
  }
  if (params.city && params.city !== "ALL") {
    values.push(params.city);
    conditions.push(`LOWER(city) = LOWER($${values.length})`);
  }
  if (params.verifiedOnly) {
    conditions.push(`is_verified = TRUE`);
  }
  if (params.q && params.q.trim().length > 0) {
    values.push(`%${params.q.trim()}%`);
    conditions.push(`(name ILIKE $${values.length} OR location ILIKE $${values.length} OR city ILIKE $${values.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(Math.max(1, Number(params.pageSize || 50)), 100);
  const offset = (page - 1) * pageSize;

  const countRes = await dbQuery<{ total: number; verified_cnt: number }>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE is_verified = TRUE)::int AS verified_cnt
     FROM estatepilot.properties`
  );

  const filteredCountRes = await dbQuery<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM estatepilot.properties ${whereClause}`,
    values
  );

  const paginatedValues = [...values, pageSize, offset];
  const rowsRes = await dbQuery<{ record: PropertyRecord }>(
    `SELECT record
     FROM estatepilot.properties
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paginatedValues.length - 1} OFFSET $${paginatedValues.length}`,
    paginatedValues
  );

  const totalFiltered = Number(filteredCountRes.rows[0]?.cnt ?? 0);

  return {
    properties: rowsRes.rows.map((r) => r.record),
    total: Number(countRes.rows[0]?.total ?? 0),
    verifiedCount: Number(countRes.rows[0]?.verified_cnt ?? 0),
    pagination: {
      page,
      pageSize,
      totalRecords: totalFiltered,
      totalPages: Math.max(1, Math.ceil(totalFiltered / pageSize))
    }
  };
}

/**
 * Creates a new property in PostgreSQL (unverified by default until admin review).
 */
export async function createPropertyInDb(params: {
  id?: string;
  name: string;
  category: PropertyCategory;
  location?: string;
  landmark?: string;
  city?: string;
  minAreaSqFt?: number;
  maxAreaSqFt?: number;
  approvedRatePerSqFt: number;
  amenities?: string[];
  reraNumber?: string;
  approvals?: string[];
  possessionDate?: string;
  description?: string;
  brochureFileName?: string;
  actor: AdminUser;
}): Promise<PropertyRecord> {
  const cleanName = String(params.name || "").trim();
  if (!cleanName) {
    throw new Error("Project name is required.");
  }
  if (!["PLOT", "INDEPENDENT_HOUSE", "FLAT", "VILLA"].includes(params.category)) {
    throw new Error("Invalid property category.");
  }
  const rate = Number(params.approvedRatePerSqFt);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Approved rate per sq.ft. must be a positive number.");
  }

  const nowIso = new Date().toISOString();
  const newProp: PropertyRecord = {
    id: params.id && /^prop-[a-zA-Z0-9_-]+$/.test(params.id) ? params.id : `prop-${randomUUID().slice(0, 8)}`,
    name: cleanName,
    category: params.category,
    location: String(params.location || "Bangalore").trim(),
    landmark: String(params.landmark || "").trim(),
    city: String(params.city || "Bangalore").trim(),
    minAreaSqFt: Math.max(100, Number(params.minAreaSqFt) || 1200),
    maxAreaSqFt: Math.max(100, Number(params.maxAreaSqFt) || 2400),
    approvedRatePerSqFt: rate,
    currency: "INR",
    availabilityStatus: "AVAILABLE",
    isVerified: false, // Mandatory Rule: Uploaded brochures start unverified
    verifiedBy: "Pending Operational Verification",
    verifiedAt: "",
    amenities:
      Array.isArray(params.amenities) && params.amenities.length > 0
        ? params.amenities.map((a) => String(a).trim())
        : ["Gated community", "Security", "Road access"],
    reraNumber: String(params.reraNumber || "Under Review").trim(),
    approvals:
      Array.isArray(params.approvals) && params.approvals.length > 0
        ? params.approvals.map((a) => String(a).trim())
        : ["A-Khata pending"],
    possessionDate: String(params.possessionDate || "Within 12 months").trim(),
    description: String(params.description || "Brochure uploaded into knowledge base.").trim(),
    brochureFileName: String(params.brochureFileName || "Uploaded-Brochure.pdf").trim(),
    brochureUploadedAt: nowIso
  };

  await withTransaction(async (tx: DbClient) => {
    await tx.query(
      `INSERT INTO estatepilot.properties (
        id, name, category, location, city, is_verified,
        approved_rate_per_sqft, availability_status, verified_by, verified_at,
        record, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7, $8, NULL, $9::jsonb, NOW(), NOW())`,
      [
        newProp.id,
        newProp.name,
        newProp.category,
        newProp.location,
        newProp.city,
        newProp.approvedRatePerSqFt,
        newProp.availabilityStatus,
        newProp.verifiedBy,
        JSON.stringify(newProp)
      ]
    );

    await recordAuditEvent(tx, {
      entityType: "PROPERTY",
      entityId: newProp.id,
      action: "PROPERTY_CREATED_UNVERIFIED",
      actorId: params.actor.id,
      actorRole: params.actor.role,
      details: {
        name: newProp.name,
        category: newProp.category,
        approvedRatePerSqFt: newProp.approvedRatePerSqFt
      }
    });
  });

  return newProp;
}

/**
 * Updates or verifies a property in PostgreSQL (restricted to SUPER_ADMIN and ADMIN).
 */
export async function updatePropertyInDb(params: {
  id: string;
  isVerified?: boolean;
  verifiedBy?: string;
  approvedRatePerSqFt?: number;
  availabilityStatus?: "AVAILABLE" | "FEW_UNITS_LEFT" | "SOLD_OUT";
  description?: string;
  actor: AdminUser;
}): Promise<PropertyRecord> {
  if (!["SUPER_ADMIN", "ADMIN"].includes(params.actor.role)) {
    throw new Error("FORBIDDEN: Only ADMIN or SUPER_ADMIN roles can verify properties or modify approved rates.");
  }

  return withTransaction(async (tx: DbClient) => {
    const existingRes = await tx.query<{ record: PropertyRecord }>(
      "SELECT record FROM estatepilot.properties WHERE id = $1",
      [params.id]
    );
    if (existingRes.rowCount === 0) {
      throw new Error("NOT_FOUND: Property not found.");
    }

    const current = existingRes.rows[0].record;
    const nextVerified = typeof params.isVerified === "boolean" ? params.isVerified : current.isVerified;
    const nextRate =
      params.approvedRatePerSqFt !== undefined ? Number(params.approvedRatePerSqFt) : current.approvedRatePerSqFt;

    if (!Number.isFinite(nextRate) || nextRate <= 0) {
      throw new Error("Approved rate per sq.ft. must be a positive number.");
    }

    const verifiedAtIso = nextVerified ? new Date().toISOString() : "";
    const verifiedByText =
      params.verifiedBy ||
      (nextVerified ? `${params.actor.fullName} (${params.actor.role} Approved)` : "Pending Operational Review");

    const updated: PropertyRecord = {
      ...current,
      isVerified: nextVerified,
      verifiedBy: verifiedByText,
      verifiedAt: verifiedAtIso,
      approvedRatePerSqFt: nextRate,
      availabilityStatus: params.availabilityStatus || current.availabilityStatus,
      description: params.description !== undefined ? String(params.description).trim() : current.description
    };

    await tx.query(
      `UPDATE estatepilot.properties
       SET is_verified = $1,
           verified_by = $2,
           verified_at = $3,
           approved_rate_per_sqft = $4,
           availability_status = $5,
           record = $6::jsonb,
           updated_at = NOW()
       WHERE id = $7`,
      [
        updated.isVerified,
        updated.verifiedBy,
        updated.isVerified ? verifiedAtIso : null,
        updated.approvedRatePerSqFt,
        updated.availabilityStatus,
        JSON.stringify(updated),
        updated.id
      ]
    );

    await recordAuditEvent(tx, {
      entityType: "PROPERTY",
      entityId: updated.id,
      action: typeof params.isVerified === "boolean"
        ? updated.isVerified
          ? "PROPERTY_VERIFIED"
          : "PROPERTY_VERIFICATION_REVOKED"
        : "PROPERTY_UPDATED",
      actorId: params.actor.id,
      actorRole: params.actor.role,
      details: {
        isVerified: updated.isVerified,
        approvedRatePerSqFt: updated.approvedRatePerSqFt,
        verifiedBy: updated.verifiedBy
      }
    });

    return updated;
  });
}

/**
 * Lists leads from PostgreSQL with filtering, search, pagination, and EXECUTIVE RBAC scoping.
 */
export async function listLeadsFromDb(params: {
  status?: string | null;
  category?: string | null;
  language?: string | null;
  q?: string | null;
  page?: number;
  pageSize?: number;
  actor?: AdminUser | null;
}): Promise<{
  leads: LeadRecord[];
  metrics: LeadMetrics;
  pagination: PaginationMeta;
}> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  // Role-based row filtering: EXECUTIVE can only access leads assigned to them
  if (params.actor && params.actor.role === "EXECUTIVE") {
    const execIdentifier = params.actor.executiveDisplayName || params.actor.fullName;
    values.push(`%${execIdentifier}%`);
    conditions.push(`assigned_executive ILIKE $${values.length}`);
  }

  if (params.status && params.status !== "ALL") {
    values.push(params.status);
    conditions.push(`status = $${values.length}`);
  }
  if (params.category && params.category !== "ALL") {
    values.push(params.category);
    conditions.push(`property_type = $${values.length}`);
  }
  if (params.language && params.language !== "ALL") {
    values.push(params.language);
    conditions.push(`LOWER(preferred_language) = LOWER($${values.length})`);
  }
  if (params.q && params.q.trim().length > 0) {
    values.push(`%${params.q.trim()}%`);
    conditions.push(
      `(full_name ILIKE $${values.length} OR phone ILIKE $${values.length} OR preferred_location ILIKE $${values.length} OR reference_number ILIKE $${values.length})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(Math.max(1, Number(params.pageSize || 50)), 100);
  const offset = (page - 1) * pageSize;

  // Scope metrics to executive if caller is EXECUTIVE
  const metricsConditions: string[] = [];
  const metricsValues: unknown[] = [];
  if (params.actor && params.actor.role === "EXECUTIVE") {
    const execIdentifier = params.actor.executiveDisplayName || params.actor.fullName;
    metricsValues.push(`%${execIdentifier}%`);
    metricsConditions.push(`WHERE assigned_executive ILIKE $1`);
  }
  const metricsWhere = metricsConditions.join(" ");

  const metricsRes = await dbQuery<{
    total: number;
    new_leads: number;
    contacted: number;
    interested: number;
    callbacks_due: number;
    site_visits_scheduled: number;
    site_visits_completed: number;
    converted: number;
    lost: number;
  }>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'NEW')::int AS new_leads,
       COUNT(*) FILTER (WHERE status = 'CONTACTED')::int AS contacted,
       COUNT(*) FILTER (WHERE status = 'INTERESTED')::int AS interested,
       COUNT(*) FILTER (WHERE status = 'CALLBACK_SCHEDULED')::int AS callbacks_due,
       COUNT(*) FILTER (WHERE status = 'SITE_VISIT_SCHEDULED')::int AS site_visits_scheduled,
       COUNT(*) FILTER (WHERE status = 'SITE_VISITED')::int AS site_visits_completed,
       COUNT(*) FILTER (WHERE status = 'CONVERTED')::int AS converted,
       COUNT(*) FILTER (WHERE status IN ('LOST', 'DO_NOT_CONTACT'))::int AS lost
     FROM estatepilot.leads
     ${metricsWhere}`,
    metricsValues
  );

  const countRes = await dbQuery<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM estatepilot.leads ${whereClause}`,
    values
  );

  const paginatedValues = [...values, pageSize, offset];
  const rowsRes = await dbQuery<{ record: LeadRecord }>(
    `SELECT record
     FROM estatepilot.leads
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paginatedValues.length - 1} OFFSET $${paginatedValues.length}`,
    paginatedValues
  );

  const m = metricsRes.rows[0];
  const totalRecords = Number(countRes.rows[0]?.cnt ?? 0);

  return {
    leads: rowsRes.rows.map((r) => r.record),
    metrics: {
      total: Number(m?.total ?? 0),
      newLeads: Number(m?.new_leads ?? 0),
      contacted: Number(m?.contacted ?? 0),
      interested: Number(m?.interested ?? 0),
      callbacksDue: Number(m?.callbacks_due ?? 0),
      siteVisitsScheduled: Number(m?.site_visits_scheduled ?? 0),
      siteVisitsCompleted: Number(m?.site_visits_completed ?? 0),
      converted: Number(m?.converted ?? 0),
      lost: Number(m?.lost ?? 0)
    },
    pagination: {
      page,
      pageSize,
      totalRecords,
      totalPages: Math.max(1, Math.ceil(totalRecords / pageSize))
    }
  };
}

/**
 * Creates a new customer enquiry lead in PostgreSQL inside an atomic transaction.
 */
export async function createLeadInDb(params: {
  fullName: string;
  phone: string;
  email?: string;
  propertyType?: string;
  preferredLocation?: string;
  preferredArea?: string;
  preferredLanguage?: string;
  callConsent: boolean;
  source?: string;
  rawBody?: Record<string, unknown>;
}): Promise<{
  lead: LeadRecord;
  referenceNumber: string;
  matchedProperties: PropertyRecord[];
  roomId: string;
}> {
  // Enforce Rule 1: Reject any attempt to submit budget, salary, or income profiling fields
  if (params.rawBody) {
    for (const key of Object.keys(params.rawBody)) {
      if (/(budget|salary|income|loan)/i.test(key) && params.rawBody[key] !== undefined) {
        throw new Error(
          `COMPLIANCE_VIOLATION: Field "${key}" is prohibited. EstatePilot AI strictly never collects customer budget or income data.`
        );
      }
    }
  }

  const cleanName = String(params.fullName || "").trim();
  if (!cleanName || cleanName.length < 2 || cleanName.length > 100) {
    throw new Error("VALIDATION: Full name is required (2–100 characters).");
  }

  const digits = String(params.phone || "").replace(/\D/g, "");
  const last10 = digits.slice(-10);
  if (!/^[6-9]\d{9}$/.test(last10)) {
    throw new Error("VALIDATION: Please provide a valid 10-digit Indian mobile number.");
  }
  const formattedPhone = `+91${last10}`;

  if (params.callConsent !== true) {
    throw new Error("VALIDATION: Consent to be contacted is required to submit an enquiry.");
  }

  const category: PropertyCategory = ["PLOT", "INDEPENDENT_HOUSE", "FLAT", "VILLA"].includes(
    String(params.propertyType || "")
  )
    ? (params.propertyType as PropertyCategory)
    : "PLOT";

  const lang: SupportedLanguage = ["English", "Kannada", "Telugu", "Hindi"].includes(
    String(params.preferredLanguage || "")
  )
    ? (params.preferredLanguage as SupportedLanguage)
    : "English";

  const cleanEmail = params.email ? String(params.email).trim() : undefined;
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error("VALIDATION: Please provide a valid email address.");
  }

  const matchedProperties = await matchVerifiedPropertiesFromDb(category, params.preferredLocation);

  const defaultExecutive =
    lang === "Kannada"
      ? "Suresh Kumar (Kannada Language Specialist)"
      : category === "FLAT"
      ? "Priya Nair (Lead Relationship Manager)"
      : "Rajesh Sharma (Senior Property Specialist)";

  return withTransaction(async (tx: DbClient) => {
    // Duplicate submission check within last 5 minutes for same phone + property category
    const dupCheck = await tx.query<{ reference_number: string }>(
      `SELECT reference_number
       FROM estatepilot.leads
       WHERE phone = $1
         AND property_type = $2
         AND created_at > NOW() - INTERVAL '5 minutes'
       LIMIT 1`,
      [formattedPhone, category]
    );
    if (dupCheck.rowCount > 0) {
      throw new Error(
        `DUPLICATE: An enquiry (${dupCheck.rows[0].reference_number}) was recently submitted for this mobile number and property category.`
      );
    }

    const nowIso = new Date().toISOString();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const referenceNumber = `EP-2026-${randomSuffix}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const newLeadId = `lead-${randomUUID().slice(0, 12)}`;
    const roomId = `room-${randomUUID().slice(0, 8)}`;

    const newLead: LeadRecord = {
      id: newLeadId,
      referenceNumber,
      fullName: cleanName,
      phone: formattedPhone,
      email: cleanEmail,
      source: (params.source as LeadRecord["source"]) || "PUBLIC_WEBSITE",
      propertyType: category,
      preferredLocation: params.preferredLocation ? String(params.preferredLocation).trim() : "Bangalore",
      preferredArea: params.preferredArea ? String(params.preferredArea).trim() : "Standard",
      preferredLanguage: lang,
      status: "NEW",
      consent: {
        channel: "PHONE_CALL",
        granted: true,
        capturedAt: nowIso,
        purpose: "Property consultation & site-visit scheduling",
        evidence: "Online enquiry submission checkbox verified: Customer agreed to phone contact."
      },
      createdAt: nowIso,
      updatedAt: nowIso,
      assignedExecutive: defaultExecutive,
      notes: "Newly received website enquiry. Budget was NOT requested per EstatePilot core rules.",
      matchedPropertyIds: matchedProperties.map((p) => p.id),
      callIds: [],
      siteVisitIds: []
    };

    await tx.query(
      `INSERT INTO estatepilot.leads (
        id, reference_number, full_name, phone, email, source,
        status, property_type, preferred_location, preferred_language,
        assigned_executive, consent_granted, consent_captured_at,
        next_action_at, record, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, TRUE, $12,
        NULL, $13::jsonb, NOW(), NOW()
      )`,
      [
        newLead.id,
        newLead.referenceNumber,
        newLead.fullName,
        newLead.phone,
        newLead.email ?? null,
        newLead.source,
        newLead.status,
        newLead.propertyType,
        newLead.preferredLocation,
        newLead.preferredLanguage,
        newLead.assignedExecutive,
        nowIso,
        JSON.stringify(newLead)
      ]
    );

    await recordAuditEvent(tx, {
      entityType: "CONSENT",
      entityId: newLead.id,
      action: "CONSENT_GRANTED_ONLINE",
      actorId: "public_customer",
      actorRole: "PUBLIC",
      details: {
        referenceNumber: newLead.referenceNumber,
        channel: "PHONE_CALL",
        capturedAt: nowIso
      }
    });

    await recordAuditEvent(tx, {
      entityType: "LEAD",
      entityId: newLead.id,
      action: "LEAD_CREATED",
      actorId: "public_customer",
      actorRole: "PUBLIC",
      details: {
        referenceNumber: newLead.referenceNumber,
        propertyType: newLead.propertyType,
        preferredLanguage: newLead.preferredLanguage,
        matchedCount: matchedProperties.length
      }
    });

    return {
      lead: newLead,
      referenceNumber,
      matchedProperties,
      roomId
    };
  });
}

/**
 * Updates an existing lead in PostgreSQL inside an atomic transaction with RBAC checks.
 */
export async function updateLeadInDb(params: {
  leadId: string;
  status?: LeadStatus;
  assignedExecutive?: string;
  notes?: string;
  nextActionAt?: string | null;
  actor: AdminUser;
}): Promise<LeadRecord> {
  const validStatuses: LeadStatus[] = [
    "NEW",
    "CONTACTED",
    "INTERESTED",
    "CALLBACK_SCHEDULED",
    "SITE_VISIT_SCHEDULED",
    "SITE_VISITED",
    "CONVERTED",
    "LOST",
    "DO_NOT_CONTACT"
  ];

  if (params.status && !validStatuses.includes(params.status)) {
    throw new Error(`VALIDATION: Invalid lead status "${params.status}".`);
  }

  return withTransaction(async (tx: DbClient) => {
    const existingRes = await tx.query<{ record: LeadRecord; assigned_executive: string }>(
      "SELECT record, assigned_executive FROM estatepilot.leads WHERE id = $1",
      [params.leadId]
    );

    if (existingRes.rowCount === 0) {
      throw new Error("NOT_FOUND: Lead not found.");
    }

    const current = existingRes.rows[0].record;

    // RBAC Check for EXECUTIVE role
    if (params.actor.role === "EXECUTIVE") {
      const execIdent = (params.actor.executiveDisplayName || params.actor.fullName).toLowerCase();
      if (!current.assignedExecutive.toLowerCase().includes(execIdent)) {
        throw new Error("FORBIDDEN: Executives can only access and update leads assigned to them.");
      }
      if (params.assignedExecutive && params.assignedExecutive !== current.assignedExecutive) {
        throw new Error("FORBIDDEN: Executives are not permitted to reassign leads to other specialists.");
      }
    }

    const nowIso = new Date().toISOString();
    const updated: LeadRecord = {
      ...current,
      status: params.status || current.status,
      assignedExecutive: params.assignedExecutive ? String(params.assignedExecutive).trim() : current.assignedExecutive,
      notes: params.notes !== undefined ? String(params.notes) : current.notes,
      nextActionAt:
        params.nextActionAt !== undefined
          ? params.nextActionAt
            ? new Date(params.nextActionAt).toISOString()
            : undefined
          : current.nextActionAt,
      updatedAt: nowIso
    };

    await tx.query(
      `UPDATE estatepilot.leads
       SET status = $1,
           assigned_executive = $2,
           next_action_at = $3,
           record = $4::jsonb,
           updated_at = NOW()
       WHERE id = $5`,
      [
        updated.status,
        updated.assignedExecutive,
        updated.nextActionAt ?? null,
        JSON.stringify(updated),
        updated.id
      ]
    );

    await recordAuditEvent(tx, {
      entityType: "LEAD",
      entityId: updated.id,
      action: "LEAD_UPDATED",
      actorId: params.actor.id,
      actorRole: params.actor.role,
      details: {
        previousStatus: current.status,
        newStatus: updated.status,
        assignedExecutive: updated.assignedExecutive,
        nextActionAt: updated.nextActionAt ?? null
      }
    });

    return updated;
  });
}

/**
 * Lists site visits and call logs from PostgreSQL for reporting and follow-up views.
 */
export async function listSiteVisitsFromDb(): Promise<SiteVisitRecord[]> {
  const res = await dbQuery<{ record: SiteVisitRecord }>(
    "SELECT record FROM estatepilot.site_visits ORDER BY scheduled_at ASC"
  );
  return res.rows.map((r) => r.record);
}

export async function listCallsFromDb(): Promise<CallLogItem[]> {
  const res = await dbQuery<{ record: CallLogItem }>(
    "SELECT record FROM estatepilot.calls ORDER BY started_at DESC"
  );
  return res.rows.map((r) => r.record);
}

/**
 * Reviewed seed-data process: Explicitly seeds baseline properties, leads, site visits, and call logs
 * into PostgreSQL when invoked by an authorized process or test harness.
 * Never runs automatically against an external production database unless explicitly invoked.
 */
export async function seedReviewedBaselineData(actorId = "system_reviewed_seed"): Promise<{
  propertiesSeeded: number;
  leadsSeeded: number;
  siteVisitsSeeded: number;
  callsSeeded: number;
}> {
  return withTransaction(async (tx: DbClient) => {
    let propertiesSeeded = 0;
    let leadsSeeded = 0;
    let siteVisitsSeeded = 0;
    let callsSeeded = 0;

    for (const prop of INITIAL_PROPERTIES) {
      const res = await tx.query(
        `INSERT INTO estatepilot.properties (
          id, name, category, location, city, is_verified,
          approved_rate_per_sqft, availability_status, verified_by, verified_at,
          record, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING`,
        [
          prop.id,
          prop.name,
          prop.category,
          prop.location,
          prop.city,
          prop.isVerified,
          prop.approvedRatePerSqFt,
          prop.availabilityStatus,
          prop.verifiedBy,
          prop.verifiedAt ? prop.verifiedAt : null,
          JSON.stringify(prop)
        ]
      );
      propertiesSeeded += res.rowCount;
    }

    for (const lead of INITIAL_LEADS) {
      const res = await tx.query(
        `INSERT INTO estatepilot.leads (
          id, reference_number, full_name, phone, email, source,
          status, property_type, preferred_location, preferred_language,
          assigned_executive, consent_granted, consent_captured_at,
          next_action_at, record, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17)
        ON CONFLICT (id) DO NOTHING`,
        [
          lead.id,
          lead.referenceNumber,
          lead.fullName,
          lead.phone,
          lead.email ?? null,
          lead.source,
          lead.status,
          lead.propertyType,
          lead.preferredLocation,
          lead.preferredLanguage,
          lead.assignedExecutive,
          lead.consent.granted,
          lead.consent.capturedAt,
          lead.nextActionAt ?? null,
          JSON.stringify(lead),
          lead.createdAt,
          lead.updatedAt
        ]
      );
      leadsSeeded += res.rowCount;
    }

    for (const visit of INITIAL_SITE_VISITS) {
      const res = await tx.query(
        `INSERT INTO estatepilot.site_visits (
          id, lead_id, property_id, scheduled_at, status, assigned_executive, record
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (id) DO NOTHING`,
        [
          visit.id,
          visit.leadId,
          visit.propertyId,
          visit.scheduledAt,
          visit.status,
          visit.assignedExecutive,
          JSON.stringify(visit)
        ]
      );
      siteVisitsSeeded += res.rowCount;
    }

    for (const call of INITIAL_CALLS) {
      const res = await tx.query(
        `INSERT INTO estatepilot.calls (
          id, lead_id, room_id, language, status, started_at, duration_seconds, record
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (id) DO NOTHING`,
        [
          call.id,
          call.leadId ?? null,
          call.roomId,
          call.language,
          call.status,
          call.startedAt,
          call.durationSeconds,
          JSON.stringify(call)
        ]
      );
      callsSeeded += res.rowCount;
    }

    await recordAuditEvent(tx, {
      entityType: "PROPERTY",
      entityId: "baseline-seed",
      action: "REVIEWED_SEED_APPLIED",
      actorId,
      actorRole: "SUPER_ADMIN",
      details: { propertiesSeeded, leadsSeeded, siteVisitsSeeded, callsSeeded }
    });

    return { propertiesSeeded, leadsSeeded, siteVisitsSeeded, callsSeeded };
  });
}
