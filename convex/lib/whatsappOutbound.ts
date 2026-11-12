import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { appendMessage } from "./messaging";
import { renderPayloadText, type OutboundPayload } from "../../lib/whatsapp/client";

/* ============================================================================
 * Queue outbound WhatsApp messages.
 *
 * Every row is inserted BEFORE anything is sent, so the staff-visible thread
 * is complete even if Meta is down. All rows of one step go to ONE scheduled
 * action, which sends them strictly in order — separate `runAfter(0)` calls
 * could deliver a reprompt after the question it belongs to.
 * ========================================================================== */

export interface QueuedMessage {
  payload: OutboundPayload;
  /** Confirmation of the contact's own STOP request: allowed despite opt-out. */
  optOutAcknowledgement?: boolean;
}

export async function queueOutbound(
  ctx: MutationCtx,
  args: {
    conversationId: Id<"conversations">;
    contactId: Id<"whatsappContacts">;
    messages: QueuedMessage[];
    authorRole: "system" | "staff";
    authorName: string;
    authorUserId?: Id<"users">;
  },
): Promise<Id<"messages">[]> {
  if (args.messages.length === 0) return [];

  const rowIds: Id<"messages">[] = [];
  const items: {
    messageRowId: Id<"messages">;
    payload: OutboundPayload;
    optOutAcknowledgement?: boolean;
  }[] = [];

  for (const message of args.messages) {
    // appendMessage works from a snapshot, so re-read between rows.
    const conversation = (await ctx.db.get(args.conversationId)) as Doc<"conversations">;
    const rowId = await appendMessage(ctx, conversation, {
      conversationId: args.conversationId,
      authorUserId: args.authorUserId,
      authorName: args.authorName,
      authorRole: args.authorRole,
      body: renderPayloadText(message.payload),
      direction: "outbound",
      messageType: message.payload.type,
    });
    rowIds.push(rowId);
    items.push({
      messageRowId: rowId,
      payload: message.payload,
      ...(message.optOutAcknowledgement ? { optOutAcknowledgement: true } : {}),
    });
  }

  await ctx.scheduler.runAfter(0, internal.whatsappSend.sendOutbound, {
    contactId: args.contactId,
    items,
    attempt: 1,
  });

  return rowIds;
}
