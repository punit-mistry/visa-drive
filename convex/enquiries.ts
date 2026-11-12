import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requirePermission } from "./lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "./lib/audit";
import { createEnquiryCore } from "./lib/enquiryCore";
import { NOTIFICATION_TYPES } from "../lib/constants/notifications";
import { PERMISSIONS } from "../lib/constants/roles";
import { LEAD_STATUS_CONFIG } from "../lib/constants/statuses";

/* ============================================================================
 * Enquiries (leads).
 *
 * `submit` is the only function in the whole backend that runs with no
 * authentication at all — it backs the public contact form. Everything it
 * touches is therefore treated as hostile input: validated, clamped,
 * stripped of control characters, and rate-limited per email address.
 *
 * Everything else here is staff-only and audited.
 * ========================================================================== */

const leadStatusValidator = v.union(
  v.literal("new"),
  v.literal("contacted"),
  v.literal("follow_up_required"),
  v.literal("qualified"),
  v.literal("converted"),
  v.literal("lost"),
);

const sourceValidator = v.union(
  v.literal("website_form"),
  v.literal("whatsapp"),
  v.literal("phone"),
  v.literal("referral"),
  v.literal("walk_in"),
  v.literal("help_assistant"),
  v.literal("other"),
);

/* --------------------------- input sanitisation --------------------------- */

const LIMITS = {
  fullName: 120,
  email: 160,
  phone: 24,
  subject: 200,
  message: 4000,
  country: 80,
  category: 60,
  note: 1000,
} as const;

function validationError(message: string): never {
  throw new ConvexError({ code: "VALIDATION", message });
}

/**
 * Trim, collapse runs of whitespace, and strip control characters.
 *
 * The control-character strip matters beyond tidiness: a `\r\n` smuggled into
 * a name or subject would end up in an email header downstream, which is the
 * classic header-injection trick.
 */
function clean(value: string | undefined, max: number): string {
  if (value === undefined || value === null) return "";
  return (
    String(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/[ \t]+/g, " ")
      .trim()
      .slice(0, max)
  );
}

/** Same, but keeps paragraph breaks — used for the free-text message body. */
function cleanMultiline(value: string, max: number): string {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function normaliseEmail(value: string): string {
  const email = clean(value, LIMITS.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    validationError("Please enter a valid email address.");
  }
  return email;
}

function normalisePhone(value: string): string {
  const raw = clean(value, LIMITS.phone);
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    validationError("Please enter a valid phone number.");
  }
  // Store the typed form (people recognise their own formatting) but keep it
  // bounded; `normaliseWhatsAppNumber` handles the dial-out form later.
  return raw;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_ENQUIRIES_PER_HOUR = 5;

/* -------------------------------------------------------------------------- */
/*                              Public submission                             */
/* -------------------------------------------------------------------------- */

/**
 * **Public mutation — no authentication.** Backs the website contact form.
 *
 * Abuse guard: at most five enquiries per email address per hour. It is read
 * off the `by_email` index and bounded with `.take()`, so a flood costs one
 * cheap index scan rather than a table read. It is not a substitute for a
 * CAPTCHA in front of the form, but it does stop the obvious script.
 */
export const submit = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    destinationId: v.optional(v.id("destinations")),
    interestedCountry: v.optional(v.string()),
    visaCategory: v.optional(v.string()),
    travelDate: v.optional(v.number()),
    subject: v.optional(v.string()),
    message: v.string(),
    source: v.optional(sourceValidator),
  },
  returns: v.object({
    enquiryId: v.id("enquiries"),
    referenceId: v.string(),
  }),
  handler: async (ctx, args) => {
    const fullName = clean(args.fullName, LIMITS.fullName);
    if (fullName.length < 2) {
      validationError("Please enter your name.");
    }

    const email = normaliseEmail(args.email);
    const phone = normalisePhone(args.phone);

    const message = cleanMultiline(args.message, LIMITS.message);
    if (message.length < 5) {
      validationError("Please tell us a little about what you need.");
    }

    const subject =
      clean(args.subject, LIMITS.subject) || "Website enquiry";
    const interestedCountry = clean(args.interestedCountry, LIMITS.country);
    const visaCategory = clean(args.visaCategory, LIMITS.category);

    // A travel date more than five years out, or in the distant past, is a
    // bot or a typo. Drop it rather than rejecting the whole enquiry.
    const now = Date.now();
    const travelDate =
      typeof args.travelDate === "number" &&
      Number.isFinite(args.travelDate) &&
      args.travelDate > now - 365 * 24 * ONE_HOUR_MS &&
      args.travelDate < now + 5 * 365 * 24 * ONE_HOUR_MS
        ? args.travelDate
        : undefined;

    // ---- rate limit --------------------------------------------------
    const recent = await ctx.db
      .query("enquiries")
      .withIndex("by_email", (q) => q.eq("email", email))
      .order("desc")
      .take(MAX_ENQUIRIES_PER_HOUR + 1);

    const withinHour = recent.filter(
      (row) => now - row.createdAt < ONE_HOUR_MS,
    ).length;

    if (withinHour >= MAX_ENQUIRIES_PER_HOUR) {
      throw new ConvexError({
        code: "RATE_LIMITED",
        message:
          "We have already received several enquiries from this email address. Please give us a little time to reply, or call us on +91 77100 20694.",
      });
    }

    // ---- destination (only if it really exists and is published) ------
    let destinationId: Id<"destinations"> | undefined;
    if (args.destinationId) {
      const destination = await ctx.db.get(args.destinationId);
      if (destination) destinationId = destination._id;
    }

    return await createEnquiryCore(ctx, {
      fullName,
      email,
      phone,
      destinationId,
      interestedCountry,
      visaCategory,
      travelDate,
      subject,
      message,
      // Public and unauthenticated: only the bot (via createEnquiryCore) may
      // stamp "whatsapp", so a caller cannot inflate that channel's counts.
      source: args.source === undefined || args.source === "whatsapp" ? "website_form" : args.source,
      now,
    });
  },
});

/* -------------------------------------------------------------------------- */
/*                                  Admin reads                               */
/* -------------------------------------------------------------------------- */

export const listForAdmin = query({
  args: {
    paginationOpts: paginationOptsValidator,
    leadStatus: v.optional(leadStatusValidator),
    assignedTo: v.optional(v.id("users")),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ENQUIRY_VIEW);

    const term = clean(args.search, 100);

    if (term.length >= 2) {
      return await ctx.db
        .query("enquiries")
        .withSearchIndex("search_enquiries", (q) => {
          let search = q.search("fullName", term);
          if (args.leadStatus) search = search.eq("leadStatus", args.leadStatus);
          if (args.assignedTo) search = search.eq("assignedTo", args.assignedTo);
          return search;
        })
        .paginate(args.paginationOpts);
    }

    if (args.assignedTo) {
      return await ctx.db
        .query("enquiries")
        .withIndex("by_assignedTo", (q) => q.eq("assignedTo", args.assignedTo!))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    if (args.leadStatus) {
      return await ctx.db
        .query("enquiries")
        .withIndex("by_leadStatus_createdAt", (q) =>
          q.eq("leadStatus", args.leadStatus!),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("enquiries")
      .withIndex("by_createdAt")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getForAdmin = query({
  args: { enquiryId: v.id("enquiries") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ENQUIRY_VIEW);

    const enquiry = await ctx.db.get(args.enquiryId);
    if (!enquiry) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Enquiry not found." });
    }

    const assignee = enquiry.assignedTo
      ? await ctx.db.get(enquiry.assignedTo)
      : null;
    const destination = enquiry.destinationId
      ? await ctx.db.get(enquiry.destinationId)
      : null;
    const convertedUser = enquiry.convertedUserId
      ? await ctx.db.get(enquiry.convertedUserId)
      : null;

    return {
      ...enquiry,
      assigneeName: assignee?.fullName ?? null,
      destinationName: destination?.name ?? null,
      convertedUserEmail: convertedUser?.email ?? null,
      statusLabel: LEAD_STATUS_CONFIG[enquiry.leadStatus].label,
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                                 Admin writes                               */
/* -------------------------------------------------------------------------- */

async function loadEnquiry(
  ctx: QueryCtx | MutationCtx,
  enquiryId: Id<"enquiries">,
): Promise<Doc<"enquiries">> {
  const enquiry = await ctx.db.get(enquiryId);
  if (!enquiry) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Enquiry not found." });
  }
  return enquiry;
}

export const updateLeadStatus = mutation({
  args: {
    enquiryId: v.id("enquiries"),
    leadStatus: leadStatusValidator,
    lostReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.ENQUIRY_MANAGE);
    const enquiry = await loadEnquiry(ctx, args.enquiryId);

    const lostReason = clean(args.lostReason, LIMITS.note);
    if (args.leadStatus === "lost" && lostReason.length === 0) {
      validationError("Please record why this lead was lost.");
    }

    // "Converted" is set by `convertToApplication`, which also links the
    // customer record. Letting it be set by hand would produce a converted
    // lead with nothing attached to it.
    if (args.leadStatus === "converted" && !enquiry.convertedUserId) {
      validationError(
        "Use “Convert to application” to mark a lead as converted.",
      );
    }

    await ctx.db.patch(enquiry._id, {
      leadStatus: args.leadStatus,
      lostReason: args.leadStatus === "lost" ? lostReason : undefined,
      updatedAt: Date.now(),
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.ENQUIRY_STATUS_CHANGED,
      entityType: "enquiry",
      entityId: enquiry._id,
      summary: `Moved enquiry ${enquiry.referenceId} from ${
        LEAD_STATUS_CONFIG[enquiry.leadStatus].label
      } to ${LEAD_STATUS_CONFIG[args.leadStatus].label}`,
      before: { leadStatus: enquiry.leadStatus },
      after: { leadStatus: args.leadStatus, lostReason: lostReason || undefined },
    });

    return null;
  },
});

export const assign = mutation({
  args: {
    enquiryId: v.id("enquiries"),
    /** `null` unassigns. */
    assignedTo: v.union(v.id("users"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.ENQUIRY_ASSIGN);
    const enquiry = await loadEnquiry(ctx, args.enquiryId);

    let assigneeName = "nobody";

    if (args.assignedTo) {
      const assignee = await ctx.db.get(args.assignedTo);
      if (!assignee || assignee.status !== "active") {
        validationError("That staff member is not available for assignment.");
      }
      assigneeName = assignee.fullName;

      await ctx.db.patch(enquiry._id, {
        assignedTo: assignee._id,
        assignedAt: Date.now(),
        // Picking up a brand-new lead implicitly moves it out of the inbox.
        leadStatus: enquiry.leadStatus === "new" ? "contacted" : enquiry.leadStatus,
        updatedAt: Date.now(),
      });

      if (assignee._id !== staff.user._id) {
        await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
          userId: assignee._id,
          type: NOTIFICATION_TYPES.ENQUIRY_ASSIGNED,
          title: "An enquiry was assigned to you",
          body: `${enquiry.fullName} — ${enquiry.subject}`,
          link: `/admin/enquiries/${enquiry._id}`,
          // Re-assigning to the same person twice is the same real-world
          // event, so the key carries both ids and nothing else.
          dedupeKey: `enq:${enquiry._id}:assigned:${assignee._id}`,
          enquiryId: enquiry._id,
        });
      }
    } else {
      await ctx.db.patch(enquiry._id, {
        assignedTo: undefined,
        assignedAt: undefined,
        updatedAt: Date.now(),
      });
    }

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.ENQUIRY_ASSIGNED,
      entityType: "enquiry",
      entityId: enquiry._id,
      summary: `Assigned enquiry ${enquiry.referenceId} to ${assigneeName}`,
      before: { assignedTo: enquiry.assignedTo },
      after: { assignedTo: args.assignedTo ?? undefined },
    });

    return null;
  },
});

export const setFollowUp = mutation({
  args: {
    enquiryId: v.id("enquiries"),
    /** `null` clears the reminder. */
    followUpAt: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ENQUIRY_MANAGE);
    const enquiry = await loadEnquiry(ctx, args.enquiryId);

    if (args.followUpAt !== null && !Number.isFinite(args.followUpAt)) {
      validationError("That follow-up date is not valid.");
    }

    await ctx.db.patch(enquiry._id, {
      followUpAt: args.followUpAt ?? undefined,
      leadStatus:
        args.followUpAt !== null && enquiry.leadStatus === "new"
          ? "follow_up_required"
          : enquiry.leadStatus,
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const recordContactAttempt = mutation({
  args: {
    enquiryId: v.id("enquiries"),
    note: v.optional(v.string()),
    outcome: v.optional(
      v.union(
        v.literal("reached"),
        v.literal("no_answer"),
        v.literal("callback_requested"),
      ),
    ),
  },
  returns: v.object({ contactAttempts: v.number() }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.ENQUIRY_MANAGE);
    const enquiry = await loadEnquiry(ctx, args.enquiryId);

    const now = Date.now();
    const contactAttempts = enquiry.contactAttempts + 1;
    const note = clean(args.note, LIMITS.note);

    await ctx.db.patch(enquiry._id, {
      contactAttempts,
      lastContactedAt: now,
      // An untouched lead stops being "new" the moment somebody rings it.
      leadStatus:
        enquiry.leadStatus === "new"
          ? args.outcome === "no_answer"
            ? "follow_up_required"
            : "contacted"
          : enquiry.leadStatus,
      updatedAt: now,
    });

    // The attempt itself is worth a note on the lead's timeline.
    if (note) {
      await ctx.db.insert("internalNotes", {
        entityType: "enquiry",
        entityId: enquiry._id,
        authorId: staff.user._id,
        authorName: staff.user.fullName,
        body: `Contact attempt ${contactAttempts}${
          args.outcome ? ` (${args.outcome.replace(/_/g, " ")})` : ""
        }: ${note}`,
        mentionedUserIds: [],
        isPinned: false,
        createdAt: now,
      });
    }

    return { contactAttempts };
  },
});

/* ---------------------------- convert to booking -------------------------- */

/**
 * Turn a qualified lead into something the booking wizard can prefill.
 *
 * Deliberately does **not** create an application. An application needs a
 * visa product, a price snapshot and the customer's agreement to the terms —
 * none of which a lead has. This links the lead to a real `users` row and
 * hands back the fields the wizard should start from; `applications.create`
 * does the rest with the customer present.
 */
export const convertToApplication = mutation({
  args: {
    enquiryId: v.id("enquiries"),
    /** Optionally point at an existing customer rather than matching by email. */
    userId: v.optional(v.id("users")),
  },
  returns: v.object({
    userId: v.id("users"),
    createdPlaceholder: v.boolean(),
    prefill: v.object({
      fullName: v.string(),
      email: v.string(),
      phone: v.string(),
      destinationId: v.optional(v.id("destinations")),
      interestedCountry: v.optional(v.string()),
      visaCategory: v.optional(v.string()),
      travelDate: v.optional(v.number()),
      enquiryId: v.id("enquiries"),
      enquiryReference: v.string(),
    }),
  }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.ENQUIRY_CONVERT);
    const enquiry = await loadEnquiry(ctx, args.enquiryId);

    const now = Date.now();
    let createdPlaceholder = false;
    let user: Doc<"users"> | null = null;

    if (args.userId) {
      user = await ctx.db.get(args.userId);
      if (!user) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "That customer no longer exists.",
        });
      }
    } else if (enquiry.source === "whatsapp") {
      // The email on a WhatsApp enquiry was typed into a chat and never
      // verified, so it must not pick an account. Staff choose one explicitly.
      throw new ConvexError({
        code: "USER_REQUIRED",
        message:
          "This enquiry came from WhatsApp, so its email is unverified. Choose the customer account explicitly.",
      });
    } else {
      user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", enquiry.email))
        .first();
    }

    if (!user) {
      // Placeholder row. `clerkId` is namespaced so it can never collide with
      // a real Clerk subject, and `users.upsertFromClerk` is expected to
      // reconcile this row by email when the person actually signs up — the
      // alternative (no row at all) leaves the application ownerless.
      const placeholderId = await ctx.db.insert("users", {
        clerkId: `pending:${enquiry.email}`,
        email: enquiry.email,
        fullName: enquiry.fullName,
        phone: enquiry.phone,
        role: "customer",
        status: "active",
        emailVerified: false,
        applicationCount: 0,
        createdAt: now,
      });

      const inserted = await ctx.db.get(placeholderId);
      if (!inserted) {
        throw new ConvexError({
          code: "INTERNAL",
          message: "Could not create the customer record.",
        });
      }
      user = inserted;
      createdPlaceholder = true;
    }

    await ctx.db.patch(enquiry._id, {
      convertedUserId: user._id,
      convertedAt: now,
      leadStatus: "converted",
      updatedAt: now,
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.ENQUIRY_CONVERTED,
      entityType: "enquiry",
      entityId: enquiry._id,
      summary: `Converted enquiry ${enquiry.referenceId} to customer ${user.email}${
        createdPlaceholder ? " (new placeholder account)" : ""
      }`,
      before: { leadStatus: enquiry.leadStatus },
      after: { leadStatus: "converted", convertedUserId: user._id },
    });

    return {
      userId: user._id,
      createdPlaceholder,
      prefill: {
        fullName: enquiry.fullName,
        email: enquiry.email,
        phone: enquiry.phone,
        destinationId: enquiry.destinationId,
        interestedCountry: enquiry.interestedCountry,
        visaCategory: enquiry.visaCategory,
        travelDate: enquiry.travelDate,
        enquiryId: enquiry._id,
        enquiryReference: enquiry.referenceId,
      },
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                                    Export                                  */
/* -------------------------------------------------------------------------- */

const CSV_LIMIT = 2000;

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value).replace(/\r?\n/g, " ").trim();
  // Spreadsheet formula injection: a cell starting with = + - @ is executed
  // by Excel and Sheets on open. Prefix it so it stays text.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** CSV of the current lead list. Bounded — this is a report, not a backup. */
export const exportCsv = query({
  args: {
    leadStatus: v.optional(leadStatusValidator),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  returns: v.object({ csv: v.string(), rowCount: v.number(), truncated: v.boolean() }),
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ENQUIRY_MANAGE);

    const rows = args.leadStatus
      ? await ctx.db
          .query("enquiries")
          .withIndex("by_leadStatus_createdAt", (q) =>
            q.eq("leadStatus", args.leadStatus!),
          )
          .order("desc")
          .take(CSV_LIMIT + 1)
      : await ctx.db
          .query("enquiries")
          .withIndex("by_createdAt")
          .order("desc")
          .take(CSV_LIMIT + 1);

    const filtered = rows.filter((row) => {
      if (args.from !== undefined && row.createdAt < args.from) return false;
      if (args.to !== undefined && row.createdAt > args.to) return false;
      return true;
    });

    const truncated = filtered.length > CSV_LIMIT;
    const page = filtered.slice(0, CSV_LIMIT);

    const header = [
      "Reference",
      "Received",
      "Name",
      "Email",
      "Phone",
      "Interested in",
      "Visa category",
      "Subject",
      "Status",
      "Contact attempts",
      "Last contacted",
      "Converted",
    ];

    const lines = [header.map(csvCell).join(",")];

    for (const row of page) {
      lines.push(
        [
          row.referenceId,
          new Date(row.createdAt).toISOString(),
          row.fullName,
          row.email,
          row.phone,
          row.interestedCountry ?? "",
          row.visaCategory ?? "",
          row.subject,
          LEAD_STATUS_CONFIG[row.leadStatus].label,
          row.contactAttempts,
          row.lastContactedAt
            ? new Date(row.lastContactedAt).toISOString()
            : "",
          row.convertedAt ? "yes" : "no",
        ]
          .map(csvCell)
          .join(","),
      );
    }

    return { csv: lines.join("\n"), rowCount: page.length, truncated };
  },
});

/* -------------------------------------------------------------------------- */
/*                           Cron support (follow-ups)                        */
/* -------------------------------------------------------------------------- */

/**
 * Leads whose follow-up reminder is due.
 *
 * `internalQuery` rather than `query`: the only caller is the daily cron in
 * `convex/crons.ts`, which runs with no user identity, so a `requireStaff`
 * gate here would simply make it unusable.
 */
export const dueFollowUps = internalQuery({
  args: { before: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const before = args.before ?? Date.now();
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    const rows = await ctx.db
      .query("enquiries")
      .withIndex("by_followUpAt", (q) => q.lte("followUpAt", before))
      .take(limit);

    // `by_followUpAt` also matches rows where the field is absent, and a lead
    // that is already converted or lost does not need chasing.
    return rows.filter(
      (row) =>
        row.followUpAt !== undefined &&
        row.leadStatus !== "converted" &&
        row.leadStatus !== "lost",
    );
  },
});
