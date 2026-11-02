import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { requirePermission } from "./lib/auth";
import { PERMISSIONS } from "../lib/constants/roles";

/* ============================================================================
 * Audit log reads.
 *
 * Read-only on purpose. Rows are written by `recordAudit` in
 * `convex/lib/audit.ts` from the mutation that performed the action; there is
 * no public write path, and deliberately no delete path. An audit trail that
 * can be edited from the admin UI is not an audit trail.
 *
 * `audit:view` is an admin-and-above permission, so these queries are not
 * reachable by a support agent looking up a colleague's activity.
 * ========================================================================== */

const entityTypeValidator = v.union(
  v.literal("application"),
  v.literal("user"),
  v.literal("enquiry"),
  v.literal("conversation"),
  v.literal("document"),
  v.literal("payment"),
  v.literal("visa_product"),
  v.literal("destination"),
  v.literal("setting"),
  v.literal("staff"),
);

/**
 * The global activity timeline.
 *
 * One index is chosen per call rather than combining filters: `by_action` and
 * `by_actorUserId` are both single-field, and layering a `.filter()` on top of
 * a paginated query would silently return short pages. The admin UI exposes
 * these as mutually exclusive filters for the same reason.
 */
export const listForAdmin = query({
  args: {
    paginationOpts: paginationOptsValidator,
    action: v.optional(v.string()),
    actorUserId: v.optional(v.id("users")),
    entityType: v.optional(entityTypeValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.AUDIT_LOG_VIEW);

    if (args.action) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", args.action!))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    if (args.actorUserId) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_actorUserId", (q) =>
          q.eq("actorUserId", args.actorUserId!),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    const result = await ctx.db
      .query("auditLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .paginate(args.paginationOpts);

    // `entityType` has no index of its own (only the compound
    // `by_entity`), so it narrows the page in memory. Pages may come back
    // short; `isDone` still terminates the list correctly.
    return args.entityType
      ? {
          ...result,
          page: result.page.filter((row) => row.entityType === args.entityType),
        }
      : result;
  },
});

/** Everything that has ever happened to one row — the entity's own history. */
export const listForEntity = query({
  args: {
    paginationOpts: paginationOptsValidator,
    entityType: entityTypeValidator,
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.AUDIT_LOG_VIEW);

    return await ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

/**
 * Distinct actions present in the log, for populating the filter dropdown
 * without hardcoding the list in the UI.
 */
export const availableActions = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.AUDIT_LOG_VIEW);

    // Bounded scan of the most recent rows: enough to cover everything the
    // deployment actually does, without reading the whole table.
    const recent = await ctx.db
      .query("auditLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(500);

    return Array.from(new Set(recent.map((row) => row.action))).sort();
  },
});
