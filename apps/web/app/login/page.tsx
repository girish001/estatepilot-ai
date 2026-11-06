"use client";

import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";

interface AdminUserSummary {
  id: string;
  email: string;
  fullName: string;
  role: "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "EXECUTIVE";
  assignedExecutiveName: string | null;
  isActive?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export default function LoginPage() {
  const [loading, setLoading] = useState(true);
  const [requiresInitialSetup, setRequiresInitialSetup] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<AdminUserSummary | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [teamUsers, setTeamUsers] = useState<AdminUserSummary[]>([]);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Initial SUPER_ADMIN setup form state
  const [setupName, setSetupName] = useState("");
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupBootstrapToken, setSetupBootstrapToken] = useState("");
  const [seedBaselineOnSetup, setSeedBaselineOnSetup] = useState(true);

  // Create team user state (for SUPER_ADMIN)
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"SUPER_ADMIN" | "ADMIN" | "MANAGER" | "EXECUTIVE">("EXECUTIVE");
  const [newUserExecName, setNewUserExecName] = useState("Rajesh Sharma (Senior Property Specialist)");

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);

  async function refreshSessionAndTeam() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json().catch(() => null);
      if (data?.requiresInitialSetup) {
        setRequiresInitialSetup(true);
        setAuthenticatedUser(null);
      } else if (data?.authenticated && data.user) {
        setRequiresInitialSetup(false);
        setAuthenticatedUser(data.user);
        setCsrfToken(data.csrfToken || "");
        if (data.user.role === "SUPER_ADMIN") {
          const usersRes = await fetch("/api/auth/users");
          const usersData = await usersRes.json().catch(() => null);
          if (usersData?.success && Array.isArray(usersData.users)) {
            setTeamUsers(usersData.users);
          }
        }
      } else {
        setRequiresInitialSetup(false);
        setAuthenticatedUser(null);
      }
    } catch {
      setFeedback({ type: "error", message: "Unable to verify authentication status." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshSessionAndTeam();
  }, []);

  async function handleBootstrapSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bootstrap-token": setupBootstrapToken
        },
        body: JSON.stringify({
          fullName: setupName,
          email: setupEmail,
          password: setupPassword,
          bootstrapToken: setupBootstrapToken
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || `Bootstrap failed (HTTP ${res.status})`);
      }

      if (seedBaselineOnSetup && data.csrfToken) {
        await fetch("/api/admin/seed", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": data.csrfToken
          }
        });
      }

      setFeedback({
        type: "success",
        message: "Initial SUPER_ADMIN account provisioned and signed in."
      });
      setSetupBootstrapToken("");
      await refreshSessionAndTeam();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to initialize SUPER_ADMIN account."
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || `Sign in failed (HTTP ${res.status})`);
      }

      setFeedback({
        type: "success",
        message: `Signed in as ${data.user.fullName} (${data.user.role}).`
      });
      setLoginPassword("");
      await refreshSessionAndTeam();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Authentication failed."
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({
          fullName: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
          assignedExecutiveName: newUserRole === "EXECUTIVE" ? newUserExecName : null
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || `Failed to create user (HTTP ${res.status})`);
      }
      setFeedback({
        type: "success",
        message: `Created ${data.user.role} account for ${data.user.email}.`
      });
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      await refreshSessionAndTeam();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to create staff account."
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSeedBaseline() {
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/seed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken
        }
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || `Seed failed (HTTP ${res.status})`);
      }
      setFeedback({
        type: "success",
        message: `Reviewed baseline inventory seeded (${data.propertiesSeeded} properties, ${data.leadsSeeded} leads).`
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to seed baseline records."
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setSubmitting(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "x-csrf-token": csrfToken
        }
      });
      setAuthenticatedUser(null);
      setCsrfToken("");
      setFeedback({ type: "success", message: "Signed out of EstatePilot AI." });
      await refreshSessionAndTeam();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar currentPath="/login" />

      <main className="app-container" style={{ padding: "36px 24px 64px", flex: 1, maxWidth: 960 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, color: "#2563eb", textTransform: "uppercase" }}>
              EstatePilot Security & RBAC
            </span>
            <span className="role-badge">Server-Enforced Auth</span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: -0.6 }}>
            {requiresInitialSetup
              ? "One-Time Initial SUPER_ADMIN Provisioning"
              : authenticatedUser
              ? "Authenticated Staff Session & Role Management"
              : "Admin & Executive Sign In"}
          </h1>
          <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
            HTTP-only session cookies, CSRF protection, scrypt password hashing, 5-strike account lockout, and PostgreSQL audit logging.
          </p>
        </div>

        {feedback && (
          <div
            role="status"
            style={{
              marginBottom: 20,
              padding: "12px 16px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              background: feedback.type === "error" ? "#fef2f2" : "#ecfdf5",
              border: `1px solid ${feedback.type === "error" ? "#fecaca" : "#a7f3d0"}`,
              color: feedback.type === "error" ? "#b91c1c" : "#047857"
            }}
          >
            {feedback.type === "error" ? `⚠️ ${feedback.message}` : `✓ ${feedback.message}`}
          </div>
        )}

        {loading ? (
          <div className="card" style={{ padding: 28 }}>
            <p style={{ color: "#64748b", fontSize: 14 }}>Checking PostgreSQL session and RBAC status...</p>
          </div>
        ) : requiresInitialSetup ? (
          <div className="card" style={{ padding: 28 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
              Bootstrap First Production SUPER_ADMIN Account
            </h2>
            <p style={{ fontSize: 13, color: "#475569", marginBottom: 18 }}>
              No administrator accounts exist yet in <code>estatepilot.admin_users</code>. For security compliance, EstatePilot AI ships with zero default passwords and requires the server&apos;s secret <code>ADMIN_BOOTSTRAP_TOKEN</code> to provision the initial <strong>SUPER_ADMIN</strong> account.
            </p>

            <form onSubmit={handleBootstrapSubmit} style={{ display: "grid", gap: 14, maxWidth: 520 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
                Server Bootstrap Token (ADMIN_BOOTSTRAP_TOKEN) *
                <input
                  required
                  type="password"
                  value={setupBootstrapToken}
                  onChange={(e) => setSetupBootstrapToken(e.target.value)}
                  placeholder="Enter secret ADMIN_BOOTSTRAP_TOKEN (>= 16 chars)"
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </label>

              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
                Full Name *
                <input
                  required
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  placeholder="e.g. Girish (Principal Administrator)"
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </label>

              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
                Corporate Email *
                <input
                  required
                  type="email"
                  value={setupEmail}
                  onChange={(e) => setSetupEmail(e.target.value)}
                  placeholder="admin@estatepilot.in"
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </label>

              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
                Strong Password (min 10 chars, upper, lower, number) *
                <input
                  required
                  type="password"
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  placeholder="Minimum 10 characters"
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#334155", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={seedBaselineOnSetup}
                  onChange={(e) => setSeedBaselineOnSetup(e.target.checked)}
                />
                <span>Also seed reviewed baseline RERA properties & sample enquiries into PostgreSQL</span>
              </label>

              <div style={{ marginTop: 6 }}>
                <button type="submit" disabled={submitting} className="btn-primary">
                  <span>{submitting ? "Provisioning..." : "Provision SUPER_ADMIN & Sign In"}</span>
                </button>
              </div>
            </form>
          </div>
        ) : authenticatedUser ? (
          <div style={{ display: "grid", gap: 24 }}>
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Signed-In Identity</span>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "4px 0" }}>
                    {authenticatedUser.fullName}
                  </h2>
                  <p style={{ fontSize: 13, color: "#475569" }}>
                    {authenticatedUser.email} · Role: <strong>{authenticatedUser.role}</strong>
                    {authenticatedUser.assignedExecutiveName ? ` · Scope: ${authenticatedUser.assignedExecutiveName}` : ""}
                  </p>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <a href="/" className="btn-secondary">
                    <span>Go to CRM Dashboard</span>
                  </a>
                  <button type="button" onClick={handleLogout} disabled={submitting} className="btn-primary" style={{ background: "#dc2626" }}>
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </div>

            {authenticatedUser.role === "SUPER_ADMIN" && (
              <div className="card" style={{ padding: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                      SUPER_ADMIN: Provision Staff & Role-Based Access
                    </h3>
                    <p style={{ fontSize: 13, color: "#64748b" }}>
                      Create least-privilege accounts for ADMIN, MANAGER, or EXECUTIVE team members.
                    </p>
                  </div>

                  <button type="button" onClick={handleSeedBaseline} disabled={submitting} className="btn-secondary">
                    <span>Seed Reviewed Baseline Inventory</span>
                  </button>
                </div>

                <form onSubmit={handleCreateUser} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
                  <input
                    required
                    placeholder="Full Name"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
                  />
                  <input
                    required
                    type="email"
                    placeholder="Email Address"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
                  />
                  <input
                    required
                    type="password"
                    placeholder="Password (min 10 chars)"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
                  />
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "EXECUTIVE")}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
                  >
                    <option value="EXECUTIVE">EXECUTIVE (Assigned Leads Only)</option>
                    <option value="MANAGER">MANAGER (Leads + Brochure Upload)</option>
                    <option value="ADMIN">ADMIN (Verify Inventory + Exports)</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN (Full Access)</option>
                  </select>
                  {newUserRole === "EXECUTIVE" && (
                    <select
                      value={newUserExecName}
                      onChange={(e) => setNewUserExecName(e.target.value)}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
                    >
                      <option value="Rajesh Sharma (Senior Property Specialist)">Rajesh Sharma</option>
                      <option value="Priya Nair (Lead Relationship Manager)">Priya Nair</option>
                      <option value="Suresh Kumar (Kannada Language Specialist)">Suresh Kumar</option>
                    </select>
                  )}
                  <button type="submit" disabled={submitting} className="btn-primary" style={{ fontSize: 13 }}>
                    <span>+ Create Staff Account</span>
                  </button>
                </form>

                {teamUsers.length > 0 && (
                  <div className="data-table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Executive Scope</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamUsers.map((u) => (
                          <tr key={u.id}>
                            <td style={{ fontWeight: 700 }}>{u.fullName}</td>
                            <td>{u.email}</td>
                            <td>
                              <span className="badge badge-contacted">{u.role}</span>
                            </td>
                            <td>{u.assignedExecutiveName || "All Records"}</td>
                            <td>{u.isActive !== false ? "Active ✓" : "Disabled"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ padding: 28, maxWidth: 480 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
              Staff Sign In
            </h2>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 18 }}>
              Sign in with your EstatePilot AI credentials to access protected CRM leads, property verification, and CSV exports.
            </p>

            <form onSubmit={handleLoginSubmit} style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
                Email Address *
                <input
                  required
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@estatepilot.in"
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </label>

              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
                Password *
                <input
                  required
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </label>

              <button type="submit" disabled={submitting} className="btn-primary" style={{ marginTop: 6 }}>
                <span>{submitting ? "Signing In..." : "Sign In to EstatePilot AI"}</span>
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
