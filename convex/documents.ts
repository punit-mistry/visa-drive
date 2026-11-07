import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  authError,
  getPartnerForUser,
  requireApplicationAccess,
  requireDocumentAccess,
  requirePermission,
  requireUser,
} from "./lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "./lib/audit";
import { fulfilDocumentRequest } from "./documentRequests";
import { requirePartnerDocumentAccess } from "./partnerDocuments";
import {
  ACCEPTED_MIME_TYPES,
  DOCUMENT_TYPE_MAP,
  MAX_UPLOAD_BYTES,
  documentLabel,
} from "../lib/constants/documents";
import { APPLICATION_STATUS_CONFIG } from "../lib/constants/statuses";
import type { ApplicationStatus } from "../lib/constants/statuses";
import { NOTIFICATION_TYPES, dedupeKeys } from "../lib/constants/notifications";
import { PERMISSIONS, isPartnerRole } from "../lib/constants/roles";
import { partnerCanTrade } from "../lib/constants/partners";

/* ============================================================================
 * Documents.
 *
 * Two rules drive everything in this file:
 *
 *  1. A storage URL is never public. This module is the ONLY one in the whole
 *     codebase that calls `ctx.storage.getUrl`, in exactly two exports:
 *     `getSignedUrl` (after `requireDocumentAccess`) for a traveller's files,
 *     and `getPartnerSignedUrl` (after `requirePartnerDocumentAccess`) for a
 *     B2B partner's business paperwork. Passport scans, bank statements and
 *     GST certificates all live behind those two checks and nothing else.
 *  2. Files are never overwritten. A replacement supersedes the previous row
 *     (`isCurrent: false`, `version + 1`, `supersedesId`) so the audit trail
 *     keeps what the customer originally sent.
 * ========================================================================== */

/**
 * The visa document VisaDrive issues at the end. It is stored as a normal
 * `documents` row so it inherits the one access-checked URL path, but it is a
 * deliverable rather than a requirement, so it is excluded from the checklist
 * counts below.
 */
export const FINAL_DOCUMENT_KEY = "final_visa_document";

const documentStatusValidator = v.union(
  v.literal("pending_review"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("replacement_requested"),
);

/* -------------------------------------------------------------------------- */
/*                            shared count helpers                            */
/* -------------------------------------------------------------------------- */

/**
 * `documentsRequiredCount` / `documentsApprovedCount` are denormalised onto the
 * application because the admin table renders "4 / 9 documents" for a hundred
 * rows at a time — recomputing that per row would be a hundred extra index
 * scans on every keystroke in the search box. They are recomputed here, in the
 * three places that can change them (attach, review, remove) and on submit.
 */
export async function recountApplicationDocuments(
  ctx: MutationCtx,
  applicationId: Id<"applications">,
): Promise<void> {
  const application = await ctx.db.get(applicationId);
  if (!application) return;

  const [requirements, applicants, current] = await Promise.all([
    ctx.db
      .query("visaRequirements")
      .withIndex("by_visaProductId", (q) =>
        q.eq("visaProductId", application.visaProductId),
      )
      .collect(),
    ctx.db
      .query("applicants")
      .withIndex("by_applicationId", (q) => q.eq("applicationId", applicationId))
      .collect(),
    ctx.db
      .query("documents")
      .withIndex("by_application_current", (q) =>
        q.eq("applicationId", applicationId).eq("isCurrent", true),
      )
      .collect(),
  ]);

  const applicantCount = Math.max(1, applicants.length);
  const required = requirements
    .filter((r) => r.isMandatory)
    // "all" means every traveller needs their own copy; a narrower `appliesTo`
    // (employed / student / ...) is counted once because we cannot reliably
    // decide from the stored data which applicants it binds.
    .reduce((sum, r) => sum + (r.appliesTo === "all" ? applicantCount : 1), 0);

  const approved = current.filter(
    (d) => d.status === "approved" && d.documentKey !== FINAL_DOCUMENT_KEY,
  ).length;

  if (
    application.documentsRequiredCount === required &&
    application.documentsApprovedCount === approved
  ) {
    return;
  }

  await ctx.db.patch(applicationId, {
    documentsRequiredCount: required,
    documentsApprovedCount: approved,
    updatedAt: Date.now(),
  });
}

/** A type alias rather than an interface so it keeps an implicit index
 *  signature and can travel inside a `ConvexError` payload. */
export type MissingDocument = {
  documentKey: string;
  label: string;
  applicantId?: Id<"applicants">;
  applicantName?: string;
};

/**
 * Which mandatory documents are still absent. Shared by `applications.submit`
 * (which refuses and lists them) and by the checklist query.
 */
export async function collectMissingMandatoryDocuments(
  ctx: QueryCtx,
  application: Doc<"applications">,
  applicants: Doc<"applicants">[],
): Promise<MissingDocument[]> {
  const requirements = await ctx.db
    .query("visaRequirements")
    .withIndex("by_visaProductId", (q) =>
      q.eq("visaProductId", application.visaProductId),
    )
    .collect();

  const current = await ctx.db
    .query("documents")
    .withIndex("by_application_current", (q) =>
      q.eq("applicationId", application._id).eq("isCurrent", true),
    )
    .collect();

  const missing: MissingDocument[] = [];

  for (const requirement of requirements) {
    if (!requirement.isMandatory) continue;

    if (requirement.appliesTo === "all" && applicants.length > 0) {
      for (const applicant of applicants) {
        const has = current.some(
          (d) =>
            d.documentKey === requirement.documentKey &&
            d.applicantId === applicant._id &&
            d.status !== "rejected",
        );
        if (!has) {
          missing.push({
            documentKey: requirement.documentKey,
            label: requirement.label,
            applicantId: applicant._id,
            applicantName: `${applicant.firstName} ${applicant.lastName}`.trim(),
          });
        }
      }
      continue;
    }

    const has = current.some(
      (d) => d.documentKey === requirement.documentKey && d.status !== "rejected",
    );
    if (!has) {
      missing.push({
        documentKey: requirement.documentKey,
        label: requirement.label,
      });
    }
  }

  return missing;
}

/* -------------------------------------------------------------------------- */
/*                                   upload                                   */
/* -------------------------------------------------------------------------- */

/**
 * Mint a one-shot Convex storage upload URL.
 *
 * The URL itself is unguessable but unauthenticated, so the gate has to be
 * here: the caller must already have access to the target application AND the
 * application must still be in a state that accepts uploads. Without the second
 * check a customer could keep pushing files onto an application that is already
 * with the embassy.
 */
export const generateUploadUrl = mutation({
  args: {
    applicationId: v.id("applications"),
    /** Accepted (and ignored) so the client can keep one call shape; the real
     *  per-document constraints are enforced in `attach`, after the bytes are
     *  in storage and the declared size/type can be checked against the row. */
    documentKey: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const access = await requireApplicationAccess(ctx, args.applicationId);

    if (!access.actingAsStaff) {
      const config =
        APPLICATION_STATUS_CONFIG[access.application.status as ApplicationStatus];
      if (!config?.customerCanUpload) {
        throw new ConvexError({
          code: "UPLOADS_CLOSED",
          message:
            "This application is no longer accepting uploads. Message the VisaDrive team if you need to send something.",
        });
      }
    }

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Record a document after the file has been PUT to the upload URL.
 *
 * Supersedes any previous current row for the same
 * `(applicationId, applicantId, documentKey)` triple, so a re-upload always
 * produces a new version rather than mutating history.
 */
export const attach = mutation({
  args: {
    applicationId: v.id("applications"),
    applicantId: v.optional(v.id("applicants")),
    storageId: v.id("_storage"),
    documentKey: v.string(),
    label: v.optional(v.string()),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
    documentRequestId: v.optional(v.id("documentRequests")),
  },
  returns: v.id("documents"),
  handler: async (ctx, args) => {
    const access = await requireApplicationAccess(ctx, args.applicationId);
    const application = access.application;
    const now = Date.now();

    if (!access.actingAsStaff) {
      const config =
        APPLICATION_STATUS_CONFIG[application.status as ApplicationStatus];
      if (!config?.customerCanUpload) {
        throw new ConvexError({
          code: "UPLOADS_CLOSED",
          message: "This application is no longer accepting uploads.",
        });
      }
    }

    // An applicant id, when given, must belong to this application — otherwise a
    // document could be filed against somebody else's traveller row.
    if (args.applicantId) {
      const applicant = await ctx.db.get(args.applicantId);
      if (!applicant || applicant.applicationId !== args.applicationId) {
        throw new ConvexError({
          code: "INVALID_APPLICANT",
          message: "That traveller does not belong to this application.",
        });
      }
    }

    // Upload constraints come from the product's requirement row when one
    // exists, else from the document-type catalogue, else the global default.
    const requirement = await ctx.db
      .query("visaRequirements")
      .withIndex("by_product_key", (q) =>
        q
          .eq("visaProductId", application.visaProductId)
          .eq("documentKey", args.documentKey),
      )
      .unique()
      .catch(() => null);

    const definition = DOCUMENT_TYPE_MAP[args.documentKey];
    const allowedMimeTypes =
      requirement?.allowedMimeTypes?.length
        ? requirement.allowedMimeTypes
        : (definition?.allowedMimeTypes ?? [...ACCEPTED_MIME_TYPES]);
    const maxSizeBytes = Math.min(
      requirement?.maxSizeBytes ?? definition?.maxSizeBytes ?? MAX_UPLOAD_BYTES,
      MAX_UPLOAD_BYTES,
    );

    if (!allowedMimeTypes.includes(args.mimeType)) {
      throw new ConvexError({
        code: "INVALID_FILE_TYPE",
        message: `${args.fileName} is not an accepted file type for this document.`,
      });
    }
    if (args.size <= 0 || args.size > maxSizeBytes) {
      throw new ConvexError({
        code: "FILE_TOO_LARGE",
        message: `${args.fileName} exceeds the ${Math.round(maxSizeBytes / (1024 * 1024))} MB limit for this document.`,
      });
    }

    // Supersede the previous current version of this exact slot.
    const previous = await ctx.db
      .query("documents")
      .withIndex("by_application_key", (q) =>
        q
          .eq("applicationId", args.applicationId)
          .eq("applicantId", args.applicantId)
          .eq("documentKey", args.documentKey),
      )
      .collect();

    const currentPrevious = previous.find((d) => d.isCurrent) ?? null;
    const highestVersion = previous.reduce((max, d) => Math.max(max, d.version), 0);

    if (currentPrevious) {
      await ctx.db.patch(currentPrevious._id, { isCurrent: false });
    }

    const documentId = await ctx.db.insert("documents", {
      applicationId: args.applicationId,
      applicantId: args.applicantId,
      // Ownership is the application owner, never the uploader — staff
      // uploading on a customer's behalf must not become the owner.
      userId: application.userId,
      storageId: args.storageId,
      documentKey: args.documentKey,
      label: args.label ?? requirement?.label ?? documentLabel(args.documentKey),
      fileName: args.fileName,
      mimeType: args.mimeType,
      size: args.size,
      status: "pending_review",
      version: highestVersion + 1,
      supersedesId: currentPrevious?._id,
      isCurrent: true,
      uploadedByStaffId: access.actingAsStaff ? access.user._id : undefined,
      documentRequestId: args.documentRequestId,
      createdAt: now,
    });

    // Close the open request this upload answers, if any.
    let requestId = args.documentRequestId ?? null;
    if (!requestId) {
      const openRequests = await ctx.db
        .query("documentRequests")
        .withIndex("by_application_status", (q) =>
          q.eq("applicationId", args.applicationId).eq("status", "open"),
        )
        .collect();
      const match = openRequests.find(
        (r) =>
          r.documentKey === args.documentKey &&
          (r.applicantId === undefined || r.applicantId === args.applicantId),
      );
      requestId = match?._id ?? null;
    }
    if (requestId) {
      await fulfilDocumentRequest(ctx, requestId, documentId);
      await ctx.db.patch(documentId, { documentRequestId: requestId });
    }

    await recountApplicationDocuments(ctx, args.applicationId);

    // Staff get one "documents uploaded" nudge per application per day — the
    // dedupe key folds a burst of eight passport scans into a single ping.
    if (!access.actingAsStaff && application.assignedAgentId) {
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        userId: application.assignedAgentId,
        type: NOTIFICATION_TYPES.DOCUMENTS_UPLOADED,
        title: "New documents uploaded",
        body: `${application.customerName} uploaded documents for ${application.referenceId}.`,
        link: `/admin/applications/${application._id}`,
        dedupeKey: `app:${application._id}:docsuploaded:${new Date(now).toISOString().slice(0, 13)}`,
        applicationId: application._id,
      });
    }

    return documentId;
  },
});

/* -------------------------------------------------------------------------- */
/*                                   reads                                    */
/* -------------------------------------------------------------------------- */

/** The product checklist merged with what has actually been uploaded. */
export const listByApplication = query({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    const access = await requireApplicationAccess(ctx, args.applicationId);
    const application = access.application;

    const [requirements, applicants, documents] = await Promise.all([
      ctx.db
        .query("visaRequirements")
        .withIndex("by_product_order", (q) =>
          q.eq("visaProductId", application.visaProductId),
        )
        .collect(),
      ctx.db
        .query("applicants")
        .withIndex("by_application_order", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
      ctx.db
        .query("documents")
        .withIndex("by_applicationId", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
    ]);

    const current = documents.filter((d) => d.isCurrent);

    const checklist = requirements.flatMap((requirement) => {
      const base = {
        documentKey: requirement.documentKey,
        label: requirement.label,
        description: requirement.description ?? null,
        sampleImageUrl: requirement.sampleImageUrl ?? null,
        isMandatory: requirement.isMandatory,
        appliesTo: requirement.appliesTo,
        allowedMimeTypes: requirement.allowedMimeTypes.length
          ? requirement.allowedMimeTypes
          : [...ACCEPTED_MIME_TYPES],
        maxSizeBytes: Math.min(requirement.maxSizeBytes || MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES),
        displayOrder: requirement.displayOrder,
      };

      if (requirement.appliesTo === "all" && applicants.length > 0) {
        return applicants.map((applicant) => ({
          ...base,
          applicantId: applicant._id,
          applicantName: `${applicant.firstName} ${applicant.lastName}`.trim(),
          document:
            current.find(
              (d) =>
                d.documentKey === requirement.documentKey &&
                d.applicantId === applicant._id,
            ) ?? null,
        }));
      }

      return [
        {
          ...base,
          applicantId: undefined as Id<"applicants"> | undefined,
          applicantName: undefined as string | undefined,
          document:
            current.find((d) => d.documentKey === requirement.documentKey) ?? null,
        },
      ];
    });

    // Anything uploaded that is not on the checklist (staff-requested extras).
    const checklistKeys = new Set(requirements.map((r) => r.documentKey));
    const extras = current.filter((d) => !checklistKeys.has(d.documentKey));

    return {
      checklist,
      extras,
      history: documents.filter((d) => !d.isCurrent),
      counts: {
        required: application.documentsRequiredCount,
        approved: application.documentsApprovedCount,
        uploaded: current.length,
        pendingReview: current.filter((d) => d.status === "pending_review").length,
        rejected: current.filter((d) => d.status === "rejected").length,
      },
      canUpload:
        access.actingAsStaff ||
        (APPLICATION_STATUS_CONFIG[application.status as ApplicationStatus]
          ?.customerCanUpload ??
          false),
    };
  },
});

/**
 * The single place a file URL is ever produced.
 *
 * Deliberately a query so the portal can re-resolve a URL after the signed one
 * expires without a round trip through a mutation. The access check is the
 * whole point — `requireDocumentAccess` allows the owner, or staff holding
 * `document:view`, and nobody else.
 */
export const getSignedUrl = query({
  args: { documentId: v.id("documents") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const { document } = await requireDocumentAccess(ctx, args.documentId);
    // NOTE: a `document.downloaded` audit row would need a mutation; the admin
    // UI records that separately when it opens the viewer.
    return await ctx.storage.getUrl(document.storageId);
  },
});

/**
 * The same thing for a B2B partner's business paperwork.
 *
 * Partner verification documents live in their own table — a GST certificate
 * belongs to a business, not to any one booking — but they must not acquire a
 * second, looser way to reach storage. So the URL is minted here, beside the
 * other one, and only after `requirePartnerDocumentAccess` passes: the partner
 * the file belongs to, or staff holding `partner:view`.
 *
 * Keeping both calls in this module is what makes "where can a file URL come
 * from?" a one-file answer.
 */
export const getPartnerSignedUrl = query({
  args: { partnerDocumentId: v.id("partnerDocuments") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const { document } = await requirePartnerDocumentAccess(
      ctx,
      args.partnerDocumentId,
    );
    return await ctx.storage.getUrl(document.storageId);
  },
});

/** Paginated review queue. */
export const listForAdmin = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(documentStatusValidator),
    applicationId: v.optional(v.id("applications")),
    reviewerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.DOCUMENT_VIEW);

    let stream;
    if (args.applicationId) {
      const applicationId = args.applicationId;
      stream = ctx.db
        .query("documents")
        .withIndex("by_applicationId", (q) => q.eq("applicationId", applicationId));
    } else if (args.status) {
      const status = args.status;
      stream = ctx.db
        .query("documents")
        .withIndex("by_status_createdAt", (q) => q.eq("status", status));
    } else {
      stream = ctx.db.query("documents").withIndex("by_status_createdAt");
    }

    let filtered = stream.order("desc");
    if (args.status && args.applicationId) {
      const status = args.status;
      filtered = filtered.filter((q) => q.eq(q.field("status"), status));
    }
    if (args.reviewerId) {
      const reviewerId = args.reviewerId;
      filtered = filtered.filter((q) => q.eq(q.field("reviewedBy"), reviewerId));
    }

    const result = await filtered.paginate(args.paginationOpts);

    // Resolve the parent application for each row on the page only — bounded by
    // the page size, never the table.
    const applicationIds = [...new Set(result.page.map((d) => d.applicationId))];
    const applications = await Promise.all(
      applicationIds.map((id) => ctx.db.get(id)),
    );
    const applicationById = new Map(
      applications.filter((a): a is Doc<"applications"> => a !== null).map((a) => [a._id, a]),
    );

    return {
      ...result,
      page: result.page.map((doc) => {
        const application = applicationById.get(doc.applicationId);
        return {
          ...doc,
          applicationReference: application?.referenceId ?? null,
          customerName: application?.customerName ?? null,
          destinationName: application?.destinationName ?? null,
        };
      }),
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                                   review                                   */
/* -------------------------------------------------------------------------- */

export const review = mutation({
  args: {
    documentId: v.id("documents"),
    status: documentStatusValidator,
    note: v.optional(v.string()),
    rejectionReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.DOCUMENT_REVIEW);
    const document = await ctx.db.get(args.documentId);
    if (!document) authError("NOT_FOUND", "Document not found.");

    if (args.status === "pending_review") {
      throw new ConvexError({
        code: "INVALID_REVIEW",
        message: "A review must approve, reject or request a replacement.",
      });
    }

    // A rejection the customer cannot act on is useless, so the reason is
    // mandatory and is what gets put in front of them.
    const reason = (args.rejectionReason ?? args.note ?? "").trim();
    if (
      (args.status === "rejected" || args.status === "replacement_requested") &&
      reason.length === 0
    ) {
      throw new ConvexError({
        code: "REASON_REQUIRED",
        message: "Tell the customer why this document was not accepted.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.documentId, {
      status: args.status,
      reviewedBy: staff.user._id,
      reviewedAt: now,
      reviewNote: args.note,
      rejectionReason: args.status === "approved" ? undefined : reason,
    });

    await recountApplicationDocuments(ctx, document.applicationId);

    const application = await ctx.db.get(document.applicationId);

    await recordAudit(ctx, {
      actor: staff.user,
      action:
        args.status === "approved"
          ? AUDIT_ACTIONS.DOCUMENT_APPROVED
          : AUDIT_ACTIONS.DOCUMENT_REJECTED,
      entityType: "document",
      entityId: args.documentId,
      summary: `${args.status === "approved" ? "Approved" : "Rejected"} "${document.label}" on ${application?.referenceId ?? document.applicationId}`,
      before: { status: document.status },
      after: { status: args.status, rejectionReason: reason || undefined },
    });

    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      userId: document.userId,
      type:
        args.status === "approved"
          ? NOTIFICATION_TYPES.DOCUMENT_APPROVED
          : NOTIFICATION_TYPES.DOCUMENT_REJECTED,
      title:
        args.status === "approved"
          ? `${document.label} approved`
          : `${document.label} needs attention`,
      body:
        args.status === "approved"
          ? `Your ${document.label} has been checked and accepted.`
          : reason,
      link: `/dashboard/applications/${document.applicationId}`,
      dedupeKey: dedupeKeys.documentReviewed(args.documentId, args.status),
      applicationId: document.applicationId,
    });

    return null;
  },
});

/* -------------------------------------------------------------------------- */
/*                                   delete                                   */
/* -------------------------------------------------------------------------- */

export const remove = mutation({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) authError("NOT_FOUND", "Document not found.");

    const application = await ctx.db.get(document.applicationId);
    if (!application) authError("NOT_FOUND", "Application not found.");

    const isOwner = document.userId === user._id;

    // The partner who placed a B2B booking gets the same self-service window
    // as the traveller who owns a direct one: they are the applicant side,
    // and a document filed into the wrong slot has to be fixable before the
    // booking is submitted. Resolved from the session, never an argument.
    const placingPartner =
      !isOwner && isPartnerRole(user.role)
        ? await getPartnerForUser(ctx, user._id)
        : null;
    const isPlacingPartner =
      !!placingPartner &&
      application.partnerId === placingPartner._id &&
      partnerCanTrade(placingPartner.status);

    let actorIsStaff = false;

    if ((isOwner || isPlacingPartner) && application.isDraft) {
      // Applicant-side self-service, but only while nothing is submitted.
    } else {
      // Anyone else (and the owner after submission) needs the delete grant.
      await requirePermission(ctx, PERMISSIONS.DOCUMENT_DELETE);
      actorIsStaff = true;
    }

    await ctx.db.delete(args.documentId);
    await ctx.storage.delete(document.storageId).catch(() => {
      // The row is the source of truth; a dangling blob is harmless.
    });

    // Promote the previous version back to current so the slot is not orphaned.
    if (document.isCurrent && document.supersedesId) {
      const previous = await ctx.db.get(document.supersedesId);
      if (previous) await ctx.db.patch(previous._id, { isCurrent: true });
    }

    await recountApplicationDocuments(ctx, document.applicationId);

    if (actorIsStaff) {
      await recordAudit(ctx, {
        actor: user,
        action: AUDIT_ACTIONS.DOCUMENT_DELETED,
        entityType: "document",
        entityId: args.documentId,
        summary: `Deleted "${document.label}" from ${application.referenceId}`,
        before: { fileName: document.fileName, status: document.status },
      });
    }

    return null;
  },
});
