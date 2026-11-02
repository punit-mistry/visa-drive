/**
 * Pricing maths.
 *
 * Money is handled in the smallest currency unit (paise for INR) as integers
 * everywhere — in Convex, in Razorpay calls and on screen. Floats are only
 * introduced at the final formatting step.
 *
 * This module is imported by both the Convex backend and the client so the
 * checkout total a customer sees is computed by the exact same code that the
 * server later verifies.
 */

export interface PriceInput {
  currency: string;
  governmentFee: number;
  serviceFee: number;
  additionalCharges: number;
  taxPercent: number;
  travellerCount: number;
  discountAmount?: number;
  discountCode?: string;
  /** When set, replaces (governmentFee + serviceFee) per traveller. */
  promoPrice?: number;
  promoEndsAt?: number;
  now?: number;
}

export interface PriceBreakdown {
  currency: string;
  governmentFee: number;
  serviceFee: number;
  additionalCharges: number;
  taxPercent: number;
  taxAmount: number;
  discountAmount: number;
  discountCode?: string;
  travellerCount: number;
  subtotal: number;
  total: number;
}

/**
 * Per-traveller fees are multiplied by the traveller count; additional
 * charges are treated as a per-booking amount. Tax applies to the discounted
 * subtotal, which is the convention Indian invoices use.
 */
export function computePricing(input: PriceInput): PriceBreakdown {
  const travellers = Math.max(1, Math.floor(input.travellerCount || 1));
  const now = input.now ?? Date.now();

  const promoActive =
    typeof input.promoPrice === "number" &&
    input.promoPrice >= 0 &&
    (input.promoEndsAt === undefined || input.promoEndsAt > now);

  // A promo price replaces the combined per-traveller fee. We keep the
  // government fee intact and absorb the discount into the service fee so the
  // breakdown still shows what is a statutory fee and what is ours.
  let governmentFee = Math.max(0, Math.round(input.governmentFee));
  let serviceFee = Math.max(0, Math.round(input.serviceFee));

  if (promoActive) {
    const promo = Math.round(input.promoPrice!);
    if (promo <= governmentFee) {
      governmentFee = promo;
      serviceFee = 0;
    } else {
      serviceFee = promo - governmentFee;
    }
  }

  const perTraveller = governmentFee + serviceFee;
  const additionalCharges = Math.max(0, Math.round(input.additionalCharges || 0));

  const gross = perTraveller * travellers + additionalCharges;
  const discountAmount = clamp(Math.round(input.discountAmount || 0), 0, gross);
  const subtotal = gross - discountAmount;

  const taxPercent = Math.max(0, input.taxPercent || 0);
  const taxAmount = Math.round((subtotal * taxPercent) / 100);
  const total = subtotal + taxAmount;

  return {
    currency: input.currency,
    governmentFee: governmentFee * travellers,
    serviceFee: serviceFee * travellers,
    additionalCharges,
    taxPercent,
    taxAmount,
    discountAmount,
    discountCode: discountAmount > 0 ? input.discountCode : undefined,
    travellerCount: travellers,
    subtotal,
    total,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Lowest advertised price for a destination card ("from ₹X"). */
export function startingPrice(
  products: Array<{
    governmentFee: number;
    serviceFee: number;
    promoPrice?: number;
    promoEndsAt?: number;
    isPublished: boolean;
  }>,
  now = Date.now(),
): number | null {
  const prices = products
    .filter((p) => p.isPublished)
    .map((p) => {
      const promoActive =
        typeof p.promoPrice === "number" &&
        (p.promoEndsAt === undefined || p.promoEndsAt > now);
      return promoActive ? p.promoPrice! : p.governmentFee + p.serviceFee;
    })
    .filter((n) => Number.isFinite(n) && n >= 0);

  if (prices.length === 0) return null;
  return Math.min(...prices);
}

/* ------------------------------ formatting ------------------------------- */

/** Format a smallest-unit integer as currency. `12345` → `₹123.45`. */
export function formatMoney(
  minorUnits: number,
  currency = "INR",
  locale = "en-IN",
  options: { compact?: boolean; hideDecimals?: boolean } = {},
): string {
  const major = minorUnits / 100;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: options.compact ? "compact" : "standard",
    maximumFractionDigits:
      options.hideDecimals || Number.isInteger(major) ? 0 : 2,
    minimumFractionDigits: options.hideDecimals || Number.isInteger(major) ? 0 : 2,
  }).format(major);
}

/** Parse a user-entered major-unit amount into minor units. `"1,234.5"` → `123450`. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** "3–5 working days" / "About 5 working days" / null when unknown. */
export function formatProcessingTime(
  minDays?: number | null,
  maxDays?: number | null,
  note?: string | null,
): string | null {
  if (note) return note;
  if (minDays == null && maxDays == null) return null;
  if (minDays != null && maxDays != null) {
    if (minDays === maxDays) {
      return `About ${minDays} working ${minDays === 1 ? "day" : "days"}`;
    }
    return `${minDays}–${maxDays} working days`;
  }
  const single = minDays ?? maxDays!;
  return `About ${single} working ${single === 1 ? "day" : "days"}`;
}
