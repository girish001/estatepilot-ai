import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  buildRateLimitUnavailableResponse,
  checkWebrtcRoomRateLimit,
  getClientIp
} from "../../../lib/auth";
import { redactPII } from "../../../lib/db";

export const dynamic = "force-dynamic";

function resolveSafeOrigin(request: Request): string {
  const configuredOrigin =
    process.env.PUBLIC_WEB_ORIGIN?.trim() || process.env.WEB_ORIGIN?.trim() || "";
  if (configuredOrigin && /^https?:\/\/[a-zA-Z0-9.-]+(:\d+)?$/.test(configuredOrigin)) {
    return configuredOrigin;
  }

  const hostHeader = (request.headers.get("host") || "localhost:3000").trim();
  const safeHost = /^[a-zA-Z0-9.-]+(:\d+)?$/.test(hostHeader) ? hostHeader : "localhost:3000";
  const protocol =
    safeHost.startsWith("localhost") || safeHost.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${safeHost}`;
}

export async function POST(request: Request) {
  const ip = getClientIp(request);

  // Fail closed when the PostgreSQL rate limiter is unavailable (return 503 with generic error)
  let rate: { allowed: boolean; retryAfterSeconds: number };
  try {
    rate = await checkWebrtcRoomRateLimit(ip);
  } catch (rateError) {
    const msg = rateError instanceof Error ? rateError.message : "Rate limiter failure";
    console.error("[POST /api/webrtc/rooms RateLimiter Error]:", redactPII(msg));
    return buildRateLimitUnavailableResponse();
  }

  if (!rate.allowed) {
    return NextResponse.json(
      {
        success: false,
        code: "RATE_LIMITED",
        message: `Too many room creation requests. Please wait ${rate.retryAfterSeconds} seconds.`
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rate.retryAfterSeconds),
          "Cache-Control": "no-store"
        }
      }
    );
  }

  try {
    const roomId = randomUUID().replaceAll("-", "");
    const fullOrigin = resolveSafeOrigin(request);

    return NextResponse.json(
      {
        success: true,
        roomId,
        customerUrl: `${fullOrigin}/call/${roomId}`,
        expiresInSeconds: 1800,
        signaling: {
          supportedTransports: ["webrtc", "websocket"],
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" }
          ]
        }
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Room creation error";
    console.error("[POST /api/webrtc/rooms Error]:", redactPII(msg));
    return NextResponse.json(
      {
        success: false,
        code: "INTERNAL_ERROR",
        message: "Could not create call room."
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
