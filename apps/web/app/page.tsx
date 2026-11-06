"use client";

export const dynamic = "force-dynamic";

import { useState, useMemo } from "react";
import Navbar from "./components/Navbar";
import { INITIAL_LEADS, INITIAL_PROPERTIES, LeadRecord, LeadStatus, PropertyCategory, SupportedLanguage } from "./lib/store";

export default function DashboardPage() {
  const [leads, setLeads] = useState<LeadRecord[]>(INITIAL_LEADS);
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(INITIAL_LEADS[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [languageFilter, setLanguageFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Filtering
  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (categoryFilter !== "ALL" && l.propertyType !== categoryFilter) return false;
      if (languageFilter !== "ALL" && l.preferredLanguage !== languageFilter) return false;
      if (statusFilter !== "ALL" && l.status !== statusFilter) return false;
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const matches =
          l.fullName.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          l.referenceNumber.toLowerCase().includes(q) ||
          l.preferredLocation.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [leads, categoryFilter, languageFilter, statusFilter, searchQuery]);

  // Status badge styling helper
  function getStatusBadge(status: LeadStatus) {
    switch (status) {
      case "NEW":
        return <span className="badge badge-new">New Enquiry</span>;
      case "CONTACTED":
        return <span className="badge badge-contacted">Contacted</span>;
      case "INTERESTED":
        return <span className="badge badge-interested">Interested</span>;
      case "CALLBACK_SCHEDULED":
        return <span className="badge badge-callback">Callback Agreed</span>;
      case "SITE_VISIT_SCHEDULED":
        return <span className="badge badge-sitevisit">Site Visit Booked</span>;
      case "SITE_VISITED":
        return <span className="badge badge-contacted">Site Visited</span>;
      case "CONVERTED":
        return <span className="badge badge-converted">Converted ✓</span>;
      case "DO_NOT_CONTACT":
      case "LOST":
        return <span className="badge badge-dnc">Do Not Contact / Lost</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  }

  // Quick status update for selected lead
  function handleStatusChange(newStatus: LeadStatus) {
    if (!selectedLead) return;
    const updated = { ...selectedLead, status: newStatus, updatedAt: new Date().toISOString() };
    setSelectedLead(updated);
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  function handleAssignExecutive(name: string) {
    if (!selectedLead) return;
    const updated = { ...selectedLead, assignedExecutive: name, updatedAt: new Date().toISOString() };
    setSelectedLead(updated);
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar currentPath="/" />

      <main className="app-container" style={{ padding: "32px 24px 64px", flex: 1 }}>
        {/* Header with Title and Quick Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, color: "#2563eb", textTransform: "uppercase" }}>
                EstatePilot Executive Station
              </span>
              <span className="role-badge">Admin Workspace</span>
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: "#0f172a", letterSpacing: -0.8 }}>
              Real Estate Leads & AI Receptionist CRM
            </h1>
            <p style={{ color: "#64748b", marginTop: 4, fontSize: 14 }}>
              Consent-verified property enquiries, 4-language AI conversations, approved per-sq.ft. inventory and site-visit scheduling.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/enquire" className="btn-secondary">
              <span>+ Customer Enquiry Form</span>
            </a>
            <a href="/receptionist" className="btn-secondary">
              <span>🎙 Launch AI Voice Room</span>
            </a>
            <a href="/api/reports/export?type=daily-enquiries" download className="btn-primary">
              <span>📥 Export Excel / CSV</span>
            </a>
          </div>
        </div>

        {/* 8 Primary KPI Metric Cards */}
        <div className="metrics-grid">
          <div className="metric-card">
            <span className="metric-label">Total Enquiries</span>
            <div className="metric-value-row">
              <span className="metric-value">{leads.length}</span>
              <span className="metric-trend trend-up">+14% wk</span>
            </div>
            <span className="metric-footnote">Captured with verified phone consent</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">New Leads</span>
            <div className="metric-value-row">
              <span className="metric-value">{leads.filter((l) => l.status === "NEW").length}</span>
              <span className="metric-trend trend-neutral">Awaiting call</span>
            </div>
            <span className="metric-footnote">Permitted hours: 09:00 - 19:00 IST</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Contacted Leads</span>
            <div className="metric-value-row">
              <span className="metric-value">{leads.filter((l) => l.status === "CONTACTED").length}</span>
              <span className="metric-trend trend-up">AI handled</span>
            </div>
            <span className="metric-footnote">Multilingual conversation logged</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Qualified Interested</span>
            <div className="metric-value-row">
              <span className="metric-value">{leads.filter((l) => l.status === "INTERESTED").length}</span>
              <span className="metric-trend trend-up">Hot</span>
            </div>
            <span className="metric-footnote">Requirement profile verified</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Site Visits Scheduled</span>
            <div className="metric-value-row">
              <span className="metric-value">{leads.filter((l) => l.status === "SITE_VISIT_SCHEDULED").length}</span>
              <span className="metric-trend trend-up">Weekend slots</span>
            </div>
            <span className="metric-footnote">Executive auto-assigned</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Site Visits Done</span>
            <div className="metric-value-row">
              <span className="metric-value">9</span>
              <span className="metric-trend trend-up">Completed</span>
            </div>
            <span className="metric-footnote">Physical walkthrough logged</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Converted Leads</span>
            <div className="metric-value-row">
              <span className="metric-value">6</span>
              <span className="metric-trend trend-up">Booking stage</span>
            </div>
            <span className="metric-footnote">Approved rates finalized</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Do Not Contact / Lost</span>
            <div className="metric-value-row">
              <span className="metric-value">{leads.filter((l) => l.status === "DO_NOT_CONTACT" || l.status === "LOST").length}</span>
              <span className="metric-trend trend-neutral">Opt-outs</span>
            </div>
            <span className="metric-footnote">Zero outbound contacts allowed</span>
          </div>
        </div>

        {/* Analytics Breakdown & AI Compliance Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18, marginTop: 24 }}>
          {/* Property Category Share */}
          <div className="card">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>
              Enquiries by Property Category
            </h2>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>Residential Plots</span>
                  <span style={{ color: "#64748b" }}>38% (Devanahalli, Sarjapur)</span>
                </div>
                <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: "38%", height: "100%", background: "#2563eb", borderRadius: 4 }}></div>
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>Apartments & Flats</span>
                  <span style={{ color: "#64748b" }}>34% (Whitefield, Gachibowli)</span>
                </div>
                <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: "34%", height: "100%", background: "#0ea5e9", borderRadius: 4 }}></div>
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>Luxury Villas</span>
                  <span style={{ color: "#64748b" }}>16% (Attibele, Sarjapur)</span>
                </div>
                <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: "16%", height: "100%", background: "#8b5cf6", borderRadius: 4 }}></div>
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>Independent Houses</span>
                  <span style={{ color: "#64748b" }}>12% (Yelahanka, Rajankunte)</span>
                </div>
                <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: "12%", height: "100%", background: "#10b981", borderRadius: 4 }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Preferred Language Distribution */}
          <div className="card">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>
              4-Language AI Engagement Share
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>English</span>
                <p style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "4px 0" }}>42%</p>
                <span style={{ fontSize: 11, color: "#10b981" }}>Universal corporate standard</span>
              </div>
              <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Telugu (తెలుగు)</span>
                <p style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "4px 0" }}>26%</p>
                <span style={{ fontSize: 11, color: "#2563eb" }}>Hyderabad & Bangalore East</span>
              </div>
              <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Kannada (ಕನ್ನಡ)</span>
                <p style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "4px 0" }}>18%</p>
                <span style={{ fontSize: 11, color: "#d97706" }}>Bangalore North & South</span>
              </div>
              <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Hindi (हिन्दी)</span>
                <p style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "4px 0" }}>14%</p>
                <span style={{ fontSize: 11, color: "#8b5cf6" }}>Pan-India IT relocations</span>
              </div>
            </div>
          </div>

          {/* Strict AI Compliance Monitor */}
          <div className="card">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>
              Core AI Business Rules Compliance
            </h2>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#ecfdf5", color: "#047857", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>✓</span>
                <span><strong>0 Budget Questions:</strong> Never qualifies customers by income or budget.</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#ecfdf5", color: "#047857", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>✓</span>
                <span><strong>Approved Per-Sq.Ft. Only:</strong> Never promises unapproved total prices.</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#ecfdf5", color: "#047857", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>✓</span>
                <span><strong>No Price Negotiation:</strong> Commercial discussions directed to human executive.</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#ecfdf5", color: "#047857", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>✓</span>
                <span><strong>Opt-Out Respect:</strong> Stop requests immediately cease all communications.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Leads Table Filter Bar */}
        <div style={{ marginTop: 36, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
              Active Leads & Conversation Pipeline ({filteredLeads.length})
            </h2>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {/* Search */}
              <input
                type="text"
                placeholder="Search name, phone, ref..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontSize: 13,
                  minWidth: 220,
                  outline: "none"
                }}
              />

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
              >
                <option value="ALL">All Categories</option>
                <option value="PLOT">Residential Plots</option>
                <option value="FLAT">Apartments / Flats</option>
                <option value="INDEPENDENT_HOUSE">Independent Houses</option>
                <option value="VILLA">Luxury Villas</option>
              </select>

              {/* Language Filter */}
              <select
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
              >
                <option value="ALL">All Languages</option>
                <option value="English">English</option>
                <option value="Telugu">Telugu (తెలుగు)</option>
                <option value="Kannada">Kannada (ಕನ್ನಡ)</option>
                <option value="Hindi">Hindi (हिन्दी)</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
              >
                <option value="ALL">All Statuses</option>
                <option value="NEW">New</option>
                <option value="CONTACTED">Contacted</option>
                <option value="INTERESTED">Interested</option>
                <option value="CALLBACK_SCHEDULED">Callback Scheduled</option>
                <option value="SITE_VISIT_SCHEDULED">Site Visit Scheduled</option>
                <option value="CONVERTED">Converted</option>
                <option value="DO_NOT_CONTACT">Do Not Contact</option>
              </select>
            </div>
          </div>
        </div>

        {/* Leads Data Table */}
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference ID</th>
                <th>Customer</th>
                <th>Interest</th>
                <th>Preferred Location</th>
                <th>Language</th>
                <th>Status</th>
                <th>Assigned Executive</th>
                <th>Next Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => {
                const isSelected = selectedLead?.id === lead.id;
                return (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    style={{
                      cursor: "pointer",
                      background: isSelected ? "#eff6ff" : undefined
                    }}
                  >
                    <td>
                      <span style={{ fontWeight: 700, color: "#1e3a8a", fontSize: 13 }}>
                        {lead.referenceNumber}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{lead.fullName}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{lead.phone}</div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>
                        {lead.propertyType.replace("_", " ")}
                      </span>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{lead.preferredArea}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: 13 }}>{lead.preferredLocation}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", background: "#f1f5f9", borderRadius: 6 }}>
                        {lead.preferredLanguage}
                      </span>
                    </td>
                    <td>{getStatusBadge(lead.status)}</td>
                    <td>
                      <span style={{ fontSize: 13, color: "#334155" }}>
                        {lead.assignedExecutive.split(" (")[0]}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: "#475569" }}>
                        {lead.nextActionAt ? new Date(lead.nextActionAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "None"}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLead(lead);
                        }}
                        style={{
                          background: "#fff",
                          border: "1px solid #cbd5e1",
                          borderRadius: 6,
                          padding: "4px 8px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        View Profile →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Selected Lead Detail Drawer / Inspector */}
        {selectedLead && (
          <div style={{ marginTop: 28, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24, boxShadow: "var(--shadow-md)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#2563eb" }}>{selectedLead.referenceNumber}</span>
                  {getStatusBadge(selectedLead.status)}
                  <span style={{ fontSize: 12, color: "#64748b" }}>Captured: {new Date(selectedLead.createdAt).toLocaleDateString()}</span>
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: "6px 0 2px" }}>
                  {selectedLead.fullName}
                </h2>
                <p style={{ color: "#475569", fontSize: 14 }}>
                  📞 {selectedLead.phone} {selectedLead.email ? `· ✉️ ${selectedLead.email}` : ""} · Preferred Language: <strong>{selectedLead.preferredLanguage}</strong>
                </p>
              </div>

              {/* Status Update & Actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Update Status:</span>
                <select
                  value={selectedLead.status}
                  onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, fontWeight: 700 }}
                >
                  <option value="NEW">New Enquiry</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="INTERESTED">Interested</option>
                  <option value="CALLBACK_SCHEDULED">Callback Scheduled</option>
                  <option value="SITE_VISIT_SCHEDULED">Site Visit Scheduled</option>
                  <option value="SITE_VISITED">Site Visited</option>
                  <option value="CONVERTED">Converted</option>
                  <option value="LOST">Lost</option>
                  <option value="DO_NOT_CONTACT">Do Not Contact (Opt-out)</option>
                </select>

                <a href={`/call/demo-${selectedLead.id}`} className="btn-primary" style={{ padding: "7px 14px", fontSize: 13 }}>
                  <span>🎙 Start WebRTC Voice Call</span>
                </a>
              </div>
            </div>

            {/* Detailed sections: Consent, Matched Properties, and AI Transcript */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginTop: 20 }}>
              {/* Consent & Audit Trail */}
              <div style={{ padding: 16, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
                  🔒 Consent & Privacy Audit Trail
                </h3>
                <div style={{ fontSize: 12, lineHeight: 1.6, color: "#334155" }}>
                  <p><strong>Channel:</strong> {selectedLead.consent.channel}</p>
                  <p><strong>Status:</strong> {selectedLead.consent.granted ? "Explicitly Granted ✓" : "Revoked"}</p>
                  <p><strong>Captured:</strong> {new Date(selectedLead.consent.capturedAt).toLocaleString()}</p>
                  <p><strong>Evidence:</strong> {selectedLead.consent.evidence}</p>
                  <p style={{ marginTop: 8, color: "#b91c1c" }}>
                    {selectedLead.status === "DO_NOT_CONTACT" ? "⚠️ Customer opted out: System blocks all automated calling." : "Calling permitted within 09:00 - 19:00 IST."}
                  </p>
                </div>
              </div>

              {/* Matched Verified Properties */}
              <div style={{ padding: 16, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
                  🏢 Matched Verified Inventory
                </h3>
                {INITIAL_PROPERTIES.filter((p) => selectedLead.matchedPropertyIds.includes(p.id)).map((prop) => (
                  <div key={prop.id} style={{ padding: 10, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{prop.name}</span>
                      <span style={{ fontSize: 11, color: "#047857", fontWeight: 700, background: "#ecfdf5", padding: "2px 6px", borderRadius: 4 }}>
                        Approved Rate: ₹{prop.approvedRatePerSqFt.toLocaleString("en-IN")}/sq.ft.
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                      {prop.location} · {prop.reraNumber}
                    </p>
                  </div>
                ))}
              </div>

              {/* AI Conversation Summary */}
              <div style={{ padding: 16, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
                  🤖 AI Conversation Summary
                </h3>
                <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>
                  {selectedLead.aiConversationSummary || "No voice conversation logged yet. Customer submitted online enquiry."}
                </p>
                <div style={{ marginTop: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Assigned Executive:</span>
                  <select
                    value={selectedLead.assignedExecutive}
                    onChange={(e) => handleAssignExecutive(e.target.value)}
                    style={{ marginLeft: 8, padding: "4px 8px", fontSize: 12, borderRadius: 6, border: "1px solid #cbd5e1" }}
                  >
                    <option value="Rajesh Sharma (Senior Property Specialist)">Rajesh Sharma</option>
                    <option value="Priya Nair (Lead Relationship Manager)">Priya Nair</option>
                    <option value="Suresh Kumar (Kannada Language Specialist)">Suresh Kumar</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
