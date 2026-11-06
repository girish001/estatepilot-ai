"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Navbar from "../../components/Navbar";
import { SupportedLanguage } from "../../lib/store";

interface MessageTurn {
  role: "receptionist" | "customer" | "system" | "executive";
  text: string;
  time: string;
}

export default function CustomerCallPage() {
  const params = useParams();
  const roomId = (params?.roomId as string) || "demo-room";

  const [callState, setCallState] = useState<"IDLE" | "CONNECTING" | "CONNECTED" | "ENDED">("IDLE");
  const [statusText, setStatusText] = useState("Ready to connect to EstatePilot AI Receptionist.");
  const [activeLanguage, setActiveLanguage] = useState<SupportedLanguage>("English");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [humanTakeover, setHumanTakeover] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [transcript, setTranscript] = useState<MessageTurn[]>([
    {
      role: "receptionist",
      text: "Hello! I am EstatePilot AI Receptionist. I can assist you in English, Kannada (ಕನ್ನಡ), Telugu (తెలుగు), or Hindi (हिन्दी). Which property category or location can I help you explore today?",
      time: "00:01"
    }
  ]);

  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Speech Synthesis for the selected language
  function speakReply(text: string, lang: SupportedLanguage) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    // Language tag mapping for Indian regional voices
    const langCodes: Record<SupportedLanguage, string> = {
      English: "en-IN",
      Hindi: "hi-IN",
      Telugu: "te-IN",
      Kannada: "kn-IN"
    };

    utterance.lang = langCodes[lang] || "en-IN";
    utterance.rate = 0.95; // Natural conversational pacing

    // Look for localized voice
    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = voices.find((v) => v.lang.startsWith(langCodes[lang]) || v.name.toLowerCase().includes(lang.toLowerCase()));
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }

  // Start WebRTC and Browser Microphone Call
  async function startCall() {
    try {
      setCallState("CONNECTING");
      setStatusText("Requesting microphone permission & creating WebRTC peer…");

      let media: MediaStream | null = null;
      try {
        media = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        streamRef.current = media;
        if (localAudioRef.current) localAudioRef.current.srcObject = media;
      } catch (err) {
        console.warn("Microphone access not granted or unavailable, operating in interactive audio mode:", err);
      }

      // Initialize WebRTC Peer Connection with STUN servers
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" }
        ]
      });
      peerRef.current = pc;

      if (media) {
        media.getTracks().forEach((track) => pc.addTrack(track, media!));
      }

      pc.ontrack = (event) => {
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0];
      };

      setCallState("CONNECTED");
      setStatusText("Connected to AI Receptionist. Speak into your microphone or choose a quick prompt below.");

      // Setup Web Speech Recognition if supported
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.continuous = true;
          rec.interimResults = false;
          rec.lang = activeLanguage === "Telugu" ? "te-IN" : activeLanguage === "Kannada" ? "kn-IN" : activeLanguage === "Hindi" ? "hi-IN" : "en-IN";

          rec.onresult = (e: any) => {
            const last = e.results[e.results.length - 1];
            if (last.isFinal) {
              const spokenText = last[0].transcript;
              handleCustomerSpokenTurn(spokenText);
            }
          };

          rec.onstart = () => setIsListening(true);
          rec.onend = () => {
            if (callState === "CONNECTED") {
              try { rec.start(); } catch {}
            }
          };

          rec.start();
          recognitionRef.current = rec;
        } catch (e) {
          console.warn("Speech recognition initialization error:", e);
        }
      }

      // Initial greeting speech
      speakReply(transcript[0].text, activeLanguage);
    } catch (error) {
      setCallState("IDLE");
      setStatusText(error instanceof Error ? error.message : "Could not join call.");
    }
  }

  // Process customer speech turn through server AI dialogue engine
  async function handleCustomerSpokenTurn(text: string) {
    if (!text || text.trim().length === 0) return;

    const timeStr = new Date().toLocaleTimeString("en-IN", { minute: "2-digit", second: "2-digit" });
    const userTurn: MessageTurn = { role: "customer", text, time: timeStr };

    setTranscript((prev) => [...prev, userTurn]);
    setManualInput("");

    if (humanTakeover) {
      // If human executive joined, AI does not interfere
      return;
    }

    try {
      setStatusText("EstatePilot AI is processing your requirement…");

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          language: activeLanguage,
          history: transcript.map((t) => ({ role: t.role, text: t.text }))
        })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success || typeof data.reply !== "string") {
        throw new Error(data?.message || `AI Receptionist service error (HTTP ${response.status})`);
      }

      const replyText = data.reply;
      const newLang: SupportedLanguage = data.detectedLanguage || activeLanguage;
      if (newLang !== activeLanguage) {
        setActiveLanguage(newLang);
      }

      const replyTime = new Date().toLocaleTimeString("en-IN", { minute: "2-digit", second: "2-digit" });
      const aiTurn: MessageTurn = { role: "receptionist", text: replyText, time: replyTime };

      setTranscript((prev) => [...prev, aiTurn]);
      setStatusText(data.escalateToHuman ? "Senior Property Executive requested. Connecting to live agent…" : "AI Receptionist responding…");

      if (data.escalateToHuman) {
        setHumanTakeover(true);
      }

      speakReply(replyText, newLang);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Unable to reach AI Receptionist.";
      setStatusText(`⚠️ ${errMsg}. Please try sending your message again.`);
      const replyTime = new Date().toLocaleTimeString("en-IN", { minute: "2-digit", second: "2-digit" });
      setTranscript((prev) => [
        ...prev,
        {
          role: "system",
          text: `Temporary dialogue service warning: ${errMsg}. Please try again.`,
          time: replyTime
        }
      ]);
    }
  }

  function toggleMute() {
    const next = !isMuted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setIsMuted(next);
  }

  function handleHumanTakeover() {
    setHumanTakeover(true);
    const timeStr = new Date().toLocaleTimeString("en-IN", { minute: "2-digit", second: "2-digit" });
    setTranscript((prev) => [
      ...prev,
      {
        role: "system",
        text: "Human Sales Executive (Rajesh Sharma) has taken over the WebRTC session. Commercial discussions and customized scheduling are active.",
        time: timeStr
      }
    ]);
    setStatusText("Human Takeover Active. Senior Property Specialist Rajesh Sharma is on the call.");
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }

  function leaveCall() {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    recognitionRef.current?.stop();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCallState("ENDED");
    setStatusText("Call ended. Thank you for speaking with EstatePilot AI.");
  }

  // Quick multilingual test prompts
  const testPrompts: Array<{ label: string; text: string; lang: SupportedLanguage }> = [
    { label: "Telugu: ప్లాట్ల రేటు ఎంత?", text: "నమస్కారం, దేవనಹల్లి ఎయిర్‌పోర్ట్ దగ్గర ప్లాట్ల రేటు ఎంత? సైట్ విజిట్ చేయవచ్చా?", lang: "Telugu" },
    { label: "Kannada: ವೈಟ್‌ಫೀಲ್ಡ್ ಫ್ಲಾಟ್ ವಿವರಗಳು", text: "ನಮಸ್ಕಾರ, ವೈಟ್‌ಫೀಲ್ಡ್‌ನಲ್ಲಿ 3 ಬಿಎಚ್‌ಕೆ ಫ್ಲಾಟ್ ವಿವರಗಳು ಮತ್ತು ಅನುಮೋದಿತ ಬೆಲೆ ತಿಳಿಸಿ.", lang: "Kannada" },
    { label: "Hindi: सरजापुर विला की दर", text: "नमस्ते, सरजापुर में लक्जरी विला की प्रति वर्ग फुट स्वीकृत दर क्या है?", lang: "Hindi" },
    { label: "English: Schedule Site Visit", text: "Hi, I am interested in Greenfield Serene County plots. Can we schedule a site visit for this Sunday?", lang: "English" },
    { label: "Compliance: Negotiate Price", text: "Can you give me a 15% discount on the square foot rate?", lang: "English" }
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar currentPath="/call" />

      <main className="app-container" style={{ padding: "32px 24px 64px", flex: 1, maxWidth: 960 }}>
        {/* Call Banner */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#2563eb", letterSpacing: 1.2 }}>ESTATEPILOT AI</span>
              <span className={`badge ${callState === "CONNECTED" ? "badge-converted" : "badge-new"}`}>
                {callState === "CONNECTED" ? "● LIVE WEBRTC CALL" : callState}
              </span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>
              AI Real Estate Receptionist Calling Room
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Language:</span>
            <select
              value={activeLanguage}
              onChange={(e) => setActiveLanguage(e.target.value as SupportedLanguage)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, fontWeight: 700 }}
            >
              <option value="English">English</option>
              <option value="Kannada">ಕನ್ನಡ (Kannada)</option>
              <option value="Telugu">తెలుగు (Telugu)</option>
              <option value="Hindi">हिन्दी (Hindi)</option>
            </select>
          </div>
        </div>

        {/* Audio Elements (Hidden) */}
        <audio ref={localAudioRef} muted autoPlay style={{ display: "none" }} />
        <audio ref={remoteAudioRef} autoPlay style={{ display: "none" }} />

        {/* Call Card Panel */}
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          {/* Status Display */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, paddingBottom: 16, borderBottom: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: callState === "CONNECTED" ? "#10b981" : callState === "CONNECTING" ? "#f59e0b" : "#94a3b8" }}></div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{statusText}</p>
                <p style={{ fontSize: 12, color: "#64748b" }}>Room ID: {roomId} · Audio: WebRTC 48kHz Opus · Local STUN</p>
              </div>
            </div>

            {/* Audio Visualizer */}
            {callState === "CONNECTED" && (
              <div className="audio-visualizer" title={isSpeaking ? "AI Speaking" : "Listening"}>
                <div className="audio-bar" style={{ animationDuration: isSpeaking ? "0.6s" : "1.8s", height: isSpeaking ? 38 : 12 }}></div>
                <div className="audio-bar" style={{ animationDuration: isSpeaking ? "0.8s" : "2.0s", height: isSpeaking ? 48 : 16 }}></div>
                <div className="audio-bar" style={{ animationDuration: isSpeaking ? "0.5s" : "1.6s", height: isSpeaking ? 30 : 10 }}></div>
                <div className="audio-bar" style={{ animationDuration: isSpeaking ? "0.9s" : "2.2s", height: isSpeaking ? 42 : 14 }}></div>
                <div className="audio-bar" style={{ animationDuration: isSpeaking ? "0.7s" : "1.7s", height: isSpeaking ? 36 : 12 }}></div>
              </div>
            )}
          </div>

          {/* Call Control Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
            {callState === "IDLE" && (
              <button onClick={startCall} className="btn-primary" style={{ padding: "12px 24px", fontSize: 15 }}>
                <span>🎙 Join & Allow Microphone</span>
              </button>
            )}

            {callState === "CONNECTED" && (
              <>
                <button
                  onClick={toggleMute}
                  className="btn-secondary"
                  style={{ background: isMuted ? "#fef2f2" : "#fff", color: isMuted ? "#b91c1c" : "#334155" }}
                >
                  {isMuted ? "🔇 Unmute Mic" : "🎙 Mute Mic"}
                </button>

                {!humanTakeover && (
                  <button onClick={handleHumanTakeover} className="btn-secondary">
                    <span>👤 Request Human Executive</span>
                  </button>
                )}

                <button onClick={leaveCall} className="btn-secondary" style={{ background: "#fef2f2", color: "#b91c1c", borderColor: "#fecaca" }}>
                  <span>☎ End Call</span>
                </button>
              </>
            )}

            {callState === "ENDED" && (
              <button onClick={startCall} className="btn-primary">
                <span>🔄 Reconnect Call</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Conversation Transcript Panel */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
              Live Conversation Transcript ({transcript.length} turns)
            </h2>
            <span style={{ fontSize: 12, color: "#64748b" }}>Consent Active · Recorded for Verification</span>
          </div>

          {/* Transcript Scroll Area */}
          <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, padding: "8px 4px" }}>
            {transcript.map((turn, i) => {
              const isAI = turn.role === "receptionist";
              const isSystem = turn.role === "system";

              if (isSystem) {
                return (
                  <div key={i} style={{ textAlign: "center", padding: 8, background: "#fefce8", border: "1px solid #fef08a", borderRadius: 8, fontSize: 12, color: "#854d0e" }}>
                    ℹ️ {turn.text}
                  </div>
                );
              }

              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isAI ? "flex-start" : "flex-end",
                    maxWidth: "85%",
                    alignSelf: isAI ? "flex-start" : "flex-end"
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: isAI ? "#2563eb" : "#475569", marginBottom: 3 }}>
                    {isAI ? "🤖 EstatePilot Receptionist" : "👤 Customer"} · {turn.time}
                  </span>
                  <div
                    style={{
                      background: isAI ? "#f1f5f9" : "#2563eb",
                      color: isAI ? "#0f172a" : "#fff",
                      padding: "12px 16px",
                      borderRadius: isAI ? "16px 16px 16px 4px" : "16px 16px 4px 16px",
                      fontSize: 14,
                      lineHeight: 1.5,
                      boxShadow: "var(--shadow-sm)"
                    }}
                  >
                    {turn.text}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Text/Spoken Turn Input Field & Quick Prompts */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder={callState === "CONNECTED" ? "Speak into microphone or type message here..." : "Start call above to activate voice..."}
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCustomerSpokenTurn(manualInput);
                }}
                disabled={callState !== "CONNECTED"}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                  outline: "none"
                }}
              />
              <button
                type="button"
                onClick={() => handleCustomerSpokenTurn(manualInput)}
                disabled={callState !== "CONNECTED" || !manualInput.trim()}
                className="btn-primary"
                style={{ padding: "10px 18px" }}
              >
                Send
              </button>
            </div>

            {/* Quick multilingual prompt chips to immediately test all 4 languages */}
            <div style={{ marginTop: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>
                Test 4-Language Speech & Strict Rules (Click to send turn):
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {testPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (callState !== "CONNECTED") {
                        startCall();
                      }
                      setActiveLanguage(p.lang);
                      handleCustomerSpokenTurn(p.text);
                    }}
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #cbd5e1",
                      borderRadius: 20,
                      padding: "5px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#334155",
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
