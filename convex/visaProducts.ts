import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { entryType, paymentMode, visaCategory } from "./schema";
import { authError, callerHasPermission, requirePermission } from "./lib/auth";
import { AUDIT_ACTIONS, diffFields, recordAudit } from "./lib/audit";
import { compareDestinations } from "./lib/destinationOrder";
import { PERMISSIONS } from "../lib/constants/roles";

/* ============================================================================
 * Visa products - what a customer actually books.
 *
 * `destinationSlug` is denormalised onto every row so the public route
 * /destinations/<destinationSlug>/<slug> resolves with a single indexed read.
 * Every write path below keeps it in step with the parent destination.
 * ========================================================================== */

const CATALOGUE_LIMIT = 500;

type VisaCategory = Doc<"visaProducts">["category"];

/* -------------------------------------------------------------------------- */
/*                                   slugs                                    */
/* -------------------------------------------------------------------------- */

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Slugs only need to be unique within a destination, which is what the
 *  `by_slug` index (destinationSlug, slug) enforces. */
async function uniqueSlug(
  ctx: MutationCtx,
  destinationSlug: string,
  desired: string,
  ignoreId?: Id<"visaProducts">,
): Promise<string> {
  const base = slugify(desired) || "visa";

  for (let suffix = 1; suffix < 200; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const clash = await ctx.db
      .query("visaProducts")
      .withIndex("by_slug", (q) =>
        q.eq("destinationSlug", destinationSlug).eq("slug", candidate),
      )
      .unique();
    if (!clash || clash._id === ignoreId) return candidate;
  }

  throw new ConvexError({
    code: "CONFLICT",
    message: `Could not derive a free slug from "${desired}".`,
  });
}

/* -------------------------------------------------------------------------- */
/*                             discovery mapping                              */
/* -------------------------------------------------------------------------- */

/**
 * The homepage form asks "why are you travelling?" in plain words. Map that
 * onto the stored `category` union; an unrecognised purpose means "no category
 * filter" rather than "no results".
 */
const PURPOSE_TO_CATEGORY: Record<string, VisaCategory> = {
  tourist: "tourist",
  tourism: "tourist",
  holiday: "tourist",
  vacation: "tourist",
  leisure: "tourist",
  visit: "tourist",
  family: "tourist",
  business: "business",
  conference: "business",
  work: "work",
  employment: "work",
  job: "work",
  student: "student",
  study: "student",
  education: "student",
  transit: "transit",
  medical: "medical",
  treatment: "medical",
  exchange: "exchange_visitor",
  exchange_visitor: "exchange_visitor",
  service: "service",
  consultation: "service",
  other: "other",
};

function purposeToCategory(purpose?: string): VisaCategory | undefined {
  if (!purpose) return undefined;
  const key = purpose.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return PURPOSE_TO_CATEGORY[key];
}

/**
 * `eligibleNationalities` is an allow-list of ISO codes; an empty array means
 * the product is open to every nationality, which is the common case.
 */
function isEligible(product: Doc<"visaProducts">, fromCountry?: string): boolean {
  if (!fromCountry) return true;
  if (product.eligibleNationalities.length === 0) return true;
  const needle = fromCountry.trim().toUpperCase();
  return product.eligibleNationalities.some(
    (code) => code.trim().toUpperCase() === needle,
  );
}

/* -------------------------------------------------------------------------- */
/*                                   reads                                    */
/* -------------------------------------------------------------------------- */

async function requirementsFor(
  ctx: QueryCtx | MutationCtx,
  visaProductId: Id<"visaProducts">,
) {
  return await ctx.db
    .query("visaRequirements")
    .withIndex("by_product_order", (q) => q.eq("visaProductId", visaProductId))
    .order("asc")
    .take(CATALOGUE_LIMIT);
}

/** Published products for one destination, ordered for the public page. */
export const listByDestinationSlug = query({
  args: { destinationSlug: v.string() },
  handler: async (ctx, args) => {
    const destination = await ctx.db
      .query("destinations")
      .withIndex("by_slug", (q) => q.eq("slug", args.destinationSlug))
      .unique();

    if (!destination || !destination.isPublished) return [];

    const products = await ctx.db
      .query("visaProducts")
      .withIndex("by_destination_published", (q) =>
        q.eq("destinationId", destination._id).eq("isPublished", true),
      )
      .take(CATALOGUE_LIMIT);

    return products.sort((a, b) => a.displayOrder - b.displayOrder);
  },
});

/**
 * Public product page: the product, its document checklist and its FAQs.
 * Unpublished rows are visible only to staff with `catalogue:view`, flagged
 * `isPreview` so the page can show a draft banner.
 */
export const getBySlug = query({
  args: { destinationSlug: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    const product = await ctx.db
      .query("visaProducts")
      .withIndex("by_slug", (q) =>
        q.eq("destinationSlug", args.destinationSlug).eq("slug", args.slug),
      )
      .unique();

    if (!product) return null;

    const destination = await ctx.db.get(product.destinationId);
    if (!destination) return null;

    let isPreview = false;
    if (!product.isPublished || !destination.isPublished) {
      const canPreview = await callerHasPermission(
        ctx,
        PERMISSIONS.CATALOGUE_VIEW,
      );
      if (!canPreview) return null;
      isPreview = true;
    }

    const requirements = await requirementsFor(ctx, product._id);

    const faqs = (
      await ctx.db
        .query("visaFAQs")
        .withIndex("by_visaProductId", (q) => q.eq("visaProductId", product._id))
        .take(CATALOGUE_LIMIT)
    )
      .filter((f) => isPreview || f.isPublished)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    return {
      ...product,
      isPreview,
      destination,
      requirements,
      faqs,
    };
  },
});

/**
 * Homepage discovery search.
 *
 * All four inputs are optional - the form submits whatever the visitor filled
 * in. `toCountry` is matched loosely (slug, name or ISO code) because it comes
 * from a combobox that also accepts free text.
 */
export const searchForDiscovery = query({
  args: {
    fromCountry: v.optional(v.string()),
    toCountry: v.optional(v.string()),
    purpose: v.optional(v.string()),
    travelDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const published = await ctx.db
      .query("destinations")
      .withIndex("by_published_order", (q) => q.eq("isPublished", true))
      .order("asc")
      .take(CATALOGUE_LIMIT);

    const needle = args.toCountry?.trim().toLowerCase();
    const destinations = needle
      ? published.filter(
          (d) =>
            d.slug === needle ||
            d.name.toLowerCase() === needle ||
            d.countryCode.toLowerCase() === needle ||
            d.name.toLowerCase().includes(needle),
        )
      : published;

    const category = purposeToCategory(args.purpose);
    const now = Date.now();
    const limit = Math.min(args.limit ?? 60, CATALOGUE_LIMIT);

    const results = [];

    // One indexed read per candidate destination; the destination list is
    // already bounded by the published catalogue.
    for (const destination of destinations) {
      const products = await ctx.db
        .query("visaProducts")
        .withIndex("by_destination_published", (q) =>
          q.eq("destinationId", destination._id).eq("isPublished", true),
        )
        .take(CATALOGUE_LIMIT);

      for (const product of products) {
        if (category && product.category !== category) continue;
        if (!isEligible(product, args.fromCountry)) continue;

        // Advisory only: a product is still offered when the trip is sooner
        // than the quoted processing window, but the UI can warn about it.
        let meetsTravelDate: boolean | null = null;
        if (args.travelDate && product.processingTimeMaxDays != null) {
          const daysAway = Math.floor(
            (args.travelDate - now) / (24 * 60 * 60 * 1000),
          );
          meetsTravelDate = daysAway >= product.processingTimeMaxDays;
        }

        results.push({ ...product, destination, meetsTravelDate });
      }
    }

    results.sort(
      (a, b) =>
        compareDestinations(a.destination, b.destination) ||
        a.displayOrder - b.displayOrder,
    );

    return {
      matchedDestinations: destinations.length,
      resolvedCategory: category ?? null,
      results: results.slice(0, limit),
    };
  },
});

/** Admin catalogue table. */
export const listAll = query({
  args: {
    destinationId: v.optional(v.id("destinations")),
    category: v.optional(visaCategory),
    isPublished: v.optional(v.boolean()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CATALOGUE_VIEW);

    let rows: Doc<"visaProducts">[];

    if (args.destinationId !== undefined && args.isPublished !== undefined) {
      rows = await ctx.db
        .query("visaProducts")
        .withIndex("by_destination_published", (q) =>
          q
            .eq("destinationId", args.destinationId!)
            .eq("isPublished", args.isPublished!),
        )
        .take(CATALOGUE_LIMIT);
    } else if (args.destinationId !== undefined) {
      rows = await ctx.db
        .query("visaProducts")
        .withIndex("by_destinationId", (q) =>
          q.eq("destinationId", args.destinationId!),
        )
        .take(CATALOGUE_LIMIT);
    } else if (args.category !== undefined) {
      rows = await ctx.db
        .query("visaProducts")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .take(CATALOGUE_LIMIT);
    } else if (args.isPublished !== undefined) {
      rows = await ctx.db
        .query("visaProducts")
        .withIndex("by_isPublished", (q) =>
          q.eq("isPublished", args.isPublished!),
        )
        .take(CATALOGUE_LIMIT);
    } else {
      // The catalogue is admin-curated and small; the cap keeps this bounded.
      rows = await ctx.db.query("visaProducts").take(CATALOGUE_LIMIT);
    }

    // Narrow the remaining dimensions in memory - the set is already small and
    // Convex offers no multi-field index covering every combination here.
    if (args.category !== undefined) {
      rows = rows.filter((p) => p.category === args.category);
    }
    if (args.isPublished !== undefined) {
      rows = rows.filter((p) => p.isPublished === args.isPublished);
    }
    const term = args.search?.trim().toLowerCase();
    if (term) {
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.slug.includes(term) ||
          p.visaType.toLowerCase().includes(term),
      );
    }

    const destinationCache = new Map<string, Doc<"destinations"> | null>();
    const joined = [];
    for (const product of rows) {
      const key = product.destinationId as unknown as string;
      if (!destinationCache.has(key)) {
        destinationCache.set(key, await ctx.db.get(product.destinationId));
      }
      joined.push({ ...product, destination: destinationCache.get(key) ?? null });
    }

    return joined.sort(
      (a, b) =>
        compareDestinations(a.destination ?? {}, b.destination ?? {}) ||
        a.displayOrder - b.displayOrder,
    );
  },
});

/* -------------------------------------------------------------------------- */
/*                                  writes                                    */
/* -------------------------------------------------------------------------- */

/**
 * A product only loses the "Sample data" badge once an admin has recorded both
 * where the figures came from and when they were last checked.
 */
function resolveIsDemoContent(
  lastVerifiedAt: number | undefined,
  officialSourceUrl: string | undefined,
  explicit?: boolean,
): boolean {
  if (explicit !== undefined) return explicit;
  return !(lastVerifiedAt !== undefined && !!officialSourceUrl);
}

export const create = mutation({
  args: {
    destinationId: v.id("destinations"),
    name: v.string(),
    category: visaCategory,
    visaType: v.string(),
    shortDescription: v.string(),
    slug: v.optional(v.string()),
    detailedDescription: v.optional(v.string()),
    eligibleNationalities: v.optional(v.array(v.string())),
    entryType: v.optional(entryType),
    validityDays: v.optional(v.number()),
    maxStayDays: v.optional(v.number()),
    processingTimeMinDays: v.optional(v.number()),
    processingTimeMaxDays: v.optional(v.number()),
    processingTimeNote: v.optional(v.string()),
    currency: v.optional(v.string()),
    governmentFee: v.number(),
    serviceFee: v.number(),
    additionalCharges: v.optional(v.number()),
    taxPercent: v.optional(v.number()),
    promoPrice: v.optional(v.number()),
    promoLabel: v.optional(v.string()),
    promoEndsAt: v.optional(v.number()),
    paymentMode: v.optional(paymentMode),
    eligibilityNotes: v.optional(v.string()),
    importantInformation: v.optional(v.string()),
    requiredApplicantFields: v.optional(v.array(v.string())),
    officialSourceUrl: v.optional(v.string()),
    lastVerifiedAt: v.optional(v.number()),
    isDemoContent: v.optional(v.boolean()),
    isPublished: v.optional(v.boolean()),
    displayOrder: v.optional(v.number()),
  },
  returns: v.object({ visaProductId: v.id("visaProducts"), slug: v.string() }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_EDIT);

    const destination = await ctx.db.get(args.destinationId);
    if (!destination) authError("NOT_FOUND", "That destination no longer exists.");

    const slug = await uniqueSlug(ctx, destination.slug, args.slug ?? args.name);

    let displayOrder = args.displayOrder;
    if (displayOrder === undefined) {
      const siblings = await ctx.db
        .query("visaProducts")
        .withIndex("by_destinationId", (q) =>
          q.eq("destinationId", destination._id),
        )
        .take(CATALOGUE_LIMIT);
      displayOrder =
        siblings.reduce((max, p) => Math.max(max, p.displayOrder), 0) + 10;
    }

    const now = Date.now();
    const visaProductId = await ctx.db.insert("visaProducts", {
      destinationId: destination._id,
      // Kept in sync with the parent so the public route needs one read.
      destinationSlug: destination.slug,
      slug,
      name: args.name.trim(),
      category: args.category,
      visaType: args.visaType,
      shortDescription: args.shortDescription,
      detailedDescription: args.detailedDescription,
      eligibleNationalities: (args.eligibleNationalities ?? []).map((c) =>
        c.trim().toUpperCase(),
      ),
      entryType: args.entryType ?? "single",
      validityDays: args.validityDays,
      maxStayDays: args.maxStayDays,
      processingTimeMinDays: args.processingTimeMinDays,
      processingTimeMaxDays: args.processingTimeMaxDays,
      processingTimeNote: args.processingTimeNote,
      currency: args.currency ?? destination.currency ?? "INR",
      governmentFee: Math.max(0, Math.round(args.governmentFee)),
      serviceFee: Math.max(0, Math.round(args.serviceFee)),
      additionalCharges: Math.max(0, Math.round(args.additionalCharges ?? 0)),
      taxPercent: args.taxPercent ?? 0,
      promoPrice: args.promoPrice,
      promoLabel: args.promoLabel,
      promoEndsAt: args.promoEndsAt,
      paymentMode: args.paymentMode ?? "pay_after_confirmation",
      eligibilityNotes: args.eligibilityNotes,
      importantInformation: args.importantInformation,
      requiredApplicantFields: args.requiredApplicantFields ?? [],
      officialSourceUrl: args.officialSourceUrl,
      lastVerifiedAt: args.lastVerifiedAt,
      isDemoContent: resolveIsDemoContent(
        args.lastVerifiedAt,
        args.officialSourceUrl,
        args.isDemoContent,
      ),
      isPublished: args.isPublished ?? false,
      displayOrder,
      createdAt: now,
      updatedAt: now,
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CATALOGUE_CREATED,
      entityType: "visa_product",
      entityId: visaProductId,
      summary: `Created visa product ${args.name} for ${destination.name}`,
      after: { name: args.name, slug, destination: destination.slug },
    });

    return { visaProductId, slug };
  },
});

export const update = mutation({
  args: {
    visaProductId: v.id("visaProducts"),
    destinationId: v.optional(v.id("destinations")),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    category: v.optional(visaCategory),
    visaType: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    detailedDescription: v.optional(v.string()),
    eligibleNationalities: v.optional(v.array(v.string())),
    entryType: v.optional(entryType),
    validityDays: v.optional(v.number()),
    maxStayDays: v.optional(v.number()),
    processingTimeMinDays: v.optional(v.number()),
    processingTimeMaxDays: v.optional(v.number()),
    processingTimeNote: v.optional(v.string()),
    currency: v.optional(v.string()),
    governmentFee: v.optional(v.number()),
    serviceFee: v.optional(v.number()),
    additionalCharges: v.optional(v.number()),
    taxPercent: v.optional(v.number()),
    promoPrice: v.optional(v.number()),
    promoLabel: v.optional(v.string()),
    promoEndsAt: v.optional(v.number()),
    paymentMode: v.optional(paymentMode),
    eligibilityNotes: v.optional(v.string()),
    importantInformation: v.optional(v.string()),
    requiredApplicantFields: v.optional(v.array(v.string())),
    officialSourceUrl: v.optional(v.string()),
    lastVerifiedAt: v.optional(v.number()),
    isDemoContent: v.optional(v.boolean()),
    displayOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_EDIT);

    const product = await ctx.db.get(args.visaProductId);
    if (!product) authError("NOT_FOUND", "That visa product no longer exists.");

    const patch: Partial<Doc<"visaProducts">> = { updatedAt: Date.now() };

    // Moving a product between destinations has to re-stamp the denormalised
    // slug, and the product slug has to be re-checked under the new parent.
    let destinationSlug = product.destinationSlug;
    if (args.destinationId && args.destinationId !== product.destinationId) {
      const destination = await ctx.db.get(args.destinationId);
      if (!destination) {
        authError("NOT_FOUND", "That destination no longer exists.");
      }
      patch.destinationId = destination._id;
      destinationSlug = destination.slug;
      patch.destinationSlug = destination.slug;
      patch.slug = await uniqueSlug(
        ctx,
        destination.slug,
        args.slug ?? product.slug,
        product._id,
      );
    } else if (args.slug !== undefined && slugify(args.slug) !== product.slug) {
      patch.slug = await uniqueSlug(
        ctx,
        destinationSlug,
        args.slug,
        product._id,
      );
    }

    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.category !== undefined) patch.category = args.category;
    if (args.visaType !== undefined) patch.visaType = args.visaType;
    if (args.shortDescription !== undefined) {
      patch.shortDescription = args.shortDescription;
    }
    if (args.detailedDescription !== undefined) {
      patch.detailedDescription = args.detailedDescription;
    }
    if (args.eligibleNationalities !== undefined) {
      patch.eligibleNationalities = args.eligibleNationalities.map((c) =>
        c.trim().toUpperCase(),
      );
    }
    if (args.entryType !== undefined) patch.entryType = args.entryType;
    if (args.validityDays !== undefined) patch.validityDays = args.validityDays;
    if (args.maxStayDays !== undefined) patch.maxStayDays = args.maxStayDays;
    if (args.processingTimeMinDays !== undefined) {
      patch.processingTimeMinDays = args.processingTimeMinDays;
    }
    if (args.processingTimeMaxDays !== undefined) {
      patch.processingTimeMaxDays = args.processingTimeMaxDays;
    }
    if (args.processingTimeNote !== undefined) {
      patch.processingTimeNote = args.processingTimeNote;
    }
    if (args.currency !== undefined) patch.currency = args.currency;
    if (args.governmentFee !== undefined) {
      patch.governmentFee = Math.max(0, Math.round(args.governmentFee));
    }
    if (args.serviceFee !== undefined) {
      patch.serviceFee = Math.max(0, Math.round(args.serviceFee));
    }
    if (args.additionalCharges !== undefined) {
      patch.additionalCharges = Math.max(0, Math.round(args.additionalCharges));
    }
    if (args.taxPercent !== undefined) patch.taxPercent = args.taxPercent;
    if (args.promoPrice !== undefined) patch.promoPrice = args.promoPrice;
    if (args.promoLabel !== undefined) patch.promoLabel = args.promoLabel;
    if (args.promoEndsAt !== undefined) patch.promoEndsAt = args.promoEndsAt;
    if (args.paymentMode !== undefined) patch.paymentMode = args.paymentMode;
    if (args.eligibilityNotes !== undefined) {
      patch.eligibilityNotes = args.eligibilityNotes;
    }
    if (args.importantInformation !== undefined) {
      patch.importantInformation = args.importantInformation;
    }
    if (args.requiredApplicantFields !== undefined) {
      patch.requiredApplicantFields = args.requiredApplicantFields;
    }
    if (args.officialSourceUrl !== undefined) {
      patch.officialSourceUrl = args.officialSourceUrl;
    }
    if (args.lastVerifiedAt !== undefined) {
      patch.lastVerifiedAt = args.lastVerifiedAt;
    }
    if (args.displayOrder !== undefined) patch.displayOrder = args.displayOrder;

    // Recompute the demo flag from the post-patch values unless set explicitly.
    const nextVerifiedAt =
      args.lastVerifiedAt !== undefined
        ? args.lastVerifiedAt
        : product.lastVerifiedAt;
    const nextSourceUrl =
      args.officialSourceUrl !== undefined
        ? args.officialSourceUrl
        : product.officialSourceUrl;
    patch.isDemoContent = resolveIsDemoContent(
      nextVerifiedAt,
      nextSourceUrl,
      args.isDemoContent,
    );

    const { before, after } = diffFields(
      product as unknown as Record<string, unknown>,
      patch as Record<string, unknown>,
    );

    await ctx.db.patch(product._id, patch);

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CATALOGUE_UPDATED,
      entityType: "visa_product",
      entityId: product._id,
      summary: `Updated visa product ${patch.name ?? product.name}`,
      before,
      after,
    });

    return {
      visaProductId: product._id,
      slug: patch.slug ?? product.slug,
      destinationSlug: patch.destinationSlug ?? product.destinationSlug,
    };
  },
});

export const setPublished = mutation({
  args: { visaProductId: v.id("visaProducts"), isPublished: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_PUBLISH);

    const product = await ctx.db.get(args.visaProductId);
    if (!product) authError("NOT_FOUND", "That visa product no longer exists.");
    if (product.isPublished === args.isPublished) return null;

    await ctx.db.patch(product._id, {
      isPublished: args.isPublished,
      updatedAt: Date.now(),
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: args.isPublished
        ? AUDIT_ACTIONS.CATALOGUE_PUBLISHED
        : AUDIT_ACTIONS.CATALOGUE_UNPUBLISHED,
      entityType: "visa_product",
      entityId: product._id,
      summary: `${args.isPublished ? "Published" : "Unpublished"} visa product ${
        product.name
      }`,
      before: { isPublished: product.isPublished },
      after: { isPublished: args.isPublished },
    });

    return null;
  },
});

/**
 * Delete a product along with its requirements and FAQs.
 *
 * Refused once an application references it: the application keeps a frozen
 * price snapshot but still joins back for the product name on admin screens.
 */
export const remove = mutation({
  args: { visaProductId: v.id("visaProducts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_DELETE);

    const product = await ctx.db.get(args.visaProductId);
    if (!product) authError("NOT_FOUND", "That visa product no longer exists.");

    const booked = await ctx.db
      .query("applications")
      .withIndex("by_visaProductId", (q) => q.eq("visaProductId", product._id))
      .first();

    if (booked) {
      throw new ConvexError({
        code: "HAS_DEPENDENTS",
        message: `${product.name} has existing applications and cannot be deleted. Unpublish it instead.`,
      });
    }

    for (const requirement of await requirementsFor(ctx, product._id)) {
      await ctx.db.delete(requirement._id);
    }

    const faqs = await ctx.db
      .query("visaFAQs")
      .withIndex("by_visaProductId", (q) => q.eq("visaProductId", product._id))
      .take(CATALOGUE_LIMIT);
    for (const faq of faqs) await ctx.db.delete(faq._id);

    await ctx.db.delete(product._id);

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CATALOGUE_DELETED,
      entityType: "visa_product",
      entityId: product._id,
      summary: `Deleted visa product ${product.name}`,
      before: { name: product.name, slug: product.slug },
    });

    return null;
  },
});

/** Clone a product (and its checklist) as an unpublished draft. */
export const duplicate = mutation({
  args: {
    visaProductId: v.id("visaProducts"),
    name: v.optional(v.string()),
    destinationId: v.optional(v.id("destinations")),
  },
  returns: v.object({ visaProductId: v.id("visaProducts"), slug: v.string() }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_EDIT);

    const source = await ctx.db.get(args.visaProductId);
    if (!source) authError("NOT_FOUND", "That visa product no longer exists.");

    const destination = await ctx.db.get(
      args.destinationId ?? source.destinationId,
    );
    if (!destination) authError("NOT_FOUND", "That destination no longer exists.");

    const name = args.name?.trim() || `${source.name} (copy)`;
    const slug = await uniqueSlug(ctx, destination.slug, name);

    const now = Date.now();
    const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...fields } = source;

    const visaProductId = await ctx.db.insert("visaProducts", {
      ...fields,
      destinationId: destination._id,
      destinationSlug: destination.slug,
      slug,
      name,
      // A copy is never live and is unverified until someone re-checks it.
      isPublished: false,
      isDemoContent: true,
      displayOrder: source.displayOrder + 1,
      createdAt: now,
      updatedAt: now,
    });

    for (const requirement of await requirementsFor(ctx, source._id)) {
      const { _id: _reqId, _creationTime: _reqCreated, ...requirementFields } = requirement;
      await ctx.db.insert("visaRequirements", {
        ...requirementFields,
        visaProductId,
        createdAt: now,
      });
    }

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CATALOGUE_CREATED,
      entityType: "visa_product",
      entityId: visaProductId,
      summary: `Duplicated ${source.name} as ${name}`,
      after: { name, slug, sourceId: source._id },
    });

    return { visaProductId, slug };
  },
});
