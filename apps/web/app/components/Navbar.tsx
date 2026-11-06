"use client";

import { useState } from "react";

interface NavbarProps {
  currentPath?: string;
}

export default function Navbar({ currentPath = "/" }: NavbarProps) {
  const [role, setRole] = useState<"ADMIN" | "MANAGER" | "SALES_EXECUTIVE">("ADMIN");

  const navLinks = [
    { href: "/", label: "Dashboard" },
    { href: "/enquire", label: "Customer Enquiry" },
    { href: "/receptionist", label: "AI Receptionist" },
    { href: "/knowledge-base", label: "Knowledge Base" },
    { href: "/follow-ups", label: "Follow-Ups & Visits" },
    { href: "/reports", label: "Reports & Exports" }
  ];

  return (
    <header className="top-nav">
      <div className="app-container">
        <div className="top-nav-inner">
          <div className="brand-badge">
            <a href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="brand-logo-icon">EP</div>
              <div>
                <span className="brand-name">EstatePilot AI</span>
                <span className="brand-tag" style={{ marginLeft: 8 }}>v1.0 SaaS</span>
              </div>
            </a>
          </div>

          <nav className="nav-links">
            {navLinks.map((link) => {
              const isActive = currentPath === link.href;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={`nav-link ${isActive ? "active" : ""}`}
                >
                  {link.label}
                </a>
              );
            })}
          </nav>

          <div className="nav-actions">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Role:</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "ADMIN" | "MANAGER" | "SALES_EXECUTIVE")}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  color: "#0f172a",
                  cursor: "pointer"
                }}
              >
                <option value="ADMIN">Admin (All Access)</option>
                <option value="MANAGER">Sales Manager</option>
                <option value="SALES_EXECUTIVE">Sales Executive</option>
              </select>
            </div>

            <a href="/enquire" className="btn-primary" style={{ padding: "8px 14px", fontSize: 13 }}>
              <span>+ Enquiry Form</span>
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
