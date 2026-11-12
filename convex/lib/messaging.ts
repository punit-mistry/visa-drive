import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/* ============================================================================
 * Conversation bookkeeping.
 *
 * `conversations.ts` and `messages.ts` both have to keep the denormalised
 * counters on a conversation row correct — `lastMessageAt`,
 * `lastMessagePreview`, `messageCount`, `unreadForCustomer`,
 * `unreadForStaff`. Two copies of that arithmetic drift within a week, so it
 * lives here once.
 *
 * The one rule worth stating out loud: **an internal staff note never touches
 * any of it.** `lastMessagePreview` is rendered in the customer's thread list,
 * so writing an internal note into it would leak the note's first 140
 * characters to the very person it was hidden from. Internal notes are
 * invisible to this module by design — see `appendInternalNote`.
 * ========================================================================== */

export const PREVIEW_LENGTH = 140;

/** One-line preview for the thread list. Collapses newlines and clamps. */
export function conversationPreview(body: string): string {
  const flat = body
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return flat.length > PREVIEW_LENGTH
    ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…`
    : flat;
}

export type MessageAuthorRole = "customer" | "staff" | "system";

export interface AppendMessageInput {
  conversationId: Id<"conversations">;
  authorUserId?: Id<"users">;
  authorName: string;
  authorRole: MessageAuthorRole;
  body: string;
  attachments?: Doc<"messages">["attachments"];
  /** WhatsApp-only metadata; absent for portal messages. */
  externalId?: string;
  direction?: Doc<"messages">["direction"];
  deliveryStatus?: Doc<"messages">["deliveryStatus"];
  messageType?: string;
}

/**
 * Insert a customer-visible message and roll the conversation's counters
 * forward.
 *
 * `isInternal` is hard-coded to `false` here; there is no way to write an
 * internal note through this path, which is what keeps the preview safe.
 */
export async function appendMessage(
  ctx: MutationCtx,
  conversation: Doc<"conversations">,
  input: AppendMessageInput,
): Promise<Id<"messages">> {
  const now = Date.now();

  const messageId = await ctx.db.insert("messages", {
    conversationId: conversation._id,
    authorUserId: input.authorUserId,
    authorName: input.authorName,
    authorRole: input.authorRole,
    body: input.body,
    attachments: input.attachments ?? [],
    isInternal: false,
    externalId: input.externalId,
    direction: input.direction,
    deliveryStatus: input.deliveryStatus,
    messageType: input.messageType,
    // The author has, by definition, read their own message.
    readByCustomerAt: input.authorRole === "customer" ? now : undefined,
    readByStaffAt: input.authorRole === "staff" ? now : undefined,
    createdAt: now,
  });

  // A system message is nobody's unread — it is a status line, not a reply.
  const unreadForCustomer =
    input.authorRole === "staff"
      ? conversation.unreadForCustomer + 1
      : conversation.unreadForCustomer;

  const unreadForStaff =
    input.authorRole === "customer"
      ? conversation.unreadForStaff + 1
      : conversation.unreadForStaff;

  await ctx.db.patch(conversation._id, {
    lastMessageAt: now,
    lastMessagePreview: conversationPreview(input.body),
    messageCount: conversation.messageCount + 1,
    unreadForCustomer,
    unreadForStaff,
  });

  return messageId;
}

/**
 * Insert an internal staff note.
 *
 * Separate from `appendMessage` precisely because it must *not* update
 * `lastMessagePreview`, `messageCount` or `unreadForCustomer` — all three are
 * customer-visible surfaces. Staff see internal notes inline in the admin
 * thread, which reads the messages table directly.
 */
export async function appendInternalNote(
  ctx: MutationCtx,
  conversation: Doc<"conversations">,
  input: {
    authorUserId: Id<"users">;
    authorName: string;
    body: string;
    attachments?: Doc<"messages">["attachments"];
  },
): Promise<Id<"messages">> {
  const now = Date.now();

  return await ctx.db.insert("messages", {
    conversationId: conversation._id,
    authorUserId: input.authorUserId,
    authorName: input.authorName,
    authorRole: "staff",
    body: input.body,
    attachments: input.attachments ?? [],
    isInternal: true,
    readByStaffAt: now,
    createdAt: now,
  });
}

/** How many message rows one `markRead` call will stamp. */
const MARK_READ_LIMIT = 200;

/**
 * Zero one side's unread counter and stamp the individual messages as read.
 *
 * `side: "customer"` only ever touches non-internal rows, so reading a thread
 * as a customer cannot mark an internal note as "read by the customer" — a
 * flag that would be both wrong and alarming in the admin UI.
 */
export async function markConversationRead(
  ctx: MutationCtx,
  conversation: Doc<"conversations">,
  side: "customer" | "staff",
): Promise<number> {
  const now = Date.now();

  const messages =
    side === "customer"
      ? await ctx.db
          .query("messages")
          .withIndex("by_conversation_internal", (q) =>
            q.eq("conversationId", conversation._id).eq("isInternal", false),
          )
          .order("desc")
          .take(MARK_READ_LIMIT)
      : await ctx.db
          .query("messages")
          .withIndex("by_conversation_created", (q) =>
            q.eq("conversationId", conversation._id),
          )
          .order("desc")
          .take(MARK_READ_LIMIT);

  let stamped = 0;
  for (const message of messages) {
    if (side === "customer") {
      if (message.readByCustomerAt === undefined) {
        await ctx.db.patch(message._id, { readByCustomerAt: now });
        stamped += 1;
      }
    } else if (message.readByStaffAt === undefined) {
      await ctx.db.patch(message._id, { readByStaffAt: now });
      stamped += 1;
    }
  }

  await ctx.db.patch(conversation._id,
    side === "customer" ? { unreadForCustomer: 0 } : { unreadForStaff: 0 },
  );

  return stamped;
}
