export type PropertyCategory = "PLOT" | "INDEPENDENT_HOUSE" | "FLAT" | "VILLA";

export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "INTERESTED"
  | "CALLBACK_SCHEDULED"
  | "SITE_VISIT_SCHEDULED"
  | "SITE_VISITED"
  | "CONVERTED"
  | "LOST"
  | "DO_NOT_CONTACT";

export type SupportedLanguage = "English" | "Kannada" | "Telugu" | "Hindi";

export interface PropertyRecord {
  id: string;
  name: string;
  category: PropertyCategory;
  location: string;
  landmark: string;
  city: string;
  minAreaSqFt: number;
  maxAreaSqFt: number;
  approvedRatePerSqFt: number;
  currency: "INR";
  availabilityStatus: "AVAILABLE" | "FEW_UNITS_LEFT" | "SOLD_OUT";
  isVerified: boolean;
  verifiedBy: string;
  verifiedAt: string;
  amenities: string[];
  reraNumber: string;
  approvals: string[];
  possessionDate: string;
  description: string;
  brochureFileName?: string;
  brochureUploadedAt?: string;
}

export interface LeadConsentRecord {
  channel: "PHONE_CALL" | "WHATSAPP" | "EMAIL";
  granted: boolean;
  capturedAt: string;
  purpose: string;
  evidence: string;
}

export interface CallLogItem {
  id: string;
  leadId?: string;
  roomId: string;
  customerName: string;
  phone: string;
  language: SupportedLanguage;
  startedAt: string;
  durationSeconds: number;
  status: "COMPLETED" | "MISSED" | "ESCALATED_TO_HUMAN";
  summary: string;
  transcript: Array<{ role: "receptionist" | "customer" | "executive"; text: string; time: string }>;
  matchedPropertyNames: string[];
}

export interface SiteVisitRecord {
  id: string;
  leadId: string;
  customerName: string;
  phone: string;
  propertyId: string;
  propertyName: string;
  scheduledAt: string;
  status: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "RESCHEDULED" | "CANCELLED" | "NO_SHOW";
  assignedExecutive: string;
  notes: string;
}

export interface LeadRecord {
  id: string;
  referenceNumber: string;
  fullName: string;
  phone: string;
  email?: string;
  source: "PUBLIC_WEBSITE" | "PHONE_INBOUND" | "REFERRAL" | "PROPERTY_PORTAL";
  propertyType: PropertyCategory;
  preferredLocation: string;
  preferredArea: string;
  preferredLanguage: SupportedLanguage;
  status: LeadStatus;
  consent: LeadConsentRecord;
  createdAt: string;
  updatedAt: string;
  nextActionAt?: string;
  lastContactedAt?: string;
  assignedExecutive: string;
  notes?: string;
  aiConversationSummary?: string;
  matchedPropertyIds: string[];
  callIds: string[];
  siteVisitIds: string[];
}

export const INITIAL_PROPERTIES: PropertyRecord[] = [
  {
    id: "prop-01",
    name: "Greenfield Serene County",
    category: "PLOT",
    location: "Devanahalli, NH-44 Corridor",
    landmark: "10 mins from Kempegowda International Airport",
    city: "Bangalore",
    minAreaSqFt: 1200,
    maxAreaSqFt: 2400,
    approvedRatePerSqFt: 3850,
    currency: "INR",
    availabilityStatus: "AVAILABLE",
    isVerified: true,
    verifiedBy: "Senior Operations Manager (Approved)",
    verifiedAt: "2026-10-15T10:00:00Z",
    amenities: [
      "40-ft wide blacktop roads",
      "Underground cabling & drainage",
      "10,000 sq.ft. clubhouse",
      "Landscaped tree boulevards",
      "24/7 security & CCTV surveillance"
    ],
    reraNumber: "PRM/KA/RERA/1250/303/PR/230112/005612",
    approvals: ["BIAAPA Approved", "RERA Registered", "A-Khata Clear Title"],
    possessionDate: "Immediate (Ready for registration)",
    description: "Verified master-planned residential plotted community near Bangalore International Airport with crystal-clear legal documentation and ready civic infrastructure.",
    brochureFileName: "Greenfield-Serene-County-Brochure-2026.pdf",
    brochureUploadedAt: "2026-10-15T09:30:00Z"
  },
  {
    id: "prop-02",
    name: "Silver Oak Meadows Plotted Enclave",
    category: "PLOT",
    location: "Sarjapur-Chikka Tirupathi Road",
    landmark: "Opposite Indus International School",
    city: "Bangalore",
    minAreaSqFt: 1500,
    maxAreaSqFt: 3000,
    approvedRatePerSqFt: 4900,
    currency: "INR",
    availabilityStatus: "FEW_UNITS_LEFT",
    isVerified: true,
    verifiedBy: "Chief Legal & Operations Officer",
    verifiedAt: "2026-10-20T11:30:00Z",
    amenities: [
      "Compound wall around periphery",
      "Water treatment plant (WTP)",
      "Clubhouse with indoor sports",
      "Jogging track & amphitheatre"
    ],
    reraNumber: "PRM/KA/RERA/1251/308/PR/221019/005340",
    approvals: ["BMRDA Approved", "RERA Compliant", "Bank Pre-approved (HDFC, SBI)"],
    possessionDate: "Ready for Construction",
    description: "Premium villa plots nestled in a peaceful green corridor connecting Sarjapur and Whitefield IT hubs.",
    brochureFileName: "Silver-Oak-Meadows-Specifications.pdf",
    brochureUploadedAt: "2026-10-20T11:00:00Z"
  },
  {
    id: "prop-03",
    name: "Prestige Elm Greens Apartments",
    category: "FLAT",
    location: "Varthur - Whitefield Main Road",
    landmark: "Near Forum Neighbourhood Mall",
    city: "Bangalore",
    minAreaSqFt: 1180,
    maxAreaSqFt: 1750,
    approvedRatePerSqFt: 8400,
    currency: "INR",
    availabilityStatus: "AVAILABLE",
    isVerified: true,
    verifiedBy: "Technical Audit Team",
    verifiedAt: "2026-10-25T14:00:00Z",
    amenities: [
      "Olympic-length swimming pool",
      "2 air-conditioned squash courts",
      "Children's adventure play arena",
      "Dedicated EV fast charging bays",
      "100% DG power backup"
    ],
    reraNumber: "PRM/KA/RERA/1251/311/PR/220516/004889",
    approvals: ["BBMP Approved", "Karnataka RERA", "Environment Clearance (SEIAA)"],
    possessionDate: "Phase 1: March 2027",
    description: "Luxury high-rise 2 & 3 BHK apartments with 80% open landscaped area and immediate metro line connectivity.",
    brochureFileName: "Prestige-Elm-Greens-Brochure.pdf",
    brochureUploadedAt: "2026-10-25T13:45:00Z"
  },
  {
    id: "prop-04",
    name: "Aparna CyberHeights Towers",
    category: "FLAT",
    location: "Gachibowli Financial District, Nanakramguda",
    landmark: "Beside Waverock Tech Park",
    city: "Hyderabad",
    minAreaSqFt: 1260,
    maxAreaSqFt: 1840,
    approvedRatePerSqFt: 9100,
    currency: "INR",
    availabilityStatus: "AVAILABLE",
    isVerified: true,
    verifiedBy: "Regional Verification Officer",
    verifiedAt: "2026-10-28T09:00:00Z",
    amenities: [
      "Sky lounge & infinity edge pool",
      "Co-working business pods",
      "Multi-tier 24/7 security",
      "Piped gas provision"
    ],
    reraNumber: "P02400004519",
    approvals: ["GHMC Sanctioned", "TG-RERA Verified", "Fire Safety NOC"],
    possessionDate: "December 2026",
    description: "Premium IT-corridor residences crafted for professionals seeking seamless commute times and resort-inspired amenities.",
    brochureFileName: "Aparna-CyberHeights-Floorplans.pdf",
    brochureUploadedAt: "2026-10-28T08:30:00Z"
  },
  {
    id: "prop-05",
    name: "Sobha Meadows Independent Houses",
    category: "INDEPENDENT_HOUSE",
    location: "Rajankunte - Yelahanka Extension",
    landmark: "Near Stonehill International School",
    city: "Bangalore",
    minAreaSqFt: 2200,
    maxAreaSqFt: 2800,
    approvedRatePerSqFt: 7200,
    currency: "INR",
    availabilityStatus: "AVAILABLE",
    isVerified: true,
    verifiedBy: "Senior Property Consultant",
    verifiedAt: "2026-10-30T16:00:00Z",
    amenities: [
      "Individual private garden & terrace",
      "Dual covered car parking",
      "Solar rooftop panel ready",
      "Private borewell & municipal water dual lines"
    ],
    reraNumber: "PRM/KA/RERA/1250/309/PR/231102/006381",
    approvals: ["BIAAPA Sanctioned", "RERA Registered", "Clear Title Verified"],
    possessionDate: "September 2026",
    description: "Exclusive independent houses providing standalone privacy, private courtyard gardens, and bespoke architectural finishes.",
    brochureFileName: "Sobha-Meadows-Independent-Brochure.pdf",
    brochureUploadedAt: "2026-10-30T15:00:00Z"
  },
  {
    id: "prop-06",
    name: "Palm Valley Signature Villas",
    category: "VILLA",
    location: "Sarjapur - Attibele Road",
    landmark: "Close to Wipro SEZ Sarjapur",
    city: "Bangalore",
    minAreaSqFt: 3400,
    maxAreaSqFt: 4200,
    approvedRatePerSqFt: 11200,
    currency: "INR",
    availabilityStatus: "FEW_UNITS_LEFT",
    isVerified: true,
    verifiedBy: "Principal Architecture Reviewer",
    verifiedAt: "2026-11-01T12:00:00Z",
    amenities: [
      "Private plunge pool on master terrace",
      "Custom Italian marble flooring",
      "Smart home automation (lighting & AC control)",
      "Double-height living pavilion",
      "Private elevator provision"
    ],
    reraNumber: "PRM/KA/RERA/1251/308/PR/230405/005842",
    approvals: ["BMRDA Approved", "Karnataka RERA", "Environment Clearance"],
    possessionDate: "October 2026",
    description: "Ultra-luxury 4 BHK triplex villas designed with sustainable architecture, expansive double-height volumes, and private infinity dip pools.",
    brochureFileName: "Palm-Valley-Luxury-Villas.pdf",
    brochureUploadedAt: "2026-11-01T11:00:00Z"
  }
];

export const INITIAL_LEADS: LeadRecord[] = [
  {
    id: "lead-01",
    referenceNumber: "EP-2026-1042",
    fullName: "Kiran Kumar Reddy",
    phone: "+919845012345",
    email: "kiran.reddy@example.com",
    source: "PUBLIC_WEBSITE",
    propertyType: "PLOT",
    preferredLocation: "Devanahalli, North Bangalore",
    preferredArea: "1500 to 2400 sq.ft.",
    preferredLanguage: "Telugu",
    status: "SITE_VISIT_SCHEDULED",
    consent: {
      channel: "PHONE_CALL",
      granted: true,
      capturedAt: "2026-11-04T08:30:00Z",
      purpose: "Property enquiry consultation & site visit coordination",
      evidence: "Online consent checkbox: 'I agree to be contacted by phone about this property enquiry.'"
    },
    createdAt: "2026-11-04T08:30:00Z",
    updatedAt: "2026-11-05T14:20:00Z",
    nextActionAt: "2026-11-08T10:30:00Z",
    lastContactedAt: "2026-11-05T14:00:00Z",
    assignedExecutive: "Rajesh Sharma (Senior Property Specialist)",
    notes: "Customer spoke in Telugu during the voice call. Interested in Greenfield Serene County. Site visit confirmed for Sunday at 10:30 AM.",
    aiConversationSummary: "Customer inquired in Telugu regarding airport proximity and approved sq.ft. rates for residential plots. AI receptionist confirmed Greenfield Serene County approved rate at ₹3,850/sq.ft. Customer requested site visit for Sunday morning.",
    matchedPropertyIds: ["prop-01"],
    callIds: ["call-01"],
    siteVisitIds: ["sv-01"]
  },
  {
    id: "lead-02",
    referenceNumber: "EP-2026-1043",
    fullName: "Ananya Deshmukh",
    phone: "+919920144567",
    email: "ananya.d@example.com",
    source: "PUBLIC_WEBSITE",
    propertyType: "FLAT",
    preferredLocation: "Whitefield, Varthur",
    preferredArea: "3 BHK apartment",
    preferredLanguage: "English",
    status: "CONTACTED",
    consent: {
      channel: "PHONE_CALL",
      granted: true,
      capturedAt: "2026-11-05T09:15:00Z",
      purpose: "Property information sharing",
      evidence: "Online enquiry form opt-in verified"
    },
    createdAt: "2026-11-05T09:15:00Z",
    updatedAt: "2026-11-05T15:00:00Z",
    nextActionAt: "2026-11-07T11:00:00Z",
    lastContactedAt: "2026-11-05T11:45:00Z",
    assignedExecutive: "Priya Nair (Lead Relationship Manager)",
    notes: "Verified rate card of Prestige Elm Greens shared. Customer agreed to callback on Saturday at 11:00 AM.",
    aiConversationSummary: "Inquired about 3 BHK unit sizes and approved rate. AI quoted ₹8,400/sq.ft. with March 2027 possession. No negotiation attempted.",
    matchedPropertyIds: ["prop-03"],
    callIds: ["call-02"],
    siteVisitIds: []
  },
  {
    id: "lead-03",
    referenceNumber: "EP-2026-1044",
    fullName: "Manjunath Gowda",
    phone: "+919448098765",
    email: "manjunath.gowda@example.com",
    source: "PHONE_INBOUND",
    propertyType: "INDEPENDENT_HOUSE",
    preferredLocation: "Yelahanka, Rajankunte",
    preferredArea: "2200 sq.ft. built-up",
    preferredLanguage: "Kannada",
    status: "INTERESTED",
    consent: {
      channel: "PHONE_CALL",
      granted: true,
      capturedAt: "2026-11-05T10:00:00Z",
      purpose: "Independent house enquiry",
      evidence: "Spoken verbal consent recorded in call session EP-CALL-103"
    },
    createdAt: "2026-11-05T10:00:00Z",
    updatedAt: "2026-11-05T16:10:00Z",
    nextActionAt: "2026-11-09T14:00:00Z",
    lastContactedAt: "2026-11-05T10:30:00Z",
    assignedExecutive: "Suresh Kumar (Kannada Language Specialist)",
    notes: "Kannada language conversation. Discussed Sobha Meadows Independent Houses at ₹7,200/sq.ft. Customer wanted to discuss loan options with their bank before site visit.",
    aiConversationSummary: "Conversation held entirely in Kannada (ಕನ್ನಡ). Receptionist confirmed BIAAPA & RERA approvals and September 2026 possession date. Customer politely asked for a follow-up next Monday.",
    matchedPropertyIds: ["prop-05"],
    callIds: ["call-03"],
    siteVisitIds: []
  },
  {
    id: "lead-04",
    referenceNumber: "EP-2026-1045",
    fullName: "Virendra Singh Chouhan",
    phone: "+919811234567",
    email: "virendra.singh@example.com",
    source: "PUBLIC_WEBSITE",
    propertyType: "VILLA",
    preferredLocation: "Sarjapur Road",
    preferredArea: "4 BHK Villa, 3500+ sq.ft.",
    preferredLanguage: "Hindi",
    status: "SITE_VISIT_SCHEDULED",
    consent: {
      channel: "PHONE_CALL",
      granted: true,
      capturedAt: "2026-11-05T11:20:00Z",
      purpose: "Luxury villa consultation",
      evidence: "Online form digital signature & timestamp"
    },
    createdAt: "2026-11-05T11:20:00Z",
    updatedAt: "2026-11-05T17:00:00Z",
    nextActionAt: "2026-11-07T15:30:00Z",
    lastContactedAt: "2026-11-05T11:40:00Z",
    assignedExecutive: "Rajesh Sharma (Senior Property Specialist)",
    notes: "Hindi conversation. Matched Palm Valley Signature Villas at approved rate ₹11,200/sq.ft. Site visit confirmed for Saturday 3:30 PM.",
    aiConversationSummary: "Inquiry in Hindi (हिन्दी). AI explained 4 BHK triplex floor plan and plunge pool amenities from approved brochure. Site visit requested and scheduled.",
    matchedPropertyIds: ["prop-06"],
    callIds: ["call-04"],
    siteVisitIds: ["sv-02"]
  },
  {
    id: "lead-05",
    referenceNumber: "EP-2026-1046",
    fullName: "Pooja Hegde",
    phone: "+919731238901",
    email: "pooja.hegde@example.com",
    source: "PUBLIC_WEBSITE",
    propertyType: "PLOT",
    preferredLocation: "Sarjapur East",
    preferredArea: "1500 sq.ft.",
    preferredLanguage: "Kannada",
    status: "NEW",
    consent: {
      channel: "PHONE_CALL",
      granted: true,
      capturedAt: "2026-11-05T18:00:00Z",
      purpose: "Plot enquiry callback",
      evidence: "Website enquiry submission"
    },
    createdAt: "2026-11-05T18:00:00Z",
    updatedAt: "2026-11-05T18:00:00Z",
    nextActionAt: "2026-11-06T10:00:00Z",
    assignedExecutive: "Suresh Kumar (Kannada Language Specialist)",
    notes: "New enquiry received through website. Awaiting initial AI/executive call during permitted hours.",
    matchedPropertyIds: ["prop-02"],
    callIds: [],
    siteVisitIds: []
  }
];

export const INITIAL_CALLS: CallLogItem[] = [
  {
    id: "call-01",
    leadId: "lead-01",
    roomId: "callroom-kiran-reddy",
    customerName: "Kiran Kumar Reddy",
    phone: "+919845012345",
    language: "Telugu",
    startedAt: "2026-11-04T08:35:00Z",
    durationSeconds: 195,
    status: "COMPLETED",
    summary: "Telugu inquiry regarding airport corridor plots. AI receptionist quoted approved ₹3,850/sq.ft. rate for Greenfield Serene County and scheduled Sunday 10:30 AM site visit.",
    transcript: [
      { role: "receptionist", text: "నమస్కారం! నేను EstatePilot AI రిసెప్షనిస్ట్‌ని. నేను తెలుగు, ఇంగ్లీష్, కన్నడ మరియు హిందీ మాట్లాడగలను. మీకు ఏ ప్రాపర్టీ వివరాలు కావాలి?", time: "00:02" },
      { role: "customer", text: "నమస్కారం అండి, నాకు ఎయిర్‌పోర్ట్ దగ్గర మంచి రెసిడెన్షియల్ ప్లాట్లు కావాలి.", time: "00:12" },
      { role: "receptionist", text: "తప్పకుండా అండి. మా వద్ద దేవనహల్లి ఎయిర్‌పోర్ట్ కారిడార్‌లో BIAAPA మరియు RERA అప్రూవ్ అయిన Greenfield Serene County గేటెడ్ ప్లాట్లు ఉన్నాయి. ఇక్కడ 1,200 నుండి 2,400 చదరపు అడుగుల ప్లాట్లు అందుబాటులో ఉన్నాయి. ఆమోదించబడిన రేటు చదరపు అడుగుకి ₹3,850.", time: "00:28" },
      { role: "customer", text: "అక్కడ సైట్ విజిట్ చేయడానికి అవకాశం ఉందా?", time: "00:45" },
      { role: "receptionist", text: "అవునండి, మేము సైట్ విజిట్ ఏర్పాటు చేయగలం. ఈ ఆదివారం ఉదయం 10:30 గంటలకు మీకు సౌకర్యంగా ఉంటుందా?", time: "00:58" },
      { role: "customer", text: "సరే, ఆదివారం 10:30 కి ఫిక్స్ చేయండి.", time: "01:10" },
      { role: "receptionist", text: "ధన్యవాదాలు! మీ సైట్ విజిట్ ఆదివారం 10:30 AM కి కన్ఫర్మ్ అయింది. మా ప్రాపర్టీ ఎగ్జిక్యూటివ్ మిమ్మల్ని సంప్రదిస్తారు.", time: "01:25" }
    ],
    matchedPropertyNames: ["Greenfield Serene County"]
  },
  {
    id: "call-02",
    leadId: "lead-02",
    roomId: "callroom-ananya-d",
    customerName: "Ananya Deshmukh",
    phone: "+919920144567",
    language: "English",
    startedAt: "2026-11-05T09:20:00Z",
    durationSeconds: 142,
    status: "COMPLETED",
    summary: "Customer asked about 3 BHK configurations in Whitefield. AI shared Prestige Elm Greens specifications and verified ₹8,400/sq.ft. rate. Agreed for follow-up callback on Saturday 11 AM.",
    transcript: [
      { role: "receptionist", text: "Hello! I am EstatePilot AI receptionist. I can assist you in English, Hindi, Kannada or Telugu. How may I help you today?", time: "00:02" },
      { role: "customer", text: "Hi, I submitted an enquiry for 3 BHK apartments in Whitefield or Varthur.", time: "00:10" },
      { role: "receptionist", text: "Thank you for reaching out. In Varthur-Whitefield, we have Prestige Elm Greens, which offers premium 3 BHK units from 1,450 to 1,750 sq.ft. The approved rate is ₹8,400 per sq.ft. It is RERA registered with possession targeted for March 2027.", time: "00:30" },
      { role: "customer", text: "Is there any negotiation on the price?", time: "00:46" },
      { role: "receptionist", text: "As an AI receptionist, I am only authorized to share approved base rates. I cannot negotiate prices or offer unapproved discounts. I would be happy to connect you with our senior property executive to discuss payment milestones.", time: "01:05" },
      { role: "customer", text: "Okay, call me back on Saturday at 11 AM.", time: "01:18" },
      { role: "receptionist", text: "Noted with thanks! Our team will call you on Saturday at 11:00 AM.", time: "01:30" }
    ],
    matchedPropertyNames: ["Prestige Elm Greens Apartments"]
  }
];

export const INITIAL_SITE_VISITS: SiteVisitRecord[] = [
  {
    id: "sv-01",
    leadId: "lead-01",
    customerName: "Kiran Kumar Reddy",
    phone: "+919845012345",
    propertyId: "prop-01",
    propertyName: "Greenfield Serene County",
    scheduledAt: "2026-11-08T10:30:00Z",
    status: "CONFIRMED",
    assignedExecutive: "Rajesh Sharma",
    notes: "Customer confirmed over Telugu voice call. Executive to meet at project gate with brochure pack."
  },
  {
    id: "sv-02",
    leadId: "lead-04",
    customerName: "Virendra Singh Chouhan",
    phone: "+919811234567",
    propertyId: "prop-06",
    propertyName: "Palm Valley Signature Villas",
    scheduledAt: "2026-11-07T15:30:00Z",
    status: "SCHEDULED",
    assignedExecutive: "Rajesh Sharma",
    notes: "Site visit for 4 BHK triplex villa. Sample villa walkthrough arranged."
  }
];

// Helper functions for matching
export function matchProperties(category: PropertyCategory, preferredLocation?: string): PropertyRecord[] {
  return INITIAL_PROPERTIES.filter((prop) => {
    if (prop.category !== category) return false;
    if (!prop.isVerified) return false;
    if (preferredLocation && preferredLocation.trim().length > 0) {
      const loc = preferredLocation.toLowerCase();
      const match =
        prop.location.toLowerCase().includes(loc) ||
        prop.landmark.toLowerCase().includes(loc) ||
        prop.city.toLowerCase().includes(loc) ||
        prop.name.toLowerCase().includes(loc);
      return match;
    }
    return true;
  });
}
