import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "estatepilot-web",
    framework: "Next.js 15 SSR",
    region: process.env.AWS_REGION || "ap-south-1",
    timestamp: new Date().toISOString()
  });
}
