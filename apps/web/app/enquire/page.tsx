"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Navbar from "../components/Navbar";
import { PropertyRecord, SupportedLanguage } from "../lib/store";

const TRANSLATIONS: Record<
  SupportedLanguage,
  {
    title: string;
    subtitle: string;
    fullName: string;
    fullNamePlaceholder: string;
    mobile: string;
    email: string;
    propertyType: string;
    location: string;
    locationPlaceholder: string;
    area: string;
    areaPlaceholder: string;
    language: string;
    consent: string;
    noBudgetNote: string;
    submitBtn: string;
    submitting: string;
    successTitle: string;
    successMessage: string;
    startVoiceBtn: string;
    aiDisclosure: string;
  }
> = {
  English: {
    title: "Find Verified Properties in Bangalore & Hyderabad.",
    subtitle: "Share what you are looking for. Our AI receptionist and property specialists will connect you with verified inventory and approved per-square-foot rates.",
    fullName: "Your Full Name",
    fullNamePlaceholder: "Enter your full name",
    mobile: "Mobile Number",
    email: "Email Address (Optional)",
    propertyType: "What are you interested in?",
    location: "Preferred Location",
    locationPlaceholder: "e.g. Devanahalli, Whitefield, Sarjapur, Gachibowli",
    area: "Preferred Configuration / Area",
    areaPlaceholder: "e.g. 1500 sq.ft. plot, 2 BHK, 3 BHK, 4 BHK Villa",
    language: "Preferred Communication Language",
    consent: "I agree to be contacted by phone regarding this property enquiry. I understand I can opt out at any time.",
    noBudgetNote: "Privacy Guarantee: We strictly never ask for your budget, salary or personal finances in this enquiry.",
    submitBtn: "Submit Property Enquiry",
    submitting: "Submitting Enquiry…",
    successTitle: "Enquiry Received Successfully!",
    successMessage: "Thank you. Your enquiry reference number has been generated. You can speak with our multilingual AI receptionist immediately or wait for our property executive to call you.",
    startVoiceBtn: "🎙 Start AI Voice Conversation Now",
    aiDisclosure: "Notice: You are about to speak with EstatePilot AI Receptionist. Microphone permission is required. This browser call uses secure WebRTC."
  },
  Kannada: {
    title: "ಬೆಂಗಳೂರು ಮತ್ತು ಹೈದರಾಬಾದ್‌ನಲ್ಲಿ ಪರಿಶೀಲಿಸಿದ ಆಸ್ತಿಗಳು.",
    subtitle: "ನಿಮ್ಮ ಆಸ್ತಿಯ ಅಗತ್ಯಗಳನ್ನು ಹಂಚಿಕೊಳ್ಳಿ. ನಮ್ಮ ಎಐ ರಿಸೆಪ್ಷನಿಸ್ಟ್ ಮತ್ತು ಆಸ್ತಿ ತಜ್ಞರು ಅನುಮೋದಿತ ದರಗಳೊಂದಿಗೆ ಪರಿಶೀಲಿಸಿದ ಆಸ್ತಿಗಳನ್ನು ನಿಮಗೆ ಒದಗಿಸುತ್ತಾರೆ.",
    fullName: "ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರು",
    fullNamePlaceholder: "ನಿಮ್ಮ ಹೆಸರನ್ನು ನಮೂದಿಸಿ",
    mobile: "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ",
    email: "ಇಮೇಲ್ ವಿಳಾಸ (ಐಚ್ಛಿಕ)",
    propertyType: "ನೀವು ಯಾವ ಆಸ್ತಿಯಲ್ಲಿ ಆಸಕ್ತಿ ಹೊಂದಿದ್ದೀರಿ?",
    location: "ಆದ್ಯತೆಯ ಪ್ರದೇಶ / ಸ್ಥಳ",
    locationPlaceholder: "ಉದಾ: ದೇವನಹಳ್ಳಿ, ವೈಟ್‌ಫೀಲ್ಡ್, ಸರ್ಜಾಪುರ",
    area: "ಆದ್ಯತೆಯ ವಿಸ್ತೀರ್ಣ / ಕಾನ್ಫಿಗರೇಶನ್",
    areaPlaceholder: "ಉದಾ: 1500 ಚ.ಅಡಿ ಪ್ಲಾಟ್, 2 ಅಥವಾ 3 ಬಿಎಚ್‌ಕೆ",
    language: "ಸಂವಹನದ ಭಾಷೆ",
    consent: "ಈ ಆಸ್ತಿ ವಿಚಾರಣೆಗಾಗಿ ದೂರವಾಣಿ ಕರೆ ಸ್ವೀಕರಿಸಲು ನಾನು ಸಮ್ಮತಿಸುತ್ತೇನೆ. ನಾನು ಯಾವಾಗ ಬೇಕಾದರೂ ಇದನ್ನು ರದ್ದುಗೊಳಿಸಬಹುದು.",
    noBudgetNote: "ಖಾಸಗಿತನ ಖಾತರಿ: ನಿಮ್ಮ ಬಜೆಟ್ ಅಥವಾ ಆದಾಯವನ್ನು ನಾವು ಎಂದಿಗೂ ಕೇಳುವುದಿಲ್ಲ.",
    submitBtn: "ಆಸ್ತಿ ವಿಚಾರಣೆ ಸಲ್ಲಿಸಿ",
    submitting: "ಸಲ್ಲಿಸಲಾಗುತ್ತಿದೆ…",
    successTitle: "ನಿಮ್ಮ ವಿಚಾರಣೆ ಸ್ವೀಕರಿಸಲಾಗಿದೆ!",
    successMessage: "ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ವಿಚಾರಣಾ ಸಂಖ್ಯೆ ರಚಿಸಲಾಗಿದೆ. ನೀವು ತಕ್ಷಣ ನಮ್ಮ ಎಐ ರಿಸೆಪ್ಷನಿಸ್ಟ್ ಜೊತೆ ಮಾತನಾಡಬಹುದು.",
    startVoiceBtn: "🎙 ಎಐ ಧ್ವನಿ ಸಂಭಾಷಣೆ ಪ್ರಾರಂಭಿಸಿ",
    aiDisclosure: "ಸೂಚನೆ: ನೀವು EstatePilot ಎಐ ರಿಸೆಪ್ಷನಿಸ್ಟ್ ಜೊತೆ ಮಾತನಾಡಲಿದ್ದೀರಿ. ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ಅಗತ್ಯವಿದೆ."
  },
  Telugu: {
    title: "బెంగళూరు మరియు హైదరాబాద్‌లలో వెరిఫైడ్ ప్రాపర్టీస్.",
    subtitle: "మీ అవసరాలను పంచుకోండి. మా AI రిసెప్షనిస్ట్ మరియు ప్రాపర్టీ నిపుణులు ఆమోదించబడిన బేస్ రేట్లతో వెరిఫైడ్ ప్రాజెక్ట్ వివరాలను అందిస్తారు.",
    fullName: "మీ పూర్తి పేరు",
    fullNamePlaceholder: "మీ పేరును నమోదు చేయండి",
    mobile: "మొబైల్ నంబర్",
    email: "ఇమెయిల్ అడ్రస్ (ఐచ్ఛికం)",
    propertyType: "మీకు ఎలాంటి ప్రాపర్టీ కావాలి?",
    location: "మీరు కోరుకునే ప్రాంతం",
    locationPlaceholder: "ఉదా: గచ్చిబౌలి, వైట్‌ఫీల్డ్, దేవనహల్లి, సర్జాపూర్",
    area: "కాన్ఫిగరేషన్ / విస్తీర్ణం",
    areaPlaceholder: "ఉదా: 1500 చ.అడుగుల ప్లాట్, 2 BHK, 3 BHK ఫ్లాట్",
    language: "మాట్లాడటానికి ఇష్టపడే భాష",
    consent: "ఈ ప్రాపర్టీ సమాచారం కోసం ఫోన్ ద్వారా సంప్రదించడానికి నేను అంగీకరిస్తున్నాను. ఎప్పుడైనా నేను దీన్ని నిలిపివేయవచ్చు.",
    noBudgetNote: "గోప్యతా నియమం: మీ బడ్జెట్ లేదా ఆదాయ వివరాలను మేము ఎప్పుడూ అడగము.",
    submitBtn: "విచారణ సమర్పించండి",
    submitting: "సమర్పిస్తున్నాము…",
    successTitle: "మీ విచారణ విజయవంతంగా అందింది!",
    successMessage: "ధన్యవాదాలు. మీ రిఫరెన్స్ నంబర్ రూపొందించబడింది. మీరు ఇప్పుడే మా మల్టీలింగ్వల్ AI రిసెప్షనిస్ట్‌తో మాట్లాడవచ్చు.",
    startVoiceBtn: "🎙 AI వాయిస్ కాల్ ప్రారంభించండి",
    aiDisclosure: "గమనిక: మీరు EstatePilot AI రిసెప్షనిస్ట్‌తో మాట్లాడబోతున్నారు. మైక్రోఫోన్ అనుమతి అవసరం."
  },
  Hindi: {
    title: "बैंगलोर और हैदराबाद में सत्यापित प्रॉपर्टीज।",
    subtitle: "अपनी आवश्यकता साझा करें। हमारे एआई रिसेप्शनिस्ट और प्रॉपर्टी विशेषज्ञ स्वीकृत प्रति वर्ग फुट दरों के साथ सत्यापित विकल्प प्रदान करेंगे।",
    fullName: "आपका पूरा नाम",
    fullNamePlaceholder: "अपना पूरा नाम दर्ज करें",
    mobile: "मोबाइल नंबर",
    email: "ईमेल पता (वैकल्पिक)",
    propertyType: "आप किस प्रकार की प्रॉपर्टी चाहते हैं?",
    location: "पसंदीदा लोकेशन",
    locationPlaceholder: "उदा: देवनहल्ली, व्हाइटफील्ड, सरजापुर, गाचीबोवली",
    area: "पसंदीदा आकार / कॉन्फ़िगरेशन",
    areaPlaceholder: "उदा: 1500 वर्ग फुट प्लॉट, 2 BHK, 3 BHK, 4 BHK विला",
    language: "बातचीत की पसंदीदा भाषा",
    consent: "मैं इस प्रॉपर्टी पूछताछ के संबंध में फोन पर संपर्क किए जाने की सहमति देता हूँ। मैं कभी भी इसे रोक सकता हूँ।",
    noBudgetNote: "गोपनीयता वादा: हम इस फॉर्म में कभी भी आपका बजट या आय नहीं पूछते हैं।",
    submitBtn: "प्रॉपर्टी पूछताछ सबमिट करें",
    submitting: "सबमिट हो रहा है…",
    successTitle: "पूछताछ सफलतापूर्वक दर्ज की गई!",
    successMessage: "धन्यवाद। आपका संदर्भ नंबर जारी कर दिया गया है। आप तुरंत हमारे बहुभाषी एआई रिसेप्शनिस्ट से बातचीत शुरू कर सकते हैं।",
    startVoiceBtn: "🎙 एआई वॉइस कॉल शुरू करें",
    aiDisclosure: "सूचना: आप EstatePilot AI रिसेप्शनिस्ट से बात करने जा रहे हैं। माइक्रोफोन अनुमति आवश्यक है।"
  }
};

export default function EnquiryPage() {
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>("English");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [propertyType, setPropertyType] = useState("PLOT");
  const [submittedData, setSubmittedData] = useState<{
    referenceNumber: string;
    roomId: string;
    callUrl: string;
    matchedProperties: PropertyRecord[];
  } | null>(null);

  const t = TRANSLATIONS[selectedLanguage];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!/^\d{10}$/.test(phone)) {
      setErrorMessage("Please enter a valid 10-digit Indian mobile number.");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      fullName: String(form.get("fullName") || "").trim(),
      phone: `+91${phone}`,
      email: String(form.get("email") || "").trim() || undefined,
      propertyType,
      preferredLocation: String(form.get("preferredLocation") || "").trim(),
      preferredArea: String(form.get("preferredArea") || "").trim(),
      preferredLanguage: selectedLanguage,
      callConsent: form.get("callConsent") === "on",
      source: "PUBLIC_WEBSITE"
    };

    if (!payload.callConsent) {
      setErrorMessage("Please agree to receive a call regarding this enquiry before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to submit enquiry.");
      }

      setSubmittedData({
        referenceNumber: data.referenceNumber,
        roomId: data.voiceCallRoom.roomId,
        callUrl: data.voiceCallRoom.callUrl,
        matchedProperties: data.matchedProperties || []
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to submit enquiry right now.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar currentPath="/enquire" />

      <main className="enquiry-shell" style={{ flex: 1, padding: "40px 16px" }}>
        <div className="enquiry-card">
          {/* Language Switcher Bar at top of enquiry form */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#2563eb", letterSpacing: 1.2 }}>
              ESTATEPILOT AI · RECEPTIONIST
            </span>

            <div style={{ display: "flex", gap: 6, background: "#f1f5f9", padding: 4, borderRadius: 8 }}>
              {(["English", "Kannada", "Telugu", "Hindi"] as SupportedLanguage[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setSelectedLanguage(lang)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "none",
                    background: selectedLanguage === lang ? "#2563eb" : "transparent",
                    color: selectedLanguage === lang ? "#fff" : "#475569",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  {lang === "Kannada" ? "ಕನ್ನಡ" : lang === "Telugu" ? "తెలుగు" : lang === "Hindi" ? "हिन्दी" : "English"}
                </button>
              ))}
            </div>
          </div>

          {!submittedData ? (
            <>
              <p className="enquiry-eyebrow" style={{ marginTop: 0 }}>PROPERTY ENQUIRY DESK</p>
              <h1 style={{ fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 800, color: "#0f172a", letterSpacing: -0.8 }}>
                {t.title}
              </h1>
              <p className="enquiry-intro">
                {t.subtitle}
              </p>

              <form onSubmit={handleSubmit} className="enquiry-form">
                <label>
                  {t.fullName} <span style={{ color: "#e11d48" }}>*</span>
                  <input name="fullName" autoComplete="name" placeholder={t.fullNamePlaceholder} required maxLength={100} />
                </label>

                <label>
                  {t.mobile} <span style={{ color: "#e11d48" }}>*</span>
                  <div className="phone-field">
                    <span className="country-code">🇮🇳 +91</span>
                    <input
                      aria-label="10-digit Indian mobile number"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      placeholder="10-digit mobile number"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
                      required
                    />
                  </div>
                </label>

                <label>
                  {t.email}
                  <input name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={160} />
                </label>

                <label>
                  {t.propertyType} <span style={{ color: "#e11d48" }}>*</span>
                  <select value={propertyType} onChange={(event) => setPropertyType(event.target.value)} required>
                    <option value="PLOT">Residential Plot (Devanahalli, Sarjapur)</option>
                    <option value="FLAT">Apartment / Flat (Whitefield, Gachibowli)</option>
                    <option value="INDEPENDENT_HOUSE">Independent House (Yelahanka)</option>
                    <option value="VILLA">Luxury Villa (Sarjapur Road)</option>
                  </select>
                </label>

                <label>
                  {t.location}
                  <input name="preferredLocation" placeholder={t.locationPlaceholder} maxLength={160} />
                </label>

                <label>
                  {t.area}
                  <input name="preferredArea" placeholder={t.areaPlaceholder} maxLength={120} />
                </label>

                <label className="consent-row" style={{ marginTop: 6 }}>
                  <input name="callConsent" type="checkbox" required />
                  <span style={{ fontSize: 13 }}>{t.consent}</span>
                </label>

                <p className="privacy-note" style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  🔒 <strong>{t.noBudgetNote}</strong>
                </p>

                <button type="submit" disabled={submitting}>
                  {submitting ? t.submitting : t.submitBtn}
                </button>

                {errorMessage && (
                  <p role="alert" style={{ color: "#b91c1c", background: "#fef2f2", padding: 12, borderRadius: 8, fontSize: 13 }}>
                    {errorMessage}
                  </p>
                )}
              </form>
            </>
          ) : (
            /* Successful submission card with immediate AI Voice option */
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#ecfdf5", color: "#047857", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                ✓
              </div>

              <h2 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
                {t.successTitle}
              </h2>

              <div style={{ display: "inline-block", background: "#eff6ff", border: "1px solid #bfdbfe", padding: "8px 18px", borderRadius: 10, margin: "12px 0 16px" }}>
                <span style={{ fontSize: 12, color: "#1e40af", fontWeight: 700 }}>Enquiry Reference: </span>
                <span style={{ fontSize: 18, color: "#1d4ed8", fontWeight: 800 }}>{submittedData.referenceNumber}</span>
              </div>

              <p style={{ color: "#475569", lineHeight: 1.6, maxWidth: 540, margin: "0 auto 24px", fontSize: 14 }}>
                {t.successMessage}
              </p>

              {/* Matched Verified Properties */}
              {submittedData.matchedProperties.length > 0 && (
                <div style={{ textAlign: "left", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18, marginBottom: 24 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>
                    🏢 Matching Verified Inventory:
                  </h3>
                  {submittedData.matchedProperties.slice(0, 2).map((prop) => (
                    <div key={prop.id} style={{ background: "#fff", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, color: "#0f172a", fontSize: 14 }}>{prop.name}</span>
                        <span style={{ background: "#ecfdf5", color: "#047857", fontWeight: 700, fontSize: 12, padding: "2px 8px", borderRadius: 6 }}>
                          Approved: ₹{prop.approvedRatePerSqFt.toLocaleString("en-IN")}/sq.ft.
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                        📍 {prop.location} · {prop.reraNumber}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 420, margin: "0 auto" }}>
                <a
                  href={submittedData.callUrl}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    background: "#2563eb",
                    color: "#fff",
                    fontWeight: 700,
                    padding: "14px 20px",
                    borderRadius: 12,
                    fontSize: 15,
                    boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)"
                  }}
                >
                  {t.startVoiceBtn}
                </a>

                <p style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
                  {t.aiDisclosure}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setSubmittedData(null);
                    setPhone("");
                  }}
                  style={{
                    background: "transparent",
                    border: "1px solid #cbd5e1",
                    color: "#475569",
                    padding: "10px 16px",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    marginTop: 8
                  }}
                >
                  Submit Another Enquiry
                </button>
              </div>
            </div>
          )}

          <footer>EstatePilot AI · Confidential & RERA Compliant · No Budget Profiling</footer>
        </div>
      </main>
    </div>
  );
}
