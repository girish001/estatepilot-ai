import { NextResponse } from "next/server";
import { processCustomerTurn, detectLanguage } from "../../../lib/ai-receptionist";
import { INITIAL_PROPERTIES, type SupportedLanguage } from "../../../lib/store";
import { listPropertiesFromDb } from "../../../lib/repositories";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, language, history } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ success: false, message: "Message is required." }, { status: 400 });
    }

    const currentLang: SupportedLanguage = ["English", "Kannada", "Telugu", "Hindi"].includes(language)
      ? language
      : detectLanguage(message);

    const dbResult = await listPropertiesFromDb({ verifiedOnly: true }).catch(() => null);
    const dbVerifiedProperties = dbResult?.properties ?? [];
    const verifiedSource =
      dbVerifiedProperties.length > 0
        ? dbVerifiedProperties
        : INITIAL_PROPERTIES.filter((p) => p.isVerified);

    const result = processCustomerTurn(message, currentLang, history || [], verifiedSource);

    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Dialogue engine error." },
      { status: 500 }
    );
  }
}
