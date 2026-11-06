import { NextResponse } from "next/server";
import {
  authenticateAdmin,
  buildSessionCookieHeader,
  createAdminUser,
  getAdminUserCount,
  getClientIp
} from "../../../lib/auth";
import { seedReviewedBaselineData } from "../../../lib/repositories";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const existingCount = await getAdminUserCount();
    if (existingCount > 0) {
      return NextResponse.json(
        {
          success: false,
          code: "ALREADY_PROVISIONED",
          message: "Initial Super Admin has already been provisioned. Please sign in or ask a Super Admin to create your account."
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const requiredBootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
    if (requiredBootstrapToken && body?.bootstrapToken !== requiredBootstrapToken) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_BOOTSTRAP_TOKEN",
          message: "Valid ADMIN_BOOTSTRAP_TOKEN is required to provision the first Super Admin."
        },
        { status: 403 }
      );
    }

    const email = String(body?.email || "").trim();
    const fullName = String(body?.fullName || "").trim();
    const password = String(body?.password || "");
    const seedBaseline = Boolean(body?.seedBaseline);

    const user = await createAdminUser({
      email,
      fullName,
      password,
      role: "SUPER_ADMIN",
      actorId: "initial_bootstrap",
      actorRole: "SUPER_ADMIN"
    });

    let seedSummary = null;
    if (seedBaseline) {
      seedSummary = await seedReviewedBaselineData(user.id);
    }

    const ip = getClientIp(request);
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
        message: "Initial SUPER_ADMIN provisioned successfully.",
        user: session.user,
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
        seedSummary
      },
      { status: 201 }
    );
    response.headers.set("Set-Cookie", buildSessionCookieHeader(rawSessionToken));
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to provision initial admin."
      },
      { status: 400 }
    );
  }
}
