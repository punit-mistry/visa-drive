import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import {
  requireConversationAccess,
  requirePermission,
} from "./lib/auth";
import {
  appendInternalNote,
  appendMessage,
  markConversationRead,
} from "./lib/messaging";
import { NOTIFICATION_TYPES } from "../lib/constants/notifications";
import { PERMISSIONS } from "../lib/constants/roles";

/* ============================================================================
 * Messages inside a conversation.
 *
 * The one rule in this file that is not negotiable:
 *
 *   **An `isInternal: true` row must never reach a customer.**
 *
 * It is enforced structurally rather than by a post-read `.filter()`. A
 * customer's read goes through the `by_conversation_internal` index pinned to
 * `isInternal === false`, so internal rows are not merely removed from the
 * result — they are never in it. A future refactor that forgets a filter
 * cannot leak them, because there is no filter to forget.
 * ========================================================================== */

const MAX_PAGE = 200;
const BODY_LIMIT = 5000;
const NOTE_LIMIT = 5000;

const attachmentValidator = v.object({
  storageId: v.id("_storage"),
  fileName: v.string(),
  mimeType: v.string(),
  size: v.number(),
});

function clean(value: string, max: number): string {
  return (
    String(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim()
      .slice(0, max)
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Read                                    */
/* -------------------------------------------------------------------------- */

/**
 * The thread's messages, oldest first.
 *
 * Customers get the non-internal rows only — see the file header. Staff with
 * `conversation:view_all` get everything, which is how they read their
 * colleagues' notes inline.
 *
 * Note that a staff member who is themselves the thread's customer is treated
 * as a customer here (`requireConversationAccess` returns `viaStaff: false`
 * when the row is their own), which is the safe direction to err in.
 */
export const listByConversation = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { viaStaff } = await requireConversationAccess(
      ctx,
      args.conversationId,
    );

    const limit = Math.min(Math.max(args.limit ?? 100, 1), MAX_PAGE);

    if (!viaStaff) {
      // Customer path. The index does the redaction.
      const rows = await ctx.db
        .query("messages")
        .withIndex("by_conversation_internal", (q) =>
          q.eq("conversationId", args.conversationId).eq("isInternal", false),
        )
        .order("desc")
        .take(limit);

      return rows.reverse();
    }

    const rows = await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .take(limit);

    return rows.reverse();
  },
});

/* -------------------------------------------------------------------------- */
/*                                    Send                                    */
/* -------------------------------------------------------------------------- */

/**
 * Post a customer-visible reply.
 *
 * Updates the parent thread's `lastMessageAt`, `lastMessagePreview`,
 * `messageCount` and the *other* side's unread counter (via
 * `convex/lib/messaging.ts`), then notifies whoever did not write it.
 */
export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    body: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  returns: v.object({ messageId: v.id("messages") }),
  handler: async (ctx, args) => {
    const { user, conversation, viaStaff } = await requireConversationAccess(
      ctx,
      args.conversationId,
    );

    const body = clean(args.body, BODY_LIMIT);
    if (body.length === 0 && (args.attachments ?? []).length === 0) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Please write a message before sending.",
      });
    }

    // Reading a thread is not the same as replying in it: a support agent can
    // see every conversation, but replying needs `conversation:reply`.
    if (viaStaff) {
      await requirePermission(ctx, PERMISSIONS.CONVERSATION_REPLY);
    }

    if (conversation.status === "closed" && !viaStaff) {
      throw new ConvexError({
        code: "VALIDATION",
        message:
          "This conversation has been closed. Please start a new one and we will pick it up.",
      });
    }

    const messageId = await appendMessage(ctx, conversation, {
      conversationId: conversation._id,
      authorUserId: user._id,
      authorName: user.fullName,
      authorRole: viaStaff ? "staff" : "customer",
      body,
      attachments: args.attachments ?? [],
    });

    // A reply to a resolved thread reopens it — otherwise the customer's
    // follow-up question sits in a bucket nobody looks at.
    if (conversation.status === "resolved") {
      await ctx.db.patch(conversation._id, {
        status: "open",
        resolvedAt: undefined,
        resolvedBy: undefined,
      });
    }

    const preview = body.slice(0, 600);

    if (viaStaff) {
      if (conversation.userId) {
        await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
          userId: conversation.userId,
          type: NOTIFICATION_TYPES.ADMIN_REPLIED,
          title: `VisaDrive replied: ${conversation.subject}`,
          body: body.slice(0, 160),
          link: `/dashboard/messages/${conversation._id}`,
          // One notification per message, so a double-submit is harmless.
          dedupeKey: `msg:${messageId}`,
          conversationId: conversation._id,
          applicationId: conversation.applicationId,
          emailTemplate: "admin_replied",
          emailData: {
            customerName: conversation.customerName,
            conversationSubject: conversation.subject,
            agentName: user.fullName,
            messagePreview: preview,
            link: `/dashboard/messages/${conversation._id}`,
          },
        });
      }
    } else if (conversation.assignedTo) {
      // Someone owns this thread — do not wake the whole team.
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        userId: conversation.assignedTo,
        type: NOTIFICATION_TYPES.CUSTOMER_REPLIED,
        title: `${conversation.customerName} replied`,
        body: `${conversation.subject} — ${body.slice(0, 120)}`,
        link: `/admin/conversations/${conversation._id}`,
        dedupeKey: `msg:${messageId}`,
        conversationId: conversation._id,
        applicationId: conversation.applicationId,
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.notifications.dispatchToStaff, {
        permission: PERMISSIONS.CONVERSATION_VIEW_ALL,
        type: NOTIFICATION_TYPES.CUSTOMER_REPLIED,
        title: `${conversation.customerName} replied`,
        body: `${conversation.subject} — ${body.slice(0, 120)}`,
        link: `/admin/conversations/${conversation._id}`,
        dedupeKeyPrefix: `msg:${messageId}`,
        conversationId: conversation._id,
        applicationId: conversation.applicationId,
        excludeUserId: user._id,
      });
    }

    return { messageId };
  },
});

/* -------------------------------------------------------------------------- */
/*                               Internal note                                */
/* -------------------------------------------------------------------------- */

/**
 * Post a staff-only note into the thread.
 *
 * Three things it deliberately does **not** do, each of which would leak the
 * note to the customer:
 *
 *  - it does not update `lastMessagePreview` (rendered in the customer's
 *    thread list);
 *  - it does not bump `messageCount` or `unreadForCustomer`;
 *  - it does not send a notification to the customer.
 *
 * All of that lives in `appendInternalNote`, which has no code path that can
 * touch those fields.
 */
export const sendInternalNote = mutation({
  args: {
    conversationId: v.id("conversations"),
    body: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  returns: v.object({ messageId: v.id("messages") }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(
      ctx,
      PERMISSIONS.CONVERSATION_INTERNAL_NOTE,
    );

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Conversation not found.",
      });
    }

    const body = clean(args.body, NOTE_LIMIT);
    if (body.length === 0) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "An internal note cannot be empty.",
      });
    }

    const messageId = await appendInternalNote(ctx, conversation, {
      authorUserId: staff.user._id,
      authorName: staff.user.fullName,
      body,
      attachments: args.attachments ?? [],
    });

    return { messageId };
  },
});

/* -------------------------------------------------------------------------- */
/*                                  Mark read                                 */
/* -------------------------------------------------------------------------- */

/** Stamp the thread's messages as read by whichever side is calling. */
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
