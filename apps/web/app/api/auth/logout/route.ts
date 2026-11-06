import { NextResponse } from "next/server";
import { buildClearSessionCookieHeader, revokeSessionByRequest } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const result = await revokeSessionByRequest(request, { requireCsrf: true });
    if (result.csrfError) {
      return NextResponse.json(
        {
          success: false,
          code: "CSRF_INVALID",
          message: "Invalid or missing CSRF security token (x-csrf-token) for logout."
        },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch {
    // Clear client cookie if session is already expired
  }

  const response = NextResponse.json(
    {
      success: true,
      message: "Logged out successfully."
    },
    { headers: { "Cache-Control": "no-store" } }
  );
  response.headers.set("Set-Cookie", buildClearSessionCookieHeader());
  return response;
}
