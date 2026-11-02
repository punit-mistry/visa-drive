"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";

import { api } from "@/convex/_generated/api";
import { SITE } from "@/lib/constants/site";

/**
 * Public site settings, with the constants in `lib/constants/site.ts` as the
 * fallback.
 *
 * Staff can change the phone number, address or company name from
 * Admin → Settings without a deploy; until a row exists for a key, the real
 * value audited from visadrive.in is used. That means the marketing site
 * renders correctly on a completely empty database.
 */
export function useSiteSettings() {
  const settings = useQuery(api.appSettings.getPublic);

  return useMemo(() => {
    const map = new Map<string, unknown>(
      (settings ?? []).map((row) => [row.key, row.value]),
    );

    const get = <T,>(key: string, fallback: T): T => {
      const value = map.get(key);
      return value === undefined || value === null || value === "" ? fallback : (value as T);
    };

    // The setting is a plain list when staff edit it, but the seed wraps the
    // same list in `{ isDemo, note, items }` so the demo caveat travels with
    // the data. Both shapes are valid; only the list reaches the UI.
    const rawTestimonials = map.get("content.testimonials");
    const testimonials = (
      Array.isArray(rawTestimonials)
        ? rawTestimonials
        : ((rawTestimonials as { items?: unknown } | null | undefined)?.items ?? [])
    ) as Array<{ quote: string; name: string; context?: string; isDemo?: boolean }>;

    return {
      isLoading: settings === undefined,
      companyName: get("company.name", SITE.name),
      tagline: get("company.tagline", SITE.tagline),
      description: get("company.description", SITE.footerDescription),
      email: get("contact.email", SITE.contact.email),
      phone: get("contact.phone", SITE.contact.phonePrimary),
      phoneDisplay: get("contact.phoneDisplay", SITE.contact.phonePrimaryDisplay),
      phoneSecondary: get("contact.phoneSecondary", SITE.contact.phoneSecondary),
      phoneSecondaryDisplay: get(
        "contact.phoneSecondaryDisplay",
        SITE.contact.phoneSecondaryDisplay,
      ),
      whatsapp: get("contact.whatsapp", SITE.contact.whatsapp),
      address: get("contact.address", SITE.address.full),
      addressShort: get("contact.addressShort", SITE.address.short),
      businessHours: get<string | null>("contact.businessHours", SITE.businessHours),
      currency: get("finance.currency", SITE.defaultCurrency),
      taxPercent: get("finance.taxPercent", 0),
      social: get<Record<string, string>>("company.social", SITE.social),
      /** Demo testimonials are labelled in the UI; real ones are not. */
      testimonials,
      raw: map,
    };
  }, [settings]);
}
