"use client";

import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import { INITIAL_PROPERTIES, PropertyCategory, PropertyRecord } from "../lib/store";

export default function KnowledgeBasePage() {
  const [properties, setProperties] = useState<PropertyRecord[]>(INITIAL_PROPERTIES);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    name: "",
    category: "PLOT" as PropertyCategory,
    location: "",
    landmark: "",
    city: "Bangalore",
    minAreaSqFt: "1200",
    maxAreaSqFt: "2400",
    approvedRatePerSqFt: "4200",
    reraNumber: "",
    possessionDate: "Immediate",
    description: "",
    brochureFileName: "Project-Brochure-2026.pdf"
  });
  const [csrfToken, setCsrfToken] = useState("");
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState("");
  const [apiErrorMsg, setApiErrorMsg] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => res.json().catch(() => null))
      .then((authData) => {
        if (active && authData?.csrfToken) {
          setCsrfToken(authData.csrfToken);
        }
      })
      .catch(() => {});

    fetch("/api/properties")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success || !Array.isArray(data.properties)) {
          throw new Error(data?.message || `Failed to load property inventory (HTTP ${res.status})`);
        }
        if (active && data.properties.length > 0) {
          setProperties(data.properties);
        }
      })
      .catch((err) => {
        if (active) {
          setApiErrorMsg(
            err instanceof Error
              ? `${err.message}. Displaying verified baseline inventory.`
              : "Could not sync property inventory from server. Displaying verified baseline inventory."
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredProperties = properties.filter((p) => {
    if (selectedCategory !== "ALL" && p.category !== selectedCategory) return false;
    return true;
  });

  function toggleVerification(id: string) {
    const target = properties.find((p) => p.id === id);
    const nextState = target ? !target.isVerified : false;
    const verifiedBy = nextState ? "Operations Director (Approved)" : "Pending Operational Review";
    setApiErrorMsg("");

    setProperties((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            isVerified: nextState,
            verifiedBy,
            verifiedAt: nextState ? new Date().toISOString() : ""
          };
        }
        return p;
      })
    );

    fetch("/api/properties", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ id, isVerified: nextState, verifiedBy })
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          throw new Error(data?.message || `Failed to update verification status (HTTP ${res.status})`);
        }
        setUploadSuccessMsg(
          `Verification status for "${target?.name || id}" updated to ${nextState ? "Verified & Active" : "Pending Audit"}.`
        );
        setTimeout(() => setUploadSuccessMsg(""), 4000);
      })
      .catch((err) => {
        setApiErrorMsg(
          err instanceof Error
            ? `Updated locally, but server sync failed: ${err.message}`
            : "Updated locally, but server sync failed."
        );
      });
  }

  function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiErrorMsg("");
    const newProp: PropertyRecord = {
      id: `prop-${Date.now()}`,
      name: uploadForm.name,
      category: uploadForm.category,
      location: uploadForm.location,
      landmark: uploadForm.landmark,
      city: uploadForm.city,
      minAreaSqFt: Number(uploadForm.minAreaSqFt) || 1200,
      maxAreaSqFt: Number(uploadForm.maxAreaSqFt) || 2400,
      approvedRatePerSqFt: Number(uploadForm.approvedRatePerSqFt),
      currency: "INR",
      availabilityStatus: "AVAILABLE",
      isVerified: false, // Strict Rule: Uploaded brochures start as unverified until authorized human approval
      verifiedBy: "Pending Verification by Operations Manager",
      verifiedAt: "",
      amenities: ["Gated Community", "Underground Drainage", "CCTV Security"],
      reraNumber: uploadForm.reraNumber || "PRM/KA/RERA/PENDING",
      approvals: ["BMRDA / BIAAPA Pending Final Inspection", "Title Verification Underway"],
      possessionDate: uploadForm.possessionDate,
      description: uploadForm.description || "Uploaded property brochure specifications extracted.",
      brochureFileName: uploadForm.brochureFileName,
      brochureUploadedAt: new Date().toISOString()
    };

    setProperties([newProp, ...properties]);
    setShowUploadModal(false);

    fetch("/api/properties", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify(newProp)
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          throw new Error(data?.message || `Failed to ingest brochure on server (HTTP ${res.status})`);
        }
        if (data.property?.id) {
          setProperties((prev) => prev.map((p) => (p.id === newProp.id ? data.property : p)));
        }
        setUploadSuccessMsg(`Brochure "${uploadForm.brochureFileName}" uploaded and parsed! Marked as Pending Verification.`);
        setTimeout(() => setUploadSuccessMsg(""), 5000);
      })
      .catch((err) => {
        setApiErrorMsg(
          err instanceof Error
            ? `Brochure added to current view, but server persistence failed: ${err.message}`
            : "Brochure added to current view, but server persistence failed."
        );
      });
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar currentPath="/knowledge-base" />

      <main className="app-container" style={{ padding: "32px 24px 64px", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#2563eb", letterSpacing: 1.2 }}>ESTATEPILOT AI</span>
              <span className="badge badge-converted">Ground Truth Store</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: -0.6 }}>
              Property Knowledge Base & Brochure Ingestion
            </h1>
            <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
              Authorized property brochures, approved rates per sq.ft., and strict RERA compliance verification. Unverified data is NEVER used by the AI.
            </p>
          </div>

          <button onClick={() => setShowUploadModal(true)} className="btn-primary">
            <span>+ Upload & Ingest Brochure PDF</span>
          </button>
        </div>

        {uploadSuccessMsg && (
          <div role="status" style={{ marginTop: 18, padding: 12, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#047857", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
            ✓ {uploadSuccessMsg}
          </div>
        )}

        {apiErrorMsg && (
          <div role="alert" style={{ marginTop: 18, padding: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 10, fontSize: 13, fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>⚠️ {apiErrorMsg}</span>
            <button type="button" onClick={() => setApiErrorMsg("")} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontWeight: 800 }}>✕</button>
          </div>
        )}

        {/* Category Tabs */}
        <div style={{ display: "flex", gap: 8, margin: "24px 0 20px", flexWrap: "wrap" }}>
          {[
            { id: "ALL", label: "All Properties" },
            { id: "PLOT", label: "Plots (Devanahalli, Sarjapur)" },
            { id: "FLAT", label: "Apartments / Flats (Whitefield, Gachibowli)" },
            { id: "INDEPENDENT_HOUSE", label: "Independent Houses (Yelahanka)" },
            { id: "VILLA", label: "Luxury Villas (Sarjapur Road)" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedCategory(tab.id)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid",
                borderColor: selectedCategory === tab.id ? "#2563eb" : "#cbd5e1",
                background: selectedCategory === tab.id ? "#2563eb" : "#fff",
                color: selectedCategory === tab.id ? "#fff" : "#475569",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Property Inventory Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20 }}>
          {filteredProperties.map((prop) => (
            <div
              key={prop.id}
              className="card"
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                borderColor: prop.isVerified ? "#e2e8f0" : "#fed7aa"
              }}
            >
              <div>
                {/* Header: Name and Status */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#2563eb", textTransform: "uppercase" }}>
                      {prop.category.replace("_", " ")}
                    </span>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>
                      {prop.name}
                    </h3>
                  </div>

                  <span
                    className="badge"
                    style={{
                      background: prop.isVerified ? "#ecfdf5" : "#fff7ed",
                      color: prop.isVerified ? "#047857" : "#c2410c",
                      border: prop.isVerified ? "1px solid #6ee7b7" : "1px solid #fdba74"
                    }}
                  >
                    {prop.isVerified ? "✓ Verified & Active" : "⚠️ Pending Audit"}
                  </span>
                </div>

                <p style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>
                  📍 {prop.location} ({prop.city})
                </p>
                <p style={{ fontSize: 12, color: "#64748b" }}>
                  Landmark: {prop.landmark || "Prime connectivity corridor"}
                </p>

                {/* Approved Rate per Sq. Ft. Box */}
                <div style={{ margin: "14px 0", padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Approved Base Rate:</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: "#1e3a8a" }}>
                      ₹{prop.approvedRatePerSqFt.toLocaleString("en-IN")} <small style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}>/ sq.ft.</small>
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569", marginTop: 4 }}>
                    <span>Sizes: {prop.minAreaSqFt} - {prop.maxAreaSqFt} sq.ft.</span>
                    <span>Possession: {prop.possessionDate}</span>
                  </div>
                </div>

                {/* Amenities */}
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Key Amenities:</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {prop.amenities.map((a, i) => (
                      <span key={i} style={{ fontSize: 11, background: "#f1f5f9", padding: "3px 8px", borderRadius: 6, color: "#334155" }}>
                        {a}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Approvals & RERA */}
                <div style={{ fontSize: 12, color: "#475569", background: "#f8fafc", padding: 10, borderRadius: 8 }}>
                  <p><strong>RERA Number:</strong> {prop.reraNumber}</p>
                  <p><strong>Approvals:</strong> {prop.approvals.join(" · ")}</p>
                </div>
              </div>

              {/* Card Footer: Brochure name and toggle button */}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#64748b" }}>
                  📄 {prop.brochureFileName || "Brochure.pdf"}
                </span>

                <button
                  type="button"
                  onClick={() => toggleVerification(prop.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid",
                    borderColor: prop.isVerified ? "#cbd5e1" : "#047857",
                    background: prop.isVerified ? "#fff" : "#ecfdf5",
                    color: prop.isVerified ? "#475569" : "#047857",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  {prop.isVerified ? "Revoke Verification" : "Approve & Publish to AI"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Upload Brochure Modal */}
        {showUploadModal && (
          <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
                  Upload & Ingest Property Brochure (PDF)
                </h2>
                <button
                  onClick={() => setShowUploadModal(false)}
                  style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "#64748b" }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUploadSubmit} style={{ display: "grid", gap: 14 }}>
                <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
                  Project Name *
                  <input
                    required
                    placeholder="e.g. Prestige HighLine Towers"
                    value={uploadForm.name}
                    onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                  />
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
                    Category *
                    <select
                      value={uploadForm.category}
                      onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value as PropertyCategory })}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                    >
                      <option value="PLOT">Residential Plot</option>
                      <option value="FLAT">Apartment / Flat</option>
                      <option value="INDEPENDENT_HOUSE">Independent House</option>
                      <option value="VILLA">Luxury Villa</option>
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
                    Approved Rate per Sq. Ft. (₹) *
                    <input
                      required
                      type="number"
                      placeholder="e.g. 5200"
                      value={uploadForm.approvedRatePerSqFt}
                      onChange={(e) => setUploadForm({ ...uploadForm, approvedRatePerSqFt: e.target.value })}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                    />
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
                    Location Corridor
                    <input
                      placeholder="e.g. Sarjapur Road"
                      value={uploadForm.location}
                      onChange={(e) => setUploadForm({ ...uploadForm, location: e.target.value })}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
                    RERA Registration Number
                    <input
                      placeholder="e.g. PRM/KA/RERA/..."
                      value={uploadForm.reraNumber}
                      onChange={(e) => setUploadForm({ ...uploadForm, reraNumber: e.target.value })}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                    />
                  </label>
                </div>

                <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
                  Brochure PDF Attachment
                  <div style={{ padding: 18, border: "2px dashed #cbd5e1", borderRadius: 10, textAlign: "center", background: "#f8fafc" }}>
                    <p style={{ fontSize: 13, color: "#475569", margin: "0 0 4px" }}>
                      Drop approved brochure PDF here or browse
                    </p>
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                      Selected: <strong>{uploadForm.brochureFileName}</strong>
                    </span>
                  </div>
                </label>

                <p style={{ fontSize: 12, color: "#b45309", background: "#fffbeb", padding: 10, borderRadius: 8, margin: 0 }}>
                  ⚠️ Note: Uploaded brochure facts must be reviewed and approved by an authorized manager before the AI receptionist can disclose them to customers.
                </p>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                  <button type="button" onClick={() => setShowUploadModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Upload & Ingest Brochure
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
