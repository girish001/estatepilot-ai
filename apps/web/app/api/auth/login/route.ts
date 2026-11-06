import { NextResponse } from "next/server";
import {
  authenticateAdmin,
  buildSessionCookieHeader,
  checkLoginRateLimit,
  getClientIp
} from "../../../lib/auth";
import { redactPII } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = getClientIp(request);

  try {
    const rateCheck = await checkLoginRateLimit(ip);
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
    console.warn("[EstatePilot Auth Login Rejected]:", redactPII(msg));
    return NextResponse.json(
      { success: false, message: msg },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
}
