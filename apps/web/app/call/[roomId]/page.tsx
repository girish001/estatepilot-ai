"use client";

import { useParams } from "next/navigation";
import { useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function CustomerCallPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [status, setStatus] = useState("Ready to join the EstatePilot call.");
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const localAudio = useRef<HTMLAudioElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const stream = useRef<MediaStream | null>(null);

  async function joinCall() {
    try {
      setStatus("Requesting microphone permission…");
      const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.current = media;
      if (localAudio.current) localAudio.current.srcObject = media;

      const connection = new RTCPeerConnection({
        iceServers: process.env.NEXT_PUBLIC_ICE_SERVERS
          ? JSON.parse(process.env.NEXT_PUBLIC_ICE_SERVERS)
          : []
      });
      peer.current = connection;
      media.getTracks().forEach(track => connection.addTrack(track, media));
      connection.ontrack = event => {
        if (remoteAudio.current) remoteAudio.current.srcObject = event.streams[0];
      };

      const apiUrl = new URL(API);
      apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
      apiUrl.pathname = `/webrtc/${roomId}`;
      const ws = new WebSocket(apiUrl.toString());
      socket.current = ws;
      connection.onicecandidate = event => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ice-candidate", payload: event.candidate }));
        }
      };

      ws.onopen = () => setStatus("Connected to call room. Waiting for the receptionist…");
      ws.onmessage = async event => {
        const message = JSON.parse(String(event.data)) as { type: string; role?: string; payload?: RTCSessionDescriptionInit | RTCIceCandidateInit };
        if (message.type === "joined") {
          setJoined(true);
          setStatus(message.role === "customer" ? "Joined. Waiting for the receptionist to connect…" : "Receptionist browser connected. Waiting for customer…");
        } else if (message.type === "peer-joined") {
          setStatus("The other participant joined. Connecting audio…");
          if (message.role === "customer" && connection.signalingState === "stable") {
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            if (connection.iceGatheringState !== "complete") {
              await new Promise<void>(resolve => {
                const done = () => {
                  if (connection.iceGatheringState === "complete") {
                    connection.removeEventListener("icegatheringstatechange", done);
                    resolve();
                  }
                };
                connection.addEventListener("icegatheringstatechange", done);
                window.setTimeout(resolve, 8000);
              });
            }
            ws.send(JSON.stringify({ type: "offer", payload: connection.localDescription }));
          }
        } else if (message.type === "offer") {
          await connection.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: "answer", payload: answer }));
        } else if (message.type === "answer") {
          await connection.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
        } else if (message.type === "ice-candidate") {
          await connection.addIceCandidate(message.payload as RTCIceCandidateInit);
        } else if (message.type === "peer-left") {
          setStatus("The other participant left the call.");
        } else if (message.type === "error") {
          setStatus("Call signalling error.");
        }
      };
      ws.onerror = () => setStatus("Unable to connect. Check the call link and try again.");
      ws.onclose = () => setStatus("Call connection closed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not join the call.");
    }
  }

  function toggleMute() {
    const next = !muted;
    stream.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    setMuted(next);
  }

  function leaveCall() {
    socket.current?.send(JSON.stringify({ type: "hangup" }));
    socket.current?.close();
    peer.current?.close();
    stream.current?.getTracks().forEach(track => track.stop());
    setJoined(false);
    setStatus("You left the call.");
  }

  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: 24 }}>
      <p style={{ color: "#2457d6", fontWeight: 700, letterSpacing: 1.2, fontSize: 12 }}>ESTATEPILOT AI</p>
      <h1>Property enquiry call</h1>
      <p style={{ color: "#667085", lineHeight: 1.7 }}>This is an internet voice call. Allow microphone access when prompted. Your browser must remain open during the call.</p>
      <p role="status" aria-live="polite" style={{ padding: 14, background: "#f1f5f9", borderRadius: 10 }}>{status}</p>
      <audio ref={localAudio} muted autoPlay />
      <audio ref={remoteAudio} autoPlay controls />
      {!joined ? <button onClick={joinCall} style={{ background: "#2457d6", color: "white", border: 0, borderRadius: 9, padding: "12px 18px", cursor: "pointer" }}>Join call</button> : <>
        <button onClick={toggleMute} style={{ marginRight: 10, padding: "11px 15px" }}>{muted ? "Unmute" : "Mute"}</button>
        <button onClick={leaveCall} style={{ padding: "11px 15px" }}>Leave call</button>
      </>}
      <p style={{ color: "#667085", fontSize: 12, marginTop: 24 }}>Do not share this private call link. Prototype call rooms expire automatically.</p>
    </main>
  );
}
