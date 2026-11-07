import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { partnerPricingMode } from "./schema";
import { requirePartner, requirePermission } from "./lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "./lib/audit";
import {
  loadPartner,
  marginSnapshot,
  resolvePartnerQuote,
  resolvePartnerRule,
  cleanText,
} from "./lib/partners";
import { PERMISSIONS } from "../lib/constants/roles";
import {
  MAX_MARKUP_AMOUNT,
  MAX_MARKUP_PERCENT,
  PARTNER_PRICING_MODE_LABELS,
  type PartnerPricingMode,
} from "../lib/constants/partners";
import { NOTIFICATION_TYPES, dedupeKeys } from "../lib/constants/notifications";
import {
  computePartnerPricing,
  normalisePartnerRuleValue,
} from "../lib/helpers/partner-pricing";
import { formatMoney } from "../lib/helpers/pricing";

/* ============================================================================
 * Partner pricing.
 *
 * One rule per (partner, visa product). A rule is a *recipe* — "add 12%",
 * "add ₹800 a head", "charge exactly ₹5,800 a head" — never a stored total,
 * so a catalogue fee change flows through to every partner immediately
 * instead of leaving a table of stale numbers behind it.
 *
 * Admins write these. Partners read them, and read them only for themselves:
 * `myCatalogue` resolves against `requirePartner(ctx)` and never takes a
 * partner id from an argument, which is what makes cross-partner price
 * snooping impossible rather than merely unlikely.
 * ========================================================================== */

/** The catalogue read cap for a pricing screen. */
const PRODUCT_LIMIT = 500;

function validateRule(mode: PartnerPricingMode, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new ConvexError({
      code: "VALIDATION",
      message: "Enter a positive number.",
      field: "value",
    });
  }

  if (mode === "markup_percent" && value > MAX_MARKUP_PERCENT) {
    throw new ConvexError({
      code: "VALIDATION",
      message: `A markup cannot exceed ${MAX_MARKUP_PERCENT}%.`,
      field: "value",
    });
  }

  if (mode !== "markup_percent" && value > MAX_MARKUP_AMOUNT) {
    throw new ConvexError({
      code: "VALIDATION",
      message: `That is above the ${formatMoney(MAX_MARKUP_AMOUNT)} per-traveller ceiling.`,
      field: "value",
    });
  }

  return normalisePartnerRuleValue(mode, value);
}

/* -------------------------------------------------------------------------- */
/*                                 admin side                                 */
/* -------------------------------------------------------------------------- */

/**
 * The margin table on a partner's "Pricing & Margins" tab.
 *
 * Every published product, each with its base price, the rule in force and
 * the resulting partner price and margin — all recomputed here rather than
 * read from anywhere, so the number an admin is looking at is the number a
 * booking would use this second.
 */
export const listForPartner = query({
  args: {
    partnerId: v.id("partners"),
    destinationId: v.optional(v.id("destinations")),
    configuredOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PARTNER_VIEW);
    const partner = await loadPartner(ctx, args.partnerId);

    const products = args.destinationId
      ? await ctx.db
          .query("visaProducts")
          .withIndex("by_destination_published", (q) =>
            q.eq("destinationId", args.destinationId!).eq("isPublished", true),
          )
          .take(PRODUCT_LIMIT)
      : await ctx.db
          .query("visaProducts")
          .withIndex("by_isPublished", (q) => q.eq("isPublished", true))
          .take(PRODUCT_LIMIT);

    const rules = await ctx.db
      .query("partnerPricing")
      .withIndex("by_partnerId", (q) => q.eq("partnerId", partner._id))
      .collect();

    const ruleByProduct = new Map(
      rules.map((r) => [r.visaProductId as Id<"visaProducts">, r]),
    );

    const destinationIds = [...new Set(products.map((p) => p.destinationId))];
    const destinations = await Promise.all(
      destinationIds.map((id) => ctx.db.get(id)),
    );
    const destinationName = new Map(
      destinations
        .filter((d): d is Doc<"destinations"> => d !== null)
        .map((d) => [d._id as Id<"destinations">, d.name]),
    );

    const now = Date.now();

    const rows = products
      .map((product) => {
        const row = ruleByProduct.get(product._id);
        const active = row && row.isActive ? row : null;

        const rule = active
          ? { mode: active.mode as PartnerPricingMode, value: active.value }
          : partner.defaultMarkupPercent > 0
            ? {
                mode: "markup_percent" as PartnerPricingMode,
                value: partner.defaultMarkupPercent,
              }
            : null;

        const quote = computePartnerPricing(product, 1, rule, now);

        return {
          visaProductId: product._id,
          destinationId: product.destinationId,
          destinationName: destinationName.get(product.destinationId) ?? "—",
          productName: product.name,
          visaType: product.visaType,
          category: product.category,
          currency: product.currency,
          isDemoContent: product.isDemoContent,
          rule: active
            ? {
                _id: active._id,
                mode: active.mode,
                value: active.value,
                note: active.note,
                updatedAt: active.updatedAt,
              }
            : null,
          source: active
            ? ("product" as const)
            : partner.defaultMarkupPercent > 0
              ? ("default" as const)
              : ("base" as const),
          basePrice: quote.basePrice,
          partnerPrice: quote.partnerPrice,
          marginAmount: quote.marginAmount,
          marginPercent: quote.marginPercent,
        };
      })
      .filter((row) => (args.configuredOnly ? row.rule !== null : true))
      .sort(
        (a, b) =>
          a.destinationName.localeCompare(b.destinationName) ||
          a.productName.localeCompare(b.productName),
      );

    return {
      partnerId: partner._id,
      defaultMarkupPercent: partner.defaultMarkupPercent,
      rows,
      truncated: products.length >= PRODUCT_LIMIT,
    };
  },
});

export const setRule = mutation({
  args: {
    partnerId: v.id("partners"),
    visaProductId: v.id("visaProducts"),
    mode: partnerPricingMode,
    value: v.number(),
    note: v.optional(v.string()),
  },
  returns: v.object({
    basePrice: v.number(),
    partnerPrice: v.number(),
    marginAmount: v.number(),
    marginPercent: v.number(),
    currency: v.string(),
  }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.PARTNER_PRICING);
    const partner = await loadPartner(ctx, args.partnerId);

    const product = await ctx.db.get(args.visaProductId);
    if (!product) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "That visa service no longer exists.",
      });
    }

    const mode = args.mode as PartnerPricingMode;
    const value = validateRule(mode, args.value);

    // A fixed price below the government fee would have VisaDrive paying for
    // the privilege of the booking. Refuse it at the source rather than
    // discovering it in a month's reconciliation.
    if (mode === "fixed_price" && value < product.governmentFee) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `A fixed partner price cannot be below the ${formatMoney(
          product.governmentFee,
          product.currency,
        )} government fee for this service.`,
        field: "value",
      });
    }

    const now = Date.now();

    const existing = await ctx.db
      .query("partnerPricing")
      .withIndex("by_partner_product", (q) =>
        q.eq("partnerId", partner._id).eq("visaProductId", product._id),
      )
      .unique();

    const before = existing
      ? { mode: existing.mode, value: existing.value, isActive: existing.isActive }
      : null;

    if (existing) {
      await ctx.db.patch(existing._id, {
        mode,
        value,
        isActive: true,
        note: cleanText(args.note, 500),
        setBy: staff.user._id,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("partnerPricing", {
        partnerId: partner._id,
        visaProductId: product._id,
        destinationId: product.destinationId,
        mode,
        value,
        isActive: true,
        note: cleanText(args.note, 500),
        setBy: staff.user._id,
        createdAt: now,
        updatedAt: now,
      });
    }

    const quote = computePartnerPricing(product, 1, { mode, value }, now);

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.PARTNER_PRICING_SET,
      entityType: "partner",
      entityId: partner._id,
      summary: `${staff.user.fullName} set ${partner.agencyName}'s price for ${product.name}: ${
        PARTNER_PRICING_MODE_LABELS[mode]
      } ${mode === "markup_percent" ? `${value}%` : formatMoney(value, product.currency)} (${formatMoney(
        quote.partnerPrice,
        product.currency,
      )} per traveller, margin ${formatMoney(quote.marginAmount, product.currency)})`,
      before,
      after: { mode, value, isActive: true },
    });

    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      userId: partner.userId,
      type: NOTIFICATION_TYPES.PARTNER_PRICING_UPDATED,
      title: "Your partner pricing has changed",
      body: `The rate for ${product.name} has been updated. Your current prices are on the pricing page.`,
      link: "/partner/pricing",
      dedupeKey: dedupeKeys.partnerPricingUpdated(
        partner._id,
        `${product._id}:${now}`,
      ),
    });

    return {
      basePrice: quote.basePrice,
      partnerPrice: quote.partnerPrice,
      marginAmount: quote.marginAmount,
      marginPercent: quote.marginPercent,
      currency: quote.currency,
    };
  },
});

/**
 * Drop a product-specific rule, so the partner falls back to their default
 * markup. The row is deactivated rather than deleted, which keeps "what was
 * this partner paying in March?" answerable.
 */
export const clearRule = mutation({
  args: { partnerId: v.id("partners"), visaProductId: v.id("visaProducts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.PARTNER_PRICING);
    const partner = await loadPartner(ctx, args.partnerId);

    const existing = await ctx.db
      .query("partnerPricing")
      .withIndex("by_partner_product", (q) =>
        q.eq("partnerId", partner._id).eq("visaProductId", args.visaProductId),
      )
      .unique();

    if (!existing || !existing.isActive) return null;

    await ctx.db.patch(existing._id, {
      isActive: false,
      setBy: staff.user._id,
      updatedAt: Date.now(),
    });

    const product = await ctx.db.get(args.visaProductId);

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.PARTNER_PRICING_CLEARED,
      entityType: "partner",
      entityId: partner._id,
      summary: `${staff.user.fullName} removed ${partner.agencyName}'s special price for ${
        product?.name ?? "a visa service"
      }`,
      before: { mode: existing.mode, value: existing.value, isActive: true },
      after: { isActive: false },
    });

    return null;
  },
});

/**
 * Apply one rule to every published product of a destination in a single act.
 *
 * Bounded by `PRODUCT_LIMIT`, audited once with the count rather than once per
 * product, and it refuses a fixed price — "charge ₹5,800 for everything in
 * Schengen" is almost always a mistake, and the per-product form is right
 * there for the cases where it is not.
 */
export const bulkSetForDestination = mutation({
  args: {
    partnerId: v.id("partners"),
    destinationId: v.id("destinations"),
    mode: v.union(v.literal("markup_percent"), v.literal("markup_amount")),
    value: v.number(),
  },
  returns: v.object({ updated: v.number() }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.PARTNER_PRICING);
    const partner = await loadPartner(ctx, args.partnerId);

    const mode = args.mode as PartnerPricingMode;
    const value = validateRule(mode, args.value);
    const now = Date.now();

    const [destination, products] = await Promise.all([
      ctx.db.get(args.destinationId),
      ctx.db
        .query("visaProducts")
        .withIndex("by_destination_published", (q) =>
          q.eq("destinationId", args.destinationId).eq("isPublished", true),
        )
        .take(PRODUCT_LIMIT),
    ]);

    let updated = 0;

    for (const product of products) {
      const existing = await ctx.db
        .query("partnerPricing")
        .withIndex("by_partner_product", (q) =>
          q.eq("partnerId", partner._id).eq("visaProductId", product._id),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          mode,
          value,
          isActive: true,
          setBy: staff.user._id,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("partnerPricing", {
          partnerId: partner._id,
          visaProductId: product._id,
          destinationId: product.destinationId,
          mode,
          value,
          isActive: true,
          setBy: staff.user._id,
          createdAt: now,
          updatedAt: now,
        });
      }
      updated += 1;
    }

    if (updated > 0) {
      await recordAudit(ctx, {
        actor: staff.user,
        action: AUDIT_ACTIONS.PARTNER_PRICING_SET,
        entityType: "partner",
        entityId: partner._id,
        summary: `${staff.user.fullName} applied ${
          mode === "markup_percent" ? `${value}%` : formatMoney(value)
        } to all ${updated} ${destination?.name ?? "destination"} services for ${partner.agencyName}`,
        after: { destinationId: args.destinationId, mode, value, updated },
      });

      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        userId: partner.userId,
        type: NOTIFICATION_TYPES.PARTNER_PRICING_UPDATED,
        title: "Your partner pricing has changed",
        body: `Rates for ${destination?.name ?? "a destination"} have been updated on your account.`,
        link: "/partner/pricing",
        dedupeKey: dedupeKeys.partnerPricingUpdated(
          partner._id,
          `${args.destinationId}:${now}`,
        ),
      });
    }

    return { updated };
  },
});

/* -------------------------------------------------------------------------- */
/*                                partner side                                */
/* -------------------------------------------------------------------------- */

/**
 * What this partner may sell, and at what price.
 *
 * Read-only by construction: there is no mutation on this file a partner can
 * reach, and the partner id comes from `requirePartner(ctx)` rather than from
 * an argument, so one agency cannot ask for another's rates.
 */
export const myCatalogue = query({
  args: {
    destinationId: v.optional(v.id("destinations")),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { partner } = await requirePartner(ctx);

    const products = args.destinationId
      ? await ctx.db
          .query("visaProducts")
          .withIndex("by_destination_published", (q) =>
            q.eq("destinationId", args.destinationId!).eq("isPublished", true),
          )
          .take(PRODUCT_LIMIT)
      : await ctx.db
          .query("visaProducts")
          .withIndex("by_isPublished", (q) => q.eq("isPublished", true))
          .take(PRODUCT_LIMIT);

    const destinationIds = [...new Set(products.map((p) => p.destinationId))];
    const destinations = await Promise.all(
      destinationIds.map((id) => ctx.db.get(id)),
    );
    const destinationById = new Map(
      destinations
        .filter((d): d is Doc<"destinations"> => d !== null)
        .map((d) => [d._id as Id<"destinations">, d]),
    );

    const term = args.search?.trim().toLowerCase();
    const now = Date.now();

    const rows = await Promise.all(
      products.map(async (product) => {
        const { rule, source } = await resolvePartnerRule(
          ctx,
          partner,
          product._id,
        );
        const quote = computePartnerPricing(product, 1, rule, now);
        const destination = destinationById.get(product.destinationId);

        return {
          visaProductId: product._id,
          destinationId: product.destinationId,
          destinationName: destination?.name ?? "—",
          destinationSlug: product.destinationSlug,
          flagEmoji: destination?.flagEmoji ?? "",
          productName: product.name,
          visaType: product.visaType,
          category: product.category,
          entryType: product.entryType,
          processingTimeMinDays: product.processingTimeMinDays,
          processingTimeMaxDays: product.processingTimeMaxDays,
          processingTimeNote: product.processingTimeNote,
          paymentMode: product.paymentMode,
          isDemoContent: product.isDemoContent,
          currency: product.currency,
          basePrice: quote.basePrice,
          partnerPrice: quote.partnerPrice,
          marginAmount: quote.marginAmount,
          marginPercent: quote.marginPercent,
          source,
        };
      }),
    );

    const filtered = term
      ? rows.filter(
          (r) =>
            r.productName.toLowerCase().includes(term) ||
            r.destinationName.toLowerCase().includes(term) ||
            r.visaType.toLowerCase().includes(term),
        )
      : rows;

    return {
      rows: filtered.sort(
        (a, b) =>
          a.destinationName.localeCompare(b.destinationName) ||
          a.productName.localeCompare(b.productName),
      ),
      destinations: destinations
        .filter((d): d is Doc<"destinations"> => d !== null)
        .map((d) => ({ _id: d._id, name: d.name, flagEmoji: d.flagEmoji }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      defaultMarkupPercent: partner.defaultMarkupPercent,
      truncated: products.length >= PRODUCT_LIMIT,
    };
  },
});

/** One product's full detail for the partner booking wizard. */
export const myProduct = query({
  args: {
    visaProductId: v.id("visaProducts"),
    travellerCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { partner } = await requirePartner(ctx);

    const product = await ctx.db.get(args.visaProductId);
    if (!product || !product.isPublished) return null;

    const [destination, requirements] = await Promise.all([
      ctx.db.get(product.destinationId),
      ctx.db
        .query("visaRequirements")
        .withIndex("by_product_order", (q) => q.eq("visaProductId", product._id))
        .collect(),
    ]);

    const travellers = Math.max(
      1,
      Math.min(Math.floor(args.travellerCount ?? 1), 20),
    );
    const quote = await resolvePartnerQuote(ctx, partner, product, travellers);

    return {
      product,
      destination,
      requirements,
      quote: {
        travellerCount: travellers,
        ...marginSnapshot(quote),
        breakdown: quote.breakdown,
        source: quote.source,
      },
    };
  },
});
