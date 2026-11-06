import { NextResponse } from "next/server";
import {
  authenticateAdmin,
  buildRateLimitUnavailableResponse,
  buildSessionCookieHeader,
  checkLoginRateLimit,
  getClientIp
} from "../../../lib/auth";
import { isDatabaseUnavailableError, redactPII } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = getClientIp(request);

  // Fail closed when the PostgreSQL rate limiter is unavailable (return 503 with generic error)
  let rateCheck: { allowed: boolean; retryAfterSeconds: number };
  try {
    rateCheck = await checkLoginRateLimit(ip);
  } catch (rateError) {
    const msg = rateError instanceof Error ? rateError.message : "Rate limiter failure";
    console.error("[POST /api/auth/login RateLimiter Error]:", redactPII(msg));
    return buildRateLimitUnavailableResponse();
  }

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        success: false,
        code: "RATE_LIMITED",
        message: `Too many login attempts. Please wait ${rateCheck.retryAfterSeconds} seconds before trying again.`
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateCheck.retryAfterSeconds),
          "Cache-Control": "no-store"
        }
      }
    );
  }

  try {
    const body = await request.json();
    const email = String(body?.email || "").trim();
    const password = String(body?.password || "");

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "Email and password are required." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const userAgent = request.headers.get("user-agent") || "unknown";
    const { session, rawSessionToken } = await authenticateAdmin({
      email,
      password,
      ipAddress: ip,
      userAgent
    });

    const response = NextResponse.json(
      {
        success: true,
        user: session.user,
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt
      },
      { headers: { "Cache-Control": "no-store" } }
    );
    response.headers.set("Set-Cookie", buildSessionCookieHeader(rawSessionToken));
    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Authentication failed.";
    if (isDatabaseUnavailableError(error)) {
      console.error("[EstatePilot Auth Login DB Unavailable]:", redactPII(msg));
      return buildRateLimitUnavailableResponse();
    }

    const isKnownAuthFailure =
      msg === "Invalid email or password." ||
      msg.startsWith("This account has been deactivated") ||
      msg.startsWith("Account is temporarily locked");

    console.warn("[EstatePilot Auth Login Rejected]:", redactPII(msg));
    return NextResponse.json(
      {
        success: false,
        message: isKnownAuthFailure ? msg : "Authentication failed."
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
}
