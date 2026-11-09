import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authError } from "./auth";
import {
  NOTIFICATION_TYPES,
  dedupeKeys,
} from "../../lib/constants/notifications";
import { formatMoney } from "../../lib/helpers/pricing";
import {
  computePartnerPricing,
  normalisePartnerRuleValue,
  type PartnerPriceBreakdown,
  type PartnerPricingRule,
} from "../../lib/helpers/partner-pricing";
import {
  MAX_MARKUP_PERCENT,
  type PartnerStatus,
} from "../../lib/constants/partners";

/* ============================================================================
 * Partner plumbing shared by `partners.ts`, `partnerPricing.ts` and
 * `partnerBookings.ts`.
 *
 * The rule that governs this whole module: **a price never arrives as an
 * argument.** `resolvePartnerQuote` reads the catalogue row and the stored
 * pricing rule and does the arithmetic itself, exactly as `pricingForProduct`
 * does for a direct booking. A partner UI showing ₹5,800 is showing what this
 * function returned; it is not telling the server anything.
 * ========================================================================== */

export type AnyCtx = QueryCtx | MutationCtx;

/* -------------------------------------------------------------------------- */
/*                                  lookups                                   */
/* -------------------------------------------------------------------------- */

export async function loadPartner(
  ctx: AnyCtx,
  partnerId: Id<"partners">,
): Promise<Doc<"partners">> {
  const partner = await ctx.db.get(partnerId);
  if (!partner || partner.isDeleted) {
    authError("NOT_FOUND", "That partner no longer exists.");
  }
  return partner;
}

/**
 * Allocate the next free partner code.
 *
 * Backed by the same `counters` table the application references use, so the
 * numbering survives restarts and is never reused. The uniqueness loop covers
 * codes that arrived by import rather than through this function.
 */
export async function nextPartnerCode(ctx: MutationCtx): Promise<string> {
  const counterName = "partner";

  const existing = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", counterName))
    .unique();

  let next = existing ? existing.value + 1 : 1;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = `VDP-${String(next).padStart(4, "0")}`;
    const clash = await ctx.db
      .query("partners")
      .withIndex("by_partnerCode", (q) => q.eq("partnerCode", code))
      .unique();

    if (!clash) {
      if (existing) await ctx.db.patch(existing._id, { value: next });
      else await ctx.db.insert("counters", { name: counterName, value: next });
      return code;
    }
    next += 1;
  }

  throw new ConvexError({
    code: "CONFLICT",
    message: "Could not allocate a partner code.",
  });
}

/* -------------------------------------------------------------------------- */
/*                                  pricing                                   */
/* -------------------------------------------------------------------------- */

/**
 * The pricing rule in force for one partner and one product.
 *
 * Resolution order, narrowest first:
 *   1. an active `partnerPricing` row for this exact product;
 *   2. the partner's `defaultMarkupPercent`, when it is non-zero;
 *   3. nothing — the partner trades at the catalogue price.
 */
export async function resolvePartnerRule(
  ctx: AnyCtx,
  partner: Doc<"partners">,
  visaProductId: Id<"visaProducts">,
): Promise<{ rule: PartnerPricingRule | null; source: "product" | "default" | "base" }> {
  const row = await ctx.db
    .query("partnerPricing")
    .withIndex("by_partner_product", (q) =>
      q.eq("partnerId", partner._id).eq("visaProductId", visaProductId),
    )
    .unique();

  if (row && row.isActive) {
    return {
      rule: { mode: row.mode, value: row.value },
      source: "product",
    };
  }

  const fallback = Math.min(
    Math.max(partner.defaultMarkupPercent ?? 0, 0),
    MAX_MARKUP_PERCENT,
  );

  if (fallback > 0) {
    return {
      rule: { mode: "markup_percent", value: fallback },
      source: "default",
    };
  }

  return { rule: null, source: "base" };
}

export interface PartnerQuote extends PartnerPriceBreakdown {
  source: "product" | "default" | "base";
  ruleValue: number | undefined;
}

/**
 * The authoritative quote. Every partner-facing price — the catalogue screen,
 * the booking wizard's summary rail and the figure frozen onto the
 * application — comes out of here.
 */
export async function resolvePartnerQuote(
  ctx: AnyCtx,
  partner: Doc<"partners">,
  product: Doc<"visaProducts">,
  travellerCount: number,
  now: number = Date.now(),
): Promise<PartnerQuote> {
  const { rule, source } = await resolvePartnerRule(ctx, partner, product._id);
  const quote = computePartnerPricing(product, travellerCount, rule, now);

  return {
    ...quote,
    source,
    ruleValue: rule
      ? normalisePartnerRuleValue(rule.mode, rule.value)
      : undefined,
  };
}

/** The snapshot written onto `applications.partnerMargin`. */
export function marginSnapshot(quote: PartnerQuote): {
  currency: string;
  basePrice: number;
  partnerPrice: number;
  marginAmount: number;
  marginPercent: number;
  mode: "base" | "markup_percent" | "markup_amount" | "fixed_price";
  ruleValue?: number;
} {
  return {
    currency: quote.currency,
    basePrice: quote.basePrice,
    partnerPrice: quote.partnerPrice,
    marginAmount: quote.marginAmount,
    marginPercent: quote.marginPercent,
    mode: quote.mode,
    ruleValue: quote.ruleValue,
  };
}

/* -------------------------------------------------------------------------- */
/*                                  counters                                  */
/* -------------------------------------------------------------------------- */

/**
 * Recompute a partner's denormalised totals from their bookings.
 *
 * Called after anything that could move them. Bounded by `take`: a partner
 * with more than this many bookings gets a figure derived from their most
 * recent ones, which is a reporting limit the admin screen states rather than
 * an unbounded scan on a page load.
 */
export const PARTNER_ROLLUP_LIMIT = 2000;

export async function recountPartner(
  ctx: MutationCtx,
  partnerId: Id<"partners">,
): Promise<void> {
  const partner = await ctx.db.get(partnerId);
  if (!partner) return;

  const [bookings, customers] = await Promise.all([
    ctx.db
      .query("applications")
      .withIndex("by_partnerId", (q) => q.eq("partnerId", partnerId))
      .take(PARTNER_ROLLUP_LIMIT),
    ctx.db
      .query("partnerCustomers")
      .withIndex("by_partnerId", (q) => q.eq("partnerId", partnerId))
      .take(PARTNER_ROLLUP_LIMIT),
  ]);

  // Drafts are not business yet — they are a half-filled form. Volume and
  // margin only count bookings that were actually placed.
  const placed = bookings.filter((b) => !b.isDraft && b.status !== "cancelled");

  const grossVolume = placed.reduce(
    (sum, b) => sum + (b.partnerMargin?.partnerPrice ?? b.pricing.total),
    0,
  );
  const grossMargin = placed.reduce(
    (sum, b) => sum + (b.partnerMargin?.marginAmount ?? 0),
    0,
  );
  const lastBookingAt = placed.reduce(
    (latest, b) => Math.max(latest, b.submittedAt ?? b.createdAt),
    0,
  );

  await ctx.db.patch(partnerId, {
    bookingCount: placed.length,
    customerCount: customers.filter((c) => !c.isArchived).length,
    grossVolume,
    grossMargin,
    lastBookingAt: lastBookingAt > 0 ? lastBookingAt : undefined,
    updatedAt: Date.now(),
  });
}

/* -------------------------------------------------------------------------- */
/*                          partner-facing notifications                      */
/* -------------------------------------------------------------------------- */

/**
 * Bookkeeping and the agent's confirmation, run by `applications.submit` once
 * a partner booking is actually placed.
 *
 * Lives in the lib layer rather than in `partnerBookings.ts` so that
 * `applications.ts` and `documentRequests.ts` can reach it without the three
 * function modules importing each other in a ring.
 *
 * A no-op on a direct booking: `partnerId` is unset, and the first line
 * returns.
 */
export async function onPartnerBookingSubmitted(
  ctx: MutationCtx,
  application: Doc<"applications">,
): Promise<void> {
  if (!application.partnerId) return;

  const partner = await ctx.db.get(application.partnerId);
  if (!partner) return;

  // `.take(2)`, not `.unique()`: a duplicate row must not fail the submission.
  const customerRows = await ctx.db
    .query("partnerCustomers")
    .withIndex("by_partner_user", (q) =>
      q.eq("partnerId", partner._id).eq("userId", application.userId),
    )
    .take(2);
  const customerRow =
    customerRows.find((r) => !r.isArchived) ?? customerRows[0] ?? null;

  const now = Date.now();

  if (customerRow) {
    await ctx.db.patch(customerRow._id, {
      bookingCount: customerRow.bookingCount + 1,
      lastBookingAt: now,
      updatedAt: now,
    });
  }

  await recountPartner(ctx, partner._id);

  const total =
    application.partnerMargin?.partnerPrice ?? application.pricing.total;
  const marginAmount = application.partnerMargin?.marginAmount ?? 0;
  const currency = application.pricing.currency;

  await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
    userId: partner.userId,
    type: NOTIFICATION_TYPES.PARTNER_BOOKING_CREATED,
    title: `Booking ${application.referenceId} placed`,
    body: `${application.customerName} — ${application.visaProductName} (${application.destinationName}). Value ${formatMoney(
      total,
      currency,
    )}, your margin ${formatMoney(marginAmount, currency)}.`,
    link: `/partner/bookings/${application._id}`,
    dedupeKey: dedupeKeys.partnerBookingCreated(application._id),
    applicationId: application._id,
    emailData: {
      recipientName: partner.contactPersonName,
      contactPersonName: partner.contactPersonName,
      agencyName: partner.agencyName,
      referenceId: application.referenceId,
      endCustomerName: application.customerName,
      customerName: application.customerName,
      destinationName: application.destinationName,
      visaProductName: application.visaProductName,
      amount: total,
      currency,
      marginFormatted: formatMoney(marginAmount, currency),
      partnerUrl: `/partner/bookings/${application._id}`,
    },
  });
}

/**
 * Tell a partner about something that happened to one of their bookings.
 *
 * The end customer gets their own notification from the existing B2C paths;
 * this is the agent's copy, keyed `partner:…` so `dispatch`'s dedupe gate
 * cannot make the two cancel each other out — both people have to be told.
 */
export async function notifyPartnerOfApplicationEvent(
  ctx: MutationCtx,
  application: Doc<"applications">,
  input: {
    type: string;
    title: string;
    body: string;
    dedupeKey: string;
    documentLabels?: string[];
    statusLabel?: string;
    reason?: string;
  },
): Promise<void> {
  if (!application.partnerId) return;

  const partner = await ctx.db.get(application.partnerId);
  if (!partner || partner.isDeleted) return;

  await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
    userId: partner.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    link: `/partner/bookings/${application._id}`,
    dedupeKey: input.dedupeKey,
    applicationId: application._id,
    emailData: {
      recipientName: partner.contactPersonName,
      contactPersonName: partner.contactPersonName,
      agencyName: partner.agencyName,
      referenceId: application.referenceId,
      endCustomerName: application.customerName,
      customerName: application.customerName,
      destinationName: application.destinationName,
      visaProductName: application.visaProductName,
      partnerUrl: `/partner/bookings/${application._id}`,
      documentLabels: input.documentLabels,
      statusLabel: input.statusLabel,
      statusNote: input.reason,
      reason: input.reason,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                                   shaping                                  */
/* -------------------------------------------------------------------------- */

/**
 * The partner row as the partner themselves may see it.
 *
 * `internalNote` and `reviewedBy` are the office's working notes about this
 * business and never cross back to them — the same rule `messages` applies to
 * internal notes on a conversation.
 */
export function publicPartnerView(partner: Doc<"partners">) {
  return {
    _id: partner._id,
    partnerCode: partner.partnerCode,
    agencyName: partner.agencyName,
    businessType: partner.businessType,
    gstNumber: partner.gstNumber,
    panNumber: partner.panNumber,
    website: partner.website,
    addressLine1: partner.addressLine1,
    addressLine2: partner.addressLine2,
    city: partner.city,
    state: partner.state,
    postalCode: partner.postalCode,
    country: partner.country,
    contactPersonName: partner.contactPersonName,
    contactEmail: partner.contactEmail,
    contactPhone: partner.contactPhone,
    alternatePhone: partner.alternatePhone,
    status: partner.status as PartnerStatus,
    statusReason: partner.statusReason,
    approvedAt: partner.approvedAt,
    defaultMarkupPercent: partner.defaultMarkupPercent,
    bookingCount: partner.bookingCount,
    customerCount: partner.customerCount,
    grossVolume: partner.grossVolume,
    grossMargin: partner.grossMargin,
    lastBookingAt: partner.lastBookingAt,
    createdAt: partner.createdAt,
  };
}

/* -------------------------------------------------------------------------- */
/*                                 validation                                 */
/* -------------------------------------------------------------------------- */

export function cleanText(value: string | undefined, max = 200): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function requireText(
  value: string,
  field: string,
  { min = 1, max = 200 }: { min?: number; max?: number } = {},
): string {
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new ConvexError({
      code: "VALIDATION",
      message: `${field} is required.`,
      field,
    });
  }
  return trimmed.slice(0, max);
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Loose GSTIN shape check. Formatting only — we do not claim to verify it. */
export function looksLikeGstin(value: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
    value.trim().toUpperCase(),
  );
}
