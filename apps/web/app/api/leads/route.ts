import { NextResponse } from "next/server";
import {
  buildRateLimitUnavailableResponse,
  checkPublicEnquiryRateLimit,
  getClientIp,
  requireRole
} from "../../lib/auth";
import { isDatabaseUnavailableError, redactPII } from "../../lib/db";
import {
  createLeadInDb,
  listLeadsFromDb,
  updateLeadInDb
} from "../../lib/repositories";
import type { LeadStatus } from "../../lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["SUPER_ADMIN", "ADMIN", "MANAGER", "EXECUTIVE"]);
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const language = searchParams.get("language");
    const q = searchParams.get("q");
    const page = Number(searchParams.get("page") || 1);
    const pageSize = Number(searchParams.get("pageSize") || 50);

    const result = await listLeadsFromDb({
      status,
      category,
      language,
      q,
      page,
      pageSize,
      actor: auth.session.user
    });

    return NextResponse.json(
      {
        success: true,
        ...result
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load leads.";
    console.error("[GET /api/leads Error]:", redactPII(msg));
    if (isDatabaseUnavailableError(error)) {
      return buildRateLimitUnavailableResponse();
    }
    return NextResponse.json(
      { success: false, message: "Unable to query leads from database." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: Request) {
  const ip = getClientIp(request);

  let rateLimit: { allowed: boolean; retryAfterSeconds: number };
  try {
    rateLimit = await checkPublicEnquiryRateLimit(ip);
  } catch (rateError) {
    const msg = rateError instanceof Error ? rateError.message : "Rate limiter failure";
    console.error("[POST /api/leads RateLimiter Error]:", redactPII(msg));
    return buildRateLimitUnavailableResponse();
  }

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        code: "RATE_LIMITED",
        message: `Too many enquiry submissions from this address. Please wait ${rateLimit.retryAfterSeconds} seconds.`
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "Cache-Control": "no-store"
        }
      }
    );
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 16_384) {
    return NextResponse.json(
      { success: false, message: "Request payload too large." },
      { status: 413, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const created = await createLeadInDb({
      fullName: String(body.fullName || ""),
      phone: String(body.phone || ""),
      email: body.email ? String(body.email) : undefined,
      propertyType: body.propertyType ? String(body.propertyType) : undefined,
      preferredLocation: body.preferredLocation ? String(body.preferredLocation) : undefined,
      preferredArea: body.preferredArea ? String(body.preferredArea) : undefined,
      preferredLanguage: body.preferredLanguage ? String(body.preferredLanguage) : undefined,
      callConsent: body.callConsent === true || body.consentGranted === true,
      source: body.source ? String(body.source) : "PUBLIC_WEBSITE",
      rawBody: body
    });

    return NextResponse.json(
      {
        success: true,
        message: "Your enquiry has been received successfully.",
        lead: created.lead,
        referenceNumber: created.referenceNumber,
        matchedProperties: created.matchedProperties,
        voiceCallRoom: {
          roomId: created.roomId,
          callUrl: `/call/${created.roomId}`
        }
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    if (msg.startsWith("VALIDATION:") || msg.startsWith("COMPLIANCE_VIOLATION:")) {
      return NextResponse.json(
        { success: false, message: msg.replace(/^(VALIDATION|COMPLIANCE_VIOLATION):\s*/, "") },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (msg.startsWith("DUPLICATE:")) {
      return NextResponse.json(
        { success: false, message: msg.replace(/^DUPLICATE:\s*/, "") },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    console.error("[POST /api/leads Error]:", redactPII(msg));
    if (isDatabaseUnavailableError(error)) {
      return buildRateLimitUnavailableResponse();
    }
    return NextResponse.json(
      { success: false, message: "Unable to process enquiry at this time." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRole(
    request,
    ["SUPER_ADMIN", "ADMIN", "MANAGER", "EXECUTIVE"],
    { requireCsrf: true }
  );
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { leadId, status, assignedExecutive, notes, nextActionAt } = body;

    if (!leadId || typeof leadId !== "string") {
      return NextResponse.json(
        { success: false, message: "leadId is required." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const updated = await updateLeadInDb({
      leadId,
      status: status as LeadStatus | undefined,
      assignedExecutive,
      notes,
      nextActionAt,
      actor: auth.session.user
    });

    return NextResponse.json(
      { success: true, lead: updated },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    if (msg.startsWith("NOT_FOUND:")) {
      return NextResponse.json(
        { success: false, message: msg.replace(/^NOT_FOUND:\s*/, "") },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (msg.startsWith("FORBIDDEN:")) {
      return NextResponse.json(
        { success: false, message: msg.replace(/^FORBIDDEN:\s*/, "") },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (msg.startsWith("VALIDATION:")) {
      return NextResponse.json(
        { success: false, message: msg.replace(/^VALIDATION:\s*/, "") },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    console.error("[PATCH /api/leads Error]:", redactPII(msg));
    if (isDatabaseUnavailableError(error)) {
      return buildRateLimitUnavailableResponse();
    }
    return NextResponse.json(
      { success: false, message: "Failed to update lead." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
