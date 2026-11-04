import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  requireApplicationAccess,
  requireConversationAccess,
  requirePermission,
  requireUser,
} from "./lib/auth";
import { appendMessage, markConversationRead } from "./lib/messaging";
import { NOTIFICATION_TYPES } from "../lib/constants/notifications";
import { PERMISSIONS } from "../lib/constants/roles";
import { CONVERSATION_STATUS_CONFIG } from "../lib/constants/statuses";

/* ============================================================================
 * Support conversations.
 *
 * A conversation is the thread; `convex/messages.ts` owns the individual
 * messages and the internal-notes filter. Everything that mutates a thread's
 * denormalised counters goes through `convex/lib/messaging.ts` so the two
 * modules cannot disagree about what `unreadForStaff` means.
 * ========================================================================== */

const statusValidator = v.union(
  v.literal("open"),
  v.literal("pending"),
  v.literal("resolved"),
  v.literal("closed"),
);

const priorityValidator = v.union(
  v.literal("low"),
  v.literal("normal"),
  v.literal("high"),
  v.literal("urgent"),
);

const LIMITS = { subject: 160, message: 5000 } as const;

function clean(value: string, max: number): string {
  return (
    String(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, max)
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Create                                   */
/* -------------------------------------------------------------------------- */

/**
 * Start a thread, optionally attached to an application.
 *
 * Both sides can call this: a customer asking a question, or an agent opening
 * a thread on a customer's behalf after a phone call. The caller's identity
 * decides which — never an argument.
 */
export const createForApplication = mutation({
  args: {
    applicationId: v.optional(v.id("applications")),
    subject: v.string(),
    message: v.string(),
    priority: v.optional(priorityValidator),
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
  }),
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx);

    const subject = clean(args.subject, LIMITS.subject);
    const message = clean(args.message, LIMITS.message);

    if (subject.length < 3) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Please give your message a subject.",
      });
    }
    if (message.length < 2) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Please write your message.",
      });
    }

    let application: Doc<"applications"> | null = null;
    let viaStaff = false;

    if (args.applicationId) {
      // Reuses the application's own access rule, so an agent can only open a
      // thread on an application they are allowed to see.
      const access = await requireApplicationAccess(ctx, args.applicationId);
      application = access.application;
      viaStaff = access.actingAsStaff;
    }

    // The thread always belongs to the *customer*, even when staff opened it.
    const ownerId: Id<"users"> = application ? application.userId : caller._id;
    const owner =
      ownerId === caller._id ? caller : await ctx.db.get(ownerId);

    if (!owner) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "The customer for this application no longer exists.",
      });
    }

    const now = Date.now();

    const conversationId = await ctx.db.insert("conversations", {
      subject,
      userId: owner._id,
      customerName: owner.fullName,
      customerEmail: owner.email,
      applicationId: application?._id,
      status: "open",
      priority: args.priority ?? "normal",
      channel: "portal",
      lastMessageAt: now,
      unreadForCustomer: 0,
      unreadForStaff: 0,
      messageCount: 0,
      createdAt: now,
    });

    const conversation = await ctx.db.get(conversationId);
    if (!conversation) {
      throw new ConvexError({
        code: "INTERNAL",
        message: "Could not open the conversation.",
      });
    }

    const messageId = await appendMessage(ctx, conversation, {
      conversationId,
      authorUserId: caller._id,
      authorName: caller.fullName,
      authorRole: viaStaff ? "staff" : "customer",
      body: message,
    });

    if (viaStaff) {
      // Staff opened the thread — tell the customer there is something for them.
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        userId: owner._id,
        type: NOTIFICATION_TYPES.ADMIN_REPLIED,
        title: `VisaDrive: ${subject}`,
        body: message.slice(0, 160),
        link: `/dashboard/messages/${conversationId}`,
        dedupeKey: `msg:${messageId}`,
        conversationId,
        applicationId: application?._id,
        emailTemplate: "admin_replied",
        emailData: {
          customerName: owner.fullName,
          conversationSubject: subject,
          agentName: caller.fullName,
          messagePreview: message.slice(0, 600),
          link: `/dashboard/messages/${conversationId}`,
        },
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.notifications.dispatchToStaff, {
        permission: PERMISSIONS.CONVERSATION_VIEW_ALL,
        type: NOTIFICATION_TYPES.CUSTOMER_REPLIED,
        title: `New message from ${owner.fullName}`,
        body: `${subject} — ${message.slice(0, 120)}`,
        link: `/admin/conversations/${conversationId}`,
        dedupeKeyPrefix: `msg:${messageId}`,
        conversationId,
        applicationId: application?._id,
        excludeUserId: caller._id,
      });
    }

    return { conversationId, messageId };
  },
});

/* -------------------------------------------------------------------------- */
/*                               Customer reads                               */
/* -------------------------------------------------------------------------- */

export const listMine = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    return await ctx.db
      .query("conversations")
      .withIndex("by_user_lastMessage", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getMine = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const { conversation, viaStaff } = await requireConversationAccess(
      ctx,
      args.conversationId,
    );

    const application = conversation.applicationId
      ? await ctx.db.get(conversation.applicationId)
      : null;

    return {
      ...conversation,
      // The customer sees the reference, never the internal assignment.
      applicationReference: application?.referenceId ?? null,
      statusLabel: CONVERSATION_STATUS_CONFIG[conversation.status].label,
      viaStaff,
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                                Admin reads                                 */
/* -------------------------------------------------------------------------- */

export const listForAdmin = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(statusValidator),
    assignedTo: v.optional(v.id("users")),
    unassignedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CONVERSATION_VIEW_ALL);

    if (args.assignedTo) {
      const result = await ctx.db
        .query("conversations")
        .withIndex("by_assignedTo", (q) => q.eq("assignedTo", args.assignedTo!))
        .order("desc")
        .paginate(args.paginationOpts);

      return args.status
        ? { ...result, page: result.page.filter((c) => c.status === args.status) }
        : result;
    }

    if (args.status) {
      const result = await ctx.db
        .query("conversations")
        .withIndex("by_status_lastMessage", (q) => q.eq("status", args.status!))
        .order("desc")
        .paginate(args.paginationOpts);

      return args.unassignedOnly
        ? {
            ...result,
            page: result.page.filter((c) => c.assignedTo === undefined),
          }
        : result;
    }

    const result = await ctx.db
      .query("conversations")
      .withIndex("by_lastMessageAt")
      .order("desc")
      .paginate(args.paginationOpts);

    // `unassignedOnly` must work on its own, not just alongside a status
    // filter. As with the status branch, this narrows the page in memory
    // because there is no dedicated unassigned index.
    return args.unassignedOnly
      ? {
          ...result,
          page: result.page.filter((c) => c.assignedTo === undefined),
        }
      : result;
  },
});

export const getForAdmin = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CONVERSATION_VIEW_ALL);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Conversation not found.",
      });
    }

    const [assignee, application, customer, enquiry] = await Promise.all([
      conversation.assignedTo ? ctx.db.get(conversation.assignedTo) : null,
      conversation.applicationId ? ctx.db.get(conversation.applicationId) : null,
      conversation.userId ? ctx.db.get(conversation.userId) : null,
      conversation.enquiryId ? ctx.db.get(conversation.enquiryId) : null,
    ]);

    return {
      ...conversation,
      assigneeName: assignee?.fullName ?? null,
      applicationReference: application?.referenceId ?? null,
      applicationStatus: application?.status ?? null,
      customerPhone: customer?.phone ?? null,
      enquiryReference: enquiry?.referenceId ?? null,
      statusLabel: CONVERSATION_STATUS_CONFIG[conversation.status].label,
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                                Admin writes                                */
/* -------------------------------------------------------------------------- */

export const updateStatus = mutation({
  args: {
    conversationId: v.id("conversations"),
    status: statusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CONVERSATION_REPLY);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Conversation not found.",
      });
    }

    const resolving = args.status === "resolved" || args.status === "closed";

    await ctx.db.patch(conversation._id, {
      status: args.status,
      resolvedAt: resolving ? Date.now() : undefined,
      resolvedBy: resolving ? staff.user._id : undefined,
    });

    return null;
  },
});

export const assign = mutation({
  args: {
    conversationId: v.id("conversations"),
    /** `null` returns the thread to the shared queue. */
    assignedTo: v.union(v.id("users"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CONVERSATION_ASSIGN);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Conversation not found.",
      });
    }

    if (args.assignedTo) {
      const assignee = await ctx.db.get(args.assignedTo);
      if (!assignee || assignee.status !== "active") {
        throw new ConvexError({
          code: "VALIDATION",
          message: "That staff member is not available for assignment.",
        });
      }
      await ctx.db.patch(conversation._id, { assignedTo: assignee._id });
    } else {
      await ctx.db.patch(conversation._id, { assignedTo: undefined });
    }

    return null;
  },
});

/* -------------------------------------------------------------------------- */
/*                                  Mark read                                 */
/* -------------------------------------------------------------------------- */

/**
 * Clear the caller's own unread counter on a thread.
 *
 * Which counter is decided by `requireConversationAccess`: the owner clears
 * `unreadForCustomer`, a staff member clears `unreadForStaff`. A staff member
 * reading a thread never clears the customer's badge.
 */
export const markRead = mutation({
  args: { conversationId: v.id("conversations") },
  returns: v.object({ stamped: v.number() }),
  handler: async (ctx, args) => {
    const { conversation, viaStaff } = await requireConversationAccess(
      ctx,
      args.conversationId,
    );

    const stamped = await markConversationRead(
      ctx,
      conversation,
      viaStaff ? "staff" : "customer",
    );

    return { stamped };
  },
});
