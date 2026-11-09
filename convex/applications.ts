import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  action,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { applicationStatus, paymentStatus } from "./schema";
import {
  authError,
  requireApplicationAccess,
  requireBookingEditor,
  requirePermission,
  requireUser,
} from "./lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "./lib/audit";
import { generateReference } from "./lib/references";
import {
  FINAL_DOCUMENT_KEY,
  collectMissingMandatoryDocuments,
  recountApplicationDocuments,
} from "./documents";
import { computePricing, type PriceBreakdown } from "../lib/helpers/pricing";
import {
  marginSnapshot,
  notifyPartnerOfApplicationEvent,
  onPartnerBookingSubmitted,
  recountPartner,
  resolvePartnerQuote,
} from "./lib/partners";
import {
  ALLOWED_TRANSITIONS,
  APPLICATION_STATUS_CONFIG,
  canTransition,
  type ApplicationStatus,
} from "../lib/constants/statuses";
import { NOTIFICATION_TYPES, dedupeKeys } from "../lib/constants/notifications";
import { PERMISSIONS } from "../lib/constants/roles";

/* ============================================================================
 * Applications — the spine of the product.
 *
 * Invariants enforced here:
 *   • A customer may create a draft, fill it in, submit it and cancel it.
 *     Everything past `submitted` is staff-only.
 *   • `pricing` is always computed by `computePricing` from the catalogue row.
 *     No caller, customer or staff, ever supplies a total.
 *   • `paymentStatus` is never set from this file except to the "nothing owed"
 *     / "not paid yet" starting values. Money moves it, via `payments.ts`.
 *   • Every status change is validated against `ALLOWED_TRANSITIONS`, writes a
 *     `statusHistory` row and (when customer-visible) notifies.
 * ========================================================================== */

/* -------------------------------------------------------------------------- */
/*                                   helpers                                  */
/* -------------------------------------------------------------------------- */

/**
 * The single server-side pricing expression. Exported so `payments.ts` charges
 * exactly what this computed — the client never participates in the maths.
 */
export function pricingForProduct(
  product: Doc<"visaProducts">,
  travellerCount: number,
  now: number = Date.now(),
): PriceBreakdown {
  return computePricing({
    currency: product.currency,
    governmentFee: product.governmentFee,
    serviceFee: product.serviceFee,
    additionalCharges: product.additionalCharges,
    taxPercent: product.taxPercent,
    travellerCount,
    promoPrice: product.promoPrice,
    promoEndsAt: product.promoEndsAt,
    now,
  });
}

async function writeStatusHistory(
  ctx: MutationCtx,
  application: Doc<"applications">,
  toStatus: ApplicationStatus,
  opts: {
    fromStatus?: ApplicationStatus;
    note?: string;
    visibleToCustomer: boolean;
    changedBy?: Doc<"users"> | null;
  },
): Promise<void> {
  await ctx.db.insert("statusHistory", {
    applicationId: application._id,
    userId: application.userId,
    fromStatus: opts.fromStatus,
    toStatus,
    note: opts.note,
    visibleToCustomer: opts.visibleToCustomer,
    changedBy: opts.changedBy?._id,
    changedByName: opts.changedBy?.fullName ?? "VisaDrive",
    createdAt: Date.now(),
  });
}

/** Active staff who should be told about a new booking. Bounded by `.take`. */
async function notifiableStaff(ctx: MutationCtx): Promise<Doc<"users">[]> {
  const roles = ["manager", "admin", "super_admin"] as const;
  const batches = await Promise.all(
    roles.map((role) =>
      ctx.db
        .query("users")
        .withIndex("by_status_role", (q) =>
          q.eq("status", "active").eq("role", role),
        )
        .take(25),
    ),
  );
  return batches.flat();
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Quote anything that would otherwise break the row or column boundary.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\r\n");
}

function isoDate(ms?: number | null): string {
  return ms ? new Date(ms).toISOString() : "";
}

/* -------------------------------------------------------------------------- */
/*                                   drafts                                   */
/* -------------------------------------------------------------------------- */

/**
 * Start (or resume) a booking.
 *
 * One draft per (user, visaProduct): a customer who clicks "Apply" five times
 * should end up with one row, not five. Denormalised names are snapshotted now
 * so the admin table and the customer's own list never need a join, and so a
 * later catalogue rename does not rewrite history.
 */
export const createDraft = mutation({
  args: {
    visaProductId: v.id("visaProducts"),
    travellerCount: v.optional(v.number()),
  },
  returns: v.object({
    applicationId: v.id("applications"),
    referenceId: v.string(),
    reused: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    const product = await ctx.db.get(args.visaProductId);
    if (!product) authError("NOT_FOUND", "That visa service is not available.");
    if (!product.isPublished) {
      throw new ConvexError({
        code: "PRODUCT_UNAVAILABLE",
        message: "This visa service is not currently open for applications.",
      });
    }

    const destination = await ctx.db.get(product.destinationId);
    if (!destination) authError("NOT_FOUND", "Destination not found.");

    const travellerCount = Math.max(
      1,
      Math.min(Math.floor(args.travellerCount ?? 1), 20),
    );
    const pricing = pricingForProduct(product, travellerCount, now);

    // Bounded: a customer's open drafts, not the table.
    const existingDrafts = await ctx.db
      .query("applications")
      .withIndex("by_user_draft", (q) =>
        q.eq("userId", user._id).eq("isDraft", true),
      )
      .collect();

    const reusable = existingDrafts.find(
      (d) => d.visaProductId === args.visaProductId && d.status === "draft",
    );

    if (reusable) {
      await ctx.db.patch(reusable._id, {
        travellerCount,
        pricing,
        // Keep the snapshot fresh while it is still a draft — nothing has been
        // agreed yet, so a catalogue correction should be picked up.
        destinationName: destination.name,
        visaProductName: product.name,
        customerName: user.fullName,
        customerEmail: user.email,
        customerPhone: user.phone,
        paymentMode: product.paymentMode,
        updatedAt: now,
      });
      return {
        applicationId: reusable._id,
        referenceId: reusable.referenceId,
        reused: true,
      };
    }

    const referenceId = await generateReference(ctx, "application", now);

    const applicationId = await ctx.db.insert("applications", {
      referenceId,
      userId: user._id,
      destinationId: product.destinationId,
      visaProductId: product._id,
      destinationName: destination.name,
      visaProductName: product.name,
      customerName: user.fullName,
      customerEmail: user.email,
      customerPhone: user.phone,
      status: "draft",
      paymentStatus:
        product.paymentMode === "free_consultation" ? "not_required" : "unpaid",
      paymentMode: product.paymentMode,
      travellerCount,
      pricing,
      currentStep: 1,
      isDraft: true,
      lastAutosaveAt: now,
      documentsRequiredCount: 0,
      documentsApprovedCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    await recountApplicationDocuments(ctx, applicationId);

    return { applicationId, referenceId, reused: false };
  },
});

/**
 * Wizard autosave. Called on a timer, so it stays one get + one patch and does
 * no fan-out work. The patch is allow-listed: `status`, `paymentStatus`,
 * `pricing` and `userId` are not reachable from here by design.
 */
export const saveDraftStep = mutation({
  args: {
    applicationId: v.id("applications"),
    step: v.optional(v.number()),
    patch: v.object({
      travellerCount: v.optional(v.number()),
      departureCountry: v.optional(v.string()),
      travelPurpose: v.optional(v.string()),
      intendedArrivalDate: v.optional(v.number()),
      intendedDepartureDate: v.optional(v.number()),
      previousTravelHistory: v.optional(v.string()),
      hasPreviousVisaRejection: v.optional(v.boolean()),
      previousVisaRejectionNote: v.optional(v.string()),
      customerPhone: v.optional(v.string()),
      termsAccepted: v.optional(v.boolean()),
    }),
  },
  returns: v.object({ savedAt: v.number() }),
  handler: async (ctx, args) => {
    // Autosave belongs to the applicant side — the customer whose booking it
    // is, or the partner who placed it. Deliberately not staff: the CRM has
    // its own audited `updateTripDetails`, and autosaving over a half-typed
    // form from the office is the bug that rule avoids.
    const { application } = await requireBookingEditor(ctx, args.applicationId);

    if (!application.isDraft) {
      throw new ConvexError({
        code: "NOT_A_DRAFT",
        message: "This application has already been submitted.",
      });
    }

    const now = Date.now();
    const { termsAccepted, travellerCount, ...rest } = args.patch;

    const patch: Partial<Doc<"applications">> = {
      ...rest,
      lastAutosaveAt: now,
      updatedAt: now,
    };

    if (typeof args.step === "number") {
      patch.currentStep = Math.max(1, Math.min(Math.floor(args.step), 10));
    }
    if (termsAccepted === true) patch.termsAcceptedAt = now;
    if (termsAccepted === false) patch.termsAcceptedAt = undefined;

    if (typeof travellerCount === "number") {
      const next = Math.max(1, Math.min(Math.floor(travellerCount), 20));
      patch.travellerCount = next;
      if (next !== application.travellerCount) {
        // Traveller count is a price input, so the frozen snapshot has to move
        // with it — recomputed from the catalogue row, never from the client.
        const product = await ctx.db.get(application.visaProductId);
        if (product) patch.pricing = pricingForProduct(product, next, now);
      }
    }

    await ctx.db.patch(args.applicationId, patch);
    return { savedAt: now };
  },
});

export const getDraft = query({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    const editor = await requireBookingEditor(ctx, args.applicationId);
    // On a B2B booking the owner is the end traveller; the agent's margin is
    // the agent's business, so only the partner who placed it sees it.
    const application = editor.viaPartner
      ? editor.application
      : withoutMargin(editor.application);

    const [applicants, documents, product, requirements, destination] =
      await Promise.all([
        ctx.db
          .query("applicants")
          .withIndex("by_application_order", (q) =>
            q.eq("applicationId", args.applicationId),
          )
          .collect(),
        ctx.db
          .query("documents")
          .withIndex("by_application_current", (q) =>
            q.eq("applicationId", args.applicationId).eq("isCurrent", true),
          )
          .collect(),
        ctx.db.get(application.visaProductId),
        ctx.db
          .query("visaRequirements")
          .withIndex("by_product_order", (q) =>
            q.eq("visaProductId", application.visaProductId),
          )
          .collect(),
        // The wizard summary rail shows the destination flag beside the
        // product name; the application row only denormalises the name.
        ctx.db.get(application.destinationId),
      ]);

    return {
      application,
      applicants,
      documents,
      product,
      requirements,
      destination,
    };
  },
});

export const listMyDrafts = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const drafts = await ctx.db
      .query("applications")
      .withIndex("by_user_draft", (q) =>
        q.eq("userId", user._id).eq("isDraft", true),
      )
      .order("desc")
      .take(25);
    return drafts.map(withoutMargin);
  },
});

/* -------------------------------------------------------------------------- */
/*                                   submit                                   */
/* -------------------------------------------------------------------------- */

const BASE_APPLICANT_FIELDS = ["firstName", "lastName"] as const;

function missingApplicantFields(
  applicant: Doc<"applicants">,
  required: string[],
): string[] {
  const fields = new Set<string>([...BASE_APPLICANT_FIELDS, ...required]);
  const missing: string[] = [];

  for (const field of fields) {
    const value = (applicant as unknown as Record<string, unknown>)[field];
    if (value === undefined || value === null) {
      missing.push(field);
      continue;
    }
    if (typeof value === "string" && value.trim() === "") missing.push(field);
  }

  return missing;
}

/**
 * Submit a draft.
 *
 * Refuses with a structured `ConvexError` listing exactly what is missing so
 * the wizard can jump the customer to the offending step instead of showing a
 * generic failure. The pricing snapshot is (re)frozen here from the live
 * catalogue row — that figure is what `payments` will later charge.
 */
export const submit = mutation({
  args: {
    applicationId: v.id("applications"),
    acceptTerms: v.optional(v.boolean()),
  },
  returns: v.object({
    applicationId: v.id("applications"),
    referenceId: v.string(),
    status: applicationStatus,
    paymentStatus,
    requiresPayment: v.boolean(),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    const editor = await requireBookingEditor(ctx, args.applicationId);
    const { user, application } = editor;

    // Idempotent-ish: a double-clicked submit button returns the same answer
    // rather than throwing or writing a second statusHistory row.
    if (!application.isDraft || application.status !== "draft") {
      return {
        applicationId: application._id,
        referenceId: application.referenceId,
        status: application.status,
        paymentStatus: application.paymentStatus,
        requiresPayment:
          application.paymentMode === "pay_now" &&
          application.paymentStatus !== "paid",
        total: application.pricing.total,
      };
    }

    const now = Date.now();
    const product = await ctx.db.get(application.visaProductId);
    if (!product) authError("NOT_FOUND", "This visa service is no longer available.");

    const applicants = await ctx.db
      .query("applicants")
      .withIndex("by_application_order", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();

    /* ----------------------------- completeness ---------------------------- */

    const problems: string[] = [];
    const applicantIssues: Array<{
      applicantId: Id<"applicants"> | null;
      name: string;
      missingFields: string[];
    }> = [];

    if (applicants.length === 0) {
      problems.push("Add at least one traveller.");
      applicantIssues.push({
        applicantId: null,
        name: "Traveller 1",
        missingFields: [...BASE_APPLICANT_FIELDS],
      });
    }
    if (applicants.length > 0 && applicants.length !== application.travellerCount) {
      problems.push(
        `You selected ${application.travellerCount} traveller(s) but added ${applicants.length}.`,
      );
    }
    if (!applicants.some((a) => a.isPrimary)) {
      problems.push("Mark one traveller as the primary applicant.");
    }

    for (const applicant of applicants) {
      const missing = missingApplicantFields(
        applicant,
        product.requiredApplicantFields,
      );
      if (missing.length > 0) {
        applicantIssues.push({
          applicantId: applicant._id,
          name: `${applicant.firstName} ${applicant.lastName}`.trim() || "Traveller",
          missingFields: missing,
        });
      }
    }

    const missingDocuments = await collectMissingMandatoryDocuments(
      ctx,
      application,
      applicants,
    );

    const termsAccepted =
      args.acceptTerms === true || application.termsAcceptedAt !== undefined;
    if (!termsAccepted) {
      problems.push("Accept the terms and conditions to continue.");
    }

    if (
      problems.length > 0 ||
      applicantIssues.length > 0 ||
      missingDocuments.length > 0
    ) {
      throw new ConvexError({
        code: "INCOMPLETE_APPLICATION",
        message: "This application is not complete yet.",
        problems,
        applicants: applicantIssues,
        documents: missingDocuments,
      });
    }

    /* ------------------------------- freeze -------------------------------- */

    // Both branches recompute from the catalogue row. A partner booking's
    // total is its *partner* price — what the agent's customer pays, and what
    // Razorpay will be asked for — with the base and the margin kept beside
    // it so a later rate change never rewrites what was earned here.
    let pricing: PriceBreakdown;
    let partnerMargin = application.partnerMargin;

    if (editor.viaPartner && editor.partner) {
      const quote = await resolvePartnerQuote(
        ctx,
        editor.partner,
        product,
        applicants.length,
        now,
      );
      pricing = quote.breakdown;
      partnerMargin = marginSnapshot(quote);
    } else {
      pricing = pricingForProduct(product, applicants.length, now);
    }

    // Payment status at submission is a function of how the product is sold —
    // never of anything the client sent. `pay_after_confirmation` and
    // `manual_offline` still owe money, they just owe it later, so they start
    // `unpaid` too; only a free consultation (or a zero total) owes nothing.
    const nextPaymentStatus =
      application.paymentMode === "free_consultation" || pricing.total <= 0
        ? ("not_required" as const)
        : ("unpaid" as const);

    await ctx.db.patch(application._id, {
      status: "submitted",
      paymentStatus: nextPaymentStatus,
      pricing,
      ...(partnerMargin ? { partnerMargin } : {}),
      travellerCount: applicants.length,
      isDraft: false,
      currentStep: Math.max(application.currentStep, 5),
      termsAcceptedAt: application.termsAcceptedAt ?? now,
      submittedAt: now,
      updatedAt: now,
    });

    const submitted = (await ctx.db.get(application._id))!;

    await writeStatusHistory(ctx, submitted, "submitted", {
      fromStatus: "draft",
      note: editor.viaPartner
        ? `Application submitted by ${editor.partner?.agencyName ?? "a VisaDrive partner"}.`
        : "Application submitted by the customer.",
      visibleToCustomer: true,
      changedBy: user,
    });

    await recountApplicationDocuments(ctx, application._id);

    // Denormalised counter on the *owner's* row — the traveller's — which is
    // what the customer list screen counts. On a partner booking the caller
    // and the owner are different people, so this cannot use `user`.
    const owner = await ctx.db.get(submitted.userId);
    if (owner) {
      await ctx.db.patch(owner._id, {
        applicationCount: (owner.applicationCount ?? 0) + 1,
        lastActiveAt: now,
      });
    }

    // Partner-side bookkeeping and the agent's own copy of the confirmation.
    // A no-op on a direct booking, because `partnerId` is unset.
    await onPartnerBookingSubmitted(ctx, submitted);

    /* ----------------------------- notifications --------------------------- */

    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      userId: submitted.userId,
      type: NOTIFICATION_TYPES.BOOKING_SUBMITTED,
      title: `Application ${submitted.referenceId} received`,
      body: `We have your ${submitted.visaProductName} application for ${submitted.destinationName}. Our team will review it shortly.`,
      link: `/dashboard/applications/${submitted._id}`,
      dedupeKey: dedupeKeys.bookingSubmitted(submitted._id),
      applicationId: submitted._id,
    });

    for (const staff of await notifiableStaff(ctx)) {
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        userId: staff._id,
        type: NOTIFICATION_TYPES.APPLICATION_CREATED,
        title: "New application submitted",
        body: `${submitted.customerName} — ${submitted.visaProductName} (${submitted.destinationName})`,
        link: `/admin/applications/${submitted._id}`,
        dedupeKey: `app:${submitted._id}:created:staff:${staff._id}`,
        applicationId: submitted._id,
      });
    }

    return {
      applicationId: submitted._id,
      referenceId: submitted.referenceId,
      status: submitted.status,
      paymentStatus: submitted.paymentStatus,
      requiresPayment:
        submitted.paymentMode === "pay_now" && nextPaymentStatus === "unpaid",
      total: pricing.total,
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                               customer reads                               */
/* -------------------------------------------------------------------------- */

export const listMine = query({
  args: {
    paginationOpts: paginationOptsValidator,
    includeDrafts: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    let stream = ctx.db
      .query("applications")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc");

    if (!args.includeDrafts) {
      stream = stream.filter((q) => q.eq(q.field("isDraft"), false));
    }

    const result = await stream.paginate(args.paginationOpts);
    // The caller owns these rows as the traveller; never the agent's margin.
    return { ...result, page: result.page.map(withoutMargin) };
  },
});

/**
 * The agent's frozen margin (what they pay VisaDrive and their markup) must
 * never reach the end traveller who owns a B2B booking row.
 */
function withoutMargin<T extends Doc<"applications">>(
  application: T,
): T {
  const { partnerMargin: _partnerMargin, ...rest } = application;
  void _partnerMargin;
  return rest as T;
}

async function applicationDetail(
  ctx: QueryCtx,
  application: Doc<"applications">,
  opts: { includeInternal: boolean; includeMargin: boolean },
) {
  const [applicants, documents, timeline, payments, documentRequests] =
    await Promise.all([
      ctx.db
        .query("applicants")
        .withIndex("by_application_order", (q) =>
          q.eq("applicationId", application._id),
        )
        .collect(),
      ctx.db
        .query("documents")
        .withIndex("by_application_current", (q) =>
          q.eq("applicationId", application._id).eq("isCurrent", true),
        )
        .collect(),
      ctx.db
        .query("statusHistory")
        .withIndex("by_application_created", (q) =>
          q.eq("applicationId", application._id),
        )
        .order("desc")
        .take(100),
      ctx.db
        .query("payments")
        .withIndex("by_applicationId", (q) =>
          q.eq("applicationId", application._id),
        )
        .order("desc")
        .take(50),
      ctx.db
        .query("documentRequests")
        .withIndex("by_applicationId", (q) =>
          q.eq("applicationId", application._id),
        )
        .order("desc")
        .take(50),
    ]);

  return {
    application: opts.includeMargin ? application : withoutMargin(application),
    applicants,
    documents,
    documentRequests,
    payments,
    // Internal transitions stay out of the customer's timeline.
    timeline: opts.includeInternal
      ? timeline
      : timeline.filter((t) => t.visibleToCustomer),
  };
}

export const getMine = query({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    const access = await requireApplicationAccess(ctx, args.applicationId);
    return await applicationDetail(ctx, access.application, {
      includeInternal: access.viaStaff,
      includeMargin: access.viaStaff || access.viaPartner,
    });
  },
});

export const getByReference = query({
  args: { referenceId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const application = await ctx.db
      .query("applications")
      .withIndex("by_referenceId", (q) =>
        q.eq("referenceId", args.referenceId.trim().toUpperCase()),
      )
      .unique();

    if (!application) return null;

    // Re-run the full access check by id rather than trusting the lookup: a
    // reference number is guessable, ownership is not.
    const access = await requireApplicationAccess(ctx, application._id);
    void user;
    return await applicationDetail(ctx, access.application, {
      includeInternal: access.viaStaff,
      includeMargin: access.viaStaff || access.viaPartner,
    });
  },
});

/** Statuses a customer may still walk away from. */
const CUSTOMER_CANCELLABLE: ApplicationStatus[] = [
  "draft",
  "submitted",
  "documents_pending",
  "documents_submitted",
  "additional_documents_requested",
];

export const cancelMine = mutation({
  args: {
    applicationId: v.id("applications"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // The applicant side may walk away: the traveller, or the agent who
    // booked on their behalf. Both are cancelling their own booking.
    const editor = await requireBookingEditor(ctx, args.applicationId);
    const { user, application } = editor;

    const from = application.status as ApplicationStatus;
    if (!CUSTOMER_CANCELLABLE.includes(from) || !canTransition(from, "cancelled")) {
      throw new ConvexError({
        code: "CANCELLATION_CLOSED",
        message:
          "This application has already moved into processing. Contact the VisaDrive team to cancel it.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(application._id, {
      status: "cancelled",
      isDraft: false,
      cancelledAt: now,
      updatedAt: now,
    });

    await writeStatusHistory(ctx, application, "cancelled", {
      fromStatus: from,
      note: args.reason?.trim() || "Cancelled by the customer.",
      visibleToCustomer: true,
      changedBy: user,
    });

    await recordAudit(ctx, {
      actor: user,
      action: AUDIT_ACTIONS.APPLICATION_CANCELLED,
      entityType: "application",
      entityId: application._id,
      summary: `${
        editor.viaPartner ? (editor.partner?.agencyName ?? user.fullName) : user.fullName
      } cancelled ${application.referenceId}`,
      before: { status: from },
      after: { status: "cancelled", reason: args.reason },
    });

    // A cancelled partner booking stops counting towards their volume.
    if (application.partnerId) {
      await recountPartner(ctx, application.partnerId);
    }

    return null;
  },
});

/* -------------------------------------------------------------------------- */
/*                                   admin                                    */
/* -------------------------------------------------------------------------- */

const adminFilterArgs = {
  search: v.optional(v.string()),
  status: v.optional(applicationStatus),
  paymentStatus: v.optional(paymentStatus),
  destinationId: v.optional(v.id("destinations")),
  assignedAgentId: v.optional(v.id("users")),
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
  sort: v.optional(v.union(v.literal("newest"), v.literal("oldest"))),
  includeDrafts: v.optional(v.boolean()),
};

type AdminFilters = {
  search?: string;
  status?: ApplicationStatus;
  paymentStatus?: Doc<"applications">["paymentStatus"];
  destinationId?: Id<"destinations">;
  assignedAgentId?: Id<"users">;
  dateFrom?: number;
  dateTo?: number;
  sort?: "newest" | "oldest";
  includeDrafts?: boolean;
};

/**
 * Build the narrowest indexed stream the filter set allows, then apply the
 * leftovers as a post-filter. Order of preference matters: the search index
 * wins when there is a search term because it is the only thing that can match
 * a name prefix, and `assignedAgentId` beats the rest because an agent's queue
 * is by far the smallest slice.
 */
function adminStream(ctx: QueryCtx, filters: AdminFilters) {
  if (filters.search && filters.search.trim().length > 0) {
    const term = filters.search.trim();
    return ctx.db.query("applications").withSearchIndex(
      "search_applications",
      (q) => {
        let s = q.search("customerName", term);
        if (filters.status) s = s.eq("status", filters.status);
        if (filters.paymentStatus) s = s.eq("paymentStatus", filters.paymentStatus);
        if (filters.destinationId) s = s.eq("destinationId", filters.destinationId);
        return s;
      },
    );
  }

  if (filters.assignedAgentId) {
    const assignedAgentId = filters.assignedAgentId;
    return ctx.db
      .query("applications")
      .withIndex("by_assignedAgentId", (q) =>
        q.eq("assignedAgentId", assignedAgentId),
      )
      .order(filters.sort === "oldest" ? "asc" : "desc");
  }

  if (filters.destinationId) {
    const destinationId = filters.destinationId;
    return ctx.db
      .query("applications")
      .withIndex("by_destinationId", (q) => q.eq("destinationId", destinationId))
      .order(filters.sort === "oldest" ? "asc" : "desc");
  }

  if (filters.status) {
    const status = filters.status;
    return ctx.db
      .query("applications")
      .withIndex("by_status_createdAt", (q) => {
        let r = q.eq("status", status);
        if (filters.dateFrom !== undefined) {
          r = r.gte("createdAt", filters.dateFrom) as typeof r;
        }
        if (filters.dateTo !== undefined) {
          r = r.lte("createdAt", filters.dateTo) as typeof r;
        }
        return r;
      })
      .order(filters.sort === "oldest" ? "asc" : "desc");
  }

  return ctx.db
    .query("applications")
    .withIndex("by_createdAt", (q) => {
      let r = q;
      if (filters.dateFrom !== undefined) {
        r = r.gte("createdAt", filters.dateFrom) as typeof r;
      }
      if (filters.dateTo !== undefined) {
        r = r.lte("createdAt", filters.dateTo) as typeof r;
      }
      return r;
    })
    .order(filters.sort === "oldest" ? "asc" : "desc");
}

function applyLeftoverFilters(
  stream: ReturnType<typeof adminStream>,
  filters: AdminFilters,
  options: { indexedStatus: boolean; indexedDates: boolean },
): ReturnType<typeof adminStream> {
  let s = stream;
  const {
    includeDrafts,
    status,
    paymentStatus,
    destinationId,
    assignedAgentId,
    dateFrom,
    dateTo,
  } = filters;

  if (!includeDrafts) {
    // Drafts are "only visible to the customer" — they must not appear in the
    // CRM list by default.
    s = s.filter((q) => q.eq(q.field("isDraft"), false));
  }
  if (status && !options.indexedStatus) {
    s = s.filter((q) => q.eq(q.field("status"), status));
  }
  if (paymentStatus) {
    s = s.filter((q) => q.eq(q.field("paymentStatus"), paymentStatus));
  }
  if (destinationId) {
    s = s.filter((q) => q.eq(q.field("destinationId"), destinationId));
  }
  if (assignedAgentId) {
    s = s.filter((q) => q.eq(q.field("assignedAgentId"), assignedAgentId));
  }
  if (!options.indexedDates && dateFrom !== undefined) {
    s = s.filter((q) => q.gte(q.field("createdAt"), dateFrom));
  }
  if (!options.indexedDates && dateTo !== undefined) {
    s = s.filter((q) => q.lte(q.field("createdAt"), dateTo));
  }

  return s;
}

function streamOptions(filters: AdminFilters) {
  const usingSearch = !!(filters.search && filters.search.trim().length > 0);
  const usingStatusIndex =
    !usingSearch &&
    !filters.assignedAgentId &&
    !filters.destinationId &&
    !!filters.status;
  const usingDateIndex =
    !usingSearch && !filters.assignedAgentId && !filters.destinationId;

  return {
    // The search index filters status/paymentStatus/destinationId itself.
    indexedStatus: usingSearch || usingStatusIndex,
    indexedDates: usingDateIndex,
  };
}

export const listForAdmin = query({
  args: { paginationOpts: paginationOptsValidator, ...adminFilterArgs },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.APPLICATION_VIEW_ALL);
    const filters = args as AdminFilters;
    const options = streamOptions(filters);
    const stream = applyLeftoverFilters(
      adminStream(ctx, filters),
      // The search index already applied these three; re-filtering is cheap but
      // pointless, so only the non-indexed leftovers are added.
      options.indexedStatus
        ? { ...filters, status: undefined, paymentStatus: undefined, destinationId: undefined }
        : filters,
      options,
    );

    const result = (await stream.paginate(args.paginationOpts)) as {
      page: Doc<"applications">[];
      isDone: boolean;
      continueCursor: string;
    };

    const agentIds = [
      ...new Set(
        result.page
          .map((a: Doc<"applications">) => a.assignedAgentId)
          .filter((id): id is Id<"users"> => !!id),
      ),
    ];
    const agents = await Promise.all(agentIds.map((id) => ctx.db.get(id)));
    const agentName = new Map(
      agents
        .filter((a): a is Doc<"users"> => a !== null)
        .map((a) => [a._id as Id<"users">, a.fullName]),
    );

    const partnerIds = [
      ...new Set(
        result.page
          .map((a: Doc<"applications">) => a.partnerId)
          .filter((id): id is Id<"partners"> => !!id),
      ),
    ];
    const partners = await Promise.all(partnerIds.map((id) => ctx.db.get(id)));
    const partnerName = new Map(
      partners
        .filter((p): p is Doc<"partners"> => p !== null)
        .map((p) => [p._id as Id<"partners">, p.agencyName]),
    );

    return {
      ...result,
      page: result.page.map((application: Doc<"applications">) => {
        // The list never renders the margin, so it never ships it.
        return {
          ...withoutMargin(application),
          assignedAgentName: application.assignedAgentId
            ? (agentName.get(application.assignedAgentId) ?? null)
            : null,
          partnerName: application.partnerId
            ? (partnerName.get(application.partnerId) ?? null)
            : null,
        };
      }),
    };
  },
});

export const getForAdmin = query({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    const access = await requireApplicationAccess(ctx, args.applicationId);
    if (!access.viaStaff) {
      authError("FORBIDDEN", "This view is restricted to VisaDrive staff.");
    }

    const permissions = access.staff!.permissions;
    const canSeeCommercials = permissions.has(PERMISSIONS.PARTNER_PRICING);
    const canSeePartner = permissions.has(PERMISSIONS.PARTNER_VIEW);
    // Never ship the frozen margin to staff without the commercial permission.
    const detail = await applicationDetail(ctx, access.application, {
      includeInternal: true,
      includeMargin: canSeeCommercials,
    });

    const [customer, product, destination, assignedAgent, partner] = await Promise.all([
      ctx.db.get(access.application.userId),
      ctx.db.get(access.application.visaProductId),
      ctx.db.get(access.application.destinationId),
      access.application.assignedAgentId
        ? ctx.db.get(access.application.assignedAgentId)
        : Promise.resolve(null),
      access.application.partnerId
        ? ctx.db.get(access.application.partnerId)
        : Promise.resolve(null),
    ]);

    const requirements = product
      ? await ctx.db
          .query("visaRequirements")
          .withIndex("by_product_order", (q) =>
            q.eq("visaProductId", product._id),
          )
          .collect()
      : [];

    // The partner's own record of the traveller this booking was made for.
    // `.take(2)` rather than `.unique()`: a duplicate row must not crash the page.
    const partnerRows = partner
      ? await ctx.db
          .query("partnerCustomers")
          .withIndex("by_partner_user", (q) =>
            q.eq("partnerId", partner._id).eq("userId", access.application.userId),
          )
          .take(2)
      : [];
    const partnerCustomer =
      partnerRows.find((r) => !r.isArchived) ?? partnerRows[0] ?? null;

    return {
      ...detail,
      partnerCustomer: partnerCustomer
        ? {
            _id: partnerCustomer._id,
            fullName: partnerCustomer.fullName,
            email: partnerCustomer.email,
            phone: partnerCustomer.phone,
            reference: partnerCustomer.reference,
          }
        : null,
      /** null = caller lacks the permission; undefined margin = not frozen yet. */
      commercials:
        partner && canSeeCommercials
          ? { partnerMargin: access.application.partnerMargin ?? null }
          : null,
      customer: customer
        ? {
            _id: customer._id,
            fullName: customer.fullName,
            email: customer.email,
            phone: customer.phone,
            status: customer.status,
            applicationCount: customer.applicationCount,
          }
        : null,
      product,
      destination,
      requirements,
      assignedAgent: assignedAgent
        ? { _id: assignedAgent._id, fullName: assignedAgent.fullName }
        : null,
      partner: partner && canSeePartner
        ? {
            _id: partner._id,
            partnerCode: partner.partnerCode,
            agencyName: partner.agencyName,
            contactPersonName: partner.contactPersonName,
            contactEmail: partner.contactEmail,
            contactPhone: partner.contactPhone,
            businessType: partner.businessType,
            city: partner.city,
            country: partner.country,
            status: partner.status,
            bookingCount: partner.bookingCount,
          }
        : null,
      allowedTransitions:
        ALLOWED_TRANSITIONS[access.application.status as ApplicationStatus] ?? [],
      statusConfig:
        APPLICATION_STATUS_CONFIG[access.application.status as ApplicationStatus],
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                              status management                             */
/* -------------------------------------------------------------------------- */

async function applyStatusChange(
  ctx: MutationCtx,
  args: {
    application: Doc<"applications">;
    to: ApplicationStatus;
    note?: string;
    visibleToCustomer: boolean;
    actor: Doc<"users">;
    force: boolean;
  },
): Promise<void> {
  const { application, to, actor } = args;
  const from = application.status as ApplicationStatus;
  const now = Date.now();

  const patch: Partial<Doc<"applications">> = { status: to, updatedAt: now };
  if (to === "completed") patch.completedAt = now;
  if (to === "cancelled") patch.cancelledAt = now;

  await ctx.db.patch(application._id, patch);

  await writeStatusHistory(ctx, application, to, {
    fromStatus: from,
    note: args.note,
    visibleToCustomer: args.visibleToCustomer,
    changedBy: actor,
  });

  await recordAudit(ctx, {
    actor,
    action: AUDIT_ACTIONS.APPLICATION_STATUS_CHANGED,
    entityType: "application",
    entityId: application._id,
    summary: `${application.referenceId}: ${from} → ${to}`,
    before: { status: from },
    after: { status: to, note: args.note },
  });

  if (args.force) {
    // A forced move broke the state machine on purpose. It gets its own row so
    // "who overrode what" is answerable without diffing the whole audit log.
    await recordAudit(ctx, {
      actor,
      action: "application.status_forced",
      entityType: "application",
      entityId: application._id,
      summary: `${actor.fullName} forced ${application.referenceId} from ${from} to ${to}, bypassing the allowed transitions.`,
      before: { status: from },
      after: { status: to, note: args.note },
    });
  }

  if (args.visibleToCustomer) {
    const config = APPLICATION_STATUS_CONFIG[to];
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      userId: application.userId,
      type: NOTIFICATION_TYPES.APPLICATION_STATUS_CHANGED,
      title: `${application.referenceId}: ${config.customerLabel}`,
      body: args.note?.trim() || config.description,
      link: `/dashboard/applications/${application._id}`,
      dedupeKey: dedupeKeys.applicationStatus(application._id, to),
      applicationId: application._id,
    });

    // The agent who placed a B2B booking gets their own copy, under its own
    // dedupe key — they are the one the traveller will phone. A no-op on a
    // direct booking, where `partnerId` is unset.
    await notifyPartnerOfApplicationEvent(ctx, application, {
      type:
        to === "completed"
          ? NOTIFICATION_TYPES.PARTNER_BOOKING_COMPLETED
          : NOTIFICATION_TYPES.PARTNER_BOOKING_STATUS_CHANGED,
      title: `${application.referenceId}: ${config.label}`,
      body: `${application.customerName} — ${args.note?.trim() || config.description}`,
      dedupeKey: dedupeKeys.partnerBookingStatus(application._id, to),
      statusLabel: config.label,
      reason: args.note?.trim(),
    });
  }

  // Volume and margin exclude cancelled bookings, so a cancellation from the
  // CRM has to move the partner's counters too.
  if (application.partnerId && (to === "cancelled" || to === "completed")) {
    await recountPartner(ctx, application.partnerId);
  }
}

export const updateStatus = mutation({
  args: {
    applicationId: v.id("applications"),
    status: applicationStatus,
    note: v.optional(v.string()),
    visibleToCustomer: v.optional(v.boolean()),
    /** Explicit override of `ALLOWED_TRANSITIONS`. Audited separately. */
    force: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireApplicationAccess(ctx, args.applicationId, {
      write: true,
    });
    if (!access.viaStaff) {
      authError("FORBIDDEN", "Only VisaDrive staff can change an application's status.");
    }

    const application = access.application;
    const from = application.status as ApplicationStatus;
    const to = args.status as ApplicationStatus;

    if (from === to) return null;

    const force = args.force === true;
    if (!canTransition(from, to)) {
      if (!force) {
        throw new ConvexError({
          code: "INVALID_TRANSITION",
          message: `An application cannot move from "${APPLICATION_STATUS_CONFIG[from].label}" to "${APPLICATION_STATUS_CONFIG[to].label}".`,
          from,
          to,
          allowed: ALLOWED_TRANSITIONS[from] ?? [],
        });
      }
      // `force` is already gated: requireApplicationAccess({ write: true })
      // demands `application:update_status`.
    }

    await applyStatusChange(ctx, {
      application,
      to,
      note: args.note,
      visibleToCustomer: args.visibleToCustomer ?? true,
      actor: access.user,
      force: force && !canTransition(from, to),
    });

    return null;
  },
});

/**
 * Staff correcting the trip details on a submitted application.
 *
 * The customer's own route into these fields is `saveDraftStep`, which stops
 * at submission — after that the booking is the office's to correct, usually
 * because the customer phoned in a date change. Deliberately the same
 * allow-list of columns: `status`, `paymentStatus`, `pricing` and
 * `travellerCount` are not reachable here either, because each of them has a
 * mutation of its own that does the arithmetic or the transition check.
 */
export const updateTripDetails = mutation({
  args: {
    applicationId: v.id("applications"),
    patch: v.object({
      departureCountry: v.optional(v.string()),
      travelPurpose: v.optional(v.string()),
      intendedArrivalDate: v.optional(v.union(v.number(), v.null())),
      intendedDepartureDate: v.optional(v.union(v.number(), v.null())),
      previousTravelHistory: v.optional(v.string()),
      hasPreviousVisaRejection: v.optional(v.boolean()),
      previousVisaRejectionNote: v.optional(v.string()),
      customerPhone: v.optional(v.string()),
    }),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireApplicationAccess(ctx, args.applicationId, {
      write: true,
    });
    const application = access.application;

    const patch: Partial<Doc<"applications">> = { updatedAt: Date.now() };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    const text = (value: string | undefined) => {
      const trimmed = value?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : undefined;
    };

    for (const key of [
      "departureCountry",
      "travelPurpose",
      "previousTravelHistory",
      "previousVisaRejectionNote",
      "customerPhone",
    ] as const) {
      const value = args.patch[key];
      if (value === undefined) continue;
      patch[key] = text(value);
      before[key] = application[key];
      after[key] = patch[key];
    }

    for (const key of ["intendedArrivalDate", "intendedDepartureDate"] as const) {
      const value = args.patch[key];
      if (value === undefined) continue;
      // `null` clears the date; the schema column is optional, and `undefined`
      // in a patch is how Convex removes it.
      patch[key] = value === null ? undefined : value;
      before[key] = application[key];
      after[key] = patch[key];
    }

    if (args.patch.hasPreviousVisaRejection !== undefined) {
      patch.hasPreviousVisaRejection = args.patch.hasPreviousVisaRejection;
      before.hasPreviousVisaRejection = application.hasPreviousVisaRejection;
      after.hasPreviousVisaRejection = args.patch.hasPreviousVisaRejection;
    }

    const arrival = patch.intendedArrivalDate ?? application.intendedArrivalDate;
    const departure =
      patch.intendedDepartureDate ?? application.intendedDepartureDate;
    if (arrival !== undefined && departure !== undefined && departure < arrival) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "The return date cannot be before the arrival date.",
      });
    }

    if (Object.keys(after).length === 0) return null;

    await ctx.db.patch(application._id, patch);

    await recordAudit(ctx, {
      actor: access.user,
      action: "application.trip_details_updated",
      entityType: "application",
      entityId: application._id,
      summary: `${access.user.fullName} corrected the trip details on ${application.referenceId}${
        args.note?.trim() ? ` — ${args.note.trim()}` : ""
      }`,
      before,
      after,
    });

    return null;
  },
});

export const bulkUpdateStatus = mutation({
  args: {
    applicationIds: v.array(v.id("applications")),
    status: applicationStatus,
    note: v.optional(v.string()),
    visibleToCustomer: v.optional(v.boolean()),
  },
  returns: v.object({
    updated: v.number(),
    skipped: v.array(
      v.object({ applicationId: v.id("applications"), reason: v.string() }),
    ),
  }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.APPLICATION_BULK_UPDATE);

    if (args.applicationIds.length === 0 || args.applicationIds.length > 200) {
      throw new ConvexError({
        code: "INVALID_SELECTION",
        message: "Select between 1 and 200 applications.",
      });
    }

    const to = args.status as ApplicationStatus;
    const skipped: Array<{ applicationId: Id<"applications">; reason: string }> = [];
    let updated = 0;

    for (const applicationId of args.applicationIds) {
      const application = await ctx.db.get(applicationId);
      if (!application) {
        skipped.push({ applicationId, reason: "Not found" });
        continue;
      }
      const from = application.status as ApplicationStatus;
      if (from === to) {
        skipped.push({ applicationId, reason: "Already in that status" });
        continue;
      }
      // Bulk never forces — an override has to be a deliberate, single act.
      if (!canTransition(from, to)) {
        skipped.push({
          applicationId,
          reason: `Cannot move from ${APPLICATION_STATUS_CONFIG[from].label}`,
        });
        continue;
      }

      await applyStatusChange(ctx, {
        application,
        to,
        note: args.note,
        visibleToCustomer: args.visibleToCustomer ?? true,
        actor: staff.user,
        force: false,
      });
      updated += 1;
    }

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.APPLICATION_BULK_UPDATED,
      entityType: "application",
      entityId: "bulk",
      summary: `Bulk status change to ${to}: ${updated} updated, ${skipped.length} skipped.`,
      after: { status: to, updated, skipped: skipped.length },
    });

    return { updated, skipped };
  },
});

export const assignAgent = mutation({
  args: {
    applicationId: v.id("applications"),
    agentId: v.union(v.id("users"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.APPLICATION_ASSIGN);
    const application = await ctx.db.get(args.applicationId);
    if (!application) authError("NOT_FOUND", "Application not found.");

    const now = Date.now();

    if (args.agentId === null) {
      await ctx.db.patch(application._id, {
        assignedAgentId: undefined,
        assignedAt: undefined,
        updatedAt: now,
      });
      await recordAudit(ctx, {
        actor: staff.user,
        action: AUDIT_ACTIONS.APPLICATION_ASSIGNED,
        entityType: "application",
        entityId: application._id,
        summary: `Unassigned ${application.referenceId}`,
        before: { assignedAgentId: application.assignedAgentId },
        after: { assignedAgentId: null },
      });
      return null;
    }

    const agent = await ctx.db.get(args.agentId);
    if (!agent) authError("NOT_FOUND", "That staff member does not exist.");
    if (agent.role === "customer" || agent.status !== "active") {
      throw new ConvexError({
        code: "INVALID_ASSIGNEE",
        message: "Applications can only be assigned to an active staff member.",
      });
    }

    await ctx.db.patch(application._id, {
      assignedAgentId: agent._id,
      assignedAt: now,
      updatedAt: now,
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.APPLICATION_ASSIGNED,
      entityType: "application",
      entityId: application._id,
      summary: `Assigned ${application.referenceId} to ${agent.fullName}`,
      before: { assignedAgentId: application.assignedAgentId },
      after: { assignedAgentId: agent._id },
    });

    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      userId: agent._id,
      type: NOTIFICATION_TYPES.APPLICATION_ASSIGNED,
      title: `${application.referenceId} assigned to you`,
      body: `${application.customerName} — ${application.visaProductName} (${application.destinationName})`,
      link: `/admin/applications/${application._id}`,
      dedupeKey: dedupeKeys.applicationAssigned(application._id, agent._id),
      applicationId: application._id,
    });

    return null;
  },
});

export const uploadFinalDocument = mutation({
  args: {
    applicationId: v.id("applications"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.APPLICATION_UPLOAD_FINAL);
    const application = await ctx.db.get(args.applicationId);
    if (!application) authError("NOT_FOUND", "Application not found.");

    const now = Date.now();
    await ctx.db.patch(application._id, {
      finalDocumentStorageId: args.storageId,
      finalDocumentName: args.fileName,
      finalDocumentUploadedAt: now,
      updatedAt: now,
    });

    // Mirrored into `documents` so the customer can fetch it through
    // `documents.getSignedUrl` — the single access-checked place a storage URL
    // is ever minted. Without this the final visa would be unreachable.
    const previousFinals = await ctx.db
      .query("documents")
      .withIndex("by_application_key", (q) =>
        q
          .eq("applicationId", application._id)
          .eq("applicantId", undefined)
          .eq("documentKey", FINAL_DOCUMENT_KEY),
      )
      .collect();

    const currentFinal = previousFinals.find((d) => d.isCurrent) ?? null;
    if (currentFinal) await ctx.db.patch(currentFinal._id, { isCurrent: false });

    await ctx.db.insert("documents", {
      applicationId: application._id,
      userId: application.userId,
      storageId: args.storageId,
      documentKey: FINAL_DOCUMENT_KEY,
      label: "Visa document",
      fileName: args.fileName,
      mimeType: args.mimeType ?? "application/pdf",
      size: args.size ?? 0,
      status: "approved",
      reviewedBy: staff.user._id,
      reviewedAt: now,
      version: previousFinals.reduce((max, d) => Math.max(max, d.version), 0) + 1,
      supersedesId: currentFinal?._id,
      isCurrent: true,
      uploadedByStaffId: staff.user._id,
      createdAt: now,
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.APPLICATION_FINAL_DOC_UPLOADED,
      entityType: "application",
      entityId: application._id,
      summary: `Uploaded the final document for ${application.referenceId}`,
      after: { fileName: args.fileName },
    });

    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      userId: application.userId,
      type: NOTIFICATION_TYPES.FINAL_DOCUMENT_READY,
      title: "Your visa document is ready",
      body: `The final document for ${application.referenceId} is available in your portal.`,
      link: `/dashboard/applications/${application._id}`,
      dedupeKey: dedupeKeys.finalDocument(application._id),
      applicationId: application._id,
    });

    return null;
  },
});

export const markCompleted = mutation({
  args: {
    applicationId: v.id("applications"),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireApplicationAccess(ctx, args.applicationId, {
      write: true,
    });
    if (!access.viaStaff) {
      authError("FORBIDDEN", "Only VisaDrive staff can complete an application.");
    }

    const application = access.application;
    const from = application.status as ApplicationStatus;

    if (from === "completed") return null;
    if (!canTransition(from, "completed")) {
      throw new ConvexError({
        code: "INVALID_TRANSITION",
        message: `An application in "${APPLICATION_STATUS_CONFIG[from].label}" cannot be completed yet.`,
        from,
        to: "completed",
      });
    }

    await applyStatusChange(ctx, {
      application,
      to: "completed",
      note: args.note,
      visibleToCustomer: true,
      actor: access.user,
      force: false,
    });

    await recordAudit(ctx, {
      actor: access.user,
      action: AUDIT_ACTIONS.APPLICATION_COMPLETED,
      entityType: "application",
      entityId: application._id,
      summary: `Completed ${application.referenceId}`,
    });

    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      userId: application.userId,
      type: NOTIFICATION_TYPES.APPLICATION_COMPLETED,
      title: `${application.referenceId} is complete`,
      body: args.note?.trim() || "Everything is finished. Thank you for choosing VisaDrive.",
      link: `/dashboard/applications/${application._id}`,
      dedupeKey: `app:${application._id}:completed`,
      applicationId: application._id,
    });

    return null;
  },
});

/* -------------------------------------------------------------------------- */
/*                                   export                                   */
/* -------------------------------------------------------------------------- */

const EXPORT_LIMIT = 5000;

/**
 * Rows for the CSV export. An internalQuery rather than inline in the action
 * because actions have no database access — and auth still applies here: the
 * caller's identity is carried through `ctx.runQuery`.
 */
export const exportRows = internalQuery({
  args: adminFilterArgs,
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.APPLICATION_EXPORT);

    const filters = args as AdminFilters;
    const options = streamOptions(filters);
    const stream = applyLeftoverFilters(
      adminStream(ctx, filters),
      options.indexedStatus
        ? { ...filters, status: undefined, paymentStatus: undefined, destinationId: undefined }
        : filters,
      options,
    );

    const rows: Doc<"applications">[] = await stream.take(EXPORT_LIMIT);

    const agentIds = [
      ...new Set(
        rows.map((a) => a.assignedAgentId).filter((id): id is Id<"users"> => !!id),
      ),
    ];
    const agents = await Promise.all(agentIds.map((id) => ctx.db.get(id)));
    const agentName = new Map(
      agents
        .filter((a): a is Doc<"users"> => a !== null)
        .map((a) => [a._id as Id<"users">, a.fullName]),
    );

    return rows.map((a) => ({
      referenceId: a.referenceId,
      customerName: a.customerName,
      customerEmail: a.customerEmail,
      customerPhone: a.customerPhone ?? "",
      destinationName: a.destinationName,
      visaProductName: a.visaProductName,
      status: a.status,
      paymentStatus: a.paymentStatus,
      paymentMode: a.paymentMode,
      travellerCount: a.travellerCount,
      currency: a.pricing.currency,
      total: a.pricing.total,
      assignedAgent: a.assignedAgentId
        ? (agentName.get(a.assignedAgentId) ?? "")
        : "",
      documentsApproved: a.documentsApprovedCount,
      documentsRequired: a.documentsRequiredCount,
      createdAt: isoDate(a.createdAt),
      submittedAt: isoDate(a.submittedAt),
      completedAt: isoDate(a.completedAt),
    }));
  },
});

type ApplicationExportRow = {
  referenceId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  destinationName: string;
  visaProductName: string;
  status: string;
  paymentStatus: string;
  paymentMode: string;
  travellerCount: number;
  currency: string;
  total: number;
  assignedAgent: string;
  documentsApproved: number;
  documentsRequired: number;
  createdAt: string;
  submittedAt: string;
  completedAt: string;
};

export const exportCsv = action({
  args: adminFilterArgs,
  returns: v.object({ csv: v.string(), rowCount: v.number(), truncated: v.boolean() }),
  handler: async (ctx, args) => {
    const rows: ApplicationExportRow[] = await ctx.runQuery(
      internal.applications.exportRows,
      args,
    );

    const headers = [
      "Reference",
      "Customer",
      "Email",
      "Phone",
      "Destination",
      "Visa service",
      "Status",
      "Payment status",
      "Payment mode",
      "Travellers",
      "Currency",
      "Total (minor units)",
      "Assigned agent",
      "Documents approved",
      "Documents required",
      "Created at",
      "Submitted at",
      "Completed at",
    ];

    const csv = toCsv(
      headers,
      rows.map((r) => [
        r.referenceId,
        r.customerName,
        r.customerEmail,
        r.customerPhone,
        r.destinationName,
        r.visaProductName,
        r.status,
        r.paymentStatus,
        r.paymentMode,
        r.travellerCount,
        r.currency,
        r.total,
        r.assignedAgent,
        r.documentsApproved,
        r.documentsRequired,
        r.createdAt,
        r.submittedAt,
        r.completedAt,
      ]),
    );

    return { csv, rowCount: rows.length, truncated: rows.length >= EXPORT_LIMIT };
  },
});
