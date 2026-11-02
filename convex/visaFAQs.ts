import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { authError, requirePermission } from "./lib/auth";
import { AUDIT_ACTIONS, diffFields, recordAudit } from "./lib/audit";
import { PERMISSIONS } from "../lib/constants/roles";

/* ============================================================================
 * FAQs.
 *
 * One table serves three scopes - site-wide, per destination and per visa
 * product - because the editorial content and the admin screen are identical
 * in all three cases. `scope` plus the matching foreign key decides where a
 * row renders.
 * ========================================================================== */

const FAQ_LIMIT = 200;

const faqScope = v.union(
  v.literal("global"),
  v.literal("destination"),
  v.literal("visa_product"),
);

/**
 * Public FAQ list for one scope.
 *
 * Each scope reads through its own index: `by_scope` for global (which already
 * carries `isPublished`), and the foreign-key indexes for the two narrower
 * scopes, where the per-parent set is small enough to finish in memory.
 */
export const listPublic = query({
  args: {
    scope: faqScope,
    destinationId: v.optional(v.id("destinations")),
    visaProductId: v.optional(v.id("visaProducts")),
  },
  handler: async (ctx, args) => {
    let rows: Doc<"visaFAQs">[];

    if (args.scope === "destination") {
      if (!args.destinationId) return [];
      rows = (
        await ctx.db
          .query("visaFAQs")
          .withIndex("by_destinationId", (q) =>
            q.eq("destinationId", args.destinationId),
          )
          .take(FAQ_LIMIT)
      ).filter((f) => f.scope === "destination" && f.isPublished);
    } else if (args.scope === "visa_product") {
      if (!args.visaProductId) return [];
      rows = (
        await ctx.db
          .query("visaFAQs")
          .withIndex("by_visaProductId", (q) =>
            q.eq("visaProductId", args.visaProductId),
          )
          .take(FAQ_LIMIT)
      ).filter((f) => f.scope === "visa_product" && f.isPublished);
    } else {
      rows = await ctx.db
        .query("visaFAQs")
        .withIndex("by_scope", (q) =>
          q.eq("scope", "global").eq("isPublished", true),
        )
        .take(FAQ_LIMIT);
    }

    return rows.sort((a, b) => a.displayOrder - b.displayOrder);
  },
});

/** Admin list - includes drafts. */
export const listAll = query({
  args: {
    scope: v.optional(faqScope),
    destinationId: v.optional(v.id("destinations")),
    visaProductId: v.optional(v.id("visaProducts")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CATALOGUE_VIEW);

    let rows: Doc<"visaFAQs">[];

    if (args.visaProductId) {
      rows = await ctx.db
        .query("visaFAQs")
        .withIndex("by_visaProductId", (q) =>
          q.eq("visaProductId", args.visaProductId),
        )
        .take(FAQ_LIMIT);
    } else if (args.destinationId) {
      rows = await ctx.db
        .query("visaFAQs")
        .withIndex("by_destinationId", (q) =>
          q.eq("destinationId", args.destinationId),
        )
        .take(FAQ_LIMIT);
    } else if (args.scope) {
      // `by_scope` is (scope, isPublished) - an eq on the prefix alone is a
      // valid index range, so both published and draft rows come back.
      rows = await ctx.db
        .query("visaFAQs")
        .withIndex("by_scope", (q) => q.eq("scope", args.scope!))
        .take(FAQ_LIMIT);
    } else {
      // Editorial content, curated by hand - bounded by the cap above.
      rows = await ctx.db.query("visaFAQs").take(FAQ_LIMIT);
    }

    if (args.scope) rows = rows.filter((f) => f.scope === args.scope);

    return rows.sort((a, b) => a.displayOrder - b.displayOrder);
  },
});

/** The scope and its foreign key must agree, or the row renders nowhere. */
async function assertScopeIsCoherent(
  ctx: MutationCtx,
  scope: "global" | "destination" | "visa_product",
  destinationId?: Doc<"visaFAQs">["destinationId"],
  visaProductId?: Doc<"visaFAQs">["visaProductId"],
) {
  if (scope === "destination") {
    if (!destinationId) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Pick a destination for a destination-scoped FAQ.",
      });
    }
    if (!(await ctx.db.get(destinationId))) {
      authError("NOT_FOUND", "That destination no longer exists.");
    }
  }
  if (scope === "visa_product") {
    if (!visaProductId) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Pick a visa product for a product-scoped FAQ.",
      });
    }
    if (!(await ctx.db.get(visaProductId))) {
      authError("NOT_FOUND", "That visa product no longer exists.");
    }
  }
}

export const create = mutation({
  args: {
    scope: faqScope,
    question: v.string(),
    answer: v.string(),
    destinationId: v.optional(v.id("destinations")),
    visaProductId: v.optional(v.id("visaProducts")),
    isPublished: v.optional(v.boolean()),
    displayOrder: v.optional(v.number()),
  },
  returns: v.id("visaFAQs"),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_EDIT);

    await assertScopeIsCoherent(
      ctx,
      args.scope,
      args.destinationId,
      args.visaProductId,
    );

    let displayOrder = args.displayOrder;
    if (displayOrder === undefined) {
      const siblings = await ctx.db
        .query("visaFAQs")
        .withIndex("by_scope", (q) => q.eq("scope", args.scope))
        .take(FAQ_LIMIT);
      displayOrder =
        siblings.reduce((max, f) => Math.max(max, f.displayOrder), 0) + 10;
    }

    const now = Date.now();
    const faqId = await ctx.db.insert("visaFAQs", {
      scope: args.scope,
      // Only keep the key that matches the scope, so a scope change cannot
      // leave a stale parent behind.
      destinationId: args.scope === "destination" ? args.destinationId : undefined,
      visaProductId:
        args.scope === "visa_product" ? args.visaProductId : undefined,
      question: args.question.trim(),
      answer: args.answer.trim(),
      displayOrder,
      isPublished: args.isPublished ?? true,
      createdAt: now,
      updatedAt: now,
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CATALOGUE_CREATED,
      entityType:
        args.scope === "visa_product"
          ? "visa_product"
          : args.scope === "destination"
            ? "destination"
            : "setting",
      entityId: (args.visaProductId ?? args.destinationId ?? faqId) as string,
      summary: `Added ${args.scope} FAQ "${args.question.slice(0, 60)}"`,
      after: { question: args.question, scope: args.scope },
    });

    return faqId;
  },
});

export const update = mutation({
  args: {
    faqId: v.id("visaFAQs"),
    scope: v.optional(faqScope),
    question: v.optional(v.string()),
    answer: v.optional(v.string()),
    destinationId: v.optional(v.id("destinations")),
    visaProductId: v.optional(v.id("visaProducts")),
    isPublished: v.optional(v.boolean()),
    displayOrder: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_EDIT);

    const faq = await ctx.db.get(args.faqId);
    if (!faq) authError("NOT_FOUND", "That FAQ no longer exists.");

    const scope = args.scope ?? faq.scope;
    const destinationId =
      args.destinationId !== undefined ? args.destinationId : faq.destinationId;
    const visaProductId =
      args.visaProductId !== undefined ? args.visaProductId : faq.visaProductId;

    await assertScopeIsCoherent(ctx, scope, destinationId, visaProductId);

    const patch: Partial<Doc<"visaFAQs">> = { updatedAt: Date.now() };
    if (args.question !== undefined) patch.question = args.question.trim();
    if (args.answer !== undefined) patch.answer = args.answer.trim();
    if (args.isPublished !== undefined) patch.isPublished = args.isPublished;
    if (args.displayOrder !== undefined) patch.displayOrder = args.displayOrder;

    if (
      args.scope !== undefined ||
      args.destinationId !== undefined ||
      args.visaProductId !== undefined
    ) {
      patch.scope = scope;
      patch.destinationId = scope === "destination" ? destinationId : undefined;
      patch.visaProductId = scope === "visa_product" ? visaProductId : undefined;
    }

    const { before, after } = diffFields(
      faq as unknown as Record<string, unknown>,
      patch as Record<string, unknown>,
    );

    await ctx.db.patch(faq._id, patch);

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CATALOGUE_UPDATED,
      entityType:
        scope === "visa_product"
          ? "visa_product"
          : scope === "destination"
            ? "destination"
            : "setting",
      entityId: (visaProductId ?? destinationId ?? faq._id) as string,
      summary: `Updated FAQ "${(patch.question ?? faq.question).slice(0, 60)}"`,
      before,
      after,
    });

    return null;
  },
});

export const remove = mutation({
  args: { faqId: v.id("visaFAQs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CATALOGUE_DELETE);

    const faq = await ctx.db.get(args.faqId);
    if (!faq) authError("NOT_FOUND", "That FAQ no longer exists.");

    await ctx.db.delete(faq._id);

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CATALOGUE_DELETED,
      entityType:
        faq.scope === "visa_product"
          ? "visa_product"
          : faq.scope === "destination"
            ? "destination"
            : "setting",
      entityId: (faq.visaProductId ?? faq.destinationId ?? faq._id) as string,
      summary: `Deleted FAQ "${faq.question.slice(0, 60)}"`,
      before: { question: faq.question, scope: faq.scope },
    });

    return null;
  },
});

export const reorder = mutation({
  args: {
    items: v.array(
      v.object({ faqId: v.id("visaFAQs"), displayOrder: v.number() }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CATALOGUE_EDIT);

    const now = Date.now();
    for (const item of args.items) {
      const faq = await ctx.db.get(item.faqId);
      if (!faq) continue; // tolerate a row deleted mid-drag
      await ctx.db.patch(item.faqId, {
        displayOrder: item.displayOrder,
        updatedAt: now,
      });
    }

    return null;
  },
});
