import { NextResponse } from "next/server";
import { dbQuery, verifySchemaReady, redactPII } from "../../lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const migrationInfo = await verifySchemaReady();
    const countsRes = await dbQuery<{
      properties_count: number;
      verified_properties_count: number;
      leads_count: number;
      admin_users_count: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM estatepilot.properties) AS properties_count,
         (SELECT COUNT(*)::int FROM estatepilot.properties WHERE is_verified = TRUE) AS verified_properties_count,
         (SELECT COUNT(*)::int FROM estatepilot.leads) AS leads_count,
         (SELECT COUNT(*)::int FROM estatepilot.admin_users) AS admin_users_count`
    );

    const row = countsRes.rows[0];
    return NextResponse.json(
      {
        status: "ok",
        service: "estatepilot-web",
        framework: "Next.js 15 SSR",
        region: process.env.AWS_REGION || "ap-south-1",
        database: {
          connected: true,
          mode: migrationInfo.mode,
          schema: "estatepilot",
          migrationVersion: migrationInfo.migrationVersion,
          latencyMs: Date.now() - startedAt,
          counts: {
            properties: Number(row?.properties_count ?? 0),
            verifiedProperties: Number(row?.verified_properties_count ?? 0),
            leads: Number(row?.leads_count ?? 0),
            adminUsers: Number(row?.admin_users_count ?? 0)
          }
        },
        timestamp: new Date().toISOString()
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Database health check failed";
    return NextResponse.json(
      {
        status: "degraded",
        service: "estatepilot-web",
        region: process.env.AWS_REGION || "ap-south-1",
        database: {
          connected: false,
          error: redactPII(msg)
        },
        timestamp: new Date().toISOString()
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
