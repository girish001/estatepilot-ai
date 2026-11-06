import { NextResponse } from "next/server";
import { buildClearSessionCookieHeader, revokeSessionByRequest } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await revokeSessionByRequest(request);
  } catch {
    // Always clear client cookie even if session was already expired
  }

  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully."
  });
  response.headers.set("Set-Cookie", buildClearSessionCookieHeader());
  return response;
}
