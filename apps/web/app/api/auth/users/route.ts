import { NextResponse } from "next/server";
import {
  buildRateLimitUnavailableResponse,
  createAdminUser,
  requireRole,
  type AdminRole
} from "../../../lib/auth";
import { dbQuery, isDatabaseUnavailableError, redactPII } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["SUPER_ADMIN"]);
  if (!auth.authorized) return auth.response;

  try {
    const res = await dbQuery<{
      id: string;
      email: string;
      full_name: string;
      role: AdminRole;
      executive_display_name: string | null;
      is_active: boolean;
      last_login_at: string | null;
      created_at: string;
    }>(
      `SELECT id, email, full_name, role, executive_display_name, is_active, last_login_at, created_at
       FROM estatepilot.admin_users
       ORDER BY created_at ASC`
    );

    return NextResponse.json(
      {
        success: true,
        users: res.rows.map((r) => ({
          id: r.id,
          email: r.email,
          fullName: r.full_name,
          role: r.role,
          executiveDisplayName: r.executive_display_name,
          isActive: r.is_active,
          lastLoginAt: r.last_login_at,
          createdAt: r.created_at
        }))
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to list admin users.";
    console.error("[GET /api/auth/users Error]:", redactPII(msg));
    if (isDatabaseUnavailableError(error)) {
      return buildRateLimitUnavailableResponse();
    }
    return NextResponse.json(
      { success: false, message: "Failed to list admin users." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireRole(request, ["SUPER_ADMIN"], { requireCsrf: true });
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const execScope = body?.executiveDisplayName || body?.assignedExecutiveName || null;
    const user = await createAdminUser({
      email: String(body?.email || ""),
      fullName: String(body?.fullName || ""),
      password: String(body?.password || ""),
      role: body?.role as AdminRole,
      executiveDisplayName: execScope ? String(execScope) : null,
      actorId: auth.session.user.id,
      actorRole: auth.session.user.role
    });

    return NextResponse.json(
      { success: true, user },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create admin user.";
    if (isDatabaseUnavailableError(error)) {
      console.error("[POST /api/auth/users DB Error]:", redactPII(msg));
      return buildRateLimitUnavailableResponse();
    }
    const isValidation =
      msg.includes("email") ||
      msg.includes("name") ||
      msg.includes("Password") ||
      msg.includes("role") ||
      msg.includes("EXECUTIVE");
    return NextResponse.json(
      {
        success: false,
        message: isValidation ? msg : "Failed to create admin user."
      },
      { status: isValidation ? 400 : 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
