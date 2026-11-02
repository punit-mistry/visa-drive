import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requirePermission, requireStaff } from "./lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "./lib/audit";
import { PERMISSIONS } from "../lib/constants/roles";
import {
  APPLICATION_STATUS_CONFIG,
  LEAD_STATUS_CONFIG,
  type LeadStatusValue,
} from "../lib/constants/statuses";
import {
  NOTIFICATION_TYPES,
  dayStamp,
  dedupeKeys,
} from "../lib/constants/notifications";
import { isValidReference, normaliseReference } from "./lib/references";
import {
  computeApplicationsOverTime,
  computeConversionFunnel,
  computeDestinationBreakdown,
  computeFollowUpReminders,
  computeOverviewKpis,
  computePendingTasks,
  computeRecentBookings,
  computeRecentEnquiries,
  computeRevenueOverTime,
  computeStatusDistribution,
  kpiValidator,
} from "./analytics";

/* ============================================================================
 * Admin aggregate queries.
 *
 * These exist so the admin shell makes ONE round trip instead of a dozen. The
 * composition happens server-side by calling the analytics compute helpers
 * directly — a Convex query cannot call another query, and doing the work in
 * one transaction also means every panel on the page is a consistent snapshot
 * of the same instant rather than a dozen slightly different ones.
 * ========================================================================== */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hard ceiling on any one section of the work queue. */
const QUEUE_LIMIT = 25;

/** Hard ceiling per result group in global search. */
const SEARCH_LIMIT = 8;

/* ============================================================================
 * dashboardSummary
 * ========================================================================== */

export const dashboardSummary = query({
  args: {
    rangeDays: v.optional(v.number()),
    bucket: v.optional(
      v.union(v.literal("day"), v.literal("week"), v.literal("month")),
    ),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    const now = Date.now();
    const rangeDays = Math.min(Math.max(Math.floor(args.rangeDays ?? 30), 1), 365);
    const from = now - rangeDays * DAY_MS;
    const bucket = args.bucket ?? (rangeDays > 120 ? "month" : rangeDays > 45 ? "week" : "day");

    const [
      kpis,
      applications,
      revenue,
      statuses,
      destinations,
      bookings,
      enquiries,
      tasks,
      funnel,
      followUps,
    ] = await Promise.all([
      computeOverviewKpis(ctx, rangeDays, now),
      computeApplicationsOverTime(ctx, { from, to: now, bucket }),
      computeRevenueOverTime(ctx, { from, to: now, bucket }),
      computeStatusDistribution(ctx, {}),
      computeDestinationBreakdown(ctx, { from, to: now }),
      computeRecentBookings(ctx, 8),
      computeRecentEnquiries(ctx, 8),
      computePendingTasks(ctx, now),
      computeConversionFunnel(ctx, { from, to: now }),
      computeFollowUpReminders(ctx, { now, horizonDays: 0, limit: 8 }),
    ]);

    return {
      generatedAt: now,
      rangeDays,
      bucket,
      from,
      to: now,
      kpis,
      applicationsOverTime: applications,
      revenueOverTime: revenue,
      statusDistribution: statuses,
      destinationBreakdown: destinations,
      recentBookings: bookings,
      recentEnquiries: enquiries,
      pendingTasks: tasks,
      conversionFunnel: funnel,
      followUpReminders: followUps,
    };
  },
});

/** Exported so a narrower caller can re-use the KPI shape in a returns validator. */
export const dashboardKpiValidator = kpiValidator;

/* ============================================================================
 * globalSearch
 * ========================================================================== */

const searchApplicationValidator = v.object({
  _id: v.id("applications"),
  referenceId: v.string(),
  customerName: v.string(),
  customerEmail: v.string(),
  destinationName: v.string(),
  visaProductName: v.string(),
  status: v.string(),
  statusLabel: v.string(),
  paymentStatus: v.string(),
  createdAt: v.number(),
});

const searchCustomerValidator = v.object({
  _id: v.id("users"),
  fullName: v.string(),
  email: v.string(),
  phone: v.union(v.string(), v.null()),
  role: v.string(),
  status: v.string(),
  applicationCount: v.number(),
  createdAt: v.number(),
});

const searchEnquiryValidator = v.object({
  _id: v.id("enquiries"),
  referenceId: v.string(),
  fullName: v.string(),
  email: v.string(),
  phone: v.string(),
  subject: v.string(),
  leadStatus: v.string(),
  leadStatusLabel: v.string(),
  createdAt: v.number(),
});

function dedupeById<T extends { _id: string }>(rows: T[], limit: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = row._id as string;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

export const globalSearch = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  returns: v.object({
    query: v.string(),
    applications: v.array(searchApplicationValidator),
    customers: v.array(searchCustomerValidator),
    enquiries: v.array(searchEnquiryValidator),
    totalResults: v.number(),
  }),
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);

    const term = args.query.trim();
    const limit = Math.min(Math.max(Math.floor(args.limit ?? SEARCH_LIMIT), 1), 25);

    if (term.length < 2) {
      return { query: term, applications: [], customers: [], enquiries: [], totalResults: 0 };
    }

    const looksLikeEmail = term.includes("@");
    const reference = normaliseReference(term);
    const looksLikeReference = isValidReference(term);

    /* --------------------------- applications --------------------------- */
    let applications: Doc<"applications">[] = [];
    if (staff.permissions.has(PERMISSIONS.APPLICATION_VIEW_ALL)) {
      const exact = looksLikeReference
        ? await ctx.db
            .query("applications")
            .withIndex("by_referenceId", (q) => q.eq("referenceId", reference))
            .take(1)
        : [];

      const byName = await ctx.db
        .query("applications")
        .withSearchIndex("search_applications", (q) => q.search("customerName", term))
        .take(limit);

      applications = dedupeById([...exact, ...byName], limit);
    } else if (staff.permissions.has(PERMISSIONS.APPLICATION_VIEW_ASSIGNED)) {
      // Agents with only the "assigned" grant get their own queue searched.
      const mine = await ctx.db
        .query("applications")
        .withIndex("by_assignedAgentId", (q) => q.eq("assignedAgentId", staff.user._id))
        .order("desc")
        .take(200);
      const needle = term.toLowerCase();
      applications = mine
        .filter(
          (a) =>
            a.customerName.toLowerCase().includes(needle) ||
            a.customerEmail.toLowerCase().includes(needle) ||
            a.referenceId.toLowerCase().includes(needle),
        )
        .slice(0, limit);
    }

    /* ----------------------------- customers ---------------------------- */
    let customers: Doc<"users">[] = [];
    if (staff.permissions.has(PERMISSIONS.CUSTOMER_VIEW)) {
      const exact = looksLikeEmail
        ? await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", term.toLowerCase()))
            .take(1)
        : [];

      const byName = await ctx.db
        .query("users")
        .withSearchIndex("search_users", (q) => q.search("fullName", term))
        .take(limit);

      customers = dedupeById([...exact, ...byName], limit).filter(
        (u) => u.status !== "deleted",
      );
    }

    /* ----------------------------- enquiries ---------------------------- */
    let enquiries: Doc<"enquiries">[] = [];
    if (staff.permissions.has(PERMISSIONS.ENQUIRY_VIEW)) {
      const exactRef = looksLikeReference
        ? await ctx.db
            .query("enquiries")
            .withIndex("by_referenceId", (q) => q.eq("referenceId", reference))
            .take(1)
        : [];

      const exactEmail = looksLikeEmail
        ? await ctx.db
            .query("enquiries")
            .withIndex("by_email", (q) => q.eq("email", term.toLowerCase()))
            .take(limit)
        : [];

      const byName = await ctx.db
        .query("enquiries")
        .withSearchIndex("search_enquiries", (q) => q.search("fullName", term))
        .take(limit);

      enquiries = dedupeById([...exactRef, ...exactEmail, ...byName], limit);
    }

    return {
      query: term,
      applications: applications.map((a) => ({
        _id: a._id,
        referenceId: a.referenceId,
        customerName: a.customerName,
        customerEmail: a.customerEmail,
        destinationName: a.destinationName,
        visaProductName: a.visaProductName,
        status: a.status,
        statusLabel: APPLICATION_STATUS_CONFIG[a.status].label,
        paymentStatus: a.paymentStatus,
        createdAt: a.createdAt,
      })),
      customers: customers.map((u) => ({
        _id: u._id,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone ?? null,
        role: u.role,
        status: u.status,
        applicationCount: u.applicationCount,
        createdAt: u.createdAt,
      })),
      enquiries: enquiries.map((e) => ({
        _id: e._id,
        referenceId: e.referenceId,
        fullName: e.fullName,
        email: e.email,
        phone: e.phone,
        subject: e.subject,
        leadStatus: e.leadStatus,
        leadStatusLabel: LEAD_STATUS_CONFIG[e.leadStatus as LeadStatusValue].label,
        createdAt: e.createdAt,
      })),
      totalResults: applications.length + customers.length + enquiries.length,
    };
  },
});

/* ============================================================================
 * pendingWorkQueue
 * ========================================================================== */

/** Resolve a set of user ids to display names with one read per distinct id. */
async function resolveNames(
  ctx: QueryCtx,
  ids: Array<Id<"users"> | undefined>,
): Promise<Map<string, string>> {
  const distinct = [...new Set(ids.filter(Boolean) as Id<"users">[])];
  const users = await Promise.all(distinct.map((id) => ctx.db.get(id)));
  const map = new Map<string, string>();
  for (const user of users) {
    if (user) map.set(user._id as string, user.fullName);
  }
  return map;
}

export const pendingWorkQueue = query({
  args: { limit: v.optional(v.number()), mineOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    const now = Date.now();
    const limit = Math.min(Math.max(Math.floor(args.limit ?? QUEUE_LIMIT), 1), 50);

    /* ------------------ documents awaiting a human review ---------------- */
    // Oldest first: the review queue is FIFO, a document that has waited three
    // days matters more than one uploaded a minute ago.
    const pendingDocs = staff.permissions.has(PERMISSIONS.DOCUMENT_VIEW)
      ? await ctx.db
          .query("documents")
          .withIndex("by_status_createdAt", (q) => q.eq("status", "pending_review"))
          .order("asc")
          .take(limit)
      : [];

    const docApplicationIds = [
      ...new Set(pendingDocs.map((d) => d.applicationId as string)),
    ];
    const docApplications = await Promise.all(
      docApplicationIds.map((id) => ctx.db.get(id as Id<"applications">)),
    );
    const applicationById = new Map<string, Doc<"applications">>();
    for (const app of docApplications) {
      if (app) applicationById.set(app._id as string, app);
    }

    /* ----------------------- unassigned applications --------------------- */
    const unassignedRaw = staff.permissions.has(PERMISSIONS.APPLICATION_VIEW_ALL)
      ? await ctx.db
          .query("applications")
          .withIndex("by_assignedAgentId", (q) => q.eq("assignedAgentId", undefined))
          .order("desc")
          .take(limit * 4)
      : [];

    const unassignedApplications = unassignedRaw
      .filter((a) => !a.isDraft && !APPLICATION_STATUS_CONFIG[a.status].isTerminal)
      .slice(0, limit);

    /* --------------------- conversations awaiting staff ------------------ */
    const conversationsRaw = staff.permissions.has(PERMISSIONS.CONVERSATION_VIEW_ALL)
      ? [
          ...(await ctx.db
            .query("conversations")
            .withIndex("by_status_lastMessage", (q) => q.eq("status", "open"))
            .order("asc")
            .take(limit * 2)),
          ...(await ctx.db
            .query("conversations")
            .withIndex("by_status_lastMessage", (q) => q.eq("status", "pending"))
            .order("asc")
            .take(limit * 2)),
        ]
      : [];

    const unansweredConversations = conversationsRaw
      .filter((c) => c.unreadForStaff > 0)
      .filter((c) => (args.mineOnly ? c.assignedTo === staff.user._id : true))
      .sort((a, b) => a.lastMessageAt - b.lastMessageAt)
      .slice(0, limit);

    /* ------------------------- leads due follow-up ----------------------- */
    const leads = staff.permissions.has(PERMISSIONS.ENQUIRY_VIEW)
      ? await computeFollowUpReminders(ctx, {
          now,
          horizonDays: 0,
          limit,
          assignedTo: args.mineOnly ? staff.user._id : undefined,
        })
      : [];

    /* ------------------------ open document requests --------------------- */
    const openRequests = staff.permissions.has(PERMISSIONS.DOCUMENT_VIEW)
      ? await ctx.db
          .query("documentRequests")
          .withIndex("by_status", (q) => q.eq("status", "open"))
          .order("asc")
          .take(limit)
      : [];

    const agentNames = await resolveNames(ctx, [
      ...unansweredConversations.map((c) => c.assignedTo),
      ...openRequests.map((r) => r.requestedBy),
    ]);

    return {
      generatedAt: now,
      documentsAwaitingReview: pendingDocs.map((doc) => {
        const app = applicationById.get(doc.applicationId as string);
        return {
          _id: doc._id,
          applicationId: doc.applicationId,
          referenceId: app?.referenceId ?? null,
          customerName: app?.customerName ?? null,
          documentKey: doc.documentKey,
          label: doc.label,
          fileName: doc.fileName,
          waitingMs: now - doc.createdAt,
          createdAt: doc.createdAt,
        };
      }),

      unassignedApplications: unassignedApplications.map((a) => ({
        _id: a._id,
        referenceId: a.referenceId,
        customerName: a.customerName,
        destinationName: a.destinationName,
        visaProductName: a.visaProductName,
        status: a.status,
        statusLabel: APPLICATION_STATUS_CONFIG[a.status].label,
        paymentStatus: a.paymentStatus,
        waitingMs: now - (a.submittedAt ?? a.createdAt),
        createdAt: a.createdAt,
      })),

      unansweredConversations: unansweredConversations.map((c) => ({
        _id: c._id,
        subject: c.subject,
        customerName: c.customerName,
        customerEmail: c.customerEmail,
        status: c.status,
        priority: c.priority,
        channel: c.channel,
        unreadForStaff: c.unreadForStaff,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview ?? null,
        assignedTo: c.assignedTo ?? null,
        assignedToName: c.assignedTo
          ? (agentNames.get(c.assignedTo as string) ?? null)
          : null,
        waitingMs: now - c.lastMessageAt,
      })),

      leadsDueForFollowUp: leads,

      openDocumentRequests: openRequests.map((r) => ({
        _id: r._id,
        applicationId: r.applicationId,
        documentKey: r.documentKey,
        label: r.label,
        reason: r.reason,
        dueDate: r.dueDate ?? null,
        isOverdue: r.dueDate !== undefined && r.dueDate < now,
        requestedBy: r.requestedBy,
        requestedByName: agentNames.get(r.requestedBy as string) ?? null,
        createdAt: r.createdAt,
      })),

      counts: {
        documentsAwaitingReview: pendingDocs.length,
        unassignedApplications: unassignedApplications.length,
        unansweredConversations: unansweredConversations.length,
        leadsDueForFollowUp: leads.length,
        openDocumentRequests: openRequests.length,
      },
    };
  },
});

/* ============================================================================
 * Scheduled job handlers.
 *
 * Driven by `convex/crons.ts`. They live here rather than in the cron file so
 * they can also be run by hand from the Convex dashboard when something needs
 * re-running, and so the cron file stays a readable timetable.
 *
 * All three are bounded, idempotent and non-destructive — see the header of
 * `convex/crons.ts`.
 * ========================================================================== */

/** Applications idle in `documents_pending` longer than this get a nudge. */
const DOCUMENTS_STUCK_DAYS = 3;

/** Drafts untouched for longer than this are considered abandoned. */
const DRAFT_ABANDON_DAYS = 30;

/** Grace period between warning a customer and closing their draft. */
const DRAFT_GRACE_DAYS = 7;

/** Batch cap per tick. Anything left over is picked up on the next run. */
const CRON_BATCH = 200;

/**
 * `convex/notifications.ts` is owned by another module and
 * `convex/_generated/api` is only rebuilt by `npx convex dev`. Referencing the
 * entry point by name type-checks in a tree where codegen has not run yet and
 * resolves to exactly the same function at runtime as
 * `internal.notifications.dispatch`.
 */
interface DispatchArgs {
  /** Convex function args must be an open record; the named fields below are
   *  the contract documented for `notifications.dispatch`. */
  [key: string]: unknown;
  userId: Id<"users">;
  type: string;
  title: string;
  body: string;
  link?: string;
  dedupeKey: string;
  channels?: ("in_app" | "email" | "whatsapp")[];
  applicationId?: Id<"applications">;
  conversationId?: Id<"conversations">;
  enquiryId?: Id<"enquiries">;
  emailTemplate?: string;
  emailData?: unknown;
}

const dispatchRef = makeFunctionReference<"mutation", DispatchArgs>(
  "notifications:dispatch",
);

async function dispatch(ctx: MutationCtx, args: DispatchArgs): Promise<void> {
  await ctx.scheduler.runAfter(0, dispatchRef, args);
}

/** Has a notification with this dedupe key already been written? */
async function existingNotification(
  ctx: MutationCtx,
  dedupeKey: string,
): Promise<Doc<"notifications"> | null> {
  return (
    (await ctx.db
      .query("notifications")
      .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", dedupeKey))
      .first()) ?? null
  );
}

/* ---------------- 1. Daily — follow-up reminders for leads ---------------- */

export const sendFollowUpReminders = internalMutation({
  args: {},
  returns: v.object({
    scanned: v.number(),
    due: v.number(),
    notified: v.number(),
    unassigned: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const stamp = dayStamp(now);
    // Everything scheduled up to the end of the current IST day.
    const horizon = now + DAY_MS;

    // Indexed on followUpAt. The `gt(0)` lower bound matters: an optional
    // field sorts before every number in a Convex index, so without it the
    // batch would fill up with leads that have no follow-up date at all.
    const candidates = await ctx.db
      .query("enquiries")
      .withIndex("by_followUpAt", (q) =>
        q.gt("followUpAt", 0).lte("followUpAt", horizon),
      )
      .take(CRON_BATCH);

    const due = candidates.filter(
      (e) =>
        e.followUpAt !== undefined &&
        e.leadStatus !== "converted" &&
        e.leadStatus !== "lost",
    );

    let notified = 0;
    let unassigned = 0;

    for (const lead of due) {
      if (!lead.assignedTo) {
        // Nobody owns it, so it surfaces in `pendingWorkQueue` rather than
        // being pushed into every staff inbox.
        unassigned += 1;
        continue;
      }

      const key = dedupeKeys.followUpDue(lead._id as string, stamp);
      if (await existingNotification(ctx, key)) continue;

      const overdueDays = Math.max(
        0,
        Math.floor((now - (lead.followUpAt ?? now)) / DAY_MS),
      );
      const attempts = lead.contactAttempts;

      await dispatch(ctx, {
        userId: lead.assignedTo,
        type: NOTIFICATION_TYPES.FOLLOW_UP_DUE,
        title:
          overdueDays > 0
            ? `Follow-up overdue: ${lead.fullName}`
            : `Follow-up due today: ${lead.fullName}`,
        body:
          overdueDays > 0
            ? `${lead.referenceId} — "${lead.subject}" was due ${overdueDays} day${overdueDays === 1 ? "" : "s"} ago. ${attempts} contact attempt${attempts === 1 ? "" : "s"} so far.`
            : `${lead.referenceId} — "${lead.subject}" is scheduled for follow-up today.`,
        link: `/admin/enquiries/${lead._id}`,
        dedupeKey: key,
        channels: ["in_app"],
        enquiryId: lead._id,
      });

      notified += 1;
    }

    return { scanned: candidates.length, due: due.length, notified, unassigned };
  },
});

/* ------------- 2. Daily — nudge applications awaiting documents ----------- */

export const remindStuckDocumentUploads = internalMutation({
  args: {},
  returns: v.object({
    scanned: v.number(),
    stuck: v.number(),
    notified: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const stamp = dayStamp(now);
    const cutoff = now - DOCUMENTS_STUCK_DAYS * DAY_MS;

    // `by_status_createdAt` bounds the read to applications that are both in
    // the right state AND old enough to qualify — no post-filter table scan.
    const candidates = await ctx.db
      .query("applications")
      .withIndex("by_status_createdAt", (q) =>
        q.eq("status", "documents_pending").lte("createdAt", cutoff),
      )
      .order("asc")
      .take(CRON_BATCH);

    // `createdAt` is what the index gives us, but "stuck" really means nothing
    // has moved recently, so the final decision uses `updatedAt`.
    const stuck = candidates.filter((app) => app.updatedAt <= cutoff);

    let notified = 0;

    for (const app of stuck) {
      const key = dedupeKeys.documentsReminder(app._id as string, stamp);
      if (await existingNotification(ctx, key)) continue;

      const outstanding = Math.max(
        0,
        app.documentsRequiredCount - app.documentsApprovedCount,
      );
      const idleDays = Math.max(1, Math.floor((now - app.updatedAt) / DAY_MS));

      await dispatch(ctx, {
        userId: app.userId,
        type: NOTIFICATION_TYPES.DOCUMENTS_REMINDER,
        title: "Your application is waiting on documents",
        body:
          outstanding > 0
            ? `${app.referenceId} (${app.destinationName} — ${app.visaProductName}) still needs ${outstanding} document${outstanding === 1 ? "" : "s"}. It has been ${idleDays} day${idleDays === 1 ? "" : "s"} since the last update.`
            : `${app.referenceId} (${app.destinationName} — ${app.visaProductName}) has been waiting ${idleDays} day${idleDays === 1 ? "" : "s"} for your documents.`,
        link: `/dashboard/applications/${app._id}`,
        dedupeKey: key,
        channels: ["in_app", "email"],
        applicationId: app._id,
      });

      notified += 1;
    }

    return { scanned: candidates.length, stuck: stuck.length, notified };
  },
});

/* ----------- 3. Hourly — sweep abandoned drafts (warn, then close) -------- */

export const sweepAbandonedDrafts = internalMutation({
  args: {},
  returns: v.object({
    scanned: v.number(),
    warned: v.number(),
    cancelled: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - DRAFT_ABANDON_DAYS * DAY_MS;

    // `by_draft_createdAt` reads only drafts, and only ones old enough.
    const drafts = await ctx.db
      .query("applications")
      .withIndex("by_draft_createdAt", (q) =>
        q.eq("isDraft", true).lte("createdAt", cutoff),
      )
      .order("asc")
      .take(CRON_BATCH);

    let warned = 0;
    let cancelled = 0;

    for (const draft of drafts) {
      // An old row that was autosaved yesterday is not abandoned.
      const lastTouched = draft.lastAutosaveAt ?? draft.updatedAt;
      if (lastTouched > cutoff) continue;

      // `dedupeKeys` has no recipe for this event yet, so the key follows the
      // same `app:<id>:<event>` shape as the rest of that module.
      const key = `app:${draft._id}:draft_abandoned`;
      const warning = await existingNotification(ctx, key);

      if (!warning) {
        await dispatch(ctx, {
          userId: draft.userId,
          type: NOTIFICATION_TYPES.APPLICATION_STATUS_CHANGED,
          title: "Your unfinished application will be closed",
          body: `${draft.referenceId} (${draft.destinationName} — ${draft.visaProductName}) has not been touched for ${DRAFT_ABANDON_DAYS} days. Pick it up within ${DRAFT_GRACE_DAYS} days and nothing is lost; after that we will close it, and you can start a new one whenever you are ready.`,
          link: `/apply/${draft._id}`,
          dedupeKey: key,
          channels: ["in_app", "email"],
          applicationId: draft._id,
        });
        warned += 1;
        continue;
      }

      // Warned, and the grace period has run out. Close it softly: the row and
      // everything attached to it stays, the status just moves to `cancelled`
      // (a transition `draft` is allowed to make) and the change is written to
      // the timeline and the audit log like any other.
      if (now - warning.createdAt < DRAFT_GRACE_DAYS * DAY_MS) continue;

      await ctx.db.patch(draft._id, {
        status: "cancelled",
        isDraft: false,
        cancelledAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("statusHistory", {
        applicationId: draft._id,
        userId: draft.userId,
        fromStatus: draft.status,
        toStatus: "cancelled",
        note: `Closed automatically after ${DRAFT_ABANDON_DAYS} days with no activity, ${DRAFT_GRACE_DAYS} days after the reminder was sent.`,
        visibleToCustomer: true,
        changedByName: "VisaDrive (automatic)",
        createdAt: now,
      });

      await recordAudit(ctx, {
        actor: null,
        action: AUDIT_ACTIONS.APPLICATION_CANCELLED,
        entityType: "application",
        entityId: draft._id as string,
        summary: `Abandoned draft ${draft.referenceId} closed automatically after ${DRAFT_ABANDON_DAYS} days of inactivity.`,
        before: { status: draft.status, isDraft: true },
        after: { status: "cancelled", isDraft: false },
      });

      cancelled += 1;
    }

    return { scanned: drafts.length, warned, cancelled };
  },
});
