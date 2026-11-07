/**
 * The United States leads every destination list on the site.
 *
 * Deciding this here, rather than in each surface that reads a destination
 * query, keeps the marketing grid, the apply wizard, the admin catalogue and
 * the partner price list from disagreeing about which destination is first.
 */

export const LEAD_COUNTRY_CODE = "US";

type LeadableDestination = {
  countryCode?: string | null;
  slug?: string | null;
  name?: string | null;
  displayOrder?: number | null;
};

/**
 * Tolerant on purpose: the catalogue is edited by hand, and a destination
 * whose `countryCode` was typed as "USA" (or left blank on an older row)
 * still has to be recognised as the one that leads.
 */
export function isLeadDestination(destination: LeadableDestination): boolean {
  const code = destination.countryCode?.trim().toUpperCase();
  const slug = destination.slug?.trim().toLowerCase();

  return (
    code === LEAD_COUNTRY_CODE ||
    code === "USA" ||
    slug === "usa" ||
    slug === "us" ||
    destination.name?.toLowerCase().startsWith("united states") === true
  );
}

/** US first, then the admin's display order, then the name. */
export function compareDestinations(
  a: LeadableDestination,
  b: LeadableDestination,
): number {
  const lead = Number(isLeadDestination(b)) - Number(isLeadDestination(a));
  if (lead !== 0) return lead;

  const order = (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
  if (order !== 0) return order;

  return (a.name ?? "").localeCompare(b.name ?? "");
}
