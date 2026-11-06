import { NextResponse } from "next/server";
import { getAdminUserCount, getSessionFromRequest } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      const userCount = await getAdminUserCount();
      return NextResponse.json({
        success: true,
        authenticated: false,
        requiresInitialSetup: userCount === 0
      });
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      requiresInitialSetup: false,
      user: session.user,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        message: error instanceof Error ? error.message : "Failed to verify session."
      },
      { status: 500 }
    );
  }
}
