import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { AnyCtx } from "./lib/partners";
import { mutation, query } from "./_generated/server";
import { partnerDocumentStatus } from "./schema";
import {
  authError,
  getPartnerForUser,
  requirePermission,
  requireUser,
} from "./lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "./lib/audit";
import { cleanText, loadPartner } from "./lib/partners";
import { PERMISSIONS } from "../lib/constants/roles";
import { isPartnerRole } from "../lib/constants/roles";
import {
  ACCEPTED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
} from "../lib/constants/documents";
import {
  PARTNER_DOCUMENT_KINDS,
  partnerDocumentLabel,
  type PartnerDocumentKind,
} from "../lib/constants/partners";

/* ============================================================================
 * Partner verification documents.
 *
 * Business paperwork — a registration certificate, a GST certificate — rather
 * than a traveller's passport, so it lives in its own table with its own
 * review verdict. What it shares with `convex/documents.ts` is the part that
 * matters: the bytes are never reachable by URL alone. `requirePartnerDocumentAccess`
 * below is the gate, and the single `ctx.storage.getUrl` call that serves this
 * table lives in `convex/documents.ts` beside the one that serves the other.
 *
 * Replacements supersede rather than overwrite, so "what did they originally
 * send us?" stays answerable after a re-upload.
 * ========================================================================== */

const KIND_SET = new Set<string>(PARTNER_DOCUMENT_KINDS);
/** The same file types the traveller checklist accepts: PDF and images. */
const ALLOWED_MIME_TYPES: string[] = [...ACCEPTED_MIME_TYPES];

/* -------------------------------------------------------------------------- */
/*                                   access                                   */
/* -------------------------------------------------------------------------- */

/**
 * Who may see one partner document: the partner it belongs to, or a staff
 * member holding `partner:view`. Shared with `documents.getPartnerSignedUrl`.
 */
export async function requirePartnerDocumentAccess(
  ctx: AnyCtx,
  partnerDocumentId: Id<"partnerDocuments">,
): Promise<{
  user: Doc<"users">;
  document: Doc<"partnerDocuments">;
  viaStaff: boolean;
}> {
  const user = await requireUser(ctx);
  const document = await ctx.db.get(partnerDocumentId);

  if (!document) {
    authError("NOT_FOUND", "Document not found.");
  }

  if (document.userId === user._id) {
    return { user, document, viaStaff: false };
  }

  // A partner whose login was re-pointed at a different partner row must not
  // keep reach over the old one: ownership is re-derived, not remembered.
  if (isPartnerRole(user.role)) {
    const partner = await getPartnerForUser(ctx, user._id);
    if (partner && partner._id === document.partnerId) {
      return { user, document, viaStaff: false };
    }
    authError("FORBIDDEN", "You do not have access to this document.");
  }

  const staff = await requirePermission(ctx, PERMISSIONS.PARTNER_VIEW);
  return { user: staff.user, document, viaStaff: true };
}

/**
 * The partner whose documents the caller may write to.
 *
 * A partner may only ever write to their own (the id is derived from the
 * session, never taken from an argument). Staff with `partner:manage` may
 * upload on a partner's behalf — an agency that emailed their certificate in.
 */
async function resolveWritablePartner(
  ctx: AnyCtx,
  partnerId: Id<"partners"> | undefined,
): Promise<{ user: Doc<"users">; partner: Doc<"partners">; viaStaff: boolean }> {
  const user = await requireUser(ctx);

  if (isPartnerRole(user.role)) {
    const partner = await getPartnerForUser(ctx, user._id);
    if (!partner) {
      authError("NOT_FOUND", "You do not have a partner profile.");
    }
    if (partnerId && partnerId !== partner._id) {
      authError("FORBIDDEN", "You can only manage your own documents.");
    }
    return { user, partner, viaStaff: false };
  }

  // A registration that is still pending has not granted the `partner` role
  // yet, but the applicant still has to be able to upload their paperwork.
  const own = await getPartnerForUser(ctx, user._id);
  if (own && (!partnerId || partnerId === own._id)) {
    return { user, partner: own, viaStaff: false };
  }

  if (!partnerId) {
    authError("NOT_FOUND", "You do not have a partner profile.");
  }

  const staff = await requirePermission(ctx, PERMISSIONS.PARTNER_MANAGE);
  const partner = await loadPartner(ctx, partnerId);
  return { user: staff.user, partner, viaStaff: true };
}

/* -------------------------------------------------------------------------- */
/*                                   upload                                   */
/* -------------------------------------------------------------------------- */

export const generateUploadUrl = mutation({
  args: { partnerId: v.optional(v.id("partners")) },
  returns: v.string(),
  handler: async (ctx, args) => {
    // Resolving the writable partner *is* the authorisation check; the upload
    // URL is only minted once it passes.
    await resolveWritablePartner(ctx, args.partnerId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const attach = mutation({
  args: {
    partnerId: v.optional(v.id("partners")),
    storageId: v.id("_storage"),
    documentKind: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
  },
  returns: v.id("partnerDocuments"),
  handler: async (ctx, args) => {
    const { user, partner, viaStaff } = await resolveWritablePartner(
      ctx,
      args.partnerId,
    );

    if (!KIND_SET.has(args.documentKind)) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "That is not a document type we collect.",
        field: "documentKind",
      });
    }

    if (!ALLOWED_MIME_TYPES.includes(args.mimeType)) {
      throw new ConvexError({
        code: "INVALID_FILE_TYPE",
        message: `${args.fileName} is not an accepted file type.`,
      });
    }

    if (args.size <= 0 || args.size > MAX_UPLOAD_BYTES) {
      throw new ConvexError({
        code: "FILE_TOO_LARGE",
        message: `${args.fileName} exceeds the ${Math.round(
          MAX_UPLOAD_BYTES / (1024 * 1024),
        )} MB limit.`,
      });
    }

    const now = Date.now();
    const kind = args.documentKind as PartnerDocumentKind;

    // Supersede the previous version of this exact slot rather than replacing
    // it, so the original submission survives in the audit trail.
    const previous = await ctx.db
      .query("partnerDocuments")
      .withIndex("by_partner_kind", (q) =>
        q.eq("partnerId", partner._id).eq("documentKind", kind),
      )
      .collect();

    const current = previous.find((d) => d.isCurrent) ?? null;
    if (current) await ctx.db.patch(current._id, { isCurrent: false });

    const documentId = await ctx.db.insert("partnerDocuments", {
      partnerId: partner._id,
      // Ownership is the partner's login, never the uploader — staff
      // uploading on their behalf must not become the owner.
      userId: partner.userId,
      storageId: args.storageId,
      documentKind: kind,
      label: partnerDocumentLabel(kind),
      fileName: args.fileName.slice(0, 200),
      mimeType: args.mimeType,
      size: args.size,
      status: "pending_review",
      version: previous.reduce((max, d) => Math.max(max, d.version), 0) + 1,
      supersedesId: current?._id,
      isCurrent: true,
      createdAt: now,
    });

    await recordAudit(ctx, {
      actor: user,
      action: AUDIT_ACTIONS.PARTNER_DOCUMENT_UPLOADED,
      entityType: "partner",
      entityId: partner._id,
      summary: `${viaStaff ? user.fullName : partner.agencyName} uploaded ${partnerDocumentLabel(
        kind,
      )} for ${partner.agencyName}`,
      after: { documentKind: kind, fileName: args.fileName },
    });

    return documentId;
  },
});

/* -------------------------------------------------------------------------- */
/*                                    reads                                   */
/* -------------------------------------------------------------------------- */

/** The caller's own verification checklist. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const partner = await getPartnerForUser(ctx, user._id);
    if (!partner) return { partnerId: null, documents: [] };

    const documents = await ctx.db
      .query("partnerDocuments")
      .withIndex("by_partner_current", (q) =>
        q.eq("partnerId", partner._id).eq("isCurrent", true),
      )
      .collect();

    return { partnerId: partner._id, documents };
  },
});

/** One partner's documents, including superseded versions, for the CRM. */
export const listForAdmin = query({
  args: { partnerId: v.id("partners"), includeSuperseded: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PARTNER_VIEW);

    const documents = await ctx.db
      .query("partnerDocuments")
      .withIndex("by_partnerId", (q) => q.eq("partnerId", args.partnerId))
      .order("desc")
      .take(200);

    const rows = args.includeSuperseded
      ? documents
      : documents.filter((d) => d.isCurrent);

    const reviewerIds = [
      ...new Set(
        rows.map((d) => d.reviewedBy).filter((id): id is Id<"users"> => !!id),
      ),
    ];
    const reviewers = await Promise.all(reviewerIds.map((id) => ctx.db.get(id)));
    const reviewerName = new Map(
      reviewers
        .filter((u): u is Doc<"users"> => u !== null)
        .map((u) => [u._id as Id<"users">, u.fullName]),
    );

    return rows.map((d) => ({
      ...d,
      reviewerName: d.reviewedBy ? (reviewerName.get(d.reviewedBy) ?? null) : null,
    }));
  },
});

/* -------------------------------------------------------------------------- */
/*                                   review                                   */
/* -------------------------------------------------------------------------- */

export const review = mutation({
  args: {
    partnerDocumentId: v.id("partnerDocuments"),
    status: partnerDocumentStatus,
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.PARTNER_APPROVE);

    const document = await ctx.db.get(args.partnerDocumentId);
    if (!document) authError("NOT_FOUND", "Document not found.");

    const note = cleanText(args.note, 1000);
    if (args.status === "rejected" && !note) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Say why it was rejected — the partner is shown this.",
        field: "note",
      });
    }

    const now = Date.now();
    await ctx.db.patch(document._id, {
      status: args.status,
      reviewedBy: staff.user._id,
      reviewedAt: now,
      reviewNote: note,
    });

    const partner = await ctx.db.get(document.partnerId);

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.PARTNER_DOCUMENT_REVIEWED,
      entityType: "partner",
      entityId: document.partnerId,
      summary: `${staff.user.fullName} marked ${document.label} as ${args.status}${
        partner ? ` for ${partner.agencyName}` : ""
      }${note ? ` — ${note}` : ""}`,
      before: { status: document.status },
      after: { status: args.status, note },
    });

    return null;
  },
});

/**
 * Remove a document.
 *
 * A partner may withdraw one they uploaded while it is still pending review;
 * once the office has ruled on it, only staff holding `partner:manage` can.
 */
export const remove = mutation({
  args: { partnerDocumentId: v.id("partnerDocuments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requirePartnerDocumentAccess(ctx, args.partnerDocumentId);

    if (!access.viaStaff && access.document.status !== "pending_review") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message:
          "This document has already been reviewed. Upload a replacement instead of removing it.",
      });
    }

    if (access.viaStaff) {
      await requirePermission(ctx, PERMISSIONS.PARTNER_MANAGE);
    }

    const { document } = access;

    await ctx.db.delete(document._id);
    await ctx.storage.delete(document.storageId).catch(() => {
      // A missing blob must not fail the row removal — the row is the record.
    });

    // Bring the superseded version back, so removing a replacement does not
    // silently leave the checklist looking empty.
    if (document.isCurrent && document.supersedesId) {
      const previous = await ctx.db.get(document.supersedesId);
      if (previous) await ctx.db.patch(previous._id, { isCurrent: true });
    }

    await recordAudit(ctx, {
      actor: access.user,
      action: AUDIT_ACTIONS.PARTNER_DOCUMENT_REVIEWED,
      entityType: "partner",
      entityId: document.partnerId,
      summary: `${access.user.fullName} removed ${document.label}`,
      before: { fileName: document.fileName, status: document.status },
    });

    return null;
  },
});
