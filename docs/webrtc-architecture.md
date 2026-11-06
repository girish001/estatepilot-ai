# Self-hosted WebRTC calling architecture

## Product decision
EstatePilot uses browser-to-browser WebRTC. It does not dial PSTN/mobile numbers and does not require Exotel, Twilio, Plivo, or a hosted calling platform. A customer receives a secure web link and must open it and grant microphone permission to join.

## First vertical slice
- Fastify creates an unguessable, short-lived call room.
- WebSocket signalling relays SDP offers/answers and ICE candidates between at most two browser peers.
- Media travels peer-to-peer using WebRTC; the signalling server does not carry audio.
- Room expires after 30 minutes and is removed when both peers leave.
- The initial implementation uses in-memory rooms; restart clears active rooms. This is suitable only for development/single-instance testing.

## Next implementation stages
1. Add authenticated receptionist console and customer call page.
2. Add self-hosted coturn for reliable NAT traversal. Do not rely on public STUN/TURN services in production.
3. Add self-hosted speech-to-text (Whisper/faster-whisper), local LLM (Ollama), and text-to-speech (Piper or another multilingual engine).
4. Add a voice activity detector and streaming audio pipeline; WebRTC media must be connected to the speech engine before an AI conversation can happen.
5. Add durable room/session state, lead association, consent audit, rate limits, abuse protection, and monitoring.
6. Add deployment with HTTPS/WSS. Browser microphone access requires a secure context (HTTPS or localhost).

## Customer experience constraint
A web link cannot ring a normal mobile phone. The customer must actively open the link and join. For automatic outreach, EstatePilot can send the link through a separately configured channel, but delivery of SMS/WhatsApp/email is outside this self-hosted WebRTC slice and would introduce another provider dependency. An alternative is to display the link on the thank-you page and invite the customer to start the call immediately.

## Security and compliance gates
- Only create rooms for leads with recorded call consent.
- Use short-lived, single-use room credentials in production; do not expose unrestricted room creation publicly.
- Never record audio by default. If recording/transcription is enabled, disclose it and capture required consent.
- Provide visible hang-up and opt-out controls.
- Enforce origin checks, connection limits, request validation, and abuse throttling.
- Do not use WebRTC call availability to imply PSTN/mobile reachability.

## Environment
- `API_PORT`: API listen port (default 4000)
- `API_HOST`: bind address (default 0.0.0.0)
- `WEB_ORIGIN`: allowed browser origin (default http://localhost:3000)
- `PUBLIC_WEB_ORIGIN`: base URL used to construct customer call links (default http://localhost:3000)
- Production deployment must use HTTPS and WSS, plus a self-hosted TURN server configured in the browser ICE policy.
