"use client";

import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function ReceptionistCallPage() {
  const [link, setLink] = useState("");
  const [agentUrl, setAgentUrl] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function createRoom() {
    setBusy(true);
    setStatus("Creating a secure call room…");
    try {
      const response = await fetch(`${API}/webrtc/rooms`, { method: "POST" });
      if (!response.ok) throw new Error("Could not create call room. Check that the API is running.");
      const data = await response.json() as { roomId: string; customerUrl: string; expiresInSeconds: number };
      setLink(data.customerUrl);
      setAgentUrl(`/call/${data.roomId}`);
      setStatus(`Room created. Open the receptionist call page first, then share the customer link. It expires in ${Math.round(data.expiresInSeconds / 60)} minutes.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create call room.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setStatus("Customer call link copied.");
  }

  return (
    <main style={{ maxWidth: 760, margin: "48px auto", padding: 24 }}>
      <p style={{ color: "#2457d6", fontWeight: 700, letterSpacing: 1.2, fontSize: 12 }}>ESTATEPILOT AI · RECEPTIONIST</p>
      <h1>Start an internet call</h1>
      <p style={{ color: "#667085", lineHeight: 1.7 }}>
        Create a private browser call room. Open the receptionist call page first, then share the customer link. The customer must open the link and allow microphone access. This does not call a mobile number.
      </p>
      <button onClick={createRoom} disabled={busy} style={{ border: 0, borderRadius: 10, padding: "13px 18px", background: "#2457d6", color: "white", fontWeight: 700, cursor: "pointer" }}>
        {busy ? "Creating…" : "Create customer call link"}
      </button>
      {status && <p role="status" style={{ marginTop: 18 }}>{status}</p>}
      {link && <section style={{ marginTop: 18, padding: 18, border: "1px solid #dce2ec", borderRadius: 12 }}>
        <p style={{ fontWeight: 700, marginTop: 0 }}>1. Join as receptionist</p>
        <a href={agentUrl} target="_blank" rel="noreferrer">Open receptionist call page ↗</a>
        <p style={{ fontWeight: 700, marginTop: 20 }}>2. Share this customer link</p>
        <input aria-label="Customer call link" readOnly value={link} style={{ width: "100%", boxSizing: "border-box", padding: 12, border: "1px solid #cbd5e1", borderRadius: 8 }} />
        <button onClick={copyLink} style={{ marginTop: 12, border: "1px solid #cbd5e1", borderRadius: 8, padding: "10px 14px", background: "white", cursor: "pointer" }}>Copy customer link</button>
      </section>}
      <p style={{ marginTop: 28, color: "#667085", fontSize: 13 }}>Prototype only: this connects two browsers. AI speech, lead association, authentication and production TURN are not yet connected.</p>
    </main>
  );
}
