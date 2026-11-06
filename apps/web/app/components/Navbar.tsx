"use client";

import { useEffect, useState } from "react";

interface NavbarProps {
  currentPath?: string;
}

interface AuthSessionUser {
  id: string;
  email: string;
  fullName: string;
  role: "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "EXECUTIVE";
}

export default function Navbar({ currentPath = "/" }: NavbarProps) {
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [requiresSetup, setRequiresSetup] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => res.json().catch(() => null))
      .then((data) => {
        if (!active || !data) return;
        if (data.authenticated && data.user) {
          setUser(data.user);
          setRequiresSetup(false);
        } else {
          setUser(null);
          setRequiresSetup(Boolean(data.requiresInitialSetup));
        }
      })
      .catch(() => {
        // Keep unauthenticated state on network error
      });
    return () => {
      active = false;
    };
  }, [currentPath]);

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
            {user ? (
              <a
                href="/login"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #bfdbfe",
                  background: "#eff6ff",
                  color: "#1e3a8a",
                  textDecoration: "none"
                }}
              >
                <span>🔒 {user.fullName.split(" ")[0]}</span>
                <span style={{ fontSize: 11, background: "#dbeafe", padding: "1px 6px", borderRadius: 4 }}>
                  {user.role}
                </span>
              </a>
            ) : (
              <a
                href="/login"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  color: "#0f172a",
                  textDecoration: "none"
                }}
              >
                {requiresSetup ? "⚙️ Initial Admin Setup" : "🔑 Staff Sign In"}
              </a>
            )}

            <a href="/enquire" className="btn-primary" style={{ padding: "8px 14px", fontSize: 13 }}>
              <span>+ Enquiry Form</span>
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
