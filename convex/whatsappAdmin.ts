import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { recordAudit } from "./lib/audit";
import { requirePermission } from "./lib/auth";
import { readSetting } from "./lib/settings";
import { queueOutbound } from "./lib/whatsappOutbound";
import { SETTINGS_DEFAULTS } from "./appSettings";
import { PERMISSIONS, isStaffRole } from "../lib/constants/roles";
import { textMessage } from "../lib/whatsapp/builders";
import { checkSendPolicy, readWhatsAppEnv } from "../lib/whatsapp/policy";
import { z } from "zod";

/* ============================================================================
 * WhatsApp staff surface (backend only; the inbox UI comes later).
 *
 * Every function starts with a permission helper — a role or user id arriving
 * as an argument is never trusted. Reads are bounded; nothing here returns a
 * secret.
 *
 * Permission design:
 *   whatsapp:view      read inbox + status          support_agent and up
 *   conversation:reply send reply, take over / hand back to the bot
 *   conversation:assign assign a conversation       manager and up
 *   whatsapp:manage    bot switch, demo reset       manager and up
 * ========================================================================== */

const conversationStatusArg = v.union(
  v.literal("open"),
  v.literal("pending"),
  v.literal("resolved"),
  v.literal("closed"),
);

const BOT_SETTING_KEY = "integrations.whatsappBotEnabled";
const replySchema = z.string().min(1).max(4096);

function notFound(): never {
  throw new ConvexError({ code: "NOT_FOUND", message: "Conversation not found." });
}

async function loadWhatsAppConversation(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
): Promise<{ conversation: Doc<"conversations">; contact: Doc<"whatsappContacts"> }> {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.channel !== "whatsapp" || !conversation.whatsappContactId) {
    return notFound();
  }
  const contact = await ctx.db.get(conversation.whatsappContactId);
  if (!contact) return notFound();
  return { conversation, contact };
}

/* -------------------------------------------------------------------------- */
/*                                    reads                                   */
/* -------------------------------------------------------------------------- */

export const listConversations = query({
  args: {
    status: v.optional(conversationStatusArg),
    assignedToMe: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.WHATSAPP_VIEW);

    let result;
    if (args.assignedToMe) {
      const mine = ctx.db
        .query("conversations")
        .withIndex("by_channel_assignedTo", (q) =>
          q.eq("channel", "whatsapp").eq("assignedTo", staff.user._id),
        )
        .order("desc");
      result = await (args.status
        ? mine.filter((q) => q.eq(q.field("status"), args.status!))
        : mine
      ).paginate(args.paginationOpts);
    } else if (args.status) {
      result = await ctx.db
        .query("conversations")
        .withIndex("by_channel_status_lastMessage", (q) =>
          q.eq("channel", "whatsapp").eq("status", args.status!),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      result = await ctx.db
        .query("conversations")
        .withIndex("by_channel_lastMessage", (q) => q.eq("channel", "whatsapp"))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    const page = await Promise.all(
      result.page.map(async (conversation) => {
        const contact = conversation.whatsappContactId
          ? await ctx.db.get(conversation.whatsappContactId)
          : null;
        return {
          ...conversation,
          contact: contact
            ? {
                waId: contact.waId,
                optedOut: contact.optedOut,
                humanHandoff: contact.humanHandoff,
                isDemo: contact.isDemo,
                lastInboundAt: contact.lastInboundAt ?? null,
              }
            : null,
        };
      }),
    );
    return { ...result, page };
  },
});

export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.WHATSAPP_VIEW);
    const { conversation, contact } = await loadWhatsAppConversation(ctx, args.conversationId);

    // Staff see internal notes too; newest 300, returned oldest first.
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) => q.eq("conversationId", conversation._id))
      .order("desc")
      .take(300);

    const enquiry = conversation.enquiryId ? await ctx.db.get(conversation.enquiryId) : null;

    return {
      conversation,
      contact: {
        _id: contact._id,
        waId: contact.waId,
        profileName: contact.profileName ?? null,
        displayName: contact.displayName ?? null,
        optedOut: contact.optedOut,
        humanHandoff: contact.humanHandoff,
        isDemo: contact.isDemo,
        botState: contact.botState,
        lastInboundAt: contact.lastInboundAt ?? null,
      },
      messages: recent.reverse(),
      enquiry: enquiry
        ? {
            _id: enquiry._id,
            referenceId: enquiry.referenceId,
            leadStatus: enquiry.leadStatus,
            subject: enquiry.subject,
          }
        : null,
    };
  },
});

export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.WHATSAPP_VIEW);
    const env = readWhatsAppEnv(process.env);
    const COUNT_CAP = 1000;

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_channel_lastMessage", (q) => q.eq("channel", "whatsapp"))
      .take(COUNT_CAP + 1);
    const enquiries = await ctx.db
      .query("enquiries")
      .withIndex("by_source_createdAt", (q) => q.eq("source", "whatsapp"))
      .order("desc")
      .take(COUNT_CAP + 1);

    const settingOn = (await readSetting(ctx, BOT_SETTING_KEY)) === true;

    return {
      // Presence only — values are never returned.
      connected: Boolean(
        process.env.WHATSAPP_ACCESS_TOKEN &&
          process.env.WHATSAPP_PHONE_NUMBER_ID &&
          process.env.WHATSAPP_APP_SECRET &&
          process.env.WHATSAPP_VERIFY_TOKEN,
      ),
      demoMode: env.demoMode,
      botEnabledEnv: env.botEnvEnabled,
      botEnabledSetting: settingOn,
      botActive: env.botEnvEnabled && settingOn,
      counts: {
        conversations: Math.min(conversations.length, COUNT_CAP),
        enquiries: Math.min(enquiries.length, COUNT_CAP),
        newLeads: enquiries.filter((e) => e.leadStatus === "new").length,
        capped: conversations.length > COUNT_CAP || enquiries.length > COUNT_CAP,
      },
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                                   writes                                   */
/* -------------------------------------------------------------------------- */

export const sendReply = mutation({
  args: { conversationId: v.id("conversations"), body: v.string() },
  returns: v.object({ messageId: v.id("messages") }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CONVERSATION_REPLY);
    const parsed = replySchema.safeParse(
      args.body.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim(),
    );
    if (!parsed.success) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "A reply must be between 1 and 4096 characters.",
      });
    }
    const { conversation, contact } = await loadWhatsAppConversation(ctx, args.conversationId);

    // Refuse before anything is inserted so staff get the reason immediately.
    const decision = checkSendPolicy({
      waId: contact.waId,
      optedOut: contact.optedOut,
      lastInboundAt: contact.lastInboundAt,
      now: Date.now(),
      env: readWhatsAppEnv(process.env),
    });
    if (!decision.ok) {
      throw new ConvexError({ code: decision.code, message: decision.message });
    }

    const [messageId] = await queueOutbound(ctx, {
      conversationId: conversation._id,
      contactId: contact._id,
      messages: [{ payload: textMessage(parsed.data) }],
      authorRole: "staff",
      authorName: staff.user.fullName,
      authorUserId: staff.user._id,
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: "whatsapp.reply_sent",
      entityType: "conversation",
      entityId: conversation._id,
      summary: "Sent a WhatsApp reply",
    });
    return { messageId };
  },
});

export const assign = mutation({
  args: {
    conversationId: v.id("conversations"),
    staffId: v.union(v.id("users"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CONVERSATION_ASSIGN);
    const { conversation } = await loadWhatsAppConversation(ctx, args.conversationId);

    if (args.staffId) {
      const target = await ctx.db.get(args.staffId);
      if (!target || target.status !== "active" || !isStaffRole(target.role)) {
        throw new ConvexError({ code: "VALIDATION", message: "Choose an active staff member." });
      }
    }

    await ctx.db.patch(conversation._id, { assignedTo: args.staffId ?? undefined });
    await recordAudit(ctx, {
      actor: staff.user,
      action: "conversation.assigned",
      entityType: "conversation",
      entityId: conversation._id,
      summary: args.staffId ? "Assigned a WhatsApp conversation" : "Unassigned a WhatsApp conversation",
      before: { assignedTo: conversation.assignedTo ?? null },
      after: { assignedTo: args.staffId },
    });
    return null;
  },
});

export const setHandoff = mutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CONVERSATION_REPLY);
    const { conversation, contact } = await loadWhatsAppConversation(ctx, args.conversationId);
    await ctx.db.patch(contact._id, {
      humanHandoff: true,
      botState: "handoff",
      stateHistory: [],
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, {
      actor: staff.user,
      action: "whatsapp.handoff_started",
      entityType: "conversation",
      entityId: conversation._id,
      summary: "Took over a WhatsApp conversation from the bot",
    });
    return null;
  },
});

export const resumeBot = mutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CONVERSATION_REPLY);
    const { conversation, contact } = await loadWhatsAppConversation(ctx, args.conversationId);
    await ctx.db.patch(contact._id, {
      humanHandoff: false,
      botState: "menu",
      botData: {},
      stateHistory: [],
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, {
      actor: staff.user,
      action: "whatsapp.handoff_ended",
      entityType: "conversation",
      entityId: conversation._id,
      summary: "Handed a WhatsApp conversation back to the bot",
    });
    return null;
  },
});

export const setBotEnabled = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.WHATSAPP_MANAGE);
    const def = SETTINGS_DEFAULTS[BOT_SETTING_KEY];
    const now = Date.now();
    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", BOT_SETTING_KEY))
      .unique();
    const before = existing ? existing.value : def.value;

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.enabled,
        isPublic: def.isPublic,
        updatedBy: staff.user._id,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("appSettings", {
        key: BOT_SETTING_KEY,
        category: def.category,
        value: args.enabled,
        label: def.label,
        description: def.description,
        isPublic: def.isPublic,
        updatedBy: staff.user._id,
        updatedAt: now,
      });
    }
    await recordAudit(ctx, {
      actor: staff.user,
      action: "settings.updated",
      entityType: "setting",
      entityId: BOT_SETTING_KEY,
      summary: `WhatsApp bot ${args.enabled ? "enabled" : "disabled"}`,
      before: { value: before },
      after: { value: args.enabled },
    });
    return null;
  },
});

const MAX_RESET_CONTACTS = 25;
const MAX_RESET_CONVERSATIONS = 5;
const MAX_RESET_ENQUIRIES = 20;
/** Total messages deleted per call (each may also delete up to five event rows). */
const MAX_RESET_MESSAGES = 150;

/**
 * Delete demo traffic only. A row is touched solely if it belongs to a contact
 * that is flagged `isDemo` AND whose number is on WHATSAPP_TEST_RECIPIENTS
 * (conversations, messages, their webhook events), or is an unconverted
 * `isDemo` enquiry linked to such a contact. Opted-out contacts are never
 * deleted. Refuses unless demo mode is on. Bounded:
 * call again while `hasMore` is true.
 */
export const resetDemo = mutation({
  args: {},
  returns: v.object({
    contacts: v.number(),
    conversations: v.number(),
    messages: v.number(),
    webhookEvents: v.number(),
    enquiries: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx) => {
    const staff = await requirePermission(ctx, PERMISSIONS.WHATSAPP_MANAGE);
    const env = readWhatsAppEnv(process.env);
    if (!env.demoMode) {
      throw new ConvexError({
        code: "DEMO_MODE_OFF",
        message: "Demo data can only be reset while WHATSAPP_DEMO_MODE is on.",
      });
    }

    const counts = { contacts: 0, conversations: 0, messages: 0, webhookEvents: 0, enquiries: 0 };
    // `hasMore` means "call again": rows remain that this call did not get to.
    // Every path below deletes at least one row before it can set it, so a
    // caller looping until it is false always terminates.
    let hasMore = false;
    // One budget for the whole call keeps us inside Convex's per-mutation
    // read/write limits however much demo data exists.
    let budget = MAX_RESET_MESSAGES;

    const contacts = await ctx.db
      .query("whatsappContacts")
      .withIndex("by_isDemo", (q) => q.eq("isDemo", true))
      .take(MAX_RESET_CONTACTS + 1);
    if (contacts.length > MAX_RESET_CONTACTS) {
      hasMore = true; // more contacts than one call handles; the rest next time
      contacts.pop();
    }

    for (const contact of contacts) {
      if (budget <= 0) {
        hasMore = true;
        break;
      }
      if (contact.isDemo !== true) continue; // belt and braces
      if (!env.testRecipients.includes(contact.waId)) {
        // The flag alone is not enough: only allow-listed numbers are demo.
        await ctx.db.patch(contact._id, { isDemo: false });
        continue;
      }

      /* ---- enquiries first: a contact with real ones is not demo data --- */
      const enquiries = await ctx.db
        .query("enquiries")
        .withIndex("by_whatsappContactId", (q) => q.eq("whatsappContactId", contact._id))
        .take(MAX_RESET_ENQUIRIES + 1);
      const moreEnquiries = enquiries.length > MAX_RESET_ENQUIRIES;
      if (moreEnquiries) enquiries.pop();

      // Real = not demo, or already converted into a customer / application.
      const isRealEnquiry = (e: Doc<"enquiries">) =>
        e.isDemo !== true ||
        e.convertedApplicationId !== undefined ||
        e.convertedUserId !== undefined;
      const hasReal = enquiries.some(isRealEnquiry);
      const deletedEnquiryIds = new Set<Id<"enquiries">>();
      for (const enquiry of enquiries) {
        if (!isRealEnquiry(enquiry)) {
          await ctx.db.delete(enquiry._id);
          deletedEnquiryIds.add(enquiry._id);
          counts.enquiries += 1;
          budget -= 1;
        }
      }
      if (hasReal) {
        // Keep the contact, its threads and its real enquiries. Un-flag it so
        // later resets stop selecting it (otherwise it would never drop out).
        await ctx.db.patch(contact._id, { isDemo: false });
        // The kept threads must not point at enquiries we just deleted.
        const kept = await ctx.db
          .query("conversations")
          .withIndex("by_whatsappContactId", (q) => q.eq("whatsappContactId", contact._id))
          .take(MAX_RESET_CONVERSATIONS + 1);
        for (const conversation of kept) {
          if (conversation.enquiryId && deletedEnquiryIds.has(conversation.enquiryId)) {
            await ctx.db.patch(conversation._id, { enquiryId: undefined });
          }
        }
        continue;
      }
      if (moreEnquiries) {
        hasMore = true; // this contact is not finished; deleted 20, more remain
        continue;
      }

      /* ---- conversations and their messages ----------------------------- */
      const conversations = await ctx.db
        .query("conversations")
        .withIndex("by_whatsappContactId", (q) => q.eq("whatsappContactId", contact._id))
        .take(MAX_RESET_CONVERSATIONS + 1);
      let contactDone = conversations.length <= MAX_RESET_CONVERSATIONS;
      if (!contactDone) conversations.pop();

      for (const conversation of conversations) {
        if (budget <= 0) {
          contactDone = false;
          break;
        }
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_conversationId", (q) => q.eq("conversationId", conversation._id))
          .take(budget + 1);
        const moreMessages = messages.length > budget;
        if (moreMessages) messages.pop();

        for (const message of messages) {
          if (message.externalId) {
            const keys = [
              `msg:${message.externalId}`,
              ...(["sent", "delivered", "read", "failed"] as const).map(
                (s) => `st:${message.externalId}:${s}`,
              ),
            ];
            for (const key of keys) {
              const event = await ctx.db
                .query("whatsappWebhookEvents")
                .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", key))
                .first();
              if (event) {
                await ctx.db.delete(event._id);
                counts.webhookEvents += 1;
              }
            }
          }
          await ctx.db.delete(message._id);
          counts.messages += 1;
          budget -= 1;
        }
        if (moreMessages) {
          // Drop the conversation only once its thread is fully cleared.
          contactDone = false;
          break;
        }
        await ctx.db.delete(conversation._id);
        counts.conversations += 1;
        budget -= 1;
      }

      if (contactDone && contact.optedOut) {
        // Never delete an opt-out record: it is the only thing stopping later
        // notifications. Keep the row, reset the bot fields, and stop treating
        // it as demo data so it drops out of later passes.
        await ctx.db.patch(contact._id, {
          botState: "welcome",
          botData: {},
          stateHistory: [],
          humanHandoff: false,
          isDemo: false,
          updatedAt: Date.now(),
        });
      } else if (contactDone) {
        await ctx.db.delete(contact._id);
        counts.contacts += 1;
      } else {
        hasMore = true;
      }
    }

    await recordAudit(ctx, {
      actor: staff.user,
      action: "whatsapp.demo_reset",
      entityType: "conversation",
      entityId: "whatsapp-demo",
      summary: `Reset WhatsApp demo data (${counts.contacts} contacts, ${counts.messages} messages, ${counts.enquiries} enquiries)`,
      after: counts,
    });

    return { ...counts, hasMore };
  },
});
