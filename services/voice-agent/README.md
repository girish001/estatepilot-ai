# Self-hosted voice agent

Joins an EstatePilot WebRTC room as an AI participant. Audio is processed locally with faster-whisper, Ollama and Piper.

## Setup
- Python 3.11
- Install Ollama and pull a multilingual model: `ollama pull llama3.2:3b` (verify Telugu quality before use).
- Install Piper and download a compatible voice model plus its JSON config. Set `PIPER_VOICE` to the ONNX file. Check model/voice licences before commercial use.
- Install dependencies: `pip install -r requirements.txt`
- Start the API and create a room using the receptionist page.
- Start agent with the room id:
  ```powershell
  $env:ESTATEPILOT_SIGNAL_URL="ws://localhost:4000"
  $env:ESTATEPILOT_ROOM_ID="<room-id>"
  python agent.py
  ```
- Customer opens the generated URL and selects Join call.

## Environment
`ESTATEPILOT_SIGNAL_URL` (default ws://localhost:4000), required `ESTATEPILOT_ROOM_ID`, `OLLAMA_URL` (default http://localhost:11434), `OLLAMA_MODEL` (llama3.2:3b), `WHISPER_MODEL` (small), `WHISPER_DEVICE` (cpu), `WHISPER_COMPUTE_TYPE` (int8), `PIPER_BIN` (piper), `PIPER_VOICE` (voices/en_US-lessac-medium.onnx).

## Prototype limitations and safety
This is an experimental turn-based prototype, not production-ready streaming voice. It transcribes 3-second chunks; latency will be noticeable. It does not yet implement ICE candidate exchange, VAD/echo cancellation, human handoff, RAG/property grounding, durable sessions, authentication, rate limits, or TURN. Configure those before deployment. An English Piper voice cannot speak Telugu correctly; select a Telugu-capable licensed voice. The prompt forbids budget questions and unapproved pricing, but property facts are not yet grounded. No recording is enabled. Disclose AI processing and capture consent before calls; never enable unattended customer calling until compliance, opt-out, abuse and security controls are complete.
