"use client";

import { useState } from "react";
import Navbar from "../components/Navbar";
import { INITIAL_SITE_VISITS, SiteVisitRecord } from "../lib/store";

export default function FollowUpsPage() {
  const [siteVisits, setSiteVisits] = useState<SiteVisitRecord[]>(INITIAL_SITE_VISITS);
  const [activeTab, setActiveTab] = useState<"ALL" | "SCHEDULED" | "COMPLETED" | "MISSED">("ALL");
  const [showRescheduleModal, setShowRescheduleModal] = useState<SiteVisitRecord | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("2026-11-15T11:00");

  const filteredVisits = siteVisits.filter((v) => {
    if (activeTab === "SCHEDULED" && v.status !== "SCHEDULED" && v.status !== "CONFIRMED") return false;
    if (activeTab === "COMPLETED" && v.status !== "COMPLETED") return false;
    if (activeTab === "MISSED" && v.status !== "NO_SHOW" && v.status !== "RESCHEDULED") return false;
    return true;
  });

  function handleRescheduleSubmit() {
    if (!showRescheduleModal) return;
    setSiteVisits((prev) =>
      prev.map((v) => {
        if (v.id === showRescheduleModal.id) {
          return {
            ...v,
            scheduledAt: new Date(rescheduleDate).toISOString(),
            status: "RESCHEDULED",
            notes: `${v.notes} · Rescheduled with customer consent for ${new Date(rescheduleDate).toLocaleString("en-IN")}`
          };
        }
        return v;
      })
    );
    setShowRescheduleModal(null);
  }

  function markCompleted(id: string) {
    setSiteVisits((prev) =>
      prev.map((v) => (v.id === id ? { ...v, status: "COMPLETED", notes: `${v.notes} · Walkthrough completed successfully.` } : v))
    );
  }

  function markNoShow(id: string) {
    setSiteVisits((prev) =>
      prev.map((v) =>
        v.id === id
          ? {
              ...v,
              status: "NO_SHOW",
              notes: `${v.notes} · Customer missed scheduled visit. Automated follow-up sent asking if they wish to reschedule.`
            }
          : v
      )
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar currentPath="/follow-ups" />

      <main className="app-container" style={{ padding: "32px 24px 64px", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#2563eb", letterSpacing: 1.2 }}>ESTATEPILOT AI</span>
              <span className="badge badge-converted">Consent-Driven Workflows</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: -0.6 }}>
              Follow-Up Automation & Site Visit Management
            </h1>
            <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
              Schedule customer-agreed callbacks, manage physical property walkthroughs, and handle missed visit rescheduling.
            </p>
          </div>

          {/* Permitted Calling Hours Indicator */}
          <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "10px 16px", borderRadius: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#047857" }}>
              🟢 Permitted Calling Window: 09:00 - 19:00 IST
            </span>
            <p style={{ fontSize: 11, color: "#065f46", margin: "2px 0 0" }}>
              Automatic compliance guard ensures no calls are placed during quiet hours.
            </p>
          </div>
        </div>

        {/* Workflow Pipeline Overview */}
        <div style={{ marginTop: 24, padding: 18, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>
            Standard Customer Lifecycle Stages
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
            {[
              "1. Enquiry Intake",
              "2. AI Phone / Web Call",
              "3. Property Matched",
              "4. Visit Agreed",
              "5. Walkthrough Done",
              "6. Executive Consultation",
              "7. Deal Closed"
            ].map((step, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", background: "#f1f5f9", borderRadius: 6, color: "#334155" }}>
                  {step}
                </span>
                {idx < 6 && <span style={{ color: "#94a3b8" }}>→</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Tab Filter */}
        <div style={{ display: "flex", gap: 8, margin: "24px 0 16px" }}>
          {(["ALL", "SCHEDULED", "COMPLETED", "MISSED"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid",
                borderColor: activeTab === tab ? "#2563eb" : "#cbd5e1",
                background: activeTab === tab ? "#2563eb" : "#fff",
                color: activeTab === tab ? "#fff" : "#475569",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer"
              }}
            >
              {tab === "ALL" ? "All Visits" : tab === "SCHEDULED" ? "Scheduled / Confirmed" : tab === "COMPLETED" ? "Completed" : "Missed / Rescheduled"}
            </button>
          ))}
        </div>

        {/* Site Visits Table */}
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Property Project</th>
                <th>Date & Time</th>
                <th>Status</th>
                <th>Assigned Specialist</th>
                <th>Audit Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVisits.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.customerName}</strong></td>
                  <td>{v.phone}</td>
                  <td><span style={{ color: "#2563eb", fontWeight: 700 }}>{v.propertyName}</span></td>
                  <td>
                    {new Date(v.scheduledAt).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true
                    })}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background:
                          v.status === "COMPLETED"
                            ? "#ecfdf5"
                            : v.status === "CONFIRMED" || v.status === "SCHEDULED"
                            ? "#eff6ff"
                            : "#fff7ed",
                        color:
                          v.status === "COMPLETED"
                            ? "#047857"
                            : v.status === "CONFIRMED" || v.status === "SCHEDULED"
                            ? "#1e40af"
                            : "#c2410c"
                      }}
                    >
                      {v.status}
                    </span>
                  </td>
                  <td>{v.assignedExecutive}</td>
                  <td style={{ fontSize: 12, color: "#64748b", maxWidth: 280 }}>{v.notes}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {v.status !== "COMPLETED" && (
                        <button
                          onClick={() => markCompleted(v.id)}
                          style={{ padding: "4px 8px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "1px solid #10b981", background: "#ecfdf5", color: "#047857", cursor: "pointer" }}
                        >
                          Complete
                        </button>
                      )}
                      {v.status !== "COMPLETED" && v.status !== "NO_SHOW" && (
                        <button
                          onClick={() => markNoShow(v.id)}
                          style={{ padding: "4px 8px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "1px solid #f97316", background: "#fff7ed", color: "#c2410c", cursor: "pointer" }}
                        >
                          Missed
                        </button>
                      )}
                      <button
                        onClick={() => setShowRescheduleModal(v)}
                        style={{ padding: "4px 8px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer" }}
                      >
                        Reschedule
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Reschedule Modal */}
        {showRescheduleModal && (
          <div className="modal-overlay" onClick={() => setShowRescheduleModal(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: 24, maxWidth: 480 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
                Reschedule Site Visit for {showRescheduleModal.customerName}
              </h2>
              <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
                Strict Rule 11: If a customer missed a visit, confirm their customer-agreed timing before rescheduling.
              </p>

              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
                Customer-Agreed Date & Time
                <input
                  type="datetime-local"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                <button onClick={() => setShowRescheduleModal(null)} className="btn-secondary">
                  Cancel
                </button>
                <button onClick={handleRescheduleSubmit} className="btn-primary">
                  Confirm Reschedule
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
