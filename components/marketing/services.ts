import { EXISTING_SERVICES, LEGAL, type ExistingServiceKey } from "@/lib/constants/site";

/**
 * Routing for the five service lines VisaDrive already sells.
 *
 * The slugs are fixed by `FOOTER_NAV.services` in `lib/constants/site.ts`;
 * this maps them onto the service records so `/services/[slug]` resolves
 * without duplicating any copy. The name and summary are always read from
 * `EXISTING_SERVICES` — nothing about a service is written twice.
 */
const SLUG_BY_KEY: Record<ExistingServiceKey, string> = {
  ds160_form_filling: "ds-160-form-filling",
  express_appointment: "express-appointment",
  interview_guidance: "interview-guidance",
  dropbox_renewal: "dropbox-renewal",
  appointment_rescheduling: "appointment-rescheduling",
};

/**
 * Which `LEGAL.*` statements apply to each service. These are the client's own
 * words and are reproduced verbatim; the only decision made here is which of
 * them is relevant to which service.
 */
const DISCLAIMER_KEYS_BY_KEY: Record<
  ExistingServiceKey,
  Array<keyof typeof LEGAL>
> = {
  ds160_form_filling: ["governmentFeesSeparate", "accuracyObligation"],
  express_appointment: [
    "appointmentAvailability",
    "noAdvancePayment",
    "governmentFeesSeparate",
  ],
  interview_guidance: ["noGuarantee"],
  dropbox_renewal: ["noGuarantee", "accuracyObligation", "governmentFeesSeparate"],
  appointment_rescheduling: ["appointmentAvailability", "noAdvancePayment"],
};

export interface MarketingService {
  key: ExistingServiceKey;
  slug: string;
  name: string;
  summary: string;
  icon: string;
  disclaimers: string[];
}

export const MARKETING_SERVICES: MarketingService[] = EXISTING_SERVICES.map(
  (service) => ({
    key: service.key,
    slug: SLUG_BY_KEY[service.key],
    name: service.name,
    summary: service.summary,
    icon: service.icon,
    disclaimers: DISCLAIMER_KEYS_BY_KEY[service.key].map((k) => LEGAL[k]),
  }),
);

export function serviceBySlug(slug: string): MarketingService | undefined {
  return MARKETING_SERVICES.find((service) => service.slug === slug);
}

export const SERVICE_SLUGS = MARKETING_SERVICES.map((service) => service.slug);
