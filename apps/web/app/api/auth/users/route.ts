import { NextResponse } from "next/server";
import { createAdminUser, requireRole, type AdminRole } from "../../../lib/auth";
import { dbQuery } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["SUPER_ADMIN"]);
  if (!auth.authorized) return auth.response;

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

  return NextResponse.json({
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
  });
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

    return NextResponse.json({ success: true, user }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to create admin user."
      },
      { status: 400 }
    );
  }
}
