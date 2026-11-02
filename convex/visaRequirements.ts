import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { authError, requirePermission } from "./lib/auth";
import { AUDIT_ACTIONS, diffFields, recordAudit } from "./lib/audit";
import { PERMISSIONS } from "../lib/constants/roles";

/* ============================================================================
 * Visa requirements - the document checklist attached to a visa product.
 *
 * Reads are public: the checklist is the single most useful thing on a product
 * page, and a customer needs to see it before signing in.
 * ========================================================================== */

const REQUIREMENT_LIMIT = 200;

/** Who a requirement applies to. Mirrors the schema union. */
const appliesTo = v.union(
  v.literal("all"),
  v.literal("adult"),
  v.literal("minor"),
  v.literal("employed"),
  v.literal("self_employed"),
  v.literal("student"),
  v.literal("retired"),
);

/** Sensible upload guard rails when the admin does not override them. */
const DEFAULT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

function slugifyKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/** Public: the checklist for one product, in display order. */
export const listByProduct = query({
  args: { visaProductId: v.id("visaProducts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("visaRequirements")
      .withIndex("by_product_order", (q) =>
        q.eq("visaProductId", args.visaProductId),
      )
      .order("asc")
      .take(REQUIREMENT_LIMIT);
  },
});

export const create = mutation({
  args: {
    visaProductId: v.id("visaProducts"),
    label: v.string(),
    documentKey: v.optional(v.string()),
    description: v.optional(v.string()),
    sampleImageUrl: v.optional(v.string()),
    isMandatory: v.optional(v.boolean()),
    appliesTo: v.optional(appliesTo),
    allowedMimeTypes: v.optional(v.array(v.string())),
    maxSizeBytes: v.optional(v.number()),
    displayOrder: v.optional(v.number()),
  },
  returns: v.object({
    requirementId: v.id("visaRequirements"),
    documentKey: v.string(),
  }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_EDIT);

    const product = await ctx.db.get(args.visaProductId);
    if (!product) authError("NOT_FOUND", "That visa product no longer exists.");

    const documentKey = slugifyKey(args.documentKey ?? args.label) || "document";

    // `documentKey` is how an upload is matched back to its checklist row, so
    // it has to be unique within the product.
    const clash = await ctx.db
      .query("visaRequirements")
      .withIndex("by_product_key", (q) =>
        q.eq("visaProductId", product._id).eq("documentKey", documentKey),
      )
      .unique();

    if (clash) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `This product already has a requirement keyed "${documentKey}".`,
      });
    }

    let displayOrder = args.displayOrder;
    if (displayOrder === undefined) {
      const siblings = await ctx.db
        .query("visaRequirements")
        .withIndex("by_visaProductId", (q) =>
          q.eq("visaProductId", product._id),
        )
        .take(REQUIREMENT_LIMIT);
      displayOrder =
        siblings.reduce((max, r) => Math.max(max, r.displayOrder), 0) + 10;
    }

    const requirementId = await ctx.db.insert("visaRequirements", {
      visaProductId: product._id,
      documentKey,
      label: args.label.trim(),
      description: args.description,
      sampleImageUrl: args.sampleImageUrl,
      isMandatory: args.isMandatory ?? true,
      appliesTo: args.appliesTo ?? "all",
      allowedMimeTypes: args.allowedMimeTypes ?? DEFAULT_MIME_TYPES,
      maxSizeBytes: args.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES,
      displayOrder,
      createdAt: Date.now(),
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CATALOGUE_UPDATED,
      entityType: "visa_product",
      entityId: product._id,
      summary: `Added requirement "${args.label}" to ${product.name}`,
      after: { documentKey, label: args.label },
    });

    return { requirementId, documentKey };
  },
});

export const update = mutation({
  args: {
    requirementId: v.id("visaRequirements"),
    label: v.optional(v.string()),
    description: v.optional(v.string()),
    sampleImageUrl: v.optional(v.string()),
    isMandatory: v.optional(v.boolean()),
    appliesTo: v.optional(appliesTo),
    allowedMimeTypes: v.optional(v.array(v.string())),
    maxSizeBytes: v.optional(v.number()),
    displayOrder: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_EDIT);

    const requirement = await ctx.db.get(args.requirementId);
    if (!requirement) authError("NOT_FOUND", "That requirement no longer exists.");

    const patch: Partial<Doc<"visaRequirements">> = {};
    if (args.label !== undefined) patch.label = args.label.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.sampleImageUrl !== undefined) {
      patch.sampleImageUrl = args.sampleImageUrl;
    }
    if (args.isMandatory !== undefined) patch.isMandatory = args.isMandatory;
    if (args.appliesTo !== undefined) patch.appliesTo = args.appliesTo;
    if (args.allowedMimeTypes !== undefined) {
      patch.allowedMimeTypes = args.allowedMimeTypes;
    }
    if (args.maxSizeBytes !== undefined) patch.maxSizeBytes = args.maxSizeBytes;
    if (args.displayOrder !== undefined) patch.displayOrder = args.displayOrder;

    // `documentKey` is deliberately immutable: already-uploaded documents are
    // matched to the checklist by it, and renaming would orphan them.
    const { before, after } = diffFields(
      requirement as unknown as Record<string, unknown>,
      patch as Record<string, unknown>,
    );

    await ctx.db.patch(requirement._id, patch);

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CATALOGUE_UPDATED,
      entityType: "visa_product",
      entityId: requirement.visaProductId,
      summary: `Updated requirement "${patch.label ?? requirement.label}"`,
      before,
      after,
    });

    return null;
  },
});

export const remove = mutation({
  args: { requirementId: v.id("visaRequirements") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_EDIT);

    const requirement = await ctx.db.get(args.requirementId);
    if (!requirement) authError("NOT_FOUND", "That requirement no longer exists.");

    await ctx.db.delete(requirement._id);

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CATALOGUE_UPDATED,
      entityType: "visa_product",
      entityId: requirement.visaProductId,
      summary: `Removed requirement "${requirement.label}"`,
      before: {
        documentKey: requirement.documentKey,
        label: requirement.label,
      },
    });

    return null;
  },
});

export const reorder = mutation({
  args: {
    items: v.array(
      v.object({
        requirementId: v.id("visaRequirements"),
        displayOrder: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CATALOGUE_EDIT);

    for (const item of args.items) {
      const requirement = await ctx.db.get(item.requirementId);
      if (!requirement) continue; // tolerate a row deleted mid-drag
      await ctx.db.patch(item.requirementId, {
        displayOrder: item.displayOrder,
      });
    }

    return null;
  },
});
