import { INITIAL_PROPERTIES, SupportedLanguage, PropertyRecord } from "./store";

export interface AIResponse {
  reply: string;
  detectedLanguage: SupportedLanguage;
  matchedProperties: PropertyRecord[];
  escalateToHuman: boolean;
  optOutRequested: boolean;
  siteVisitRequested: boolean;
  siteVisitTime?: string;
  leadUpdate?: {
    preferredLocation?: string;
    preferredArea?: string;
    propertyType?: "PLOT" | "INDEPENDENT_HOUSE" | "FLAT" | "VILLA";
  };
}

export function detectExplicitLanguage(text: string): SupportedLanguage | null {
  const lower = text.toLowerCase();

  // Telugu Unicode range: \u0C00-\u0C7F or transliterated Telugu tokens
  if (/[\u0C00-\u0C7F]/.test(text) || /\b(namaskaram|andi|meeru|pladlu|illu|chudataniki|eppudu|entha|cheppandi|chudali|taggisi|phone cheyoddu)\b/i.test(lower)) {
    return "Telugu";
  }

  // Kannada Unicode range: \u0C80-\u0CFF or transliterated Kannada tokens
  if (/[\u0C80-\u0CFF]/.test(text) || /\b(namaskara|hegiddira|mane|plotu|bele|jaaga|nodi|yaavaga|nodona|kadime|maadi|madbedi)\b/i.test(lower)) {
    return "Kannada";
  }

  // Devanagari / Hindi Unicode range: \u0900-\u097F or transliterated Hindi tokens
  if (/[\u0900-\u097F]/.test(text) || /\b(namaste|kaise|ghar|keemat|bhav|dekhein|shaniwar|ravivar|kya|hai|karo|mat karna)\b/i.test(lower)) {
    return "Hindi";
  }

  // Explicit English conversational phrasing
  if (/\b(hello|hi|what|where|when|how|which|can|could|would|please|stop|remove|delete|schedule|interested|discount|negotiate|price|rate|details|visit|sunday|saturday|tomorrow|english)\b/i.test(lower)) {
    return "English";
  }

  return null;
}

export function detectLanguage(text: string): SupportedLanguage {
  return detectExplicitLanguage(text) ?? "English";
}

export function processCustomerTurn(
  customerMessage: string,
  currentLanguage: SupportedLanguage,
  conversationHistory: Array<{ role: string; text: string }> = []
): AIResponse {
  const explicitLang = detectExplicitLanguage(customerMessage);
  const lang: SupportedLanguage = explicitLang ?? currentLanguage;
  const lower = customerMessage.toLowerCase();

  // 1. Opt-out check (Rule 8 & 12)
  if (
    lower.includes("stop") ||
    lower.includes("don't call") ||
    lower.includes("dont call") ||
    lower.includes("remove my number") ||
    lower.includes("do not contact") ||
    lower.includes("call madbedi") ||
    lower.includes("phone cheyoddu") ||
    lower.includes("mat karna")
  ) {
    const replies: Record<SupportedLanguage, string> = {
      English: "I completely understand. We have marked your number as Do-Not-Contact and you will not receive any further calls or follow-ups from EstatePilot AI. Thank you for your time.",
      Kannada: "ಖಂಡಿತವಾಗಿಯೂ. ನಿಮ್ಮ ಕೋರಿಕೆಯಂತೆ ನಿಮ್ಮ ಸಂಖ್ಯೆಯನ್ನು ಸಂಪರ್ಕಿಸಬೇಡಿ (Do-Not-Contact) ಪಟ್ಟಿಗೆ ಸೇರಿಸಲಾಗಿದೆ. ಇನ್ನು ಮುಂದೆ ನಿಮಗೆ ಯಾವುದೇ ಕರೆಗಳು ಬರುವುದಿಲ್ಲ. ಧನ್ಯವಾದಗಳು.",
      Telugu: "తప్పకుండా అండి. మీ అభ్యర్థన మేరకు మీ నంబర్‌ను డు-నాట్-కాంటాక్ట్ జాబితాలో చేర్చాము. ఇకపై మీకు ఎటువంటి కాల్స్ రావు. మీ సమయానికి ధన్యవాదాలు.",
      Hindi: "मैं समझता हूँ। आपके अनुरोध पर आपका नंबर डू-नॉट-कांटेक्ट सूची में जोड़ दिया गया है। आगे से आपको कोई कॉल नहीं आएगी। आपके समय के लिए धन्यवाद।"
    };
    return {
      reply: replies[lang],
      detectedLanguage: lang,
      matchedProperties: [],
      escalateToHuman: false,
      optOutRequested: true,
      siteVisitRequested: false
    };
  }

  // 2. Human escalation check (Rule 5 & 7)
  if (
    lower.includes("human") ||
    lower.includes("executive") ||
    lower.includes("manager") ||
    lower.includes("agent") ||
    lower.includes("complaint") ||
    lower.includes("legal dispute") ||
    lower.includes("discount") ||
    lower.includes("negotiat") ||
    lower.includes("bargain") ||
    lower.includes("kam karo") ||
    lower.includes("taggisi") ||
    lower.includes("kadime maadi")
  ) {
    const replies: Record<SupportedLanguage, string> = {
      English: "As an AI receptionist, I am only authorized to share verified base rates and project facts. For price negotiations, commercial terms, or legal questions, I am connecting you with our Senior Property Executive right away.",
      Kannada: "ಎಐ ರಿಸೆಪ್ಷನಿಸ್ಟ್ ಆಗಿ ನಾನು ಕೇವಲ ಅನುಮೋದಿತ ದರಗಳು ಮತ್ತು ಯೋಜನೆಯ ಮಾಹಿತಿಯನ್ನು ಮಾತ್ರ ಹಂಚಿಕೊಳ್ಳಲು ಅರ್ಹನಾಗಿದ್ದೇನೆ. ಬೆಲೆ ಮಾತುಕತೆ ಮತ್ತು ರಿಯಾಯಿತಿಗಳಿಗಾಗಿ, ನಾನು ನಮ್ಮ ಹಿರಿಯ ಆಸ್ತಿ ಸಲಹೆಗಾರರನ್ನು ನಿಮಗೆ ಸಂಪರ್ಕಿಸುತ್ತೇನೆ.",
      Telugu: "నేను AI రిసెప్షనిస్ట్‌గా అధికారిక బేస్ రేట్లు మరియు వెరిఫైడ్ ప్రాజెక్ట్ వివరాలను మాత్రమే అందించగలను. ధరల చర్చలు లేదా డిస్కౌంట్ల కోసం నేను మా సీనియర్ ప్రాపర్టీ ఎగ్జిక్యూటివ్‌కు కనెక్ట్ చేస్తున్నాను.",
      Hindi: "एआई रिसेप्शनिस्ट के रूप में मैं केवल स्वीकृत प्रति वर्ग फुट दरें और सत्यापित तथ्य ही साझा कर सकता हूँ। कीमत पर बातचीत या विशेष छूट के लिए, मैं आपको हमारे वरिष्ठ प्रॉपर्टी विशेषज्ञ से जोड़ रहा हूँ।"
    };
    return {
      reply: replies[lang],
      detectedLanguage: lang,
      matchedProperties: [],
      escalateToHuman: true,
      optOutRequested: false,
      siteVisitRequested: false
    };
  }

  // 3. Site visit booking check
  if (
    lower.includes("site visit") ||
    lower.includes("visit") ||
    lower.includes("see the property") ||
    lower.includes("dekhein") ||
    lower.includes("chudali") ||
    lower.includes("nodona") ||
    lower.includes("sunday") ||
    lower.includes("saturday") ||
    lower.includes("tomorrow")
  ) {
    const replies: Record<SupportedLanguage, string> = {
      English: "We would be delighted to organize a site visit for you! Our executive will accompany you at the project. Would this upcoming Saturday or Sunday morning at 10:30 AM be convenient for you?",
      Kannada: "ಖಂಡಿತ, ನಾವು ನಿಮಗಾಗಿ ಸೈಟ್ ಭೇಟಿಯನ್ನು (Site Visit) ಆಯೋಜಿಸುತ್ತೇವೆ! ನಮ್ಮ ಆಸ್ತಿ ತಜ್ಞರು ಯೋಜನಾ ಸ್ಥಳದಲ್ಲಿ ನಿಮ್ಮೊಂದಿಗೆ ಇರುತ್ತಾರೆ. ಮುಂಬರುವ ಶನಿವಾರ ಅಥವಾ ಭಾನುವಾರ ಬೆಳಗ್ಗೆ 10:30 ಕ್ಕೆ ನಿಮಗೆ ಅನುಕೂಲವೇ?",
      Telugu: "ఖచ్చితంగా అండి, మేము మీ కోసం సైట్ విజిట్ ఏర్పాటు చేస్తాము! మా ప్రాపర్టీ ఎగ్జిక్యూటివ్ ప్రాజెక్ట్ వద్ద మిమ్మల్ని కలుస్తారు. ఈ శనివారం లేదా ఆదివారం ఉదయం 10:30 గంటలకు మీకు వీలవుతుందా?",
      Hindi: "बिल्कुल, हम आपके लिए साइट विजिट की व्यवस्था करेंगे! हमारे प्रॉपर्टी विशेषज्ञ प्रोजेक्ट साइट पर आपके साथ रहेंगे। क्या आने वाले शनिवार या रविवार सुबह 10:30 बजे का समय आपके लिए सुविधाजनक रहेगा?"
    };
    return {
      reply: replies[lang],
      detectedLanguage: lang,
      matchedProperties: INITIAL_PROPERTIES.slice(0, 2),
      escalateToHuman: false,
      optOutRequested: false,
      siteVisitRequested: true,
      siteVisitTime: "Upcoming Weekend 10:30 AM"
    };
  }

  // 4. Property Category Matching & Verified Inventory Inquiries
  if (lower.includes("plot") || lower.includes("land") || lower.includes("site") || lower.includes("ಜಾಗ") || lower.includes("ಪ್ಲಾಟ್") || lower.includes("ప్లాట్") || lower.includes("प्लॉट")) {
    const prop = INITIAL_PROPERTIES.find((p) => p.category === "PLOT");
    const replies: Record<SupportedLanguage, string> = {
      English: `For residential plots, we have verified inventory at Greenfield Serene County near Devanahalli Airport corridor. Approved plot sizes range from 1,200 to 2,400 sq.ft. The approved rate is ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")} per sq.ft. It has BIAAPA and RERA approval with underground cabling and clubhouse amenities. Would you like to schedule a site visit?`,
      Kannada: `ಪ್ಲಾಟ್‌ಗಳಿಗಾಗಿ ನಮ್ಮಲ್ಲಿ ದೇವನಹಳ್ಳಿ ಎಂ.ಎಚ್-44 ರಸ್ತೆಯಲ್ಲಿರುವ Greenfield Serene County ನ ಅನುಮೋದಿತ ಜಾಗಗಳಿವೆ. 1,200 ರಿಂದ 2,400 ಚದರ ಅಡಿ ಪ್ಲಾಟ್‌ಗಳಿವೆ. ಆಡಳಿತ ಮಂಡಳಿಯಿಂದ ಅನುಮೋದಿತ ದರ ಪ್ರತಿ ಚದರ ಅಡಿಗೆ ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")}. BIAAPA ಮತ್ತು RERA ಅನುಮೋದನೆ ಪಡೆದಿದೆ. ನೀವು ಸೈಟ್ ನೋಡಲು ಇಷ್ಟಪಡುತ್ತೀರಾ?`,
      Telugu: `రెసిడెన్షియల్ ప్లాట్ల కోసం దేవనహల్లి ఎయిర్‌పోర్ట్ కారిడార్‌లో Greenfield Serene County అందుబాటులో ఉంది. ప్లాట్ సైజులు 1,200 నుండి 2,400 చదరపు అడుగులు. ఆమోదించబడిన బేస్ రేటు చదరపు అడుగుకి ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")}. BIAAPA & RERA సర్టిఫికేషన్లు ఉన్నాయి. మీరు సైట్ విజిట్ చూడాలనుకుంటున్నారా?`,
      Hindi: `आवासीय प्लॉट्स के लिए हमारे पास देवनहल्ली एयरपोर्ट कॉरिडोर के पास Greenfield Serene County उपलब्ध है। प्लॉट का आकार 1,200 से 2,400 वर्ग फुट है। स्वीकृत दर ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")} प्रति वर्ग फुट है। यह BIAAPA और RERA द्वारा स्वीकृत है। क्या आप साइट विजिट करना चाहेंगे?`
    };
    return {
      reply: replies[lang],
      detectedLanguage: lang,
      matchedProperties: INITIAL_PROPERTIES.filter((p) => p.category === "PLOT"),
      escalateToHuman: false,
      optOutRequested: false,
      siteVisitRequested: false,
      leadUpdate: { propertyType: "PLOT", preferredLocation: "Devanahalli" }
    };
  }

  if (lower.includes("flat") || lower.includes("apartment") || lower.includes("2 bhk") || lower.includes("3 bhk") || lower.includes("ఫ్లాట్") || lower.includes("ಅಪಾರ್ಟ್ಮೆಂಟ್") || lower.includes("फ्लैट")) {
    const prop = INITIAL_PROPERTIES.find((p) => p.category === "FLAT");
    const replies: Record<SupportedLanguage, string> = {
      English: `For apartments, we have Prestige Elm Greens on Varthur-Whitefield Main Road offering 2 & 3 BHK homes from 1,180 to 1,750 sq.ft. The approved rate is ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")} per sq.ft. Possession is March 2027 with Olympic-length swimming pool and sports courts. Would you like more details?`,
      Kannada: `ಅಪಾರ್ಟ್‌ಮೆಂಟ್‌ಗಳಿಗಾಗಿ ವೈಟ್‌ಫೀಲ್ಡ್-ವರ್ತೂರು ಮುಖ್ಯ ರಸ್ತೆಯಲ್ಲಿ Prestige Elm Greens ನಲ್ಲಿ 2 ಮತ್ತು 3 ಬಿ.ಎಚ್.ಕೆ ಮನೆಗಳಿವೆ (1,180 ರಿಂದ 1,750 ಚ.ಅಡಿ). ಅನುಮೋದಿತ ದರ ಪ್ರತಿ ಚ.ಅಡಿಗೆ ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")}. ಸ್ವಾಧೀನ ಮಾರ್ಚ್ 2027. ನೀವು ಈ ಯೋಜನೆಯ ವಿವರಗಳನ್ನು ಬಯಸುವಿರಾ?`,
      Telugu: `అపార్ట్‌మెంట్ల కోసం వైట్‌ఫీల్డ్-వర్తూర్ మెయిన్ రోడ్డులో Prestige Elm Greens ప్రాజెక్ట్‌లో 2 & 3 BHK ఫ్లాట్లు ఉన్నాయి (1,180 నుండి 1,750 చ.అడుగులు). ఆమోదించిన రేటు చదరపు అడుగుకి ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")}. మార్చి 2027 లో పొజిషన్ ఉంటుంది. మీకు మరిన్ని వివరాలు కావాలా?`,
      Hindi: `अपार्टमेंट्स के लिए हमारे पास व्हाइटफील्ड-वर्थूर मेन रोड पर Prestige Elm Greens में 2 और 3 बीएचके फ्लैट्स उपलब्ध हैं (1,180 से 1,750 वर्ग फुट)। स्वीकृत दर ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")} प्रति वर्ग फुट है। पजेशन मार्च 2027 में है। क्या आप इसकी अधिक जानकारी चाहेंगे?`
    };
    return {
      reply: replies[lang],
      detectedLanguage: lang,
      matchedProperties: INITIAL_PROPERTIES.filter((p) => p.category === "FLAT"),
      escalateToHuman: false,
      optOutRequested: false,
      siteVisitRequested: false,
      leadUpdate: { propertyType: "FLAT", preferredLocation: "Whitefield" }
    };
  }

  if (lower.includes("villa") || lower.includes("ವಿಲ್ಲಾ") || lower.includes("విల్లా") || lower.includes("विला")) {
    const prop = INITIAL_PROPERTIES.find((p) => p.category === "VILLA");
    const replies: Record<SupportedLanguage, string> = {
      English: `For luxury villas, we feature Palm Valley Signature Villas on Sarjapur-Attibele Road. These are 4 BHK triplex villas from 3,400 to 4,200 sq.ft. with private plunge pools. The approved rate is ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")} per sq.ft. Possession is scheduled for October 2026. Shall we coordinate a model villa walkthrough?`,
      Kannada: `ಐಷಾರಾಮಿ ವಿಲ್ಲಾಗಳಿಗಾಗಿ ಸರ್ಜಾಪುರ-ಅತ್ತಿಬೆಲೆ ರಸ್ತೆಯಲ್ಲಿ Palm Valley Signature Villas ಲಭ್ಯವಿದೆ. 3,400 ರಿಂದ 4,200 ಚ.ಅಡಿಯ 4 ಬಿ.ಎಚ್.ಕೆ ಟ್ರಿಪ್ಲೆಕ್ಸ್ ವಿಲ್ಲಾಗಳಾಗಿದ್ದು, ಖಾಸಗಿ ಪೂಲ್ ಹೊಂದಿದೆ. ಅನುಮೋದಿತ ದರ ಚ.ಅಡಿಗೆ ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")}. ಅಕ್ಟೋಬರ್ 2026 ರಲ್ಲಿ ಸ್ವಾಧೀನ. ಮಾದರಿ ವಿಲ್ಲಾ ನೋಡಲು ಸಮಯ ನಿಗದಿಪಡಿಸೋಣವೇ?`,
      Telugu: `లగ్జరీ విల్లాల కోసం సర్జాపూర్-అత్తిబెలె రోడ్డులో Palm Valley Signature Villas ప్రాజెక్ట్ ఉంది. ఇవి ప్రైవేట్ పూల్ ఉన్న 4 BHK ట్రిప్లెక్స్ విల్లాలు (3,400 నుండి 4,200 చ.అడుగులు). ఆమోదించిన రేటు చ.అడుగుకి ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")}. అక్టోబర్ 2026 నాటికి పొజిషన్. శాంపిల్ విల్లా చూడటానికి ప్లాన్ చేద్దామా?`,
      Hindi: `लक्ज़री विला के लिए हमारे पास सरजापुर-अत्तीबेले रोड पर Palm Valley Signature Villas हैं। ये 3,400 से 4,200 वर्ग फुट के 4 बीएचके ट्रिप्लेक्स विला हैं जिनमें प्राइवेट पूल की सुविधा है। स्वीकृत दर ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")} प्रति वर्ग फुट है। पजेशन अक्टूबर 2026 में है। क्या आप मॉडल विला देखना चाहेंगे?`
    };
    return {
      reply: replies[lang],
      detectedLanguage: lang,
      matchedProperties: INITIAL_PROPERTIES.filter((p) => p.category === "VILLA"),
      escalateToHuman: false,
      optOutRequested: false,
      siteVisitRequested: false,
      leadUpdate: { propertyType: "VILLA", preferredLocation: "Sarjapur Road" }
    };
  }

  if (lower.includes("house") || lower.includes("independent") || lower.includes("ಮನೆ") || lower.includes("ఇల్లు") || lower.includes("घर")) {
    const prop = INITIAL_PROPERTIES.find((p) => p.category === "INDEPENDENT_HOUSE");
    const replies: Record<SupportedLanguage, string> = {
      English: `For independent houses, we offer Sobha Meadows in Rajankunte, Yelahanka Extension. These are individual residences with private gardens and dual car parking. The approved rate is ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")} per sq.ft. Ready possession by September 2026. Would you like a site visit?`,
      Kannada: `ಸ್ವತಂತ್ರ ಮನೆಗಳಿಗಾಗಿ (Independent Houses) ಯಲಹಂಕ ಸಮೀಪದ ರಾಜನಕುಂಟೆಯಲ್ಲಿ Sobha Meadows ಲಭ್ಯವಿದೆ. ಖಾಸಗಿ ಗಾರ್ಡನ್ ಮತ್ತು ಪಾರ್ಕಿಂಗ್ ಸೌಲಭ್ಯವಿದೆ. ಅನುಮೋದಿತ ದರ ಪ್ರತಿ ಚ.ಅಡಿಗೆ ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")}. ಸೆಪ್ಟೆಂಬರ್ 2026 ರೊಳಗೆ ಸಿದ್ಧವಾಗಲಿದೆ. ಸೈಟ್ ನೋಡಲು ಬಯಸುವಿರಾ?`,
      Telugu: `ఇండిపెండెంట్ హౌస్‌ల కోసం యలహంక ఎక్స్‌టెన్షన్ రాజనకుంటె వద్ద Sobha Meadows అందుబాటులో ఉంది. ప్రైవేట్ గార్డెన్ మరియు పార్కింగ్ కలవు. ఆమోదించబడిన బేస్ రేటు చదరపు అడుగుకి ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")}. సెప్టెంబర్ 2026 నాటికి రెడీ. సైట్ విజిట్ చేయాలనుకుంటున్నారా?`,
      Hindi: `इंडिपेंडेंट मकानों के लिए हमारे पास यलहंका के पास राजनकुंटे में Sobha Meadows उपलब्ध है। इसमें प्राइवेट गार्डन और पार्किंग की सुविधा है। स्वीकृत दर ₹${prop?.approvedRatePerSqFt.toLocaleString("en-IN")} प्रति वर्ग फुट है। सितंबर 2026 तक पजेशन तैयार है। क्या आप साइट विजिट करना चाहेंगे?`
    };
    return {
      reply: replies[lang],
      detectedLanguage: lang,
      matchedProperties: INITIAL_PROPERTIES.filter((p) => p.category === "INDEPENDENT_HOUSE"),
      escalateToHuman: false,
      optOutRequested: false,
      siteVisitRequested: false,
      leadUpdate: { propertyType: "INDEPENDENT_HOUSE", preferredLocation: "Rajankunte, Yelahanka" }
    };
  }

  // Default natural conversational fallback in the selected language
  const defaultReplies: Record<SupportedLanguage, string> = {
    English: "Thank you for reaching out to EstatePilot AI. We have verified inventory across Plots, Independent Houses, Apartments, and Luxury Villas in Bangalore and Hyderabad. Which property category and preferred location can I assist you with today?",
    Kannada: "EstatePilot AI ಗೆ ಸುಸ್ವಾಗತ. ನಮ್ಮಲ್ಲಿ ಬೆಂಗಳೂರು ಮತ್ತು ಹೈದರಾಬಾದ್‌ನಲ್ಲಿ ಪ್ಲಾಟ್‌ಗಳು, ಸ್ವತಂತ್ರ ಮನೆಗಳು, ಫ್ಲಾಟ್‌ಗಳು ಮತ್ತು ಐಷಾರಾಮಿ ವಿಲ್ಲಾಗಳ ಸಂಪೂರ್ಣ ಪರಿಶೀಲಿಸಿದ ಮಾಹಿತಿ ಇದೆ. ನಿಮಗೆ ಯಾವ ರೀತಿಯ ಆಸ್ತಿ ಮತ್ತು ಯಾವ ಪ್ರದೇಶದ ವಿವರಗಳು ಬೇಕು?",
    Telugu: "EstatePilot AI కి స్వాగతం. మా వద్ద బెంగళూరు మరియు హైదరాబాద్‌లలో ప్లాట్లు, ఇండిపెండెంట్ హౌస్‌లు, అపార్ట్‌మెంట్లు మరియు లగ్జరీ విల్లాల వివరాలు ఉన్నాయి. మీకు ఏ కేటగిరీ మరియు ఏ లొకేషన్ సమాచారం కావాలి?",
    Hindi: "EstatePilot AI में आपका स्वागत है। हमारे पास बैंगलोर और हैदराबाद में प्लॉट्स, इंडिपेंडेंट मकान, फ्लैट्स और लक्ज़री विला का सत्यापित इन्वेंट्री विवरण है। आपको किस तरह की प्रॉपर्टी और लोकेशन की जानकारी चाहिए?"
  };

  return {
    reply: defaultReplies[lang],
    detectedLanguage: lang,
    matchedProperties: INITIAL_PROPERTIES,
    escalateToHuman: false,
    optOutRequested: false,
    siteVisitRequested: false
  };
}
