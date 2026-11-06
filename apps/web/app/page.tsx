const metrics = [
  { label: "New enquiries", value: "—", note: "Awaiting lead integration" },
  { label: "Follow-ups due", value: "—", note: "Customer-agreed callbacks" },
  { label: "Site visits", value: "—", note: "Scheduled and completed" },
  { label: "Available properties", value: "—", note: "Verified inventory only" }
];

export default function HomePage() {
  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "48px 24px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <p style={{ color: "#2457d6", fontWeight: 700, letterSpacing: 1.4, fontSize: 12 }}>ESTATEPILOT AI</p>
          <h1 style={{ margin: "8px 0", fontSize: 34 }}>Real estate lead workspace</h1>
          <p style={{ color: "#667085", margin: 0 }}>Manage enquiries, verified properties, callbacks and site visits.</p>
        </div>
        <span style={{ border: "1px solid #cbd5e1", borderRadius: 999, padding: "8px 12px", color: "#475569", fontSize: 13 }}>Foundation · MVP</span>
      </header>

      <section aria-label="Overview metrics" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16, marginTop: 36 }}>
        {metrics.map((metric) => (
          <article key={metric.label} style={{ background: "#fff", border: "1px solid #e6e9f0", borderRadius: 16, padding: 20 }}>
            <p style={{ color: "#667085", margin: 0, fontSize: 14 }}>{metric.label}</p>
            <p style={{ fontSize: 30, fontWeight: 700, margin: "12px 0" }}>{metric.value}</p>
            <p style={{ color: "#667085", margin: 0, fontSize: 12 }}>{metric.note}</p>
          </article>
        ))}
      </section>

      <section style={{ marginTop: 28, background: "#fff", border: "1px solid #e6e9f0", borderRadius: 16, padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>Next implementation milestones</h2>
        <ol style={{ color: "#475569", lineHeight: 2 }}>
          <li>Property inventory and approved per-square-foot rates</li>
          <li>Lead intake, consent capture and requirement profile</li>
          <li>AI calling, conversation summary and property matching</li>
          <li>Customer-agreed callbacks and site-visit workflow</li>
          <li>Excel reports and owner notifications</li>
        </ol>
      </section>
    </main>
  );
}
