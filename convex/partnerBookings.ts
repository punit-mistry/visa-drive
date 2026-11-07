import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { applicationStatus } from "./schema";
import { authError, requirePartner } from "./lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "./lib/audit";
import {
  cleanText,
  marginSnapshot,
  normaliseEmail,
  recountPartner,
  requireText,
  resolvePartnerQuote,
} from "./lib/partners";
import { generateReference } from "./lib/references";
import { recountApplicationDocuments } from "./documents";
import { isStaffRole } from "../lib/constants/roles";

/* ============================================================================
 * B2B bookings — the partner's own side of the product.
 *
 * Everything here is scoped by `requirePartner(ctx)`, which resolves the
 * caller's `partners` row from their session. No function in this file takes a
 * partner id as an argument, so there is no parameter an attacker could change
 * to reach another agency's bookings, customers or prices. That is the whole
 * defence against IDOR here: not a check that can be forgotten, but an
 * identifier that never arrives from the client in the first place.
 *
 * Two further rules:
 *   • The *traveller* owns the application (`userId`), not the partner. A
 *     customer who later signs up with the same address inherits their own
 *     bookings, and the existing B2C portal shows them without a change.
 *   • `pricing` and `partnerMargin` are computed by `resolvePartnerQuote` from
 *     the catalogue row and the stored rule. A price never arrives as an
 *     argument, from a partner or from anybody else.
 * ========================================================================== */

/* -------------------------------------------------------------------------- */
/*                                  customers                                 */
/* -------------------------------------------------------------------------- */

/**
 * Find or create the `users` row behind a partner's customer.
 *
 * An address that already has a VisaDrive account is *linked*, not duplicated:
 * the traveller gets to see, in their own portal, the application their agent
 * filed for them. A staff address is refused outright — a colleague's login
 * must never end up owning a partner's booking.
 */
async function resolveCustomerUser(
  ctx: MutationCtx,
  input: { fullName: string; email: string; phone?: string },
): Promise<{ userId: Id<"users">; created: boolean }> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", input.email))
    .first();

  if (existing) {
    if (isStaffRole(existing.role)) {
      throw new ConvexError({
        code: "VALIDATION",
        message:
          "That email belongs to a VisaDrive staff account. Use the traveller's own address.",
        field: "email",
      });
    }
    if (existing.status === "deleted") {
      throw new ConvexError({
        code: "VALIDATION",
        message: "That email belongs to a closed account.",
        field: "email",
      });
    }
    return { userId: existing._id, created: false };
  }

  // Placeholder, exactly as `enquiries.convertToApplication` creates one: the
  // `pending:` clerkId can never collide with a real Clerk subject, and
  // `users.upsertFromClerk` reconciles it by email if they ever sign up.
  const userId = await ctx.db.insert("users", {
    clerkId: `pending:${input.email}`,
    email: input.email,
    fullName: input.fullName,
    phone: input.phone,
    role: "customer",
    status: "active",
    emailVerified: false,
    applicationCount: 0,
    createdAt: Date.now(),
  });

  return { userId, created: true };
}

export const upsertCustomer = mutation({
  args: {
    partnerCustomerId: v.optional(v.id("partnerCustomers")),
    fullName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    partnerCustomerId: v.id("partnerCustomers"),
    userId: v.id("users"),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { user, partner } = await requirePartner(ctx);
    const now = Date.now();

    const fullName = requireText(args.fullName, "Customer name", {
      min: 2,
      max: 120,
    });
    const email = normaliseEmail(args.email);
    if (!email.includes("@")) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Enter a valid email address for the customer.",
        field: "email",
      });
    }
    const phone = cleanText(args.phone, 24);
    const reference = cleanText(args.reference, 80);
    const notes = cleanText(args.notes, 1000);

    /* ------------------------------- update ------------------------------- */
    if (args.partnerCustomerId) {
      const row = await ctx.db.get(args.partnerCustomerId);
      // Ownership is checked against the caller's own partner id, never an
      // argument, so another agency's customer simply does not resolve.
      if (!row || row.partnerId !== partner._id) {
        authError("NOT_FOUND", "That customer is not on your account.");
      }

      await ctx.db.patch(row._id, {
        fullName,
        email,
        phone,
        reference,
        notes,
        updatedAt: now,
      });

      await recordAudit(ctx, {
        actor: user,
        action: AUDIT_ACTIONS.PARTNER_CUSTOMER_UPDATED,
        entityType: "partner",
        entityId: partner._id,
        summary: `${partner.agencyName} updated their customer ${fullName}`,
        before: { fullName: row.fullName, email: row.email, phone: row.phone },
        after: { fullName, email, phone },
      });

      return {
        partnerCustomerId: row._id,
        userId: row.userId,
        created: false,
      };
    }

    /* ------------------------------- create ------------------------------- */
    const duplicate = await ctx.db
      .query("partnerCustomers")
      .withIndex("by_partner_email", (q) =>
        q.eq("partnerId", partner._id).eq("email", email),
      )
      .first();

    if (duplicate) {
      // Re-adding somebody is almost always "I forgot they were here", so
      // revive and refresh rather than refusing or creating a second row.
      await ctx.db.patch(duplicate._id, {
        fullName,
        phone,
        reference: reference ?? duplicate.reference,
        notes: notes ?? duplicate.notes,
        isArchived: false,
        updatedAt: now,
      });
      return {
        partnerCustomerId: duplicate._id,
        userId: duplicate.userId,
        created: false,
      };
    }

    const { userId } = await resolveCustomerUser(ctx, { fullName, email, phone });

    const partnerCustomerId = await ctx.db.insert("partnerCustomers", {
      partnerId: partner._id,
      userId,
      fullName,
      email,
      phone,
      reference,
      notes,
      bookingCount: 0,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    });

    await recordAudit(ctx, {
      actor: user,
      action: AUDIT_ACTIONS.PARTNER_CUSTOMER_ADDED,
      entityType: "partner",
      entityId: partner._id,
      summary: `${partner.agencyName} added the customer ${fullName} (${email})`,
      after: { fullName, email },
    });

    await recountPartner(ctx, partner._id);

    return { partnerCustomerId, userId, created: true };
  },
});

export const listMyCustomers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { partner } = await requirePartner(ctx);

    const term = args.search?.trim();

    if (term) {
      return await ctx.db
        .query("partnerCustomers")
        .withSearchIndex("search_partner_customers", (q) => {
          const base = q.search("fullName", term).eq("partnerId", partner._id);
          return args.includeArchived ? base : base.eq("isArchived", false);
        })
        .paginate(args.paginationOpts);
    }

    let stream = ctx.db
      .query("partnerCustomers")
      .withIndex("by_partner_created", (q) => q.eq("partnerId", partner._id))
      .order("desc");

    if (!args.includeArchived) {
      stream = stream.filter((q) => q.eq(q.field("isArchived"), false));
    }

    return await stream.paginate(args.paginationOpts);
  },
});

/** One customer plus their booking history with this partner. */
export const myCustomer = query({
  args: { partnerCustomerId: v.id("partnerCustomers") },
  handler: async (ctx, args) => {
    const { partner } = await requirePartner(ctx);

    const row = await ctx.db.get(args.partnerCustomerId);
    if (!row || row.partnerId !== partner._id) return null;

    // Scoped by partner *and* then by customer: a booking this agency did not
    // place never enters the list, even for a traveller they share with
    // another agency.
    const bookings = await ctx.db
      .query("applications")
      .withIndex("by_partner_createdAt", (q) => q.eq("partnerId", partner._id))
      .order("desc")
      .take(500);

    return {
      customer: row,
      bookings: bookings
        .filter((b) => b.userId === row.userId)
        .map((b) => ({
          _id: b._id,
          referenceId: b.referenceId,
          destinationName: b.destinationName,
          visaProductName: b.visaProductName,
          status: b.status,
          paymentStatus: b.paymentStatus,
          isDraft: b.isDraft,
          total: b.partnerMargin?.partnerPrice ?? b.pricing.total,
          margin: b.partnerMargin?.marginAmount ?? 0,
          currency: b.pricing.currency,
          createdAt: b.createdAt,
          submittedAt: b.submittedAt,
        })),
    };
  },
});

export const archiveCustomer = mutation({
  args: { partnerCustomerId: v.id("partnerCustomers"), archived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { partner } = await requirePartner(ctx);

    const row = await ctx.db.get(args.partnerCustomerId);
    if (!row || row.partnerId !== partner._id) {
      authError("NOT_FOUND", "That customer is not on your account.");
    }

    await ctx.db.patch(row._id, {
      isArchived: args.archived,
      updatedAt: Date.now(),
    });
    await recountPartner(ctx, partner._id);

    return null;
  },
});

/* -------------------------------------------------------------------------- */
/*                                  bookings                                  */
/* -------------------------------------------------------------------------- */

/**
 * Start a booking on a customer's behalf.
 *
 * The partner picks a product, a traveller count and a customer — either one
 * already on their book, or new details to add. Everything about money is
 * decided here, server-side: `resolvePartnerQuote` reads the catalogue row and
 * the partner's rule, and the result is frozen onto the application as both
 * the charged `pricing` and the `partnerMargin` snapshot.
 *
 * Idempotent in the way the B2C `createDraft` is: a partner who clicks twice
 * gets back the same draft rather than a second one.
 */
export const createDraft = mutation({
  args: {
    visaProductId: v.id("visaProducts"),
    travellerCount: v.optional(v.number()),
    partnerCustomerId: v.optional(v.id("partnerCustomers")),
    newCustomer: v.optional(
      v.object({
        fullName: v.string(),
        email: v.string(),
        phone: v.optional(v.string()),
        reference: v.optional(v.string()),
      }),
    ),
  },
  returns: v.object({
    applicationId: v.id("applications"),
    referenceId: v.string(),
    partnerCustomerId: v.id("partnerCustomers"),
    reused: v.boolean(),
    partnerPrice: v.number(),
    marginAmount: v.number(),
    currency: v.string(),
  }),
  handler: async (ctx, args) => {
    const { user, partner } = await requirePartner(ctx);
    const now = Date.now();

    /* ------------------------------ catalogue ----------------------------- */
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

    /* ------------------------------ customer ------------------------------ */
    let customerRow: Doc<"partnerCustomers"> | null = null;

    if (args.partnerCustomerId) {
      const row = await ctx.db.get(args.partnerCustomerId);
      if (!row || row.partnerId !== partner._id) {
        authError("NOT_FOUND", "That customer is not on your account.");
      }
      customerRow = row;
    } else if (args.newCustomer) {
      const fullName = requireText(args.newCustomer.fullName, "Customer name", {
        min: 2,
        max: 120,
      });
      const email = normaliseEmail(args.newCustomer.email);
      if (!email.includes("@")) {
        throw new ConvexError({
          code: "VALIDATION",
          message: "Enter a valid email address for the customer.",
          field: "email",
        });
      }
      const phone = cleanText(args.newCustomer.phone, 24);

      const duplicate = await ctx.db
        .query("partnerCustomers")
        .withIndex("by_partner_email", (q) =>
          q.eq("partnerId", partner._id).eq("email", email),
        )
        .first();

      if (duplicate) {
        await ctx.db.patch(duplicate._id, {
          fullName,
          phone: phone ?? duplicate.phone,
          isArchived: false,
          updatedAt: now,
        });
        customerRow = (await ctx.db.get(duplicate._id))!;
      } else {
        const { userId } = await resolveCustomerUser(ctx, {
          fullName,
          email,
          phone,
        });
        const id = await ctx.db.insert("partnerCustomers", {
          partnerId: partner._id,
          userId,
          fullName,
          email,
          phone,
          reference: cleanText(args.newCustomer.reference, 80),
          bookingCount: 0,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });
        customerRow = (await ctx.db.get(id))!;
      }
    } else {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Choose an existing customer or enter new customer details.",
        field: "partnerCustomerId",
      });
    }

    const travellerCount = Math.max(
      1,
      Math.min(Math.floor(args.travellerCount ?? 1), 20),
    );

    /* ------------------------------- pricing ------------------------------ */
    const quote = await resolvePartnerQuote(
      ctx,
      partner,
      product,
      travellerCount,
      now,
    );
    const margin = marginSnapshot(quote);

    /* ------------------------------- reuse -------------------------------- */
    // Bounded: this partner's open drafts, not the applications table.
    const openDrafts = await ctx.db
      .query("applications")
      .withIndex("by_partner_draft", (q) =>
        q.eq("partnerId", partner._id).eq("isDraft", true),
      )
      .take(100);

    const reusable = openDrafts.find(
      (d) =>
        d.visaProductId === product._id &&
        d.userId === customerRow!.userId &&
        d.status === "draft",
    );

    if (reusable) {
      await ctx.db.patch(reusable._id, {
        travellerCount,
        pricing: quote.breakdown,
        partnerMargin: margin,
        destinationName: destination.name,
        visaProductName: product.name,
        customerName: customerRow.fullName,
        customerEmail: customerRow.email,
        customerPhone: customerRow.phone,
        paymentMode: product.paymentMode,
        updatedAt: now,
      });

      return {
        applicationId: reusable._id,
        referenceId: reusable.referenceId,
        partnerCustomerId: customerRow._id,
        reused: true,
        partnerPrice: margin.partnerPrice,
        marginAmount: margin.marginAmount,
        currency: margin.currency,
      };
    }

    /* ------------------------------- create ------------------------------- */
    const referenceId = await generateReference(ctx, "application", now);

    const applicationId = await ctx.db.insert("applications", {
      referenceId,
      // The traveller owns the booking; the partner placed it.
      userId: customerRow.userId,
      destinationId: product.destinationId,
      visaProductId: product._id,
      destinationName: destination.name,
      visaProductName: product.name,
      customerName: customerRow.fullName,
      customerEmail: customerRow.email,
      customerPhone: customerRow.phone,
      status: "draft",
      paymentStatus:
        product.paymentMode === "free_consultation" ? "not_required" : "unpaid",
      paymentMode: product.paymentMode,
      travellerCount,
      pricing: quote.breakdown,
      partnerId: partner._id,
      createdByPartnerUserId: user._id,
      partnerMargin: margin,
      currentStep: 1,
      isDraft: true,
      lastAutosaveAt: now,
      documentsRequiredCount: 0,
      documentsApprovedCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    await recountApplicationDocuments(ctx, applicationId);

    await recordAudit(ctx, {
      actor: user,
      action: AUDIT_ACTIONS.PARTNER_BOOKING_CREATED,
      entityType: "partner",
      entityId: partner._id,
      summary: `${partner.agencyName} started ${referenceId} for ${customerRow.fullName} — ${product.name} (${destination.name})`,
      after: {
        applicationId,
        referenceId,
        partnerPrice: margin.partnerPrice,
        marginAmount: margin.marginAmount,
      },
    });

    return {
      applicationId,
      referenceId,
      partnerCustomerId: customerRow._id,
      reused: false,
      partnerPrice: margin.partnerPrice,
      marginAmount: margin.marginAmount,
      currency: margin.currency,
    };
  },
});

/* ------------------------------ partner reads ----------------------------- */

export const listMine = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(applicationStatus),
    includeDrafts: v.optional(v.boolean()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { partner } = await requirePartner(ctx);

    let stream = args.status
      ? ctx.db
          .query("applications")
          .withIndex("by_partner_status", (q) =>
            q.eq("partnerId", partner._id).eq("status", args.status!),
          )
          .order("desc")
      : ctx.db
          .query("applications")
          .withIndex("by_partner_createdAt", (q) =>
            q.eq("partnerId", partner._id),
          )
          .order("desc");

    if (!args.includeDrafts) {
      stream = stream.filter((q) => q.eq(q.field("isDraft"), false));
    }

    const result = await stream.paginate(args.paginationOpts);

    // Search narrows the page that was already fetched rather than widening
    // the query: a partner's book is small, and a second search index on
    // applications would only ever be used by this one screen.
    const term = args.search?.trim().toLowerCase();

    return {
      ...result,
      page: result.page
        .filter(
          (a) =>
            !term ||
            a.customerName.toLowerCase().includes(term) ||
            a.referenceId.toLowerCase().includes(term) ||
            a.destinationName.toLowerCase().includes(term),
        )
        .map((a) => ({
          _id: a._id,
          referenceId: a.referenceId,
          customerName: a.customerName,
          customerEmail: a.customerEmail,
          customerPhone: a.customerPhone,
          destinationName: a.destinationName,
          visaProductName: a.visaProductName,
          status: a.status,
          paymentStatus: a.paymentStatus,
          isDraft: a.isDraft,
          travellerCount: a.travellerCount,
          total: a.partnerMargin?.partnerPrice ?? a.pricing.total,
          basePrice: a.partnerMargin?.basePrice ?? a.pricing.total,
          margin: a.partnerMargin?.marginAmount ?? 0,
          currency: a.pricing.currency,
          documentsRequiredCount: a.documentsRequiredCount,
          documentsApprovedCount: a.documentsApprovedCount,
          createdAt: a.createdAt,
          submittedAt: a.submittedAt,
          updatedAt: a.updatedAt,
        })),
    };
  },
});

/**
 * One booking, as the partner may see it.
 *
 * Shaped rather than returned whole: the internal timeline, the office's
 * notes and the assigned agent are not the agent's business, exactly as they
 * are not the customer's. What a partner does get, and a customer does not, is
 * the margin on their own booking.
 */
export const getMine = query({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    const { partner } = await requirePartner(ctx);

    const application = await ctx.db.get(args.applicationId);
    if (
      !application ||
      !application.partnerId ||
      application.partnerId !== partner._id
    ) {
      return null;
    }

    const [applicants, documents, timeline, documentRequests, product] =
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
          .query("documentRequests")
          .withIndex("by_application_status", (q) =>
            q.eq("applicationId", application._id).eq("status", "open"),
          )
          .collect(),
        ctx.db.get(application.visaProductId),
      ]);

    const requirements = product
      ? await ctx.db
          .query("visaRequirements")
          .withIndex("by_product_order", (q) =>
            q.eq("visaProductId", product._id),
          )
          .collect()
      : [];

    return {
      application: {
        ...application,
        // Who inside VisaDrive is handling it is internal.
        assignedAgentId: undefined,
      },
      applicants,
      documents,
      documentRequests,
      requirements,
      product,
      // Internal transitions stay out of a partner's timeline, exactly as
      // they stay out of the customer's.
      timeline: timeline.filter((t) => t.visibleToCustomer),
      margin: application.partnerMargin ?? null,
    };
  },
});

/** Drafts a partner has not finished, for the "pick up where you left off" rail. */
export const listMyDrafts = query({
  args: {},
  handler: async (ctx) => {
    const { partner } = await requirePartner(ctx);

    const drafts = await ctx.db
      .query("applications")
      .withIndex("by_partner_draft", (q) =>
        q.eq("partnerId", partner._id).eq("isDraft", true),
      )
      .order("desc")
      .take(25);

    return drafts.map((d) => ({
      _id: d._id,
      referenceId: d.referenceId,
      customerName: d.customerName,
      destinationName: d.destinationName,
      visaProductName: d.visaProductName,
      travellerCount: d.travellerCount,
      currentStep: d.currentStep,
      total: d.partnerMargin?.partnerPrice ?? d.pricing.total,
      currency: d.pricing.currency,
      updatedAt: d.updatedAt,
    }));
  },
});

/** Discard a draft a partner started by mistake. Only ever their own, only drafts. */
export const discardDraft = mutation({
  args: { applicationId: v.id("applications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, partner } = await requirePartner(ctx);

    const application = await ctx.db.get(args.applicationId);
    if (!application || application.partnerId !== partner._id) {
      authError("NOT_FOUND", "That booking is not on your account.");
    }
    if (!application.isDraft || application.status !== "draft") {
      throw new ConvexError({
        code: "NOT_A_DRAFT",
        message:
          "This booking has already been submitted. Cancel it from the booking page instead.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(application._id, {
      status: "cancelled",
      isDraft: false,
      cancelledAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("statusHistory", {
      applicationId: application._id,
      userId: application.userId,
      fromStatus: "draft",
      toStatus: "cancelled",
      note: "Draft discarded by the partner before submission.",
      visibleToCustomer: false,
      changedBy: user._id,
      changedByName: partner.agencyName,
      createdAt: now,
    });

    await recordAudit(ctx, {
      actor: user,
      action: AUDIT_ACTIONS.APPLICATION_CANCELLED,
      entityType: "application",
      entityId: application._id,
      summary: `${partner.agencyName} discarded the draft ${application.referenceId}`,
      before: { status: "draft" },
      after: { status: "cancelled" },
    });

    await recountPartner(ctx, partner._id);

    return null;
  },
});
