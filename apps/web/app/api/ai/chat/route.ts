import { NextResponse } from "next/server";
import {
  buildRateLimitUnavailableResponse,
  checkAiChatRateLimit,
  getClientIp
} from "../../../lib/auth";
import { processCustomerTurn, detectLanguage } from "../../../lib/ai-receptionist";
import { type SupportedLanguage } from "../../../lib/store";
import { isDatabaseUnavailableError, redactPII } from "../../../lib/db";
import { listPropertiesFromDb } from "../../../lib/repositories";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = getClientIp(request);

  // Fail closed when the PostgreSQL rate limiter is unavailable (return 503 with generic error)
  let rate: { allowed: boolean; retryAfterSeconds: number };
  try {
    rate = await checkAiChatRateLimit(ip);
  } catch (rateError) {
    const msg = rateError instanceof Error ? rateError.message : "Rate limiter failure";
    console.error("[POST /api/ai/chat RateLimiter Error]:", redactPII(msg));
    return buildRateLimitUnavailableResponse();
  }

  if (!rate.allowed) {
    return NextResponse.json(
      {
        success: false,
        code: "RATE_LIMITED",
        message: `Too many chat requests. Please wait ${rate.retryAfterSeconds} seconds.`
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
    const body = await request.json();
    const { message, language, history } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { success: false, message: "Message is required." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (message.length > 1000) {
      return NextResponse.json(
        { success: false, message: "Message must not exceed 1000 characters." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const safeHistory = Array.isArray(history) ? history.slice(-20) : [];

    const currentLang: SupportedLanguage = ["English", "Kannada", "Telugu", "Hindi"].includes(language)
      ? language
      : detectLanguage(message);

    const dbResult = await listPropertiesFromDb({ verifiedOnly: true });
    const verifiedSource = dbResult.properties.filter((p) => p.isVerified === true);

    const result = processCustomerTurn(message.trim(), currentLang, safeHistory, verifiedSource);

    return NextResponse.json(
      {
        success: true,
        ...result
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Dialogue engine error.";
    console.error("[POST /api/ai/chat Error]:", redactPII(msg));
    if (isDatabaseUnavailableError(error)) {
      return buildRateLimitUnavailableResponse();
    }
    return NextResponse.json(
      {
        success: false,
        code: "INTERNAL_ERROR",
        message: "Unable to process chat request at this time."
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
