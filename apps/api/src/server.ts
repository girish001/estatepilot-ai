import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";

const app = Fastify({ logger: true });
await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? "http://localhost:3000"
});
await app.register(websocket);

type Peer = { socket: WebSocket; role: "agent" | "customer" };
const rooms = new Map<string, Set<Peer>>();
const ROOM_TTL_MS = 30 * 60 * 1000;
const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();

app.get("/health", async () => ({
  status: "ok",
  service: "estatepilot-api",
  features: { webrtcSignalling: true, pstnCalling: false },
  timestamp: new Date().toISOString()
}));

// Creates an unguessable, short-lived browser call room. This is not a phone call.
app.post("/webrtc/rooms", async (_request, reply) => {
  const roomId = randomUUID().replaceAll("-", "");
  rooms.set(roomId, new Set());
  roomTimers.set(roomId, setTimeout(() => {
    rooms.delete(roomId);
    roomTimers.delete(roomId);
  }, ROOM_TTL_MS));
  return reply.code(201).send({
    roomId,
    customerUrl: `${process.env.PUBLIC_WEB_ORIGIN ?? "http://localhost:3000"}/call/${roomId}`,
    expiresInSeconds: ROOM_TTL_MS / 1000
  });
});

app.get<{ Params: { roomId: string } }>("/webrtc/:roomId", { websocket: true }, (socket, request) => {
  const room = rooms.get(request.params.roomId);
  if (!room) {
    socket.close(1008, "Call link is invalid or expired");
    return;
  }
  if (room.size >= 2) {
    socket.close(1008, "Call room is full");
    return;
  }

  const role = room.size === 0 ? "agent" : "customer";
  const peer: Peer = { socket, role };
  room.add(peer);
  socket.send(JSON.stringify({ type: "joined", role, peers: room.size }));

  for (const existing of room) {
    if (existing !== peer && existing.socket.readyState === existing.socket.OPEN) {
      existing.socket.send(JSON.stringify({ type: "peer-joined", role }));
    }
  }

  socket.on("message", (raw) => {
    let message: { type?: string; payload?: unknown };
    try {
      message = JSON.parse(raw.toString());
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "Invalid signalling message" }));
      return;
    }
    if (!["offer", "answer", "ice-candidate", "hangup"].includes(message.type ?? "")) return;
    for (const other of room) {
      if (other !== peer && other.socket.readyState === other.socket.OPEN) {
        other.socket.send(JSON.stringify({ type: message.type, payload: message.payload }));
      }
    }
  });

  socket.on("close", () => {
    room.delete(peer);
    for (const other of room) {
      if (other.socket.readyState === other.socket.OPEN) {
        other.socket.send(JSON.stringify({ type: "peer-left" }));
      }
    }
    if (room.size === 0) {
      rooms.delete(request.params.roomId);
      const timer = roomTimers.get(request.params.roomId);
      if (timer) clearTimeout(timer);
      roomTimers.delete(request.params.roomId);
    }
  });
});

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";
try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
