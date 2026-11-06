import { NextResponse } from "next/server";
import { buildRateLimitUnavailableResponse, requireRole } from "../../../lib/auth";
import { isDatabaseUnavailableError, recordAuditEvent, redactPII } from "../../../lib/db";
import {
  listCallsFromDb,
  listLeadsFromDb,
  listPropertiesFromDb,
  listSiteVisitsFromDb
} from "../../../lib/repositories";

export const dynamic = "force-dynamic";

/**
 * Prevents CSV Formula Injection (CSV/Excel DDE & formula execution) by prefixing
 * values starting with =, +, -, @, tab, or carriage return with a single quote ('),
 * and wrapping strings in RFC-4180 double quotes.
 */
function sanitizeCsvCell(raw: string | number | boolean | null | undefined): string {
  const str = String(raw ?? "");
  const trimmedLeading = str.replace(/^[\s\u0000-\u001f]+/, "");
  const needsFormulaGuard =
    /^[=+\-@]/.test(str) ||
    /^[=+\-@]/.test(trimmedLeading) ||
    /^[\t\r\n]/.test(str);
  const safeValue = needsFormulaGuard ? `'${str}` : str;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  // Prevent unauthorized data exports: Only SUPER_ADMIN, ADMIN, and MANAGER can export CSV reports
  const auth = await requireRole(request, ["SUPER_ADMIN", "ADMIN", "MANAGER"]);
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "daily-enquiries";

    let csvContent = "";
    let exportedCount = 0;
    const safeTypeSlug = type.replace(/[^a-z0-9-_]/gi, "_").slice(0, 40) || "daily-enquiries";
    const filename = `estatepilot-${safeTypeSlug}-${new Date().toISOString().slice(0, 10)}.csv`;

    // UTF-8 BOM ensures Excel natively opens and displays regional characters (Kannada, Telugu, Hindi) and rupee signs correctly
    const BOM = "\uFEFF";

    if (type === "daily-enquiries" || type === "monthly-leads" || type === "weekly-performance") {
      const { leads } = await listLeadsFromDb({
        page: 1,
        pageSize: 1000,
        actor: auth.session.user
      });
      exportedCount = leads.length;

      const headers = [
        "Reference ID",
        "Full Name",
        "Phone",
        "Email",
        "Source",
        "Property Category",
        "Preferred Location",
        "Preferred Configuration",
        "Preferred Language",
        "Status",
        "Consent Granted",
        "Captured At",
        "Assigned Executive",
        "Next Action Date",
        "AI Summary"
      ];

      const rows = leads.map((lead) => [
        sanitizeCsvCell(lead.referenceNumber),
        sanitizeCsvCell(lead.fullName),
        sanitizeCsvCell(lead.phone),
        sanitizeCsvCell(lead.email || ""),
        sanitizeCsvCell(lead.source),
        sanitizeCsvCell(lead.propertyType),
        sanitizeCsvCell(lead.preferredLocation),
        sanitizeCsvCell(lead.preferredArea),
        sanitizeCsvCell(lead.preferredLanguage),
        sanitizeCsvCell(lead.status),
        sanitizeCsvCell(lead.consent.granted ? "YES" : "NO"),
        sanitizeCsvCell(lead.consent.capturedAt),
        sanitizeCsvCell(lead.assignedExecutive),
        sanitizeCsvCell(lead.nextActionAt || ""),
        sanitizeCsvCell(lead.aiConversationSummary || "")
      ]);

      csvContent = BOM + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    } else if (type === "call-summary") {
      const calls = await listCallsFromDb();
      exportedCount = calls.length;

      const headers = [
        "Call ID",
        "Customer Name",
        "Phone",
        "Language",
        "Started At",
        "Duration (Sec)",
        "Status",
        "Matched Properties",
        "Summary"
      ];

      const rows = calls.map((c) => [
        sanitizeCsvCell(c.id),
        sanitizeCsvCell(c.customerName),
        sanitizeCsvCell(c.phone),
        sanitizeCsvCell(c.language),
        sanitizeCsvCell(c.startedAt),
        String(c.durationSeconds),
        sanitizeCsvCell(c.status),
        sanitizeCsvCell(c.matchedPropertyNames.join("; ")),
        sanitizeCsvCell(c.summary)
      ]);

      csvContent = BOM + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    } else if (type === "site-visits") {
      const siteVisits = await listSiteVisitsFromDb(auth.session.user);
      exportedCount = siteVisits.length;

      const headers = [
        "Visit ID",
        "Customer Name",
        "Phone",
        "Property Name",
        "Scheduled Date & Time",
        "Status",
        "Assigned Executive",
        "Notes"
      ];

      const rows = siteVisits.map((v) => [
        sanitizeCsvCell(v.id),
        sanitizeCsvCell(v.customerName),
        sanitizeCsvCell(v.phone),
        sanitizeCsvCell(v.propertyName),
        sanitizeCsvCell(v.scheduledAt),
        sanitizeCsvCell(v.status),
        sanitizeCsvCell(v.assignedExecutive),
        sanitizeCsvCell(v.notes)
      ]);

      csvContent = BOM + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    } else if (type === "property-category") {
      const { properties } = await listPropertiesFromDb({ page: 1, pageSize: 1000 });
      exportedCount = properties.length;

      const headers = [
        "Property ID",
        "Project Name",
        "Category",
        "Location",
        "City",
        "Approved Rate Per Sq.Ft. (INR)",
        "RERA Number",
        "Verification Status",
        "Verified By",
        "Possession Date"
      ];

      const rows = properties.map((p) => [
        sanitizeCsvCell(p.id),
        sanitizeCsvCell(p.name),
        sanitizeCsvCell(p.category),
        sanitizeCsvCell(p.location),
        sanitizeCsvCell(p.city),
        String(p.approvedRatePerSqFt),
        sanitizeCsvCell(p.reraNumber),
        sanitizeCsvCell(p.isVerified ? "VERIFIED" : "PENDING_VERIFICATION"),
        sanitizeCsvCell(p.verifiedBy),
        sanitizeCsvCell(p.possessionDate)
      ]);

      csvContent = BOM + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    } else {
      // Sales Executive & Conversion aggregation computed directly from PostgreSQL leads
      const { leads } = await listLeadsFromDb({ page: 1, pageSize: 1000, actor: auth.session.user });
      const execStats = new Map<
        string,
        { assigned: number; contacted: number; visitsScheduled: number; visitsCompleted: number; converted: number }
      >();

      for (const l of leads) {
        const name = l.assignedExecutive || "Unassigned";
        const cur = execStats.get(name) || {
          assigned: 0,
          contacted: 0,
          visitsScheduled: 0,
          visitsCompleted: 0,
          converted: 0
        };
        cur.assigned += 1;
        if (l.status !== "NEW") cur.contacted += 1;
        if (l.status === "SITE_VISIT_SCHEDULED" || l.status === "SITE_VISITED" || l.status === "CONVERTED") {
          cur.visitsScheduled += 1;
        }
        if (l.status === "SITE_VISITED" || l.status === "CONVERTED") {
          cur.visitsCompleted += 1;
        }
        if (l.status === "CONVERTED") {
          cur.converted += 1;
        }
        execStats.set(name, cur);
      }

      const headers = [
        "Executive Name",
        "Total Assigned",
        "Contacted",
        "Visits Scheduled",
        "Visits Completed",
        "Converted",
        "Conversion Rate"
      ];

      const rows = Array.from(execStats.entries()).map(([execName, st]) => {
        const rate = st.assigned > 0 ? `${((st.converted / st.assigned) * 100).toFixed(1)}%` : "0.0%";
        return [
          sanitizeCsvCell(execName),
          String(st.assigned),
          String(st.contacted),
          String(st.visitsScheduled),
          String(st.visitsCompleted),
          String(st.converted),
          sanitizeCsvCell(rate)
        ];
      });

      exportedCount = rows.length;
      csvContent = BOM + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    }

    await recordAuditEvent(null, {
      entityType: "REPORT",
      entityId: safeTypeSlug,
      action: "REPORT_CSV_EXPORTED",
      actorId: auth.session.user.id,
      actorRole: auth.session.user.role,
      details: { reportType: safeTypeSlug, exportedRows: exportedCount }
    });

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to generate report export.";
    console.error("[GET /api/reports/export Error]:", redactPII(msg));
    if (isDatabaseUnavailableError(error)) {
      return buildRateLimitUnavailableResponse();
    }
    return NextResponse.json(
      { success: false, message: "Unable to export report at this time." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
