import { NextResponse } from "next/server";
import { buildRateLimitUnavailableResponse, requireRole } from "../../../lib/auth";
import { isDatabaseUnavailableError, redactPII } from "../../../lib/db";
import { seedReviewedBaselineData } from "../../../lib/repositories";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireRole(request, ["SUPER_ADMIN"], { requireCsrf: true });
  if (!auth.authorized) return auth.response;

  try {
    const result = await seedReviewedBaselineData(auth.session.user.id);
    return NextResponse.json(
      {
        success: true,
        message: "Reviewed baseline inventory and sample records seeded into PostgreSQL.",
        ...result
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to seed baseline data.";
    console.error("[POST /api/admin/seed Error]:", redactPII(msg));
    if (isDatabaseUnavailableError(error)) {
      return buildRateLimitUnavailableResponse();
    }
    return NextResponse.json(
      {
        success: false,
        message: "Failed to seed baseline data."
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
