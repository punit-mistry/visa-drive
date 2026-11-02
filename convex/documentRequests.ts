import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  authError,
  requireApplicationAccess,
  requirePermission,
} from "./lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "./lib/audit";
import { documentLabel } from "../lib/constants/documents";
import { NOTIFICATION_TYPES, dedupeKeys } from "../lib/constants/notifications";
import { PERMISSIONS } from "../lib/constants/roles";

/* ============================================================================
 * Document requests — "we need one more thing from you".
 *
 * A request is the only thing that turns a vague "additional documents
 * requested" status into something the customer can act on, so it always
 * carries a reason and always produces a notification.
 * ========================================================================== */

/**
 * Close a request because a matching document arrived.
 *
 * Exported as a plain helper (not only as a mutation) because Convex mutations
 * cannot call other mutations — `documents.attach` has to run this inline,
 * inside the same transaction that inserts the document.
 */
export async function fulfilDocumentRequest(
  ctx: MutationCtx,
  documentRequestId: Id<"documentRequests">,
  documentId: Id<"documents">,
): Promise<void> {
  const request = await ctx.db.get(documentRequestId);
  if (!request) return;
  if (request.status !== "open") return; // already fulfilled or cancelled

  await ctx.db.patch(documentRequestId, {
    status: "fulfilled",
    fulfilledDocumentId: documentId,
    fulfilledAt: Date.now(),
  });
}

/* -------------------------------------------------------------------------- */

export const create = mutation({
  args: {
    applicationId: v.id("applications"),
    applicantId: v.optional(v.id("applicants")),
    documentKey: v.string(),
    label: v.optional(v.string()),
    reason: v.string(),
    dueDate: v.optional(v.number()),
  },
  returns: v.object({ documentRequestId: v.id("documentRequests") }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.DOCUMENT_REQUEST);
    const access = await requireApplicationAccess(ctx, args.applicationId);
    const application = access.application;

    const reason = args.reason.trim();
    if (reason.length === 0) {
      throw new ConvexError({
        code: "REASON_REQUIRED",
        message: "Explain what is needed and why — the customer sees this text.",
      });
    }

    if (args.applicantId) {
      const applicant = await ctx.db.get(args.applicantId);
      if (!applicant || applicant.applicationId !== args.applicationId) {
        throw new ConvexError({
          code: "INVALID_APPLICANT",
          message: "That traveller does not belong to this application.",
        });
      }
    }

    const label = args.label ?? documentLabel(args.documentKey);
    const now = Date.now();

    const documentRequestId = await ctx.db.insert("documentRequests", {
      applicationId: args.applicationId,
      applicantId: args.applicantId,
      userId: application.userId,
      requestedBy: staff.user._id,
      documentKey: args.documentKey,
      label,
      reason,
      dueDate: args.dueDate,
      status: "open",
      createdAt: now,
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.DOCUMENT_REQUESTED,
      entityType: "application",
      entityId: args.applicationId,
      summary: `Requested "${label}" on ${application.referenceId}`,
      after: { documentKey: args.documentKey, reason, dueDate: args.dueDate },
    });

    // NOTE: the application status is deliberately NOT changed here. A status
    // move is `applications.updateStatus`'s job so there is exactly one place
    // that validates transitions and writes statusHistory.
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      userId: application.userId,
      type: NOTIFICATION_TYPES.ADDITIONAL_DOCUMENTS_REQUESTED,
      title: `Action needed: ${label}`,
      body: reason,
      link: `/dashboard/applications/${args.applicationId}`,
      dedupeKey: dedupeKeys.documentRequested(documentRequestId),
      applicationId: args.applicationId,
    });

    return { documentRequestId };
  },
});

export const listByApplication = query({
  args: {
    applicationId: v.id("applications"),
    status: v.optional(
      v.union(v.literal("open"), v.literal("fulfilled"), v.literal("cancelled")),
    ),
  },
  handler: async (ctx, args) => {
    await requireApplicationAccess(ctx, args.applicationId);

    if (args.status) {
      const status = args.status;
      return await ctx.db
        .query("documentRequests")
        .withIndex("by_application_status", (q) =>
          q.eq("applicationId", args.applicationId).eq("status", status),
        )
        .order("desc")
        .collect();
    }

    return await ctx.db
      .query("documentRequests")
      .withIndex("by_applicationId", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .order("desc")
      .collect();
  },
});

export const cancel = mutation({
  args: { documentRequestId: v.id("documentRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.DOCUMENT_REQUEST);
    const request = await ctx.db.get(args.documentRequestId);
    if (!request) authError("NOT_FOUND", "Document request not found.");

    if (request.status !== "open") {
      throw new ConvexError({
        code: "ALREADY_CLOSED",
        message: "That request is no longer open.",
      });
    }

    await ctx.db.patch(args.documentRequestId, { status: "cancelled" });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.DOCUMENT_REQUESTED,
      entityType: "application",
      entityId: request.applicationId,
      summary: `Cancelled the request for "${request.label}"`,
      before: { status: "open" },
      after: { status: "cancelled" },
    });

    return null;
  },
});

/**
 * Scheduler-facing wrapper around {@link fulfilDocumentRequest}. `documents.attach`
 * uses the helper directly; this exists so the same close can be triggered from
 * an action or a cron without duplicating the guard.
 */
export const fulfil = internalMutation({
  args: {
    documentRequestId: v.id("documentRequests"),
    documentId: v.id("documents"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await fulfilDocumentRequest(ctx, args.documentRequestId, args.documentId);
    return null;
  },
});
