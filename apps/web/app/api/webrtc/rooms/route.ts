import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const roomId = randomUUID().replaceAll("-", "");
    const origin = request.headers.get("origin") || request.headers.get("host") || "";
    const protocol = origin.includes("localhost") ? "http" : "https";
    const fullOrigin = origin.startsWith("http") ? origin : `${protocol}://${origin}`;
    
    return NextResponse.json(
      {
        success: true,
        roomId,
        customerUrl: `${fullOrigin}/call/${roomId}`,
        expiresInSeconds: 1800,
        signaling: {
          supportedTransports: ["webrtc", "websocket"],
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" }
          ]
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Could not create call room." },
      { status: 500 }
    );
  }
}
