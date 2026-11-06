import { NextResponse } from "next/server";
import { INITIAL_CALLS, INITIAL_LEADS, INITIAL_PROPERTIES, INITIAL_SITE_VISITS } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "daily-enquiries";

  let csvContent = "";
  let filename = `estatepilot-${type}-${new Date().toISOString().slice(0, 10)}.csv`;

  // UTF-8 BOM ensures Excel natively opens and displays regional characters (Kannada, Telugu, Hindi) and rupee signs correctly!
  const BOM = "\uFEFF";

  if (type === "daily-enquiries" || type === "monthly-leads") {
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

    const rows = INITIAL_LEADS.map((lead) => [
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

    const rows = INITIAL_CALLS.map((c) => [
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

    const rows = INITIAL_SITE_VISITS.map((v) => [
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

    const rows = INITIAL_PROPERTIES.map((p) => [
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
    // Executive / Conversion overview
    const headers = ["Executive Name", "Total Assigned", "Contacted", "Visits Scheduled", "Visits Completed", "Converted", "Conversion Rate"];
    const rows = [
      ['"Rajesh Sharma (Senior Property Specialist)"', "18", "16", "9", "7", "4", "22.2%"],
      ['"Priya Nair (Lead Relationship Manager)"', "14", "13", "6", "5", "3", "21.4%"],
      ['"Suresh Kumar (Kannada Language Specialist)"', "12", "11", "5", "4", "2", "16.7%"]
    ];
    csvContent = BOM + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
