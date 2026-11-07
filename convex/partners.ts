import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { partnerBusinessType, partnerStatus } from "./schema";
import {
  authError,
  getPartnerContext,
  requirePartner,
  requirePermission,
  requireUser,
} from "./lib/auth";
import { AUDIT_ACTIONS, diffFields, recordAudit } from "./lib/audit";
import {
  cleanText,
  loadPartner,
  looksLikeGstin,
  marginSnapshot,
  nextPartnerCode,
  normaliseEmail,
  publicPartnerView,
  recountPartner,
  requireText,
  resolvePartnerQuote,
} from "./lib/partners";
import { PERMISSIONS } from "../lib/constants/roles";
import {
  MAX_MARKUP_PERCENT,
  PARTNER_STATUS_CONFIG,
  canTransitionPartner,
  partnerCanTrade,
  type PartnerStatus,
} from "../lib/constants/partners";
import { NOTIFICATION_TYPES, dedupeKeys } from "../lib/constants/notifications";
import { SITE } from "../lib/constants/site";
import { formatMoney } from "../lib/helpers/pricing";

/* ============================================================================
 * B2B partners.
 *
 * Invariants enforced here:
 *   • Becoming a partner is a two-party act: the business registers, and a
 *     VisaDrive admin approves. `setStatus` is the only thing that grants the
 *     `partner` role, and the only thing that takes it away.
 *   • A partner reads their own row through `publicPartnerView`, which drops
 *     the office's internal note and reviewer — the same line `messages` draws
 *     around internal notes on a conversation.
 *   • Nothing in this file takes a price, a margin or a status from an
 *     argument without re-deriving or re-validating it server-side.
 *   • `auditLogs` *is* the partner activity timeline: every consequential act,
 *     by the office or by the partner, writes a row with
 *     `entityType: "partner"`.
 * ========================================================================== */

const businessFields = {
  agencyName: v.string(),
  businessType: partnerBusinessType,
  gstNumber: v.optional(v.string()),
  panNumber: v.optional(v.string()),
  website: v.optional(v.string()),
  addressLine1: v.string(),
  addressLine2: v.optional(v.string()),
  city: v.string(),
  state: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  country: v.string(),
  contactPersonName: v.string(),
  contactEmail: v.string(),
  contactPhone: v.string(),
  alternatePhone: v.optional(v.string()),
};

type BusinessInput = {
  agencyName: string;
  businessType: Doc<"partners">["businessType"];
  gstNumber?: string;
  panNumber?: string;
  website?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
  contactPersonName: string;
  contactEmail: string;
  contactPhone: string;
  alternatePhone?: string;
};

/**
 * Validate and normalise the registration payload.
 *
 * GST is optional (not every agency is registered), but a GST number that is
 * *supplied* has to look like one — a typo here ends up on an invoice.
 */
function normaliseBusiness(input: BusinessInput) {
  const gstNumber = cleanText(input.gstNumber, 20)?.toUpperCase();
  if (gstNumber && !looksLikeGstin(gstNumber)) {
    throw new ConvexError({
      code: "VALIDATION",
      message:
        "That does not look like a GSTIN. Leave it blank if you are not GST registered.",
      field: "gstNumber",
    });
  }

  const contactEmail = normaliseEmail(input.contactEmail);
  if (!contactEmail.includes("@")) {
    throw new ConvexError({
      code: "VALIDATION",
      message: "Enter a valid contact email address.",
      field: "contactEmail",
    });
  }

  const website = cleanText(input.website, 200);
  if (website && !/^https?:\/\//i.test(website)) {
    throw new ConvexError({
      code: "VALIDATION",
      message: "The website must start with http:// or https://",
      field: "website",
    });
  }

  return {
    agencyName: requireText(input.agencyName, "Agency name", { min: 2, max: 160 }),
    businessType: input.businessType,
    gstNumber,
    panNumber: cleanText(input.panNumber, 20)?.toUpperCase(),
    website,
    addressLine1: requireText(input.addressLine1, "Address", { min: 3, max: 200 }),
    addressLine2: cleanText(input.addressLine2, 200),
    city: requireText(input.city, "City", { min: 2, max: 80 }),
    state: cleanText(input.state, 80),
    postalCode: cleanText(input.postalCode, 16),
    country: requireText(input.country, "Country", { min: 2, max: 80 }),
    contactPersonName: requireText(input.contactPersonName, "Contact person", {
      min: 2,
      max: 120,
    }),
    contactEmail,
    contactPhone: requireText(input.contactPhone, "Mobile number", {
      min: 6,
      max: 24,
    }),
    alternatePhone: cleanText(input.alternatePhone, 24),
  };
}

/* -------------------------------------------------------------------------- */
/*                                registration                                */
/* -------------------------------------------------------------------------- */

/**
 * Apply to become a VisaDrive partner.
 *
 * Requires a signed-in account, because approval grants *that* login the
 * partner role — a registration with no account behind it would have nothing
 * to approve. Re-submitting while a decision is pending updates the existing
 * application instead of creating a second one.
 */
export const register = mutation({
  args: businessFields,
  returns: v.object({
    partnerId: v.id("partners"),
    partnerCode: v.string(),
    status: partnerStatus,
    resubmitted: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const data = normaliseBusiness(args);

    const existing = await ctx.db
      .query("partners")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing && !existing.isDeleted) {
      if (existing.status === "approved" || existing.status === "suspended") {
        throw new ConvexError({
          code: "ALREADY_A_PARTNER",
          message: "This account already has a VisaDrive partner profile.",
          partnerId: existing._id,
        });
      }

      // Pending / under review / rejected: treat this as the business
      // correcting their application rather than starting a second one.
      await ctx.db.patch(existing._id, {
        ...data,
        status: "pending",
        statusReason: undefined,
        updatedAt: now,
      });

      await recordAudit(ctx, {
        actor: user,
        action: AUDIT_ACTIONS.PARTNER_REGISTERED,
        entityType: "partner",
        entityId: existing._id,
        summary: `${data.agencyName} re-submitted their partner application`,
        before: { status: existing.status },
        after: { status: "pending" },
      });

      await notifyStaffOfRegistration(ctx, existing._id, data.agencyName, user._id);

      return {
        partnerId: existing._id,
        partnerCode: existing.partnerCode,
        status: "pending" as const,
        resubmitted: true,
      };
    }

    const partnerCode = await nextPartnerCode(ctx);

    const partnerId = await ctx.db.insert("partners", {
      partnerCode,
      userId: user._id,
      ...data,
      status: "pending",
      defaultMarkupPercent: 0,
      bookingCount: 0,
      customerCount: 0,
      grossVolume: 0,
      grossMargin: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });

    await recordAudit(ctx, {
      actor: user,
      action: AUDIT_ACTIONS.PARTNER_REGISTERED,
      entityType: "partner",
      entityId: partnerId,
      summary: `${data.agencyName} applied to become a VisaDrive partner (${partnerCode})`,
      after: { agencyName: data.agencyName, contactEmail: data.contactEmail },
    });

    await notifyStaffOfRegistration(ctx, partnerId, data.agencyName, user._id);

    return { partnerId, partnerCode, status: "pending" as const, resubmitted: false };
  },
});

async function notifyStaffOfRegistration(
  ctx: MutationCtx,
  partnerId: Id<"partners">,
  agencyName: string,
  excludeUserId: Id<"users">,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.notifications.dispatchToStaff, {
    permission: PERMISSIONS.PARTNER_APPROVE,
    type: NOTIFICATION_TYPES.PARTNER_REGISTRATION_RECEIVED,
    title: "New B2B partner registration",
    body: `${agencyName} has applied for a partner account and is waiting for review.`,
    link: `/admin/partners/${partnerId}`,
    dedupeKeyPrefix: `partner:${partnerId}:registered:staff`,
    excludeUserId,
  });
}

/* -------------------------------------------------------------------------- */
/*                             the partner's own                              */
/* -------------------------------------------------------------------------- */

/**
 * The caller's partner profile, whatever state it is in.
 *
 * Returns `null` for somebody who has never registered, so the portal can
 * offer the registration form rather than throwing at them. Never 403s: the
 * "you are not approved yet" screen is a legitimate destination.
 */
export const myProfile = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      partner: v.any(),
      canTrade: v.boolean(),
      statusLabel: v.string(),
      statusDescription: v.string(),
      documentCount: v.number(),
      verifiedDocumentCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const context = await getPartnerContext(ctx);
    if (!context || !context.partner) return null;

    const documents = await ctx.db
      .query("partnerDocuments")
      .withIndex("by_partner_current", (q) =>
        q.eq("partnerId", context.partner!._id).eq("isCurrent", true),
      )
      .collect();

    const config = PARTNER_STATUS_CONFIG[context.partner.status as PartnerStatus];

    return {
      partner: publicPartnerView(context.partner),
      canTrade: partnerCanTrade(context.partner.status),
      statusLabel: config?.label ?? context.partner.status,
      statusDescription: config?.description ?? "",
      documentCount: documents.length,
      verifiedDocumentCount: documents.filter((d) => d.status === "verified")
        .length,
    };
  },
});

/**
 * A partner correcting their own business details.
 *
 * Status, markup, codes and counters are not reachable from here — and a
 * change to the business identity of an *approved* partner drops them back to
 * review, because the office approved a specific business, not a name that can
 * be swapped afterwards.
 */
export const updateMyProfile = mutation({
  args: businessFields,
  returns: v.object({ status: partnerStatus, returnedToReview: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const partner = await ctx.db
      .query("partners")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!partner || partner.isDeleted) {
      authError("NOT_FOUND", "You do not have a partner profile yet.");
    }
    if (partner.status === "rejected") {
      throw new ConvexError({
        code: "PARTNER_NOT_APPROVED",
        message:
          "This application was declined. Re-apply from the registration form to submit fresh details.",
      });
    }

    const data = normaliseBusiness(args);
    const now = Date.now();

    const identityChanged =
      data.agencyName !== partner.agencyName ||
      data.gstNumber !== partner.gstNumber ||
      data.businessType !== partner.businessType;

    const returnedToReview = partner.status === "approved" && identityChanged;

    const { before, after } = diffFields(
      partner as unknown as Record<string, unknown>,
      data as unknown as Record<string, unknown>,
    );

    await ctx.db.patch(partner._id, {
      ...data,
      ...(returnedToReview
        ? {
            status: "under_review" as const,
            statusReason:
              "The business details changed, so the account is being re-verified.",
          }
        : {}),
      updatedAt: now,
    });

    await recordAudit(ctx, {
      actor: user,
      action: AUDIT_ACTIONS.PARTNER_UPDATED,
      entityType: "partner",
      entityId: partner._id,
      summary: `${partner.agencyName} updated their business details${
        returnedToReview ? " — returned to review" : ""
      }`,
      before,
      after,
    });

    if (returnedToReview) {
      await notifyStaffOfRegistration(ctx, partner._id, data.agencyName, user._id);
    }

    return {
      status: returnedToReview ? ("under_review" as const) : partner.status,
      returnedToReview,
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                                admin reads                                 */
/* -------------------------------------------------------------------------- */

const partnerFilterArgs = {
  search: v.optional(v.string()),
  status: v.optional(partnerStatus),
  businessType: v.optional(partnerBusinessType),
  sort: v.optional(v.union(v.literal("newest"), v.literal("oldest"))),
};

type PartnerFilters = {
  search?: string;
  status?: PartnerStatus;
  businessType?: Doc<"partners">["businessType"];
  sort?: "newest" | "oldest";
};

/**
 * Build the narrowest indexed stream the filters allow. The search index
 * carries `status` and `businessType` as filter fields, so a search never
 * needs a post-filter for them.
 */
function partnerStream(ctx: QueryCtx, filters: PartnerFilters) {
  const term = filters.search?.trim();

  if (term) {
    return ctx.db.query("partners").withSearchIndex("search_partners", (q) => {
      let s = q.search("agencyName", term);
      if (filters.status) s = s.eq("status", filters.status);
      if (filters.businessType) s = s.eq("businessType", filters.businessType);
      return s;
    });
  }

  if (filters.status) {
    const status = filters.status;
    return ctx.db
      .query("partners")
      .withIndex("by_status_createdAt", (q) => q.eq("status", status))
      .order(filters.sort === "oldest" ? "asc" : "desc");
  }

  return ctx.db
    .query("partners")
    .withIndex("by_createdAt")
    .order(filters.sort === "oldest" ? "asc" : "desc");
}

function applyPartnerLeftovers(
  stream: ReturnType<typeof partnerStream>,
  filters: PartnerFilters,
  indexedStatus: boolean,
) {
  let s = stream;
  // A soft-deleted partner is gone as far as the directory is concerned; its
  // bookings and audit trail survive, which is the point of the soft delete.
  s = s.filter((q) => q.eq(q.field("isDeleted"), false));
  if (filters.status && !indexedStatus) {
    s = s.filter((q) => q.eq(q.field("status"), filters.status!));
  }
  if (filters.businessType && !indexedStatus) {
    s = s.filter((q) => q.eq(q.field("businessType"), filters.businessType!));
  }
  return s;
}

export const listForAdmin = query({
  args: { paginationOpts: paginationOptsValidator, ...partnerFilterArgs },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PARTNER_VIEW);

    const filters = args as PartnerFilters;
    const usingSearch = !!filters.search?.trim();
    const indexedStatus = usingSearch;

    const stream = applyPartnerLeftovers(
      partnerStream(ctx, filters),
      filters,
      indexedStatus,
    );

    const result = (await stream.paginate(args.paginationOpts)) as {
      page: Doc<"partners">[];
      isDone: boolean;
      continueCursor: string;
    };

    return result;
  },
});

/** KPI strip + leaderboards for `/admin/partners`. Every figure is a read. */
export const overview = query({
  args: { rangeDays: v.optional(v.number()) },
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.PARTNER_VIEW);

    // The partner directory is an operational table in the hundreds, not the
    // millions — a bounded scan is cheaper here than six indexed counts.
    const partners = await ctx.db
      .query("partners")
      .withIndex("by_createdAt")
      .order("desc")
      .take(1000);

    const live = partners.filter((p) => !p.isDeleted);

    const byStatus = (status: PartnerStatus) =>
      live.filter((p) => p.status === status).length;

    const totals = live.reduce(
      (acc, p) => {
        acc.bookings += p.bookingCount;
        acc.volume += p.grossVolume;
        acc.margin += p.grossMargin;
        return acc;
      },
      { bookings: 0, volume: 0, margin: 0 },
    );

    const topPartners = [...live]
      .filter((p) => p.bookingCount > 0)
      .sort((a, b) => b.grossVolume - a.grossVolume)
      .slice(0, 5)
      .map((p) => ({
        _id: p._id,
        partnerCode: p.partnerCode,
        agencyName: p.agencyName,
        bookingCount: p.bookingCount,
        grossVolume: p.grossVolume,
        grossMargin: p.grossMargin,
        status: p.status,
      }));

    const recentRegistrations = live.slice(0, 5).map((p) => ({
      _id: p._id,
      partnerCode: p.partnerCode,
      agencyName: p.agencyName,
      contactPersonName: p.contactPersonName,
      status: p.status,
      createdAt: p.createdAt,
    }));

    const awaitingDecision = live
      .filter((p) => p.status === "pending" || p.status === "under_review")
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, 8)
      .map((p) => ({
        _id: p._id,
        partnerCode: p.partnerCode,
        agencyName: p.agencyName,
        status: p.status,
        createdAt: p.createdAt,
      }));

    const recentActivity = await ctx.db
      .query("auditLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(200);

    return {
      kpis: {
        totalPartners: live.length,
        activePartners: byStatus("approved"),
        pendingApprovals: byStatus("pending") + byStatus("under_review"),
        suspendedPartners: byStatus("suspended"),
        rejectedPartners: byStatus("rejected"),
        totalBookings: totals.bookings,
        totalVolume: totals.volume,
        totalMargin: totals.margin,
      },
      currency: SITE.defaultCurrency,
      topPartners,
      recentRegistrations,
      awaitingDecision,
      recentActivity: recentActivity
        .filter((row) => row.entityType === "partner")
        .slice(0, 10)
        .map((row) => ({
          _id: row._id,
          action: row.action,
          summary: row.summary,
          actorName: row.actorName,
          entityId: row.entityId,
          createdAt: row.createdAt,
        })),
      /** True while the directory may have been truncated by the read cap. */
      truncated: partners.length >= 1000,
    };
  },
});

export const getForAdmin = query({
  args: { partnerId: v.id("partners") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PARTNER_VIEW);

    const partner = await ctx.db.get(args.partnerId);
    if (!partner) return null;

    const [login, documents, pricingRows, reviewer] = await Promise.all([
      ctx.db.get(partner.userId),
      ctx.db
        .query("partnerDocuments")
        .withIndex("by_partner_current", (q) =>
          q.eq("partnerId", partner._id).eq("isCurrent", true),
        )
        .collect(),
      ctx.db
        .query("partnerPricing")
        .withIndex("by_partnerId", (q) => q.eq("partnerId", partner._id))
        .collect(),
      partner.reviewedBy
        ? ctx.db.get(partner.reviewedBy)
        : Promise.resolve(null),
    ]);

    return {
      partner,
      login: login
        ? {
            _id: login._id,
            fullName: login.fullName,
            email: login.email,
            role: login.role,
            status: login.status,
            lastActiveAt: login.lastActiveAt,
            /** A `pending:` clerkId means they have not signed in yet. */
            hasSignedIn: !login.clerkId.startsWith("pending:"),
          }
        : null,
      documents,
      pricingRuleCount: pricingRows.filter((r) => r.isActive).length,
      reviewer: reviewer ? { _id: reviewer._id, fullName: reviewer.fullName } : null,
      allowedTransitions:
        PARTNER_STATUS_CONFIG[partner.status as PartnerStatus] !== undefined
          ? Object.keys(PARTNER_STATUS_CONFIG).filter((s) =>
              canTransitionPartner(partner.status as PartnerStatus, s as PartnerStatus),
            )
          : [],
    };
  },
});

/** Bookings this partner has placed. Paginated — an agency may have thousands. */
export const bookingsForAdmin = query({
  args: {
    partnerId: v.id("partners"),
    paginationOpts: paginationOptsValidator,
    includeDrafts: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PARTNER_VIEW);

    let stream = ctx.db
      .query("applications")
      .withIndex("by_partner_createdAt", (q) => q.eq("partnerId", args.partnerId))
      .order("desc");

    if (!args.includeDrafts) {
      stream = stream.filter((q) => q.eq(q.field("isDraft"), false));
    }

    return await stream.paginate(args.paginationOpts);
  },
});

/** The travellers this partner has booked for. */
export const customersForAdmin = query({
  args: {
    partnerId: v.id("partners"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PARTNER_VIEW);

    return await ctx.db
      .query("partnerCustomers")
      .withIndex("by_partner_created", (q) => q.eq("partnerId", args.partnerId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

/** The partner's activity timeline, read straight off the audit trail. */
export const activityForAdmin = query({
  args: {
    partnerId: v.id("partners"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PARTNER_VIEW);

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    return await ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "partner").eq("entityId", args.partnerId),
      )
      .order("desc")
      .take(limit);
  },
});

/* -------------------------------------------------------------------------- */
/*                               admin mutations                              */
/* -------------------------------------------------------------------------- */

/**
 * Register a partner from the CRM, for a business that phoned in.
 *
 * Creates (or reuses) the login by email, exactly as `users.inviteStaff` does
 * — including the `pending:` placeholder clerkId that `upsertFromClerk`
 * reconciles when the person actually signs up.
 */
export const createByAdmin = mutation({
  args: {
    ...businessFields,
    /** Approve immediately rather than filing it as pending. */
    approveNow: v.optional(v.boolean()),
    defaultMarkupPercent: v.optional(v.number()),
  },
  returns: v.object({
    partnerId: v.id("partners"),
    partnerCode: v.string(),
    userId: v.id("users"),
    createdLogin: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.PARTNER_MANAGE);
    const approveNow = args.approveNow === true;

    if (approveNow) {
      // Approving is a stronger act than creating, so it needs its own grant
      // even when it arrives folded into the create call.
      await requirePermission(ctx, PERMISSIONS.PARTNER_APPROVE);
    }

    const data = normaliseBusiness(args);
    const now = Date.now();

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", data.contactEmail))
      .first();

    if (existingUser && existingUser.role !== "customer" && existingUser.role !== "partner") {
      throw new ConvexError({
        code: "CONFLICT",
        message:
          "That email belongs to a VisaDrive staff account. Use a different contact address for the partner login.",
        field: "contactEmail",
      });
    }

    let userId: Id<"users">;
    let createdLogin = false;

    if (existingUser) {
      const alreadyPartner = await ctx.db
        .query("partners")
        .withIndex("by_userId", (q) => q.eq("userId", existingUser._id))
        .unique();

      if (alreadyPartner && !alreadyPartner.isDeleted) {
        throw new ConvexError({
          code: "ALREADY_A_PARTNER",
          message: `${data.contactEmail} already has a partner profile (${alreadyPartner.partnerCode}).`,
          partnerId: alreadyPartner._id,
        });
      }

      userId = existingUser._id;
    } else {
      userId = await ctx.db.insert("users", {
        clerkId: `pending:${data.contactEmail}`,
        email: data.contactEmail,
        fullName: data.contactPersonName,
        phone: data.contactPhone,
        role: "customer",
        status: "active",
        emailVerified: false,
        applicationCount: 0,
        createdAt: now,
      });
      createdLogin = true;
    }

    const partnerCode = await nextPartnerCode(ctx);

    const partnerId = await ctx.db.insert("partners", {
      partnerCode,
      userId,
      ...data,
      status: approveNow ? "approved" : "pending",
      approvedAt: approveNow ? now : undefined,
      reviewedBy: approveNow ? staff.user._id : undefined,
      reviewedAt: approveNow ? now : undefined,
      defaultMarkupPercent: clampMarkup(args.defaultMarkupPercent ?? 0),
      bookingCount: 0,
      customerCount: 0,
      grossVolume: 0,
      grossMargin: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });

    if (approveNow) {
      await ctx.db.patch(userId, { role: "partner" });
    }

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.PARTNER_REGISTERED,
      entityType: "partner",
      entityId: partnerId,
      summary: `${staff.user.fullName} registered ${data.agencyName} (${partnerCode})${
        approveNow ? " and approved them immediately" : ""
      }`,
      after: {
        agencyName: data.agencyName,
        contactEmail: data.contactEmail,
        status: approveNow ? "approved" : "pending",
      },
    });

    if (approveNow) {
      await announceDecision(ctx, partnerId, userId, "approved", undefined);
    }

    return { partnerId, partnerCode, userId, createdLogin };
  },
});

export const updateByAdmin = mutation({
  args: { partnerId: v.id("partners"), ...businessFields },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.PARTNER_MANAGE);
    const partner = await loadPartner(ctx, args.partnerId);

    const data = normaliseBusiness(args);
    const { before, after } = diffFields(
      partner as unknown as Record<string, unknown>,
      data as unknown as Record<string, unknown>,
    );

    if (Object.keys(after).length === 0) return null;

    await ctx.db.patch(partner._id, { ...data, updatedAt: Date.now() });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.PARTNER_UPDATED,
      entityType: "partner",
      entityId: partner._id,
      summary: `${staff.user.fullName} updated ${partner.agencyName}'s details`,
      before,
      after,
    });

    return null;
  },
});

/** Internal-only working note about a partner. Never returned to them. */
export const setInternalNote = mutation({
  args: { partnerId: v.id("partners"), note: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Not audited: a working note is not a status change, money, a permission
    // or anything the partner can see, so it falls outside the audit rule.
    await requirePermission(ctx, PERMISSIONS.PARTNER_MANAGE);
    const partner = await loadPartner(ctx, args.partnerId);

    await ctx.db.patch(partner._id, {
      internalNote: cleanText(args.note, 2000),
      updatedAt: Date.now(),
    });

    return null;
  },
});

function clampMarkup(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.round(value * 100) / 100, MAX_MARKUP_PERCENT);
}

export const setDefaultMarkup = mutation({
  args: { partnerId: v.id("partners"), defaultMarkupPercent: v.number() },
  returns: v.object({ defaultMarkupPercent: v.number() }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.PARTNER_PRICING);
    const partner = await loadPartner(ctx, args.partnerId);

    const next = clampMarkup(args.defaultMarkupPercent);
    if (next === partner.defaultMarkupPercent) return { defaultMarkupPercent: next };

    await ctx.db.patch(partner._id, {
      defaultMarkupPercent: next,
      updatedAt: Date.now(),
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.PARTNER_PRICING_SET,
      entityType: "partner",
      entityId: partner._id,
      summary: `${staff.user.fullName} set ${partner.agencyName}'s default markup to ${next}%`,
      before: { defaultMarkupPercent: partner.defaultMarkupPercent },
      after: { defaultMarkupPercent: next },
    });

    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      userId: partner.userId,
      type: NOTIFICATION_TYPES.PARTNER_PRICING_UPDATED,
      title: "Your partner pricing has changed",
      body: "VisaDrive has updated the pricing on your partner account. The new rates are on your pricing page.",
      link: "/partner/pricing",
      dedupeKey: dedupeKeys.partnerPricingUpdated(partner._id, String(Date.now())),
    });

    return { defaultMarkupPercent: next };
  },
});

/* -------------------------------------------------------------------------- */
/*                             approval lifecycle                             */
/* -------------------------------------------------------------------------- */

/**
 * The one way a partner account changes state — and therefore the one way the
 * `partner` role is granted or taken away.
 *
 * Transitions are validated against `PARTNER_TRANSITIONS`, so "approve a
 * rejected applicant" is possible (it happens) while "approve an already
 * approved partner" is a no-op rather than a second notification.
 */
export const setStatus = mutation({
  args: {
    partnerId: v.id("partners"),
    status: partnerStatus,
    reason: v.optional(v.string()),
  },
  returns: v.object({ status: partnerStatus, changed: v.boolean() }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.PARTNER_APPROVE);
    const partner = await loadPartner(ctx, args.partnerId);

    const from = partner.status as PartnerStatus;
    const to = args.status as PartnerStatus;

    if (from === to) return { status: to, changed: false };

    if (!canTransitionPartner(from, to)) {
      throw new ConvexError({
        code: "INVALID_TRANSITION",
        message: `A partner cannot move from "${PARTNER_STATUS_CONFIG[from].label}" to "${PARTNER_STATUS_CONFIG[to].label}".`,
        from,
        to,
      });
    }

    const reason = cleanText(args.reason, 1000);
    if ((to === "rejected" || to === "suspended") && !reason) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Give a reason — it is shown to the partner and kept on record.",
        field: "reason",
      });
    }

    const now = Date.now();

    await ctx.db.patch(partner._id, {
      status: to,
      statusReason: reason,
      reviewedBy: staff.user._id,
      reviewedAt: now,
      approvedAt: to === "approved" ? (partner.approvedAt ?? now) : partner.approvedAt,
      suspendedAt: to === "suspended" ? now : undefined,
      updatedAt: now,
    });

    /* ------------------------------ the role ------------------------------ */
    // Approval is what grants the login its partner role; anything else takes
    // it back. A login that is also a staff account is left alone — demoting
    // a colleague because their agency was suspended would be a surprise.
    const login = await ctx.db.get(partner.userId);
    if (login && (login.role === "customer" || login.role === "partner")) {
      const nextRole = to === "approved" ? "partner" : "customer";
      if (login.role !== nextRole) {
        await ctx.db.patch(login._id, { role: nextRole });
      }
    }

    const action =
      to === "approved"
        ? AUDIT_ACTIONS.PARTNER_APPROVED
        : to === "rejected"
          ? AUDIT_ACTIONS.PARTNER_REJECTED
          : to === "suspended"
            ? AUDIT_ACTIONS.PARTNER_SUSPENDED
            : AUDIT_ACTIONS.PARTNER_STATUS_CHANGED;

    await recordAudit(ctx, {
      actor: staff.user,
      action,
      entityType: "partner",
      entityId: partner._id,
      summary: `${staff.user.fullName} moved ${partner.agencyName} from ${PARTNER_STATUS_CONFIG[from].label} to ${PARTNER_STATUS_CONFIG[to].label}${
        reason ? ` — ${reason}` : ""
      }`,
      before: { status: from },
      after: { status: to, reason },
    });

    await announceDecision(ctx, partner._id, partner.userId, to, reason);

    return { status: to, changed: true };
  },
});

/** Tell the partner what was decided. Silent for the internal-only states. */
async function announceDecision(
  ctx: MutationCtx,
  partnerId: Id<"partners">,
  userId: Id<"users">,
  status: PartnerStatus,
  reason: string | undefined,
): Promise<void> {
  const partner = await ctx.db.get(partnerId);
  if (!partner) return;

  const common = {
    userId,
    link: "/partner/dashboard",
    dedupeKey: dedupeKeys.partnerStatus(partnerId, status),
    emailData: {
      recipientName: partner.contactPersonName,
      contactPersonName: partner.contactPersonName,
      agencyName: partner.agencyName,
      partnerCode: partner.partnerCode,
      partnerUrl: "/partner/dashboard",
      reason,
    },
  };

  if (status === "approved") {
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      ...common,
      type: NOTIFICATION_TYPES.PARTNER_APPROVED,
      title: "Your partner account is approved",
      body: `${partner.agencyName} is now a VisaDrive partner (${partner.partnerCode}). You can start creating bookings for your customers.`,
    });
    return;
  }

  if (status === "rejected") {
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      ...common,
      type: NOTIFICATION_TYPES.PARTNER_REJECTED,
      title: "Your partner application was not approved",
      body: reason ?? "We were not able to approve this partner application.",
      link: "/partner/register",
    });
    return;
  }

  if (status === "suspended") {
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      ...common,
      type: NOTIFICATION_TYPES.PARTNER_SUSPENDED,
      title: "Your partner account has been paused",
      body: reason ?? "New bookings are paused on this partner account.",
    });
  }
}

/**
 * Soft-delete a partner.
 *
 * The row stays, because its bookings, margins and audit trail are history
 * that must not develop holes; it simply stops appearing and stops trading.
 */
export const remove = mutation({
  args: { partnerId: v.id("partners"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.PARTNER_MANAGE);
    const partner = await loadPartner(ctx, args.partnerId);

    const reason = cleanText(args.reason, 500);
    if (!reason) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Give a reason for removing this partner.",
        field: "reason",
      });
    }

    const now = Date.now();
    await ctx.db.patch(partner._id, {
      isDeleted: true,
      deletedAt: now,
      status: partner.status === "approved" ? "suspended" : partner.status,
      statusReason: reason,
      updatedAt: now,
    });

    const login = await ctx.db.get(partner.userId);
    if (login && login.role === "partner") {
      await ctx.db.patch(login._id, { role: "customer" });
    }

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.PARTNER_DELETED,
      entityType: "partner",
      entityId: partner._id,
      summary: `${staff.user.fullName} removed ${partner.agencyName} (${partner.partnerCode}) — ${reason}`,
      before: { status: partner.status, isDeleted: false },
      after: { isDeleted: true, reason },
    });

    return null;
  },
});

/** Rebuild one partner's denormalised counters. Safe to call at any time. */
export const recount = mutation({
  args: { partnerId: v.id("partners") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PARTNER_MANAGE);
    await recountPartner(ctx, args.partnerId);
    return null;
  },
});

/* -------------------------------------------------------------------------- */
/*                                   export                                   */
/* -------------------------------------------------------------------------- */

const EXPORT_LIMIT = 5000;

export const exportRows = internalQuery({
  args: partnerFilterArgs,
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PARTNER_EXPORT);

    const filters = args as PartnerFilters;
    const usingSearch = !!filters.search?.trim();
    const stream = applyPartnerLeftovers(
      partnerStream(ctx, filters),
      filters,
      usingSearch,
    );

    const rows: Doc<"partners">[] = await stream.take(EXPORT_LIMIT);

    return rows.map((p) => ({
      partnerCode: p.partnerCode,
      agencyName: p.agencyName,
      businessType: p.businessType,
      contactPersonName: p.contactPersonName,
      contactEmail: p.contactEmail,
      contactPhone: p.contactPhone,
      city: p.city,
      country: p.country,
      gstNumber: p.gstNumber ?? "",
      status: p.status,
      defaultMarkupPercent: p.defaultMarkupPercent,
      bookingCount: p.bookingCount,
      customerCount: p.customerCount,
      grossVolume: p.grossVolume,
      grossMargin: p.grossMargin,
      createdAt: new Date(p.createdAt).toISOString(),
      approvedAt: p.approvedAt ? new Date(p.approvedAt).toISOString() : "",
    }));
  },
});

type PartnerExportRow = {
  partnerCode: string;
  agencyName: string;
  businessType: string;
  contactPersonName: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  country: string;
  gstNumber: string;
  status: string;
  defaultMarkupPercent: number;
  bookingCount: number;
  customerCount: number;
  grossVolume: number;
  grossMargin: number;
  createdAt: string;
  approvedAt: string;
};

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const exportCsv = action({
  args: partnerFilterArgs,
  returns: v.object({
    csv: v.string(),
    rowCount: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const rows: PartnerExportRow[] = await ctx.runQuery(
      internal.partners.exportRows,
      args,
    );

    const headers = [
      "Partner ID",
      "Agency",
      "Business type",
      "Contact person",
      "Email",
      "Phone",
      "City",
      "Country",
      "GSTIN",
      "Status",
      "Default markup %",
      "Bookings",
      "Customers",
      "Gross volume (minor units)",
      "Gross margin (minor units)",
      "Registered at",
      "Approved at",
    ];

    const csv = [
      headers.map(csvCell).join(","),
      ...rows.map((r) =>
        [
          r.partnerCode,
          r.agencyName,
          r.businessType,
          r.contactPersonName,
          r.contactEmail,
          r.contactPhone,
          r.city,
          r.country,
          r.gstNumber,
          r.status,
          r.defaultMarkupPercent,
          r.bookingCount,
          r.customerCount,
          r.grossVolume,
          r.grossMargin,
          r.createdAt,
          r.approvedAt,
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n");

    return { csv, rowCount: rows.length, truncated: rows.length >= EXPORT_LIMIT };
  },
});

/* -------------------------------------------------------------------------- */
/*                          partner-facing dashboard                          */
/* -------------------------------------------------------------------------- */

/**
 * The partner's own KPI strip.
 *
 * Every figure is scoped to the caller's partner id by the index itself —
 * there is no filter a bug could drop that would widen it to another agency.
 */
export const myDashboard = query({
  args: { rangeDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { partner } = await requirePartner(ctx);

    const rangeDays = Math.min(Math.max(args.rangeDays ?? 30, 1), 365);
    const since = Date.now() - rangeDays * 24 * 60 * 60 * 1000;

    const bookings = await ctx.db
      .query("applications")
      .withIndex("by_partner_createdAt", (q) => q.eq("partnerId", partner._id))
      .order("desc")
      .take(1000);

    const placed = bookings.filter((b) => !b.isDraft);
    const inRange = placed.filter((b) => (b.submittedAt ?? b.createdAt) >= since);

    const pendingStatuses = new Set([
      "submitted",
      "documents_pending",
      "documents_submitted",
      "under_review",
      "additional_documents_requested",
      "ready_for_processing",
      "appointment_scheduled",
      "visa_processing",
      "on_hold",
    ]);

    const volume = placed.reduce(
      (sum, b) => sum + (b.partnerMargin?.partnerPrice ?? b.pricing.total),
      0,
    );
    const margin = placed.reduce(
      (sum, b) => sum + (b.partnerMargin?.marginAmount ?? 0),
      0,
    );

    // Daily buckets for the trend chart. Built from the rows above rather
    // than a second read, and keyed by IST day so the chart lines up with the
    // dates shown everywhere else in the product.
    const buckets = new Map<string, { bookings: number; volume: number }>();
    for (let i = rangeDays - 1; i >= 0; i -= 1) {
      const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000 + 5.5 * 3600_000)
        .toISOString()
        .slice(0, 10);
      buckets.set(day, { bookings: 0, volume: 0 });
    }
    for (const booking of inRange) {
      const day = new Date((booking.submittedAt ?? booking.createdAt) + 5.5 * 3600_000)
        .toISOString()
        .slice(0, 10);
      const bucket = buckets.get(day);
      if (!bucket) continue;
      bucket.bookings += 1;
      bucket.volume += booking.partnerMargin?.partnerPrice ?? booking.pricing.total;
    }

    return {
      partner: publicPartnerView(partner),
      kpis: {
        totalBookings: placed.length,
        bookingsInRange: inRange.length,
        pendingApplications: placed.filter((b) => pendingStatuses.has(b.status))
          .length,
        completedApplications: placed.filter(
          (b) => b.status === "completed" || b.status === "approved",
        ).length,
        rejectedApplications: placed.filter((b) => b.status === "rejected").length,
        draftCount: bookings.filter((b) => b.isDraft).length,
        totalVolume: volume,
        totalMargin: margin,
        currency: placed[0]?.pricing.currency ?? "INR",
      },
      trend: Array.from(buckets.entries()).map(([day, value]) => ({
        day,
        ...value,
      })),
      recentBookings: placed.slice(0, 8).map((b) => ({
        _id: b._id,
        referenceId: b.referenceId,
        customerName: b.customerName,
        destinationName: b.destinationName,
        visaProductName: b.visaProductName,
        status: b.status,
        paymentStatus: b.paymentStatus,
        total: b.partnerMargin?.partnerPrice ?? b.pricing.total,
        margin: b.partnerMargin?.marginAmount ?? 0,
        currency: b.pricing.currency,
        createdAt: b.createdAt,
        submittedAt: b.submittedAt,
      })),
      rangeDays,
      /** True when the read cap may have truncated the figures above. */
      truncated: bookings.length >= 1000,
    };
  },
});

/**
 * A live quote for one product at one traveller count.
 *
 * The booking wizard calls this to show the price before anything is created.
 * It is a *query*: nothing is written, and the number it returns is the same
 * number `partnerBookings.createDraft` will recompute and freeze.
 */
export const myQuote = query({
  args: {
    visaProductId: v.id("visaProducts"),
    travellerCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { partner } = await requirePartner(ctx);

    const product = await ctx.db.get(args.visaProductId);
    if (!product || !product.isPublished) return null;

    const travellers = Math.max(1, Math.min(Math.floor(args.travellerCount ?? 1), 20));
    const quote = await resolvePartnerQuote(ctx, partner, product, travellers);

    return {
      visaProductId: product._id,
      travellerCount: travellers,
      ...marginSnapshot(quote),
      breakdown: quote.breakdown,
      baseBreakdown: quote.baseBreakdown,
      source: quote.source,
      formatted: {
        basePrice: formatMoney(quote.basePrice, quote.currency),
        partnerPrice: formatMoney(quote.partnerPrice, quote.currency),
        marginAmount: formatMoney(quote.marginAmount, quote.currency),
      },
    };
  },
});


/* -------------------------------------------------------------------------- */
/*                               partner sign-in                              */
/* -------------------------------------------------------------------------- */

/**
 * Attach a Clerk account to a partner's login row.
 *
 * A partner row is created with a `pending:<email>` clerkId (no Clerk account
 * yet). Once a Clerk account exists for that email, this rewrites the
 * placeholder onto the real Clerk id, and nothing else. It refuses a Clerk id
 * already held by another VisaDrive user, and refuses to repoint a login that
 * is already linked to a different account.
 */
async function attachLogin(
  ctx: MutationCtx,
  partner: Doc<"partners">,
  clerkId: string,
  actor: Doc<"users"> | null,
): Promise<void> {
  const trimmed = clerkId.trim();
  if (trimmed.length === 0 || trimmed.startsWith("pending:")) {
    throw new ConvexError({
      code: "VALIDATION",
      message: "That is not a usable Clerk account id.",
    });
  }

  const login = await ctx.db.get(partner.userId);
  if (!login) authError("NOT_FOUND", "This partner's login no longer exists.");

  if (!login.clerkId.startsWith("pending:")) {
    if (login.clerkId === trimmed) return;
    throw new ConvexError({
      code: "ALREADY_LINKED",
      message: "This partner already has a sign-in linked.",
    });
  }

  const clash = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", trimmed))
    .unique();
  if (clash) {
    throw new ConvexError({
      code: "CONFLICT",
      message: "That sign-in is already attached to another VisaDrive user.",
    });
  }

  await ctx.db.patch(login._id, {
    clerkId: trimmed,
    emailVerified: true,
    // An approved partner's login must carry the partner role.
    ...(partner.status === "approved" && login.role === "customer"
      ? { role: "partner" as const }
      : {}),
  });

  await recordAudit(ctx, {
    actor,
    action: AUDIT_ACTIONS.PARTNER_UPDATED,
    entityType: "partner",
    entityId: partner._id,
    summary: `Created a sign-in for ${partner.agencyName} (${login.email})`,
    before: { clerkId: login.clerkId },
    after: { clerkId: trimmed },
  });
}

/**
 * Step 1 of creating a partner's sign-in: confirm the caller may do it, and
 * say which email the Clerk account should use. It runs before anything is
 * created in Clerk, so a refused caller leaves no account behind.
 */
export const prepareLogin = query({
  args: { partnerId: v.id("partners") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PARTNER_MANAGE);
    const partner = await loadPartner(ctx, args.partnerId);
    const login = await ctx.db.get(partner.userId);
    return {
      email: partner.contactEmail,
      agencyName: partner.agencyName,
      contactPersonName: partner.contactPersonName,
      hasSignIn: !!login && !login.clerkId.startsWith("pending:"),
    };
  },
});

/** Step 2: attach the Clerk account that was just created or found. */
export const linkLogin = mutation({
  args: { partnerId: v.id("partners"), clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.PARTNER_MANAGE);
    const partner = await loadPartner(ctx, args.partnerId);
    await attachLogin(ctx, partner, args.clerkId, staff.user);
    return null;
  },
});

/**
 * Operator-only link by email, for a one-off manual setup from the Convex CLI.
 * Not reachable from the client.
 */
export const linkLoginByEmailInternal = internalMutation({
  args: { email: v.string(), clerkId: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const email = normaliseEmail(args.email);
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!user) {
      throw new ConvexError({ code: "NOT_FOUND", message: "No user with that email." });
    }

    const partner = await ctx.db
      .query("partners")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!partner) {
      throw new ConvexError({ code: "NOT_FOUND", message: "No partner row for that email." });
    }

    await attachLogin(ctx, partner, args.clerkId, null);
    return partner.partnerCode;
  },
});
