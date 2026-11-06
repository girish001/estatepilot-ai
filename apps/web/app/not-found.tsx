export default function NotFound() {
  return (
    <main style={{ maxWidth: 640, margin: "64px auto", padding: 24, textAlign: "center", fontFamily: "Arial, sans-serif" }}>
      <p style={{ color: "#2457d6", fontWeight: 700, letterSpacing: 1.2, fontSize: 12 }}>ESTATEPILOT AI</p>
      <h1 style={{ fontSize: 32, margin: "16px 0 8px" }}>Page Not Found</h1>
      <p style={{ color: "#667085", marginBottom: 24 }}>The requested page or call link does not exist or has expired.</p>
      <a href="/" style={{ background: "#2457d6", color: "#fff", padding: "10px 18px", borderRadius: 8, fontWeight: 600, textDecoration: "none", display: "inline-block" }}>
        Return to Home
      </a>
    </main>
  );
}
