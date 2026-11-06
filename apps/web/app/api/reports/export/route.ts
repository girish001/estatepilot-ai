import { NextResponse } from "next/server";
import { requireRole } from "../../../lib/auth";
import { recordAuditEvent } from "../../../lib/db";
import {
  listCallsFromDb,
  listLeadsFromDb,
  listPropertiesFromDb,
  listSiteVisitsFromDb
} from "../../../lib/repositories";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Prevent unauthorized data exports: Only SUPER_ADMIN, ADMIN, and MANAGER can export CSV reports
  const auth = await requireRole(request, ["SUPER_ADMIN", "ADMIN", "MANAGER"]);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "daily-enquiries";

  let csvContent = "";
  let exportedCount = 0;
  const filename = `estatepilot-${type}-${new Date().toISOString().slice(0, 10)}.csv`;

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
      lead.referenceNumber,
      `"${lead.fullName.replaceAll('"', '""')}"`,
      lead.phone,
      lead.email || "",
      lead.source,
      lead.propertyType,
      `"${lead.preferredLocation.replaceAll('"', '""')}"`,
      `"${lead.preferredArea.replaceAll('"', '""')}"`,
      lead.preferredLanguage,
      lead.status,
      lead.consent.granted ? "YES" : "NO",
      lead.consent.capturedAt,
      `"${lead.assignedExecutive.replaceAll('"', '""')}"`,
      lead.nextActionAt || "",
      `"${(lead.aiConversationSummary || "").replaceAll('"', '""')}"`
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
      c.id,
      `"${c.customerName.replaceAll('"', '""')}"`,
      c.phone,
      c.language,
      c.startedAt,
      c.durationSeconds,
      c.status,
      `"${c.matchedPropertyNames.join("; ")}"`,
      `"${c.summary.replaceAll('"', '""')}"`
    ]);

    csvContent = BOM + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  } else if (type === "site-visits") {
    const siteVisits = await listSiteVisitsFromDb();
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
      v.id,
      `"${v.customerName.replaceAll('"', '""')}"`,
      v.phone,
      `"${v.propertyName.replaceAll('"', '""')}"`,
      v.scheduledAt,
      v.status,
      `"${v.assignedExecutive.replaceAll('"', '""')}"`,
      `"${v.notes.replaceAll('"', '""')}"`
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
      p.id,
      `"${p.name.replaceAll('"', '""')}"`,
      p.category,
      `"${p.location.replaceAll('"', '""')}"`,
      p.city,
      p.approvedRatePerSqFt,
      p.reraNumber,
      p.isVerified ? "VERIFIED" : "PENDING_VERIFICATION",
      `"${p.verifiedBy.replaceAll('"', '""')}"`,
      `"${p.possessionDate.replaceAll('"', '""')}"`
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
        `"${execName.replaceAll('"', '""')}"`,
        String(st.assigned),
        String(st.contacted),
        String(st.visitsScheduled),
        String(st.visitsCompleted),
        String(st.converted),
        rate
      ];
    });

    exportedCount = rows.length;
    csvContent = BOM + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }

  await recordAuditEvent(null, {
    entityType: "REPORT",
    entityId: type,
    action: "REPORT_CSV_EXPORTED",
    actorId: auth.session.user.id,
    actorRole: auth.session.user.role,
    details: { reportType: type, exportedRows: exportedCount }
  });

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
