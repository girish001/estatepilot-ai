import { NextResponse } from "next/server";
import { getSessionFromRequest, requireRole } from "../../lib/auth";
import { redactPII } from "../../lib/db";
import {
  createPropertyInDb,
  listPropertiesFromDb,
  updatePropertyInDb
} from "../../lib/repositories";
import type { PropertyCategory } from "../../lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const city = searchParams.get("city");
    const q = searchParams.get("q");
    const page = Number(searchParams.get("page") || 1);
    const pageSize = Number(searchParams.get("pageSize") || 50);

    // Unauthenticated callers only receive verified properties unless an admin session is active
    const session = await getSessionFromRequest(request);
    const verifiedOnlyParam = searchParams.get("verifiedOnly");
    const verifiedOnly = session ? verifiedOnlyParam === "true" : true;

    const result = await listPropertiesFromDb({
      category,
      city,
      verifiedOnly,
      q,
      page,
      pageSize
    });

    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    console.error("[GET /api/properties Error]:", redactPII(msg));
    return NextResponse.json(
      { success: false, message: "Unable to query property inventory." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireRole(
    request,
    ["SUPER_ADMIN", "ADMIN", "MANAGER"],
    { requireCsrf: true }
  );
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const {
      id,
      name,
      category,
      location,
      landmark,
      city,
      minAreaSqFt,
      maxAreaSqFt,
      approvedRatePerSqFt,
      amenities,
      reraNumber,
      approvals,
      possessionDate,
      description,
      brochureFileName
    } = body;

    if (!name || !approvedRatePerSqFt || !category) {
      return NextResponse.json(
        {
          success: false,
          message: "Project name, property category, and approved rate per sq.ft. are required."
        },
        { status: 400 }
      );
    }

    const newProperty = await createPropertyInDb({
      id,
      name: String(name),
      category: category as PropertyCategory,
      location,
      landmark,
      city,
      minAreaSqFt: Number(minAreaSqFt),
      maxAreaSqFt: Number(maxAreaSqFt),
      approvedRatePerSqFt: Number(approvedRatePerSqFt),
      amenities,
      reraNumber,
      approvals,
      possessionDate,
      description,
      brochureFileName,
      actor: auth.session.user
    });

    return NextResponse.json({ success: true, property: newProperty }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { success: false, message: msg },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRole(request, ["SUPER_ADMIN", "ADMIN"], { requireCsrf: true });
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { id, isVerified, verifiedBy, approvedRatePerSqFt, availabilityStatus, description } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { success: false, message: "Property id is required." },
        { status: 400 }
      );
    }

    const updated = await updatePropertyInDb({
      id,
      isVerified,
      verifiedBy,
      approvedRatePerSqFt: approvedRatePerSqFt !== undefined ? Number(approvedRatePerSqFt) : undefined,
      availabilityStatus,
      description,
      actor: auth.session.user
    });

    return NextResponse.json({ success: true, property: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    if (msg.startsWith("NOT_FOUND:")) {
      return NextResponse.json(
        { success: false, message: msg.replace(/^NOT_FOUND:\s*/, "") },
        { status: 404 }
      );
    }
    if (msg.startsWith("FORBIDDEN:")) {
      return NextResponse.json(
        { success: false, message: msg.replace(/^FORBIDDEN:\s*/, "") },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { success: false, message: msg },
      { status: 400 }
    );
  }
}
