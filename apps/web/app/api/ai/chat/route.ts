import { NextResponse } from "next/server";
import { processCustomerTurn, detectLanguage } from "../../../lib/ai-receptionist";
import { SupportedLanguage } from "../../../lib/store";

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

    const result = processCustomerTurn(message, currentLang, history || []);

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
