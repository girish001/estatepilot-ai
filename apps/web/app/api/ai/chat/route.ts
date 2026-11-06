import { NextResponse } from "next/server";
import { checkAiChatRateLimit, getClientIp } from "../../../lib/auth";
import { processCustomerTurn, detectLanguage } from "../../../lib/ai-receptionist";
import { INITIAL_PROPERTIES, type SupportedLanguage } from "../../../lib/store";
import { listPropertiesFromDb } from "../../../lib/repositories";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rate = await checkAiChatRateLimit(ip).catch(() => ({ allowed: true, retryAfterSeconds: 0 }));
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

    const body = await request.json();
    const { message, language, history } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ success: false, message: "Message is required." }, { status: 400 });
    }
    if (message.length > 1000) {
      return NextResponse.json(
        { success: false, message: "Message must not exceed 1000 characters." },
        { status: 400 }
      );
    }

    const safeHistory = Array.isArray(history) ? history.slice(-20) : [];

    const currentLang: SupportedLanguage = ["English", "Kannada", "Telugu", "Hindi"].includes(language)
      ? language
      : detectLanguage(message);

    const dbResult = await listPropertiesFromDb({ verifiedOnly: true }).catch(() => null);
    const dbVerifiedProperties = dbResult?.properties ?? [];
    const verifiedSource =
      dbVerifiedProperties.length > 0
        ? dbVerifiedProperties
        : INITIAL_PROPERTIES.filter((p) => p.isVerified);

    const result = processCustomerTurn(message.trim(), currentLang, safeHistory, verifiedSource);

    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Dialogue engine error." },
      { status: 500 }
    );
  }
}
