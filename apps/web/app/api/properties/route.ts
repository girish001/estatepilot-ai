import { NextResponse } from "next/server";
import { INITIAL_PROPERTIES, PropertyCategory, PropertyRecord } from "../../lib/store";

export const dynamic = "force-dynamic";

let propertiesState: PropertyRecord[] = [...INITIAL_PROPERTIES];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const verifiedOnly = searchParams.get("verifiedOnly") === "true";

  let filtered = [...propertiesState];
  if (category && category !== "ALL") {
    filtered = filtered.filter((p) => p.category === category);
  }
  if (verifiedOnly) {
    filtered = filtered.filter((p) => p.isVerified);
  }

  return NextResponse.json({
    success: true,
    properties: filtered,
    total: propertiesState.length,
    verifiedCount: propertiesState.filter((p) => p.isVerified).length
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
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
        { success: false, message: "Project name, property category, and approved rate per sq.ft. are required." },
        { status: 400 }
      );
    }

    const newProperty: PropertyRecord = {
      id: `prop-${Date.now()}`,
      name: String(name).trim(),
      category: category as PropertyCategory,
      location: String(location || "Bangalore").trim(),
      landmark: String(landmark || "").trim(),
      city: String(city || "Bangalore").trim(),
      minAreaSqFt: Number(minAreaSqFt) || 1200,
      maxAreaSqFt: Number(maxAreaSqFt) || 2400,
      approvedRatePerSqFt: Number(approvedRatePerSqFt),
      currency: "INR",
      availabilityStatus: "AVAILABLE",
      isVerified: false, // Must be reviewed by operations before AI uses it
      verifiedBy: "Pending Operational Verification",
      verifiedAt: "",
      amenities: Array.isArray(amenities) ? amenities : ["Gated community", "Security", "Road access"],
      reraNumber: String(reraNumber || "Under Review"),
      approvals: Array.isArray(approvals) ? approvals : ["A-Khata pending"],
      possessionDate: possessionDate || "Within 12 months",
      description: String(description || "Brochure uploaded into knowledge base.").trim(),
      brochureFileName: brochureFileName || "Uploaded-Brochure.pdf",
      brochureUploadedAt: new Date().toISOString()
    };

    propertiesState.unshift(newProperty);

    return NextResponse.json({ success: true, property: newProperty }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, isVerified, verifiedBy, approvedRatePerSqFt } = body;

    const idx = propertiesState.findIndex((p) => p.id === id);
    if (idx === -1) {
      return NextResponse.json({ success: false, message: "Property not found." }, { status: 404 });
    }

    const current = propertiesState[idx];
    const updated: PropertyRecord = {
      ...current,
      isVerified: typeof isVerified === "boolean" ? isVerified : current.isVerified,
      verifiedBy: verifiedBy || (isVerified ? "Verified by Lead Auditor" : current.verifiedBy),
      verifiedAt: isVerified ? new Date().toISOString() : current.verifiedAt,
      approvedRatePerSqFt: approvedRatePerSqFt ? Number(approvedRatePerSqFt) : current.approvedRatePerSqFt
    };

    propertiesState[idx] = updated;

    return NextResponse.json({ success: true, property: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
