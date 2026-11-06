import { NextResponse } from "next/server";
import {
  buildRateLimitUnavailableResponse,
  getAdminUserCount,
  getSessionFromRequest
} from "../../../lib/auth";
import { isDatabaseUnavailableError, redactPII } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      const userCount = await getAdminUserCount();
      return NextResponse.json(
        {
          success: true,
          authenticated: false,
          requiresInitialSetup: userCount === 0
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        authenticated: true,
        requiresInitialSetup: false,
        user: session.user,
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to verify session.";
    console.error("[GET /api/auth/me Error]:", redactPII(msg));
    if (isDatabaseUnavailableError(error)) {
      return buildRateLimitUnavailableResponse();
    }
    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        message: "Failed to verify session."
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
