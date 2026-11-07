/**
 * B2B partner vocabulary.
 *
 * Shared by the admin CRM, the partner portal and Convex, exactly as
 * `lib/constants/statuses.ts` is shared for applications. Keeping the unions
 * here means a partner's account status renders identically in both surfaces
 * and the backend validates against the same list the UI offers.
 */

import type { StatusTone } from "./statuses";

/* -------------------------------------------------------------------------- */
/*                              account lifecycle                             */
/* -------------------------------------------------------------------------- */

export const PARTNER_STATUSES = [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "suspended",
] as const;

export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export interface PartnerStatusConfig {
  value: PartnerStatus;
  label: string;
  description: string;
  tone: StatusTone;
  /** May this partner reach the booking surfaces at all? */
  canTrade: boolean;
}

export const PARTNER_STATUS_CONFIG: Record<PartnerStatus, PartnerStatusConfig> = {
  pending: {
    value: "pending",
    label: "Pending",
    description: "Registered and waiting for a first look from the team.",
    tone: "info",
    canTrade: false,
  },
  under_review: {
    value: "under_review",
    label: "Under Review",
    description: "Documents are being verified before a decision.",
    tone: "progress",
    canTrade: false,
  },
  approved: {
    value: "approved",
    label: "Approved",
    description: "Active partner. Can create bookings at their own pricing.",
    tone: "success",
    canTrade: true,
  },
  rejected: {
    value: "rejected",
    label: "Rejected",
    description: "The application was declined. The reason is on the record.",
    tone: "danger",
    canTrade: false,
  },
  suspended: {
    value: "suspended",
    label: "Suspended",
    description: "Approved previously, but trading is paused.",
    tone: "warning",
    canTrade: false,
  },
};

/** Statuses a partner account may move to from its current one. */
export const PARTNER_TRANSITIONS: Record<PartnerStatus, PartnerStatus[]> = {
  pending: ["under_review", "approved", "rejected"],
  under_review: ["approved", "rejected", "pending"],
  approved: ["suspended"],
  rejected: ["under_review", "approved"],
  suspended: ["approved", "rejected"],
};

export function canTransitionPartner(
  from: PartnerStatus,
  to: PartnerStatus,
): boolean {
  if (from === to) return false;
  return PARTNER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function partnerCanTrade(status: string): boolean {
  return PARTNER_STATUS_CONFIG[status as PartnerStatus]?.canTrade === true;
}

/* -------------------------------------------------------------------------- */
/*                               business types                               */
/* -------------------------------------------------------------------------- */

export const PARTNER_BUSINESS_TYPES = [
  "travel_agency",
  "tour_operator",
  "corporate",
  "freelance_agent",
  "education_consultant",
  "other",
] as const;

export type PartnerBusinessType = (typeof PARTNER_BUSINESS_TYPES)[number];

export const PARTNER_BUSINESS_TYPE_LABELS: Record<PartnerBusinessType, string> = {
  travel_agency: "Travel agency",
  tour_operator: "Tour operator",
  corporate: "Corporate / HR desk",
  freelance_agent: "Freelance agent",
  education_consultant: "Education consultant",
  other: "Other",
};

/* -------------------------------------------------------------------------- */
/*                            verification documents                          */
/* -------------------------------------------------------------------------- */

export const PARTNER_DOCUMENT_KINDS = [
  "business_registration",
  "gst_certificate",
  "pan_card",
  "address_proof",
  "iata_certificate",
  "other",
] as const;

export type PartnerDocumentKind = (typeof PARTNER_DOCUMENT_KINDS)[number];

export interface PartnerDocumentDefinition {
  key: PartnerDocumentKind;
  label: string;
  description: string;
  isMandatory: boolean;
}

export const PARTNER_DOCUMENT_DEFINITIONS: PartnerDocumentDefinition[] = [
  {
    key: "business_registration",
    label: "Business registration",
    description:
      "Certificate of incorporation, shop & establishment licence, or partnership deed.",
    isMandatory: true,
  },
  {
    key: "gst_certificate",
    label: "GST certificate",
    description: "Required if you are GST registered.",
    isMandatory: false,
  },
  {
    key: "pan_card",
    label: "PAN card",
    description: "Business PAN, or proprietor's PAN for a sole proprietorship.",
    isMandatory: false,
  },
  {
    key: "address_proof",
    label: "Office address proof",
    description: "Utility bill, rent agreement or property tax receipt.",
    isMandatory: false,
  },
  {
    key: "iata_certificate",
    label: "IATA / travel accreditation",
    description: "Optional, but it speeds verification up.",
    isMandatory: false,
  },
  {
    key: "other",
    label: "Other supporting document",
    description: "Anything else that helps us verify the business.",
    isMandatory: false,
  },
];

export const PARTNER_DOCUMENT_MAP: Record<string, PartnerDocumentDefinition> =
  Object.fromEntries(
    PARTNER_DOCUMENT_DEFINITIONS.map((d) => [d.key, d]),
  );

export function partnerDocumentLabel(key: string): string {
  return PARTNER_DOCUMENT_MAP[key]?.label ?? "Supporting document";
}

export const PARTNER_DOCUMENT_STATUSES = [
  "pending_review",
  "verified",
  "rejected",
] as const;

export type PartnerDocumentStatus = (typeof PARTNER_DOCUMENT_STATUSES)[number];

export const PARTNER_DOCUMENT_STATUS_CONFIG: Record<
  PartnerDocumentStatus,
  { label: string; tone: StatusTone }
> = {
  pending_review: { label: "Pending Review", tone: "info" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

/* -------------------------------------------------------------------------- */
/*                                   pricing                                  */
/* -------------------------------------------------------------------------- */

/**
 * How a partner's selling price is derived from the catalogue price.
 *
 * All three are resolved server-side. A partner never submits a price; the
 * most a partner UI does is *display* the number this produces.
 */
export const PARTNER_PRICING_MODES = [
  "markup_percent",
  "markup_amount",
  "fixed_price",
] as const;

export type PartnerPricingMode = (typeof PARTNER_PRICING_MODES)[number];

export const PARTNER_PRICING_MODE_LABELS: Record<PartnerPricingMode, string> = {
  markup_percent: "Markup %",
  markup_amount: "Markup per traveller",
  fixed_price: "Fixed price per traveller",
};

export const PARTNER_PRICING_MODE_HINTS: Record<PartnerPricingMode, string> = {
  markup_percent:
    "A percentage of the base per-traveller fee is added before tax.",
  markup_amount: "A flat amount per traveller is added before tax.",
  fixed_price:
    "Replaces the base per-traveller fee entirely. Taxes still apply on top.",
};

/** Guard rails on what an admin may configure. Enforced in Convex too. */
export const MAX_MARKUP_PERCENT = 200;
/** ₹5,00,000 per traveller, in paise. */
export const MAX_MARKUP_AMOUNT = 50_000_000;

/* -------------------------------------------------------------------------- */
/*                                  helpers                                   */
/* -------------------------------------------------------------------------- */

/** `VDP-0042` — the partner-facing account number. */
export function formatPartnerCode(code: string): string {
  return code.trim().toUpperCase();
}

export const PARTNER_PORTAL_PATH = "/partner";
