import { NextResponse } from "next/server";
import { INITIAL_LEADS, LeadRecord, LeadStatus, matchProperties, PropertyCategory, SupportedLanguage } from "../../lib/store";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

// In-memory runtime leads state
let leadsState: LeadRecord[] = [...INITIAL_LEADS];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const language = searchParams.get("language");
  const query = searchParams.get("q")?.toLowerCase();

  let filtered = [...leadsState];

  if (status && status !== "ALL") {
    filtered = filtered.filter((l) => l.status === status);
  }
  if (category && category !== "ALL") {
    filtered = filtered.filter((l) => l.propertyType === category);
  }
  if (language && language !== "ALL") {
    filtered = filtered.filter((l) => l.preferredLanguage.toLowerCase() === language.toLowerCase());
  }
  if (query) {
    filtered = filtered.filter(
      (l) =>
        l.fullName.toLowerCase().includes(query) ||
        l.phone.includes(query) ||
        l.preferredLocation.toLowerCase().includes(query) ||
        l.referenceNumber.toLowerCase().includes(query)
    );
  }

  // Calculate analytics metrics
  const total = leadsState.length;
  const newLeads = leadsState.filter((l) => l.status === "NEW").length;
  const contacted = leadsState.filter((l) => l.status === "CONTACTED").length;
  const interested = leadsState.filter((l) => l.status === "INTERESTED").length;
  const callbacksDue = leadsState.filter((l) => l.status === "CALLBACK_SCHEDULED").length;
  const siteVisitsScheduled = leadsState.filter((l) => l.status === "SITE_VISIT_SCHEDULED").length;
  const siteVisitsCompleted = leadsState.filter((l) => l.status === "SITE_VISITED").length;
  const converted = leadsState.filter((l) => l.status === "CONVERTED").length;
  const lost = leadsState.filter((l) => l.status === "LOST" || l.status === "DO_NOT_CONTACT").length;

  return NextResponse.json({
    success: true,
    leads: filtered,
    metrics: {
      total,
      newLeads,
      contacted,
      interested,
      callbacksDue,
      siteVisitsScheduled,
      siteVisitsCompleted,
      converted,
      lost
    }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      fullName,
      phone,
      email,
      propertyType,
      preferredLocation,
      preferredArea,
      preferredLanguage,
      callConsent,
      source
    } = body;

    // Strict validation
    if (!fullName || typeof fullName !== "string" || fullName.trim().length === 0) {
      return NextResponse.json({ success: false, message: "Full name is required." }, { status: 400 });
    }

    const cleanPhone = String(phone || "").replace(/\D/g, "");
    const last10Digits = cleanPhone.slice(-10);
    if (last10Digits.length !== 10) {
      return NextResponse.json(
        { success: false, message: "Please provide a valid 10-digit Indian mobile number." },
        { status: 400 }
      );
    }

    if (!callConsent) {
      return NextResponse.json(
        { success: false, message: "Consent to be contacted is required to submit an enquiry." },
        { status: 400 }
      );
    }

    const category: PropertyCategory = ["PLOT", "INDEPENDENT_HOUSE", "FLAT", "VILLA"].includes(propertyType)
      ? propertyType
      : "PLOT";

    const lang: SupportedLanguage = ["English", "Kannada", "Telugu", "Hindi"].includes(preferredLanguage)
      ? preferredLanguage
      : "English";

    // Strictly ensure no budget fields were accepted
    const matched = matchProperties(category, preferredLocation);
    const referenceNumber = `EP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const newLeadId = `lead-${Date.now()}`;
    const roomId = `room-${randomUUID().slice(0, 8)}`;

    const newLead: LeadRecord = {
      id: newLeadId,
      referenceNumber,
      fullName: fullName.trim(),
      phone: `+91${last10Digits}`,
      email: email ? String(email).trim() : undefined,
      source: source || "PUBLIC_WEBSITE",
      propertyType: category,
      preferredLocation: preferredLocation ? String(preferredLocation).trim() : "Bangalore",
      preferredArea: preferredArea ? String(preferredArea).trim() : "Standard",
      preferredLanguage: lang,
      status: "NEW",
      consent: {
        channel: "PHONE_CALL",
        granted: true,
        capturedAt: new Date().toISOString(),
        purpose: "Property consultation & site-visit scheduling",
        evidence: "Online enquiry submission checkbox verified: Customer agreed to phone contact."
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedExecutive: "Rajesh Sharma (Senior Property Specialist)",
      notes: "Newly received website enquiry. Budget was NOT requested per EstatePilot core rules.",
      matchedPropertyIds: matched.map((p) => p.id),
      callIds: [],
      siteVisitIds: []
    };

    leadsState.unshift(newLead);

    return NextResponse.json(
      {
        success: true,
        message: "Your enquiry has been received successfully.",
        lead: newLead,
        referenceNumber,
        matchedProperties: matched,
        voiceCallRoom: {
          roomId,
          callUrl: `/call/${roomId}`
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { leadId, status, assignedExecutive, notes, nextActionAt } = body;

    const leadIndex = leadsState.findIndex((l) => l.id === leadId);
    if (leadIndex === -1) {
      return NextResponse.json({ success: false, message: "Lead not found." }, { status: 404 });
    }

    const current = leadsState[leadIndex];
    const updated: LeadRecord = {
      ...current,
      status: (status as LeadStatus) || current.status,
      assignedExecutive: assignedExecutive || current.assignedExecutive,
      notes: notes !== undefined ? notes : current.notes,
      nextActionAt: nextActionAt !== undefined ? nextActionAt : current.nextActionAt,
      updatedAt: new Date().toISOString()
    };

    leadsState[leadIndex] = updated;

    return NextResponse.json({ success: true, lead: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
