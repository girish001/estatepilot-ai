"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Navbar from "../components/Navbar";
import { SupportedLanguage } from "../lib/store";

export default function ReceptionistControlPage() {
  const [createdRoomId, setCreatedRoomId] = useState("");
  const [customerLink, setCustomerLink] = useState("");
  const [agentLink, setAgentLink] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  // Dialogue simulation state
  const [simLang, setSimLang] = useState<SupportedLanguage>("Telugu");
  const [simInput, setSimInput] = useState("");
  const [simLog, setSimLog] = useState<Array<{ role: string; text: string; time: string }>>([
    {
      role: "AI Receptionist",
      text: "నమస్కారం! నేను EstatePilot AI రిసెప్షనిస్ట్‌ని. మీకు దేవనహల్లి ప్లాట్లు లేదా వైట్‌ఫీల్డ్ ఫ్లాట్ల వివరాలు కావాలా?",
      time: "10:00 AM"
    }
  ]);
  const [isSimulating, setIsSimulating] = useState(false);

  async function generateRoom() {
    setIsGenerating(true);
    setCopyStatus("");
    try {
      const res = await fetch("/api/webrtc/rooms", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setCreatedRoomId(data.roomId);
        setCustomerLink(data.customerUrl);
        setAgentLink(`/call/${data.roomId}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyToClipboard(text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Customer call link copied to clipboard! Share via WhatsApp or SMS.");
    } catch {
      setCopyStatus("Link generated. Copy from text box above.");
    }
  }

  async function handleSimulateTurn(customText?: string) {
    const textToSend = customText || simInput;
    if (!textToSend.trim()) return;

    const timeStr = new Date().toLocaleTimeString("en-IN", { minute: "2-digit", second: "2-digit" });
    setSimLog((prev) => [...prev, { role: "Customer", text: textToSend, time: timeStr }]);
    setSimInput("");
    setIsSimulating(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          language: simLang,
          history: simLog.map((l) => ({ role: l.role === "AI Receptionist" ? "assistant" : "user", text: l.text }))
        })
      });
      const data = await res.json();
      if (data.success) {
        const replyTime = new Date().toLocaleTimeString("en-IN", { minute: "2-digit", second: "2-digit" });
        setSimLog((prev) => [...prev, { role: "AI Receptionist", text: data.reply, time: replyTime }]);
        if (data.detectedLanguage) {
          setSimLang(data.detectedLanguage);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSimulating(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar currentPath="/receptionist" />

      <main className="app-container" style={{ padding: "32px 24px 64px", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#2563eb", letterSpacing: 1.2 }}>ESTATEPILOT AI</span>
              <span className="badge badge-converted">Engine Active</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: -0.6 }}>
              AI Receptionist Operations & Call Room Dispatcher
            </h1>
            <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
              Manage browser WebRTC call rooms, monitor self-hosted Faster-Whisper/Ollama/Piper voice agents, and test live multilingual dialogs.
            </p>
          </div>

          <button onClick={generateRoom} disabled={isGenerating} className="btn-primary">
            <span>{isGenerating ? "Generating Room…" : "🔑 Generate New WebRTC Room Link"}</span>
          </button>
        </div>

        {/* Room Link Result Card */}
        {customerLink && (
          <div style={{ marginTop: 24, padding: 20, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: "#1e3a8a", margin: 0 }}>
                  Active WebRTC Room Created: {createdRoomId}
                </h3>
                <p style={{ fontSize: 12, color: "#3b82f6", marginTop: 2 }}>
                  Private Room TTL: 30 minutes · End-to-end browser encrypted audio · No PSTN/mobile dialing cost.
                </p>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <a href={agentLink} target="_blank" rel="noreferrer" className="btn-secondary" style={{ background: "#fff", fontSize: 13 }}>
                  <span>Open Receptionist View ↗</span>
                </a>
                <button onClick={() => copyToClipboard(customerLink)} className="btn-primary" style={{ fontSize: 13 }}>
                  <span>Copy Customer Link</span>
                </button>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <input
                readOnly
                value={customerLink}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  fontSize: 13,
                  fontFamily: "monospace"
                }}
              />
              {copyStatus && (
                <p style={{ fontSize: 12, fontWeight: 700, color: "#047857", marginTop: 6 }}>
                  ✓ {copyStatus}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 2-Column: Left = Self-Hosted AI Architecture Config, Right = Live Multilingual Simulator */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20, marginTop: 24 }}>
          {/* Architecture Status Panel */}
          <div className="card">
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 14 }}>
              🛠 Self-Hosted Voice Architecture Status
            </h2>

            <div style={{ display: "grid", gap: 14, fontSize: 13 }}>
              {/* WebRTC Signalling */}
              <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700 }}>Real-Time Signalling Server</span>
                  <span className="badge badge-converted">Ready</span>
                </div>
                <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 12 }}>
                  Fastify WebSocket signalling service at <code>ws://localhost:4000/webrtc/:roomId</code>. Google STUN configured.
                </p>
              </div>

              {/* Faster Whisper STT */}
              <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700 }}>Speech Recognition (Faster-Whisper)</span>
                  <span className="badge badge-converted">Multilingual</span>
                </div>
                <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 12 }}>
                  Model: <code>small</code> (INT8 CPU/CUDA). Automatic language detection across EN, KN, TE, HI. 16kHz resampled.
                </p>
              </div>

              {/* Ollama LLM */}
              <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700 }}>AI Dialogue Model (Ollama)</span>
                  <span className="badge badge-converted">qwen2.5:3b</span>
                </div>
                <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 12 }}>
                  Model: <code>qwen2.5:3b</code> / <code>llama3.2:3b</code>. Enforces 12 strict real estate business rules, 0 budget profiling.
                </p>
              </div>

              {/* Piper TTS Voices */}
              <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700 }}>Multilingual TTS Engine (Piper & Web)</span>
                  <span className="badge badge-converted">4 Regional Voices</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8, fontSize: 11 }}>
                  <div style={{ background: "#fff", padding: 6, borderRadius: 6, border: "1px solid #e2e8f0" }}>
                    <strong>EN:</strong> <code>PIPER_VOICE_EN</code> (en-IN)
                  </div>
                  <div style={{ background: "#fff", padding: 6, borderRadius: 6, border: "1px solid #e2e8f0" }}>
                    <strong>TE:</strong> <code>PIPER_VOICE_TE</code> (te-IN)
                  </div>
                  <div style={{ background: "#fff", padding: 6, borderRadius: 6, border: "1px solid #e2e8f0" }}>
                    <strong>KN:</strong> <code>PIPER_VOICE_KN</code> (kn-IN)
                  </div>
                  <div style={{ background: "#fff", padding: 6, borderRadius: 6, border: "1px solid #e2e8f0" }}>
                    <strong>HI:</strong> <code>PIPER_VOICE_HI</code> (hi-IN)
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Multilingual Receptionist Simulator */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                🎙 Multilingual Dialogue Test Console
              </h2>
              <select
                value={simLang}
                onChange={(e) => setSimLang(e.target.value as SupportedLanguage)}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 12, fontWeight: 700 }}
              >
                <option value="Telugu">Telugu (తెలుగు)</option>
                <option value="Kannada">Kannada (ಕನ್ನಡ)</option>
                <option value="Hindi">Hindi (हिन्दी)</option>
                <option value="English">English</option>
              </select>
            </div>

            {/* Simulation Log */}
            <div style={{ height: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: 8, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
              {simLog.map((turn, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: turn.role === "Customer" ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    background: turn.role === "Customer" ? "#2563eb" : "#fff",
                    color: turn.role === "Customer" ? "#fff" : "#0f172a",
                    padding: "8px 12px",
                    borderRadius: 10,
                    fontSize: 13,
                    border: turn.role === "Customer" ? "none" : "1px solid #e2e8f0"
                  }}
                >
                  <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 2 }}>{turn.role} · {turn.time}</div>
                  {turn.text}
                </div>
              ))}
            </div>

            {/* Quick Test Turn Buttons */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => handleSimulateTurn("ప్లాట్ సైజులు మరియు ఆమోదిత రేటు చెప్పండి.")}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "#f1f5f9", border: "1px solid #cbd5e1", cursor: "pointer" }}
              >
                Telugu: ప్లాట్ సైజులు & రేటు
              </button>
              <button
                type="button"
                onClick={() => handleSimulateTurn("ದೇವನಹಳ್ಳಿಯಲ್ಲಿ ಸೈಟ್ ವಿಸಿಟ್ ಯಾವ ದಿನ ಮಾಡಬಹುದು?")}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "#f1f5f9", border: "1px solid #cbd5e1", cursor: "pointer" }}
              >
                Kannada: ಸೈಟ್ ವಿಸಿಟ್
              </button>
              <button
                type="button"
                onClick={() => handleSimulateTurn("क्या आप मुझे 20% डिस्काउंट दे सकते हैं?")}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "#f1f5f9", border: "1px solid #cbd5e1", cursor: "pointer" }}
              >
                Hindi: डिस्काउंट (Test Escalation)
              </button>
              <button
                type="button"
                onClick={() => handleSimulateTurn("Stop calling me and delete my record.")}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", cursor: "pointer" }}
              >
                Opt-out: Stop calling
              </button>
            </div>

            {/* Input Bar */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                type="text"
                placeholder="Type customer question..."
                value={simInput}
                onChange={(e) => setSimInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSimulateTurn();
                }}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
              />
              <button onClick={() => handleSimulateTurn()} disabled={isSimulating} className="btn-primary" style={{ padding: "8px 14px", fontSize: 13 }}>
                {isSimulating ? "Thinking…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
