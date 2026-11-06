export const PROPERTY_TYPES = ["plot", "independent_house", "flat", "villa"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export type LeadStatus =
  | "new"
  | "contacted"
  | "interested"
  | "callback_scheduled"
  | "site_visit_scheduled"
  | "site_visited"
  | "not_interested"
  | "do_not_contact";

export interface PropertyMatch {
  propertyId: string;
  propertyName: string;
  propertyType: PropertyType;
  location: string;
  areaSqFt?: number;
  approvedRatePerSqFt: number;
  currency: "INR";
}

export interface LeadRequirement {
  propertyTypes: PropertyType[];
  preferredLocations: string[];
  preferredAreaSqFt?: number;
  purchasePurpose?: "self_use" | "investment" | "other";
  purchaseTimeline?: string;
  preferredLanguage?: "te" | "en" | "hi" | "other";
}

// Intentionally excludes customer budget and affordability fields.
