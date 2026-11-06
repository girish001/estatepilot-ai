"use client";

import { useState } from "react";
import Navbar from "../components/Navbar";

interface ReportMeta {
  id: string;
  title: string;
  description: string;
  cadence: string;
  recordsCount: number;
  exportUrl: string;
}

export default function ReportsPage() {
  const [selectedReportId, setSelectedReportId] = useState("daily-enquiries");

  const reports: ReportMeta[] = [
    {
      id: "daily-enquiries",
      title: "Daily Enquiry Report",
      description: "Complete list of customer enquiries received today across all 4 property categories with consent verification records.",
      cadence: "Daily (24h)",
      recordsCount: 32,
      exportUrl: "/api/reports/export?type=daily-enquiries"
    },
    {
      id: "weekly-performance",
      title: "Weekly Performance Report",
      description: "Aggregated conversion metrics, lead velocity, response times, and AI receptionist resolution rates.",
      cadence: "Weekly",
      recordsCount: 124,
      exportUrl: "/api/reports/export?type=daily-enquiries"
    },
    {
      id: "monthly-leads",
      title: "Monthly Lead Status & Audit Report",
      description: "Detailed compliance and lead progression audit trail including opt-outs, follow-ups, and assigned specialists.",
      cadence: "Monthly",
      recordsCount: 480,
      exportUrl: "/api/reports/export?type=monthly-leads"
    },
    {
      id: "property-category",
      title: "Property-Category Inventory & Rate Report",
      description: "Verified square-foot pricing, RERA numbers, availability status, and amenities for all approved projects.",
      cadence: "Real-time",
      recordsCount: 6,
      exportUrl: "/api/reports/export?type=property-category"
    },
    {
      id: "sales-executive",
      title: "Sales Executive Performance Report",
      description: "Individual executive pipeline conversion, walkthrough completion rates, and average response times.",
      cadence: "Weekly / Monthly",
      recordsCount: 3,
      exportUrl: "/api/reports/export?type=sales-executive"
    },
    {
      id: "call-summary",
      title: "AI Voice Call Summary & Transcript Report",
      description: "WebRTC call durations, detected languages (EN, TE, KN, HI), intent classification, and human escalation logs.",
      cadence: "Daily",
      recordsCount: 42,
      exportUrl: "/api/reports/export?type=call-summary"
    },
    {
      id: "site-visits",
      title: "Site Visit & Walkthrough Report",
      description: "Scheduled, confirmed, completed, and rescheduled site visits with customer feedback and executive notes.",
      cadence: "Weekly",
      recordsCount: 23,
      exportUrl: "/api/reports/export?type=site-visits"
    },
    {
      id: "conversion-report",
      title: "End-to-End Conversion & Booking Report",
      description: "Attribution from initial web enquiry or AI voice call to physical visit and final unit reservation.",
      cadence: "Monthly",
      recordsCount: 15,
      exportUrl: "/api/reports/export?type=sales-executive"
    }
  ];

  const activeReport = reports.find((r) => r.id === selectedReportId) || reports[0];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar currentPath="/reports" />

      <main className="app-container" style={{ padding: "32px 24px 64px", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#2563eb", letterSpacing: 1.2 }}>ESTATEPILOT AI</span>
              <span className="badge badge-converted">Audit & Intelligence</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: -0.6 }}>
              Reports & Business Intelligence Exports
            </h1>
            <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
              Download complete, audit-grade CSV and Microsoft Excel (.xlsx compatible) reports across all business operations.
            </p>
          </div>

          <a href={activeReport.exportUrl} download className="btn-primary" style={{ padding: "10px 20px" }}>
            <span>📥 Export Active Report ({activeReport.title})</span>
          </a>
        </div>

        {/* 8-Report Cards Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 18, marginTop: 24 }}>
          {reports.map((report) => {
            const isSelected = report.id === selectedReportId;
            return (
              <div
                key={report.id}
                onClick={() => setSelectedReportId(report.id)}
                className="card"
                style={{
                  cursor: "pointer",
                  borderColor: isSelected ? "#2563eb" : "#e2e8f0",
                  background: isSelected ? "#f8faff" : "#fff",
                  boxShadow: isSelected ? "0 0 0 2px rgba(37,99,235,0.2)" : "var(--shadow-sm)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between"
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#2563eb", textTransform: "uppercase" }}>
                      {report.cadence}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>
                      {report.recordsCount} records
                    </span>
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", margin: "8px 0 4px" }}>
                    {report.title}
                  </h3>
                  <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                    {report.description}
                  </p>
                </div>

                <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Format: CSV / Excel UTF-8</span>
                  <a
                    href={report.exportUrl}
                    download
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: 12, fontWeight: 700, color: "#2563eb" }}
                  >
                    Download 📥
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Preview of Active Report */}
        <div className="card" style={{ marginTop: 32, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                Preview: {activeReport.title}
              </h2>
              <p style={{ fontSize: 12, color: "#64748b" }}>
                Export contains UTF-8 Byte Order Mark (BOM) to preserve Telugu, Kannada, Hindi characters and Rupee (₹) symbols in Microsoft Excel.
              </p>
            </div>
            <a href={activeReport.exportUrl} download className="btn-primary" style={{ padding: "7px 14px", fontSize: 13 }}>
              Download Excel File
            </a>
          </div>

          <div style={{ background: "#f8fafc", padding: 14, borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 13, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #cbd5e1", textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "6px 8px" }}>Column 1</th>
                  <th style={{ padding: "6px 8px" }}>Column 2</th>
                  <th style={{ padding: "6px 8px" }}>Column 3</th>
                  <th style={{ padding: "6px 8px" }}>Column 4</th>
                  <th style={{ padding: "6px 8px" }}>Column 5</th>
                  <th style={{ padding: "6px 8px" }}>Compliance Status</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "8px" }}>Sample Record A</td>
                  <td style={{ padding: "8px" }}>Bangalore North Corridor</td>
                  <td style={{ padding: "8px" }}>Plots (1200 - 2400 sq.ft.)</td>
                  <td style={{ padding: "8px" }}>₹3,850/sq.ft. (Approved)</td>
                  <td style={{ padding: "8px" }}>BIAAPA / RERA Approved</td>
                  <td style={{ padding: "8px" }}><span className="badge badge-converted">Verified ✓</span></td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "8px" }}>Sample Record B</td>
                  <td style={{ padding: "8px" }}>Whitefield / Varthur</td>
                  <td style={{ padding: "8px" }}>Flats (2 & 3 BHK)</td>
                  <td style={{ padding: "8px" }}>₹8,400/sq.ft. (Approved)</td>
                  <td style={{ padding: "8px" }}>BBMP / RERA Approved</td>
                  <td style={{ padding: "8px" }}><span className="badge badge-converted">Verified ✓</span></td>
                </tr>
                <tr>
                  <td style={{ padding: "8px" }}>Sample Record C</td>
                  <td style={{ padding: "8px" }}>Sarjapur Road</td>
                  <td style={{ padding: "8px" }}>Luxury Villas (4 BHK)</td>
                  <td style={{ padding: "8px" }}>₹11,200/sq.ft. (Approved)</td>
                  <td style={{ padding: "8px" }}>BMRDA Approved</td>
                  <td style={{ padding: "8px" }}><span className="badge badge-converted">Verified ✓</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
