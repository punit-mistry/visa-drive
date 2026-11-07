import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  authError,
  callerHasPermission,
  requirePermission,
} from "./lib/auth";
import { AUDIT_ACTIONS, diffFields, recordAudit } from "./lib/audit";
import { compareDestinations } from "./lib/destinationOrder";
import { PERMISSIONS } from "../lib/constants/roles";
import { startingPrice } from "../lib/helpers/pricing";

/* ============================================================================
 * Destinations - the top level of the catalogue.
 *
 * Public reads are unauthenticated and must stay cheap: the whole catalogue is
 * admin-curated and small (single-digit countries today), so a bounded scan of
 * the published index plus one indexed product read per destination is the
 * right shape. Nothing here scans `visaProducts` as a whole table.
 * ========================================================================== */

/** Hard cap on catalogue reads so a public query can never run unbounded. */
const CATALOGUE_LIMIT = 200;

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

/**
 * Turn a name into a slug that is free in `destinations`.
 * Collisions get `-2`, `-3`, ... rather than failing the mutation, because the
 * admin should not have to invent a unique name for "United States" twice.
 */
async function uniqueSlug(
  ctx: MutationCtx,
  desired: string,
  ignoreId?: Id<"destinations">,
): Promise<string> {
  const base = slugify(desired) || "destination";

  for (let suffix = 1; suffix < 200; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const clash = await ctx.db
      .query("destinations")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .unique();
    if (!clash || clash._id === ignoreId) return candidate;
  }

  throw new ConvexError({
    code: "CONFLICT",
    message: `Could not derive a free slug from "${desired}".`,
  });
}

/* -------------------------------------------------------------------------- */
/*                                   reads                                    */
/* -------------------------------------------------------------------------- */

async function productsFor(
  ctx: QueryCtx | MutationCtx,
  destinationId: Id<"destinations">,
  publishedOnly: boolean,
): Promise<Doc<"visaProducts">[]> {
  if (publishedOnly) {
    return await ctx.db
      .query("visaProducts")
      .withIndex("by_destination_published", (q) =>
        q.eq("destinationId", destinationId).eq("isPublished", true),
      )
      .take(CATALOGUE_LIMIT);
  }

  return await ctx.db
    .query("visaProducts")
    .withIndex("by_destinationId", (q) => q.eq("destinationId", destinationId))
    .take(CATALOGUE_LIMIT);
}

/**
 * Public destination grid.
 *
 * Read in `displayOrder` off the `by_published_order` index, then sorted with
 * the United States first. Each card carries its own `productCount` /
 * `startingPrice` so the marketing page needs exactly one query.
 */
export const listPublished = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? CATALOGUE_LIMIT, CATALOGUE_LIMIT);

    /**
     * The United States leads every list on the site.
     *
     * It is the bulk of the work that actually comes through the door, so
     * it should not depend on where an admin happened to drag it in the
     * catalogue order. Deciding it here rather than in each of the seven
     * surfaces that read this query means they cannot disagree.
     *
     * The whole published set is read before the cut, so the US is still
     * first even when its `displayOrder` puts it past the limit. Products
     * are then loaded only for the rows that survive the slice.
     */
    const all = await ctx.db
      .query("destinations")
      .withIndex("by_published_order", (q) => q.eq("isPublished", true))
      .order("asc")
      .take(CATALOGUE_LIMIT);

    const destinations = [...all].sort(compareDestinations).slice(0, limit);

    const cards = [];
    // One indexed read per destination - never a scan across all products.
    for (const destination of destinations) {
      const products = await productsFor(ctx, destination._id, true);
      cards.push({
        ...destination,
        productCount: products.length,
        startingPrice: startingPrice(products),
        // Free here — the products are already loaded — and it lets a surface
        // quote `startingPrice` without fetching every product again just to
        // find out whether the figure may be presented as official.
        hasDemoContent: products.some((product) => product.isDemoContent),
        fastestProcessingDays: fastestProcessingDays(products),
      });
    }

    return cards;
  },
});

/**
 * The shortest advertised processing time across a destination's products.
 *
 * `null` unless an administrator has actually entered one — an absent figure
 * renders as nothing at all rather than as a guess, because a processing time
 * is the claim a traveller plans a trip around.
 */
function fastestProcessingDays(
  products: { processingTimeMinDays?: number }[],
): number | null {
  const days = products
    .map((product) => product.processingTimeMinDays)
    .filter((value): value is number => typeof value === "number" && value > 0);

  return days.length > 0 ? Math.min(...days) : null;
}

/**
 * Public destination page.
 *
 * Returns `null` for a missing or unpublished destination, except for staff
 * holding `catalogue:view`, who get the row back flagged `isPreview` so the
 * admin can proof a draft on the real page before publishing it.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const destination = await ctx.db
      .query("destinations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!destination) return null;

    let isPreview = false;
    if (!destination.isPublished) {
      const canPreview = await callerHasPermission(
        ctx,
        PERMISSIONS.CATALOGUE_VIEW,
      );
      if (!canPreview) return null;
      isPreview = true;
    }

    const products = await productsFor(ctx, destination._id, !isPreview);

    const faqs = (
      await ctx.db
        .query("visaFAQs")
        .withIndex("by_destinationId", (q) =>
          q.eq("destinationId", destination._id),
        )
        .take(CATALOGUE_LIMIT)
    )
      .filter((f) => f.scope === "destination" && (isPreview || f.isPublished))
      .sort((a, b) => a.displayOrder - b.displayOrder);

    return {
      ...destination,
      isPreview,
      productCount: products.length,
      startingPrice: startingPrice(products),
      products: products.sort((a, b) => a.displayOrder - b.displayOrder),
      faqs,
    };
  },
});

/** Admin catalogue list - published and draft, with product counts. */
export const listAll = query({
  args: {
    search: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CATALOGUE_VIEW);

    const rows =
      args.isPublished === undefined
        ? await ctx.db.query("destinations").take(CATALOGUE_LIMIT)
        : await ctx.db
            .query("destinations")
            .withIndex("by_isPublished", (q) =>
              q.eq("isPublished", args.isPublished!),
            )
            .take(CATALOGUE_LIMIT);

    const term = args.search?.trim().toLowerCase();
    const filtered = term
      ? rows.filter(
          (d) =>
            d.name.toLowerCase().includes(term) ||
            d.slug.includes(term) ||
            d.countryCode.toLowerCase() === term,
        )
      : rows;

    const withCounts = [];
    for (const destination of filtered) {
      const all = await productsFor(ctx, destination._id, false);
      withCounts.push({
        ...destination,
        productCount: all.length,
        publishedProductCount: all.filter((p) => p.isPublished).length,
        startingPrice: startingPrice(all),
      });
    }

    return withCounts.sort(compareDestinations);
  },
});

/* -------------------------------------------------------------------------- */
/*                                  writes                                    */
/* -------------------------------------------------------------------------- */

const destinationFields = {
  name: v.string(),
  countryCode: v.string(),
  flagEmoji: v.string(),
  summary: v.string(),
  slug: v.optional(v.string()),
  region: v.optional(v.string()),
  tagline: v.optional(v.string()),
  description: v.optional(v.string()),
  heroImageUrl: v.optional(v.string()),
  cardImageUrl: v.optional(v.string()),
  heroImageStorageId: v.optional(v.id("_storage")),
  cardImageStorageId: v.optional(v.id("_storage")),
  currency: v.optional(v.string()),
  highlights: v.optional(v.array(v.string())),
  travelNotes: v.optional(v.string()),
  officialSourceUrl: v.optional(v.string()),
  lastVerifiedAt: v.optional(v.number()),
  isPopular: v.optional(v.boolean()),
  isPublished: v.optional(v.boolean()),
  displayOrder: v.optional(v.number()),
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
};

export const create = mutation({
  args: destinationFields,
  returns: v.object({ destinationId: v.id("destinations"), slug: v.string() }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_EDIT);

    const slug = await uniqueSlug(ctx, args.slug ?? args.name);

    // New rows go to the end of the grid unless the admin pinned a position.
    let displayOrder = args.displayOrder;
    if (displayOrder === undefined) {
      const existing = await ctx.db.query("destinations").take(CATALOGUE_LIMIT);
      displayOrder = existing.reduce((max, d) => Math.max(max, d.displayOrder), 0) + 10;
    }

    const now = Date.now();
    const destinationId = await ctx.db.insert("destinations", {
      slug,
      name: args.name.trim(),
      countryCode: args.countryCode.trim().toUpperCase(),
      flagEmoji: args.flagEmoji,
      region: args.region,
      tagline: args.tagline,
      summary: args.summary,
      description: args.description,
      heroImageUrl: args.heroImageUrl,
      cardImageUrl: args.cardImageUrl,
      heroImageStorageId: args.heroImageStorageId,
      cardImageStorageId: args.cardImageStorageId,
      currency: args.currency ?? "INR",
      highlights: args.highlights ?? [],
      travelNotes: args.travelNotes,
      officialSourceUrl: args.officialSourceUrl,
      lastVerifiedAt: args.lastVerifiedAt,
      isPopular: args.isPopular ?? false,
      // Draft by default: a destination with no products yet would be a dead
      // card on the marketing grid.
      isPublished: args.isPublished ?? false,
      displayOrder,
      seoTitle: args.seoTitle,
      seoDescription: args.seoDescription,
      createdAt: now,
      updatedAt: now,
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CATALOGUE_CREATED,
      entityType: "destination",
      entityId: destinationId,
      summary: `Created destination ${args.name}`,
      after: { name: args.name, slug },
    });

    return { destinationId, slug };
  },
});

export const update = mutation({
  args: {
    destinationId: v.id("destinations"),
    name: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    flagEmoji: v.optional(v.string()),
    summary: v.optional(v.string()),
    slug: v.optional(v.string()),
    region: v.optional(v.string()),
    tagline: v.optional(v.string()),
    description: v.optional(v.string()),
    heroImageUrl: v.optional(v.string()),
    cardImageUrl: v.optional(v.string()),
    heroImageStorageId: v.optional(v.id("_storage")),
    cardImageStorageId: v.optional(v.id("_storage")),
    currency: v.optional(v.string()),
    highlights: v.optional(v.array(v.string())),
    travelNotes: v.optional(v.string()),
    officialSourceUrl: v.optional(v.string()),
    lastVerifiedAt: v.optional(v.number()),
    isPopular: v.optional(v.boolean()),
    displayOrder: v.optional(v.number()),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_EDIT);

    const destination = await ctx.db.get(args.destinationId);
    if (!destination) authError("NOT_FOUND", "That destination no longer exists.");

    const patch: Partial<Doc<"destinations">> = { updatedAt: Date.now() };

    if (args.slug !== undefined && slugify(args.slug) !== destination.slug) {
      patch.slug = await uniqueSlug(ctx, args.slug, destination._id);
    }
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.countryCode !== undefined) {
      patch.countryCode = args.countryCode.trim().toUpperCase();
    }
    if (args.flagEmoji !== undefined) patch.flagEmoji = args.flagEmoji;
    if (args.summary !== undefined) patch.summary = args.summary;
    if (args.region !== undefined) patch.region = args.region;
    if (args.tagline !== undefined) patch.tagline = args.tagline;
    if (args.description !== undefined) patch.description = args.description;
    if (args.heroImageUrl !== undefined) patch.heroImageUrl = args.heroImageUrl;
    if (args.cardImageUrl !== undefined) patch.cardImageUrl = args.cardImageUrl;
    if (args.heroImageStorageId !== undefined) {
      patch.heroImageStorageId = args.heroImageStorageId;
    }
    if (args.cardImageStorageId !== undefined) {
      patch.cardImageStorageId = args.cardImageStorageId;
    }
    if (args.currency !== undefined) patch.currency = args.currency;
    if (args.highlights !== undefined) patch.highlights = args.highlights;
    if (args.travelNotes !== undefined) patch.travelNotes = args.travelNotes;
    if (args.officialSourceUrl !== undefined) {
      patch.officialSourceUrl = args.officialSourceUrl;
    }
    if (args.lastVerifiedAt !== undefined) {
      patch.lastVerifiedAt = args.lastVerifiedAt;
    }
    if (args.isPopular !== undefined) patch.isPopular = args.isPopular;
    if (args.displayOrder !== undefined) patch.displayOrder = args.displayOrder;
    if (args.seoTitle !== undefined) patch.seoTitle = args.seoTitle;
    if (args.seoDescription !== undefined) {
      patch.seoDescription = args.seoDescription;
    }

    const { before, after } = diffFields(
      destination as unknown as Record<string, unknown>,
      patch as Record<string, unknown>,
    );

    await ctx.db.patch(destination._id, patch);

    // `visaProducts.destinationSlug` is denormalised for the public
    // /destinations/<slug>/<product> route, so a slug change has to cascade or
    // every product URL under this destination 404s.
    if (patch.slug && patch.slug !== destination.slug) {
      const products = await productsFor(ctx, destination._id, false);
      for (const product of products) {
        await ctx.db.patch(product._id, { destinationSlug: patch.slug });
      }
    }

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CATALOGUE_UPDATED,
      entityType: "destination",
      entityId: destination._id,
      summary: `Updated destination ${patch.name ?? destination.name}`,
      before,
      after,
    });

    return { destinationId: destination._id, slug: patch.slug ?? destination.slug };
  },
});

export const setPublished = mutation({
  args: { destinationId: v.id("destinations"), isPublished: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_PUBLISH);

    const destination = await ctx.db.get(args.destinationId);
    if (!destination) authError("NOT_FOUND", "That destination no longer exists.");
    if (destination.isPublished === args.isPublished) return null;

    await ctx.db.patch(destination._id, {
      isPublished: args.isPublished,
      updatedAt: Date.now(),
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: args.isPublished
        ? AUDIT_ACTIONS.CATALOGUE_PUBLISHED
        : AUDIT_ACTIONS.CATALOGUE_UNPUBLISHED,
      entityType: "destination",
      entityId: destination._id,
      summary: `${args.isPublished ? "Published" : "Unpublished"} destination ${
        destination.name
      }`,
      before: { isPublished: destination.isPublished },
      after: { isPublished: args.isPublished },
    });

    return null;
  },
});

/**
 * Delete a destination.
 *
 * Refused while any visa product still points at it: applications reference
 * `destinationId`, so an orphaned product would break both the admin tables
 * and the public route. Destination-scoped FAQs are removed with it.
 */
export const remove = mutation({
  args: { destinationId: v.id("destinations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_DELETE);

    const destination = await ctx.db.get(args.destinationId);
    if (!destination) authError("NOT_FOUND", "That destination no longer exists.");

    const products = await productsFor(ctx, destination._id, false);
    if (products.length > 0) {
      throw new ConvexError({
        code: "HAS_DEPENDENTS",
        message: `${destination.name} still has ${products.length} visa product${
          products.length === 1 ? "" : "s"
        }. Delete or move them first.`,
      });
    }

    const faqs = await ctx.db
      .query("visaFAQs")
      .withIndex("by_destinationId", (q) =>
        q.eq("destinationId", destination._id),
      )
      .take(CATALOGUE_LIMIT);
    for (const faq of faqs) await ctx.db.delete(faq._id);

    await ctx.db.delete(destination._id);

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CATALOGUE_DELETED,
      entityType: "destination",
      entityId: destination._id,
      summary: `Deleted destination ${destination.name}`,
      before: { name: destination.name, slug: destination.slug },
    });

    return null;
  },
});

/** Drag-and-drop ordering for the admin grid. */
export const reorder = mutation({
  args: {
    items: v.array(
      v.object({
        destinationId: v.id("destinations"),
        displayOrder: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_EDIT);

    const now = Date.now();
    for (const item of args.items) {
      const destination = await ctx.db.get(item.destinationId);
      if (!destination) continue; // tolerate a row deleted mid-drag
      await ctx.db.patch(item.destinationId, {
        displayOrder: item.displayOrder,
        updatedAt: now,
      });
    }

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CATALOGUE_UPDATED,
      entityType: "destination",
      entityId: "*",
      summary: `Reordered ${args.items.length} destinations`,
      after: args.items,
    });

    return null;
  },
});
