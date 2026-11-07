/**
 * Partner pricing maths.
 *
 * The contract, in one paragraph:
 *
 *   The catalogue price is what VisaDrive charges the **partner** — the base.
 *   A partner-specific rule (set by an admin, never by the partner) lifts that
 *   to the **partner price**, which is what the partner's own customer pays on
 *   the booking. The difference is the partner's **margin**.
 *
 * As with `lib/helpers/pricing.ts`, this module is imported by both Convex and
 * the client so the figure a partner sees on screen is produced by the exact
 * same code the server uses when it writes the booking. The client's copy is
 * for display only: `convex/lib/partners.ts` recomputes from the catalogue row
 * and the stored rule on every write, and never reads a price from an
 * argument.
 *
 * Money is an integer in the smallest currency unit (paise) throughout.
 */

import { computePricing, type PriceBreakdown } from "./pricing";
import {
  MAX_MARKUP_AMOUNT,
  MAX_MARKUP_PERCENT,
  type PartnerPricingMode,
} from "../constants/partners";

/** The catalogue fields the maths needs. Any `visaProducts` row satisfies it. */
export interface PartnerPricingProduct {
  currency: string;
  governmentFee: number;
  serviceFee: number;
  additionalCharges: number;
  taxPercent: number;
  promoPrice?: number;
  promoEndsAt?: number;
}

/** A configured rule, or `null` when the partner trades at the base price. */
export interface PartnerPricingRule {
  mode: PartnerPricingMode;
  /** Percent for `markup_percent`; paise per traveller for the other two. */
  value: number;
}

export interface PartnerPriceBreakdown {
  /** What VisaDrive charges the partner for this booking, all-in. */
  basePrice: number;
  /** What the partner's customer pays, all-in. This is the booking total. */
  partnerPrice: number;
  /** `partnerPrice - basePrice`. Zero when no rule applies. */
  marginAmount: number;
  /** Margin as a percentage of the base. `0` when the base is zero. */
  marginPercent: number;
  currency: string;
  travellerCount: number;
  /** The pre-tax uplift per traveller the rule produced. */
  markupPerTraveller: number;
  /** The breakdown that is frozen onto the application as `pricing`. */
  breakdown: PriceBreakdown;
  /** The base breakdown, kept for the margin report and the admin view. */
  baseBreakdown: PriceBreakdown;
  /** Which rule produced this, for the UI to label it honestly. */
  mode: PartnerPricingMode | "base";
}

/**
 * Clamp a rule's value into the range the admin UI offers. A stored rule that
 * predates a tightened limit is brought inside it here rather than trusted.
 */
export function normalisePartnerRuleValue(
  mode: PartnerPricingMode,
  value: number,
): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (mode === "markup_percent") {
    return Math.min(Math.round(value * 100) / 100, MAX_MARKUP_PERCENT);
  }
  return Math.min(Math.round(value), MAX_MARKUP_AMOUNT);
}

/**
 * The per-traveller fee the catalogue charges, after any live promo.
 * Mirrors the promo handling in `computePricing` so the two never disagree.
 */
function basePerTraveller(
  product: PartnerPricingProduct,
  now: number,
): number {
  const promoActive =
    typeof product.promoPrice === "number" &&
    product.promoPrice >= 0 &&
    (product.promoEndsAt === undefined || product.promoEndsAt > now);

  if (promoActive) return Math.max(0, Math.round(product.promoPrice!));
  return (
    Math.max(0, Math.round(product.governmentFee)) +
    Math.max(0, Math.round(product.serviceFee))
  );
}

/**
 * Resolve one partner's price for one product.
 *
 * `markup_*` rules add to `additionalCharges`, which is the pre-tax line the
 * breakdown already has for exactly this kind of uplift — so GST applies to
 * the markup, as it does to any service fee on an Indian invoice. That tax is
 * inside `marginAmount`, because `marginAmount` is defined as every rupee the
 * customer pays above the base: what the partner and VisaDrive settle between
 * them is a commercial matter, not an arithmetic one.
 *
 * `fixed_price` replaces the per-traveller fee, reusing the same promo channel
 * `computePricing` already understands, so the two code paths cannot drift.
 */
export function computePartnerPricing(
  product: PartnerPricingProduct,
  travellerCount: number,
  rule: PartnerPricingRule | null,
  now: number = Date.now(),
): PartnerPriceBreakdown {
  const travellers = Math.max(1, Math.floor(travellerCount || 1));

  const baseInput = {
    currency: product.currency,
    governmentFee: product.governmentFee,
    serviceFee: product.serviceFee,
    additionalCharges: product.additionalCharges,
    taxPercent: product.taxPercent,
    travellerCount: travellers,
    promoPrice: product.promoPrice,
    promoEndsAt: product.promoEndsAt,
    now,
  };

  const baseBreakdown = computePricing(baseInput);

  if (!rule) {
    return {
      basePrice: baseBreakdown.total,
      partnerPrice: baseBreakdown.total,
      marginAmount: 0,
      marginPercent: 0,
      currency: baseBreakdown.currency,
      travellerCount: travellers,
      markupPerTraveller: 0,
      breakdown: baseBreakdown,
      baseBreakdown,
      mode: "base",
    };
  }

  const value = normalisePartnerRuleValue(rule.mode, rule.value);
  const perTraveller = basePerTraveller(product, now);

  let partnerBreakdown: PriceBreakdown;
  let markupPerTraveller: number;

  if (rule.mode === "fixed_price") {
    markupPerTraveller = value - perTraveller;
    partnerBreakdown = computePricing({
      ...baseInput,
      // A fixed partner price replaces the per-traveller fee, exactly as a
      // promo price does — and with no end date, because the rule's own
      // lifetime is managed on the pricing row.
      promoPrice: value,
      promoEndsAt: undefined,
    });
  } else {
    markupPerTraveller =
      rule.mode === "markup_percent"
        ? Math.round((perTraveller * value) / 100)
        : value;

    partnerBreakdown = computePricing({
      ...baseInput,
      additionalCharges:
        Math.max(0, Math.round(product.additionalCharges || 0)) +
        markupPerTraveller * travellers,
    });
  }

  const marginAmount = partnerBreakdown.total - baseBreakdown.total;

  return {
    basePrice: baseBreakdown.total,
    partnerPrice: partnerBreakdown.total,
    marginAmount,
    marginPercent:
      baseBreakdown.total > 0
        ? Math.round((marginAmount / baseBreakdown.total) * 10_000) / 100
        : 0,
    currency: partnerBreakdown.currency,
    travellerCount: travellers,
    markupPerTraveller,
    breakdown: partnerBreakdown,
    baseBreakdown,
    mode: rule.mode,
  };
}

/**
 * A one-traveller quote, which is what the partner catalogue and the admin
 * margin table both show. Keeping it here stops two screens deriving "the
 * price" slightly differently.
 */
export function partnerUnitQuote(
  product: PartnerPricingProduct,
  rule: PartnerPricingRule | null,
  now: number = Date.now(),
): {
  basePrice: number;
  partnerPrice: number;
  marginAmount: number;
  marginPercent: number;
  currency: string;
} {
  const quote = computePartnerPricing(product, 1, rule, now);
  return {
    basePrice: quote.basePrice,
    partnerPrice: quote.partnerPrice,
    marginAmount: quote.marginAmount,
    marginPercent: quote.marginPercent,
    currency: quote.currency,
  };
}

/** `12.5%` / `—`. Used in both margin tables. */
export function formatMarginPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "—";
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}
