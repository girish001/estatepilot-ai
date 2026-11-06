# EstatePilot AI – Production Deployment & Architecture Guide

EstatePilot AI is an enterprise-grade, privacy-first, full-stack AI real-estate receptionist platform engineered for browser WebRTC voice engagement, verified inventory matching, and consent-driven site-visit workflows.

---

## Architecture Overview

```
                      ┌───────────────────────────────────────────┐
                      │             Customer Browser              │
                      │   (Enquiry Form & WebRTC Audio Stream)    │
                      └─────────────────────┬─────────────────────┘
                                            │
                           HTTPS (3000)     │     WSS WebRTC Signalling (4000)
                                            ▼
                      ┌───────────────────────────────────────────┐
                      │              EstatePilot Web              │
                      │         (Next.js 15 Full-Stack)           │
                      │  - Customer Enquiry Portal (4 Languages)  │
                      │  - Executive CRM & Leads Pipeline         │
                      │  - Property Knowledge Base (Brochures)    │
                      │  - Reports & Excel / CSV Exporter         │
                      └─────────────────────┬─────────────────────┘
                                            │
                                            ▼
┌──────────────────────────┐  WebRTC Media  ┌──────────────────────────┐
│     Fastify API (4000)   │◄──────────────►│    Voice Agent Service   │
│  - WebRTC Room Broker    │                │  - Faster-Whisper (STT)  │
│  - Participant Manager   │                │  - Ollama (Qwen2.5:3b)   │
│  - Audit Session Log     │                │  - Multilingual Piper    │
└────────────┬─────────────┘                └──────────────────────────┘
             │
             ▼
┌──────────────────────────┐                ┌──────────────────────────┐
│   PostgreSQL 16 Database │                │     Redis 7 (BullMQ)     │
│   (Prisma ORM Schema)    │                │  (Follow-up Scheduler)   │
└──────────────────────────┘                └──────────────────────────┘
```

---

## 1. Zero Paid Telephony Guarantee

EstatePilot AI uses **self-hosted browser-based WebRTC voice calling**.
- **No Twilio**
- **No Exotel**
- **No Plivo**
- **No Vapi / Retell / Paid AI Phone APIs**

Customers initiate calls via an unguessable private link with a 30-minute TTL. Two-way audio connects directly through browser WebRTC media streams with Google STUN (`stun:stun.l.google.com:19302`) and optional self-hosted coturn TURN servers.

---

## 2. 4-Language Receptionist Engine

EstatePilot AI natively supports 4 official languages with automatic spoken language detection, natural code-switching, and regional voice synthesis:

1. **English** (en-IN)
2. **Kannada** (ಕನ್ನಡ - kn-IN)
3. **Telugu** (తెలుగు - te-IN)
4. **Hindi** (हिन्दी - hi-IN)

### Self-Hosted Local AI Models

| Capability | Component | Default Model | Low-Cost / Free Setup |
|---|---|---|---|
| **Speech-to-Text** | Faster-Whisper | `small` (Multilingual) | Free, self-hosted on CPU/GPU |
| **Dialogue LLM** | Ollama | `qwen2.5:3b` / `llama3.2:3b` | Free open-source, runs locally |
| **Text-to-Speech** | Piper TTS | Language-specific ONNX models | Free open-source local synthesis |

Environment variables for Piper ONNX voices:
- `PIPER_VOICE_EN`: `voices/en_US-lessac-medium.onnx`
- `PIPER_VOICE_KN`: `voices/kn_IN-voice.onnx`
- `PIPER_VOICE_TE`: `voices/te_IN-voice.onnx`
- `PIPER_VOICE_HI`: `voices/hi_IN-voice.onnx`

---

## 3. Strict Real Estate AI Business Rules

EstatePilot AI enforces 12 immutable business rules:

1. **Never ask customers about budget, income, salary or loan eligibility.**
2. **Never negotiate property prices or offer unapproved discounts.**
3. **Only quote approved per-square-foot rates or approved unit rates from verified inventory.**
4. **Never invent possession dates, approvals (RERA/BIAAPA/BMRDA/GHMC), or amenities.**
5. **Always escalate negotiations, complaints, and legal queries to a human property specialist.**
6. **Immediately honour opt-out requests ("Stop calling", "Do not contact") and permanently block outbound calls.**
7. **Contact customers only during legal calling hours (09:00 - 19:00 IST).**
8. **If a customer misses a site visit, ask if they wish to reschedule at their agreed time.**

---

## 4. Docker Compose Quickstart

Clone the repository and deploy with Docker Compose:

```bash
git clone https://github.com/girish001/estatepilot-ai.git
cd estatepilot-ai

# Copy environment template
cp .env.example .env

# Start all full-stack containers
docker compose up -d --build
```

### Port Mapping

- **Next.js Web & CRM Dashboard**: `http://localhost:3000`
- **Fastify Signalling API**: `http://localhost:4000`
- **PostgreSQL Database**: `localhost:5432`
- **Redis Cache**: `localhost:6379`
- **Ollama LLM**: `http://localhost:11434`

---

## 5. Local Development Without Docker

```bash
# 1. Install dependencies
npm install

# 2. Run Next.js Development Server (Port 3000)
npm run dev

# 3. Build & Typecheck
npm run build
npm run typecheck
```

---

## 6. Audit & Excel Reports

EstatePilot AI provides 8 built-in audit and management reports downloadable in UTF-8 BOM CSV (natively opens in Microsoft Excel without character corruption for Telugu, Kannada, Hindi, and ₹ symbols):

1. **Daily Enquiry Report** (`/api/reports/export?type=daily-enquiries`)
2. **Weekly Performance Report**
3. **Monthly Lead Status & Audit Report** (`/api/reports/export?type=monthly-leads`)
4. **Property-Category Rate Card Report** (`/api/reports/export?type=property-category`)
5. **Sales Executive Performance Report** (`/api/reports/export?type=sales-executive`)
6. **AI Voice Call Summary & Transcript Report** (`/api/reports/export?type=call-summary`)
7. **Site Visit & Walkthrough Report** (`/api/reports/export?type=site-visits`)
8. **End-to-End Conversion Report**
