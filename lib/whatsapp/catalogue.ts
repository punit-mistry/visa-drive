import type { CatalogueOption } from "./types";

/* ============================================================================
 * Bot catalogue helpers (pure). Destinations and the categories offered come
 * from the admin-configured catalogue; stay-length bands are just answer
 * options for the enquiry, not facts about any visa.
 * ========================================================================== */

export const CATEGORY_LABELS: Record<string, string> = {
  tourist: "Tourist",
  business: "Business",
  student: "Student",
  transit: "Transit",
  medical: "Medical",
  work: "Work",
  exchange_visitor: "Exchange visitor",
  service: "Visa service",
  other: "Other",
};

const FALLBACK_CATEGORIES = ["tourist", "business", "student", "transit", "medical", "work", "other"];

export function categoryOptions(published: string[]): CatalogueOption[] {
  const seen = new Set<string>();
  for (const c of published) if (c in CATEGORY_LABELS) seen.add(c);
  const ids = seen.size > 0 ? Array.from(seen) : FALLBACK_CATEGORIES;
  return ids.slice(0, 10).map((id) => ({ id, label: CATEGORY_LABELS[id] }));
}

export const DURATION_OPTIONS: CatalogueOption[] = [
  { id: "up_to_30", label: "Up to 30 days" },
  { id: "31_to_90", label: "31 to 90 days" },
  { id: "over_90", label: "More than 90 days" },
  { id: "not_sure", label: "Not sure yet" },
];
