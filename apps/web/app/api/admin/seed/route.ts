import { NextResponse } from "next/server";
import { requireRole } from "../../../lib/auth";
import { seedReviewedBaselineData } from "../../../lib/repositories";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireRole(request, ["SUPER_ADMIN"], { requireCsrf: true });
  if (!auth.authorized) return auth.response;

  try {
    const result = await seedReviewedBaselineData(auth.session.user.id);
    return NextResponse.json({
      success: true,
      message: "Reviewed baseline inventory and sample records seeded into PostgreSQL.",
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to seed baseline data."
      },
      { status: 500 }
    );
  }
}
