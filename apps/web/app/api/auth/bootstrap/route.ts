import { NextResponse } from "next/server";
import {
  authenticateAdmin,
  bootstrapFirstSuperAdmin,
  buildRateLimitUnavailableResponse,
  buildSessionCookieHeader,
  getClientIp
} from "../../../lib/auth";
import { isDatabaseUnavailableError, redactPII } from "../../../lib/db";
import { seedReviewedBaselineData } from "../../../lib/repositories";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || "unknown";

    const email = String(body?.email || "").trim();
    const fullName = String(body?.fullName || "").trim();
    const password = String(body?.password || "");
    const bootstrapToken = body?.bootstrapToken ?? request.headers.get("x-bootstrap-token");
    const seedBaseline = Boolean(body?.seedBaseline);

    // Concurrency-safe, fail-closed first SUPER_ADMIN provisioning
    const user = await bootstrapFirstSuperAdmin({
      email,
      fullName,
      password,
      bootstrapToken,
      ipAddress: ip
    });

    let seedSummary = null;
    if (seedBaseline) {
      seedSummary = await seedReviewedBaselineData(user.id);
    }

    const { session, rawSessionToken } = await authenticateAdmin({
      email,
      password,
      ipAddress: ip,
      userAgent
    });

    const response = NextResponse.json(
      {
        success: true,
        message: "Initial SUPER_ADMIN provisioned successfully.",
        user: session.user,
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
        seedSummary
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
    response.headers.set("Set-Cookie", buildSessionCookieHeader(rawSessionToken));
    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to provision initial admin.";

    if (msg.startsWith("BOOTSTRAP_DISABLED:")) {
      return NextResponse.json(
        {
          success: false,
          code: "BOOTSTRAP_DISABLED",
          message: msg.replace(/^BOOTSTRAP_DISABLED:\s*/, "")
        },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (msg.startsWith("INVALID_BOOTSTRAP_TOKEN:")) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_BOOTSTRAP_TOKEN",
          message: msg.replace(/^INVALID_BOOTSTRAP_TOKEN:\s*/, "")
        },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (msg.startsWith("ALREADY_PROVISIONED:")) {
      return NextResponse.json(
        {
          success: false,
          code: "ALREADY_PROVISIONED",
          message: msg.replace(/^ALREADY_PROVISIONED:\s*/, "")
        },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (isDatabaseUnavailableError(error)) {
      console.error("[POST /api/auth/bootstrap DB Error]:", redactPII(msg));
      return buildRateLimitUnavailableResponse();
    }

    return NextResponse.json(
      {
        success: false,
        message:
          msg.includes("email") || msg.includes("name") || msg.includes("Password")
            ? msg
            : "Unable to complete initial bootstrap."
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}
