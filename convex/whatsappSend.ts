import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { normaliseWhatsAppNumber, sendGraphMessage, type OutboundPayload } from "../lib/whatsapp/client";
import { checkSendPolicy, readWhatsAppEnv, retryDelayMs } from "../lib/whatsapp/policy";

/* ============================================================================
 * WhatsApp outbound send path.
 *
 * `sendOutbound` sends a batch of already-inserted message rows in order. It
 * enforces the policy gates (opt-out, demo allow-list, 24h window), then calls
 * the Graph API. 429 / 5xx / network errors are retried with backoff
 * (1m, 5m, 30m; four attempts in all); any other 4xx fails at once.
 *
 * The access token lives only in this action's memory and the Authorization
 * header. Stored errors are a short code + title, never a raw response.
 * ========================================================================== */

const outboundPayloadValidator = v.union(
  v.object({ type: v.literal("text"), body: v.string() }),
  v.object({
    type: v.literal("buttons"),
    body: v.string(),
    buttons: v.array(v.object({ id: v.string(), title: v.string() })),
  }),
  v.object({
    type: v.literal("list"),
    body: v.string(),
    buttonLabel: v.string(),
    rows: v.array(
      v.object({ id: v.string(), title: v.string(), description: v.optional(v.string()) }),
    ),
  }),
  v.object({ type: v.literal("template"), name: v.string(), language: v.string() }),
);

const itemValidator = v.object({
  messageRowId: v.id("messages"),
  payload: outboundPayloadValidator,
  optOutAcknowledgement: v.optional(v.boolean()),
});

export const loadContactForSend = internalQuery({
  args: { contactId: v.id("whatsappContacts") },
  returns: v.union(
    v.null(),
    v.object({
      waId: v.string(),
      optedOut: v.boolean(),
      lastInboundAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return null;
    return {
      waId: contact.waId,
      optedOut: contact.optedOut,
      lastInboundAt: contact.lastInboundAt,
    };
  },
});

/** Opt-out / window state for a normalised number, or null if we have no contact row. */
export const loadContactByWaId = internalQuery({
  args: { waId: v.string() },
  returns: v.union(
    v.null(),
    v.object({ optedOut: v.boolean(), lastInboundAt: v.optional(v.number()) }),
  ),
  handler: async (ctx, args) => {
    const contact = await ctx.db
      .query("whatsappContacts")
      .withIndex("by_waId", (q) => q.eq("waId", args.waId))
      .first();
    if (!contact) return null;
    return { optedOut: contact.optedOut, lastInboundAt: contact.lastInboundAt };
  },
});

export const recordSendResult =internalMutation({
  args: {
    messageRowId: v.id("messages"),
    outcome: v.union(
      v.object({ kind: v.literal("sent"), wamid: v.string() }),
      v.object({ kind: v.literal("failed"), code: v.string(), title: v.string() }),
      v.object({ kind: v.literal("retrying"), code: v.string(), attempt: v.number() }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.messageRowId);
    if (!row) return null;
    const outcome = args.outcome;
    if (outcome.kind === "sent") {
      await ctx.db.patch(row._id, {
        externalId: outcome.wamid,
        deliveryStatus: "sent",
        deliveryError: undefined,
      });
    } else if (outcome.kind === "failed") {
      await ctx.db.patch(row._id, {
        deliveryStatus: "failed",
        deliveryError: `${outcome.code} ${outcome.title}`.trim().slice(0, 120),
      });
    } else {
      await ctx.db.patch(row._id, {
        deliveryError: `retry ${outcome.attempt} after ${outcome.code}`.slice(0, 120),
      });
    }
    return null;
  },
});

export const sendOutbound = internalAction({
  args: {
    contactId: v.id("whatsappContacts"),
    items: v.array(itemValidator),
    attempt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const env = readWhatsAppEnv(process.env);
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

    const failAll = async (from: number, code: string, title: string) => {
      for (const item of args.items.slice(from)) {
        await ctx.runMutation(internal.whatsappSend.recordSendResult, {
          messageRowId: item.messageRowId,
          outcome: { kind: "failed", code, title },
        });
      }
    };

    const contact = await ctx.runQuery(internal.whatsappSend.loadContactForSend, {
      contactId: args.contactId,
    });
    if (!contact) {
      await failAll(0, "NO_CONTACT", "Contact not found");
      return null;
    }

    for (let i = 0; i < args.items.length; i += 1) {
      const item = args.items[i];
      const payload = item.payload as OutboundPayload;

      const decision = checkSendPolicy({
        waId: contact.waId,
        optedOut: contact.optedOut,
        lastInboundAt: contact.lastInboundAt,
        now: Date.now(),
        env,
        usingTemplate: payload.type === "template",
        optOutAcknowledgement: item.optOutAcknowledgement === true,
      });
      if (!decision.ok) {
        // The gates describe the recipient, not the message: refuse the rest too.
        await failAll(i, decision.code, decision.message);
        return null;
      }

      if (!token || !phoneNumberId) {
        console.log("[whatsapp] send skipped: WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID unset");
        await failAll(i, "NOT_CONFIGURED", "WhatsApp credentials are not configured");
        return null;
      }

      const to = normaliseWhatsAppNumber(`+${contact.waId}`);
      if (!to) {
        await failAll(i, "BAD_NUMBER", "Unusable phone number");
        return null;
      }

      const result = await sendGraphMessage({
        token,
        phoneNumberId,
        version: env.graphVersion,
        to,
        payload,
      });

      if (result.ok) {
        await ctx.runMutation(internal.whatsappSend.recordSendResult, {
          messageRowId: item.messageRowId,
          outcome: { kind: "sent", wamid: result.wamid },
        });
        continue;
      }

      if (result.retryable) {
        const delay = retryDelayMs(args.attempt);
        if (delay === null) {
          await failAll(i, result.code, result.title);
          return null;
        }
        await ctx.runMutation(internal.whatsappSend.recordSendResult, {
          messageRowId: item.messageRowId,
          outcome: { kind: "retrying", code: result.code, attempt: args.attempt },
        });
        // Resume from this message so the order of the batch is preserved.
        await ctx.scheduler.runAfter(delay, internal.whatsappSend.sendOutbound, {
          contactId: args.contactId,
          items: args.items.slice(i),
          attempt: args.attempt + 1,
        });
        return null;
      }

      // Permanent failure for this message (4xx other than 429): no retry.
      await ctx.runMutation(internal.whatsappSend.recordSendResult, {
        messageRowId: item.messageRowId,
        outcome: { kind: "failed", code: result.code, title: result.title },
      });
    }
    return null;
  },
});
