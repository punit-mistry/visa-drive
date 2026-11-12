import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { recordAudit } from "./lib/audit";
import { createEnquiryCore } from "./lib/enquiryCore";
import { appendMessage } from "./lib/messaging";
import { readSetting } from "./lib/settings";
import { queueOutbound, type QueuedMessage } from "./lib/whatsappOutbound";
import { NOTIFICATION_TYPES } from "../lib/constants/notifications";
import { PERMISSIONS } from "../lib/constants/roles";
import { SITE } from "../lib/constants/site";
import { APPLICATION_STATUS_CONFIG } from "../lib/constants/statuses";
import { categoryOptions, DURATION_OPTIONS } from "../lib/whatsapp/catalogue";
import { textMessage } from "../lib/whatsapp/builders";
import type { OutboundPayload } from "../lib/whatsapp/client";
import { isOptInText, isOptOutText, step } from "../lib/whatsapp/engine";
import { normaliseWhatsAppNumber } from "../lib/whatsapp/client";
import { readWhatsAppEnv } from "../lib/whatsapp/policy";
import type {
  BotData,
  Catalogue,
  EnquiryData,
  InboundMessage,
  StepId,
} from "../lib/whatsapp/types";

/* ============================================================================
 * WhatsApp ingest + bot orchestration (internal only).
 *
 *   http /whatsapp-webhook  (signature already verified)
 *     -> ingestWebhook      dedupe each batch item on whatsappWebhookEvents
 *       -> processMessage   contact + conversation + inbound row + STOP/START
 *         -> runBot         bot step + replies (separate job; may fail alone)
 *       -> processStatus    delivery receipts
 *
 * Event rows hold ids and states only — never message bodies or tokens.
 * ========================================================================== */

const ingestMessageValidator = v.union(
  v.object({ type: v.literal("text"), text: v.string() }),
  v.object({ type: v.literal("interactive"), id: v.string(), title: v.optional(v.string()) }),
  v.object({ type: v.literal("unsupported"), mediaType: v.string() }),
);

const ingestItemValidator = v.union(
  v.object({
    kind: v.literal("message"),
    wamid: v.string(),
    from: v.string(),
    profileName: v.optional(v.string()),
    message: ingestMessageValidator,
  }),
  v.object({
    kind: v.literal("status"),
    wamid: v.string(),
    status: v.union(v.literal("sent"), v.literal("delivered"), v.literal("read"), v.literal("failed")),
    errorCode: v.optional(v.string()),
    errorTitle: v.optional(v.string()),
  }),
);

/** A duplicate that is still pending after this long is re-processed. */
const STALE_PENDING_MS = 2 * 60 * 1000;
const MAX_EVENT_ATTEMPTS = 5;

/** Inbound rate limit: more than this many customer messages in a minute. */
const RATE_LIMIT_MESSAGES = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
/** Bot-created enquiries per contact per hour. */
const MAX_BOT_ENQUIRIES_PER_HOUR = 5;

const BOT_NAME = "VisaDrive Assistant";

/* -------------------------------------------------------------------------- */
/*                                   ingest                                   */
/* -------------------------------------------------------------------------- */

export const ingestWebhook = internalMutation({
  args: { items: v.array(ingestItemValidator) },
  returns: v.object({ accepted: v.number(), duplicates: v.number() }),
  handler: async (ctx, args): Promise<{ accepted: number; duplicates: number }> => {
    const now = Date.now();
    let accepted = 0;
    let duplicates = 0;

    for (const item of args.items) {
      const dedupeKey =
        item.kind === "message" ? `msg:${item.wamid}` : `st:${item.wamid}:${item.status}`;

      // Lookup + insert share this transaction, so two concurrent POSTs of the
      // same wamid cannot both pass the check.
      const existing = await ctx.db
        .query("whatsappWebhookEvents")
        .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", dedupeKey))
        .first();

      let eventId: Id<"whatsappWebhookEvents">;
      if (existing) {
        const stale =
          existing.processingState !== "done" &&
          now - existing.receivedAt > STALE_PENDING_MS &&
          existing.attempts < MAX_EVENT_ATTEMPTS;
        if (!stale) {
          duplicates += 1;
          continue;
        }
        // Meta retried an event we received but never finished: try again.
        await ctx.db.patch(existing._id, {
          attempts: existing.attempts + 1,
          processingState: "pending",
          receivedAt: now,
        });
        eventId = existing._id;
      } else {
        eventId = await ctx.db.insert("whatsappWebhookEvents", {
          dedupeKey,
          kind: item.kind,
          waMessageId: item.wamid,
          status: item.kind === "status" ? item.status : undefined,
          receivedAt: now,
          processingState: "pending",
          attempts: 0,
        });
      }
      accepted += 1;

      if (item.kind === "message") {
        await ctx.scheduler.runAfter(0, internal.whatsapp.processMessage, {
          eventId,
          wamid: item.wamid,
          from: item.from,
          profileName: item.profileName,
          message: item.message,
        });
      } else {
        await ctx.scheduler.runAfter(0, internal.whatsapp.processStatus, {
          eventId,
          wamid: item.wamid,
          status: item.status,
          errorCode: item.errorCode,
          errorTitle: item.errorTitle,
        });
      }
    }

    return { accepted, duplicates };
  },
});

/* -------------------------------------------------------------------------- */
/*                                   status                                   */
/* -------------------------------------------------------------------------- */

const STATUS_RETRY_MS = 30 * 1000;
const STATUS_RANK ={ sent: 1, delivered: 2, read: 3 } as const;

export const processStatus = internalMutation({
  args: {
    eventId: v.id("whatsappWebhookEvents"),
    wamid: v.string(),
    status: v.union(v.literal("sent"), v.literal("delivered"), v.literal("read"), v.literal("failed")),
    errorCode: v.optional(v.string()),
    errorTitle: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.processingState === "done") return null;

    const message = await ctx.db
      .query("messages")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.wamid))
      .first();

    if (!message) {
      // The receipt may have beaten `recordSendResult` writing the wamid. Leave
      // the event pending and look once more shortly; a second miss means the
      // wamid is not ours (or the row is gone) and is marked done.
      if (event.attempts < 1) {
        await ctx.db.patch(event._id, { attempts: event.attempts + 1 });
        await ctx.scheduler.runAfter(STATUS_RETRY_MS, internal.whatsapp.processStatus, args);
        return null;
      }
    } else {
      const current = message.deliveryStatus;
      if (args.status === "failed") {
        if (current !== "failed") {
          const detail = [args.errorCode, args.errorTitle].filter(Boolean).join(" ").slice(0, 120);
          await ctx.db.patch(message._id, {
            deliveryStatus: "failed",
            deliveryError: detail || "failed",
          });
        }
      } else if (current !== "failed") {
        const currentRank = current ? STATUS_RANK[current] : 0;
        if (STATUS_RANK[args.status] > currentRank) {
          await ctx.db.patch(message._id, { deliveryStatus: args.status });
        }
      }
    }

    await ctx.db.patch(event._id, { processingState: "done", processedAt: Date.now() });
    return null;
  },
});

/* -------------------------------------------------------------------------- */
/*                                  messages                                  */
/* -------------------------------------------------------------------------- */

function cleanText(value: string, max: number): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

function inboundBody(message: InboundMessage & { title?: string }): string {
  switch (message.type) {
    case "text":
      return cleanText(message.text, 4096) || "[empty message]";
    case "interactive":
      return cleanText(message.title ?? `[selected: ${message.id}]`, 200);
    case "unsupported":
      // Type only — media ids and URLs are never fetched or stored.
      return `[${message.mediaType}]`;
  }
}

async function loadCatalogue(ctx: MutationCtx): Promise<Catalogue> {
  const destinations = await ctx.db
    .query("destinations")
    .withIndex("by_published_order", (q) => q.eq("isPublished", true))
    .take(60);
  const products = await ctx.db
    .query("visaProducts")
    .withIndex("by_isPublished", (q) => q.eq("isPublished", true))
    .take(300);

  return {
    destinations: destinations.map((d) => ({ slug: d.slug, name: d.name })),
    categories: categoryOptions(products.map((p) => p.category)),
    durations: DURATION_OPTIONS,
  };
}

const GENERIC_STATUS_REPLY = `I couldn't find a matching booking for this phone number. Please sign in to the portal at ${SITE.url} or reply "agent" to talk to our support team.`;

/**
 * Booking status by reference. Answers ONLY when the application exists AND its
 * stored phone matches the sender. Not-found and mismatch give the identical
 * reply so references cannot be enumerated. Status label only — no names,
 * documents or amounts.
 */
async function statusReply(ctx: MutationCtx, reference: string, waId: string): Promise<string> {
  const application = await ctx.db
    .query("applications")
    .withIndex("by_referenceId", (q) => q.eq("referenceId", reference))
    .first();
  // Exact match on the full normalised number (country code included): the
  // same last ten digits under another country code is a different person.
  const stored = normaliseWhatsAppNumber(application?.customerPhone);
  if (!application || application.isDraft || !stored || stored !== waId) {
    return GENERIC_STATUS_REPLY;
  }
  const label = APPLICATION_STATUS_CONFIG[application.status].customerLabel;
  return `Your booking ${application.referenceId} is currently: ${label}. For anything more, sign in to the portal at ${SITE.url} or reply "agent".`;
}

function buildEnquiryMessage(data: EnquiryData, dateLabel: string): string {
  return [
    "Enquiry captured by the WhatsApp assistant (not a visa application).",
    `Country: ${data.destinationName}`,
    `Visa type: ${data.category}`,
    `Stay: ${data.duration}`,
    `Travel date: ${dateLabel}`,
    `Travellers: ${data.travellers}`,
  ].join("\n");
}

function dateLabel(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(ms));
}

/**
 * Create the enquiry for a confirmed bot flow. Returns the reference to show
 * the customer, or null when the contact has hit the hourly cap.
 *
 * The typed email is UNVERIFIED. If it matches an existing customer we leave a
 * staff-only note and nothing else: no `convertedUserId`, no `linkedUserId`,
 * no access to that account's data.
 */
async function createBotEnquiry(
  ctx: MutationCtx,
  contact: Doc<"whatsappContacts">,
  conversation: Doc<"conversations">,
  data: EnquiryData,
  now: number,
  isDemo: boolean,
): Promise<string | null> {
  const recent = await ctx.db
    .query("enquiries")
    .withIndex("by_whatsappContactId", (q) => q.eq("whatsappContactId", contact._id))
    .order("desc")
    .take(MAX_BOT_ENQUIRIES_PER_HOUR + 1);
  if (recent.filter((e) => now - e.createdAt < 60 * 60 * 1000).length >= MAX_BOT_ENQUIRIES_PER_HOUR) {
    return null;
  }

  const destination = await ctx.db
    .query("destinations")
    .withIndex("by_slug", (q) => q.eq("slug", data.destinationSlug))
    .first();

  const { enquiryId, referenceId } = await createEnquiryCore(ctx, {
    fullName: cleanText(data.fullName, 120),
    email: data.email,
    phone: `+${contact.waId}`,
    destinationId: destination?._id,
    interestedCountry: data.destinationName,
    visaCategory: data.category,
    travelDate: data.travelDate,
    subject: cleanText(`WhatsApp enquiry: ${data.destinationName} (${data.category})`, 200),
    message: buildEnquiryMessage(data, dateLabel(data.travelDate)),
    source: "whatsapp",
    whatsappContactId: contact._id,
    isDemo,
    now,
  });

  await recordAudit(ctx, {
    actor: null,
    action: "enquiry.created_whatsapp",
    entityType: "enquiry",
    entityId: enquiryId,
    summary: `WhatsApp bot created enquiry ${referenceId}`,
  });

  await ctx.db.patch(conversation._id, { enquiryId });
  await ctx.db.patch(contact._id, { displayName: cleanText(data.fullName, 120) });

  const matched = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", data.email))
    .first();
  if (matched) {
    await ctx.db.insert("messages", {
      conversationId: conversation._id,
      authorName: BOT_NAME,
      authorRole: "system",
      body: "Staff note: the email typed in this chat matches an existing customer account. This is unverified, so it has not been linked. Confirm identity before sharing any account details.",
      attachments: [],
      isInternal: true,
      createdAt: now,
    });
  }

  return referenceId;
}


/** Short error class name only: never a message, which could echo user text. */
function errorName(error: unknown): string {
  return (error instanceof Error ? error.name : "error").slice(0, 40);
}

/**
 * Step 1 of 2. Everything that must survive a bot failure happens here, in one
 * transaction: the contact, the conversation, the inbound row and any STOP.
 * The bot itself runs in a separate scheduled job (`runBot`), so a bug there
 * can never roll back or lose the customer's message.
 *
 * The event is left "pending" when the bot is about to run; `applyBotStep`
 * flips it to "done" in the same transaction as the replies it queues, which is
 * what makes a retry unable to reply twice.
 */
export const processMessage = internalMutation({
  args: {
    eventId: v.id("whatsappWebhookEvents"),
    wamid: v.string(),
    from: v.string(),
    profileName: v.optional(v.string()),
    message: ingestMessageValidator,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const event = await ctx.db.get(args.eventId);
    // Already finished (retried scheduler job / duplicate): never run twice.
    if (!event || event.processingState !== "pending") return null;

    const now = Date.now();
    const finish = async (state: "done" | "failed", error?: string) => {
      await ctx.db.patch(args.eventId, {
        processingState: state,
        processedAt: now,
        lastError: error,
      });
    };

    const waId = args.from.replace(/\D/g, "");
    if (waId.length < 7 || waId.length > 15) {
      await finish("failed", "invalid_sender");
      return null;
    }

    const env = readWhatsAppEnv(process.env);

    /* ---- contact (find or create, one transaction) ------------------- */
    let contact = await ctx.db
      .query("whatsappContacts")
      .withIndex("by_waId", (q) => q.eq("waId", waId))
      .first();
    if (!contact) {
      const contactId = await ctx.db.insert("whatsappContacts", {
        waId,
        profileName: args.profileName ? cleanText(args.profileName, 100) : undefined,
        optedOut: false,
        botState: "welcome",
        botData: {},
        stateHistory: [],
        humanHandoff: false,
        // Demo data is only ever a number on the test allow-list: a real
        // customer who happens to message while demo mode is on is not demo.
        isDemo: env.demoMode && env.testRecipients.includes(waId),
        language: "en",
        lastInboundAt: now,
        createdAt: now,
        updatedAt: now,
      });
      contact = (await ctx.db.get(contactId))!;
    } else if (event.attempts === 0) {
      // (A stale-event retry skips these writes: the inbound is already
      // recorded and only the bot step needs to run again.)
      await ctx.db.patch(contact._id, {
        lastInboundAt: now,
        updatedAt: now,
        // The flag can only be CLEARED here, never set: leaving demo mode or
        // the allow-list stops resetDemo trusting it, but a real customer can
        // never become demo data.
        isDemo: contact.isDemo && env.demoMode && env.testRecipients.includes(waId),
        ...(args.profileName && !contact.profileName
          ? { profileName: cleanText(args.profileName, 100) }
          : {}),
      });
      contact = (await ctx.db.get(contact._id))!;
    }

    /* ---- conversation (find or create) ------------------------------- */
    const displayName = contact.displayName ?? contact.profileName ?? `+${waId}`;
    let conversation = await ctx.db
      .query("conversations")
      .withIndex("by_whatsappContactId", (q) => q.eq("whatsappContactId", contact!._id))
      .order("desc")
      .first();
    if (!conversation) {
      const conversationId = await ctx.db.insert("conversations", {
        subject: "WhatsApp chat",
        customerName: displayName,
        customerEmail: "",
        whatsappContactId: contact._id,
        status: "open",
        priority: "normal",
        channel: "whatsapp",
        lastMessageAt: now,
        unreadForCustomer: 0,
        unreadForStaff: 0,
        messageCount: 0,
        createdAt: now,
      });
      conversation = (await ctx.db.get(conversationId))!;
    } else if (
      event.attempts === 0 &&
      (conversation.status === "resolved" || conversation.status === "closed")
    ) {
      await ctx.db.patch(conversation._id, { status: "open", resolvedAt: undefined, resolvedBy: undefined });
      conversation = (await ctx.db.get(conversation._id))!;
    }

    /* ---- rate limit (customer rows only) ------------------------------ */
    // Bot/staff rows share the index, so read a generous slice of the last
    // minute and count only the customer's own messages. Over the cap we still
    // record the message (staff see it) but do not run the bot or reply.
    const lastMinute = await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", conversation!._id).gte("createdAt", now - RATE_LIMIT_WINDOW_MS),
      )
      .order("desc")
      .take(200);
    const rateLimited =
      lastMinute.filter((m) => m.authorRole === "customer" && m.direction === "inbound").length >=
      RATE_LIMIT_MESSAGES;

    /* ---- record the inbound message (idempotent on wamid) -------------- */
    const already = await ctx.db
      .query("messages")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.wamid))
      .first();
    if (!already) {
      await appendMessage(ctx, conversation, {
        conversationId: conversation._id,
        authorName: displayName,
        authorRole: "customer",
        body: inboundBody(args.message),
        externalId: args.wamid,
        direction: "inbound",
        messageType: args.message.type === "unsupported" ? args.message.mediaType : args.message.type,
      });
    }

    /* ---- STOP / START: honoured whatever the bot is doing ------------- */
    // These are legal-grade requests and must not depend on the kill switch,
    // the admin setting or the rate limit. STOP is applied here, always. START
    // is applied here only when the bot will not run; otherwise the engine
    // sees the opted-out state and answers it.
    const text = args.message.type === "text" ? args.message.text : null;
    if (text !== null && isOptOutText(text) && !contact.optedOut) {
      await ctx.db.patch(contact._id, { optedOut: true, updatedAt: now });
      if (contact.linkedUserId) await ctx.db.patch(contact.linkedUserId, { whatsappOptIn: false });
    }

    const settingOn = (await readSetting(ctx, "integrations.whatsappBotEnabled")) === true;
    const botWillRun = env.botEnvEnabled && settingOn && !rateLimited;
    if (!botWillRun) {
      if (text !== null && isOptInText(text) && contact.optedOut) {
        await ctx.db.patch(contact._id, { optedOut: false, updatedAt: now });
        if (contact.linkedUserId) await ctx.db.patch(contact.linkedUserId, { whatsappOptIn: true });
      }
      await finish("done");
      return null;
    }

    // The bot runs in its own job; the event stays pending until it commits.
    await ctx.scheduler.runAfter(0, internal.whatsapp.runBot, {
      eventId: args.eventId,
      contactId: contact._id,
      conversationId: conversation._id,
      message: args.message,
    });
    return null;
  },
});

const botStepArgs = {
  eventId: v.id("whatsappWebhookEvents"),
  contactId: v.id("whatsappContacts"),
  conversationId: v.id("conversations"),
  message: ingestMessageValidator,
};

/**
 * Step 2 of 2 wrapper. `applyBotStep` is one transaction, so when it throws
 * nothing it did is kept; this action then records the failure on the event
 * (error class name only). It is an action rather than a mutation so the
 * rollback and the failure marker are genuinely separate transactions.
 */
export const runBot = internalAction({
  args: botStepArgs,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    try {
      await ctx.runMutation(internal.whatsapp.applyBotStep, args);
    } catch (error) {
      const name = errorName(error);
      console.error("[whatsapp] bot step failed", name);
      await ctx.runMutation(internal.whatsapp.markBotFailed, {
        eventId: args.eventId,
        error: name,
        contactId: args.contactId,
        conversationId: args.conversationId,
      });
    }
    return null;
  },
});

/**
 * A customer whose message the bot could not process would otherwise be
 * stranded in silence. Raise the thread to staff: high priority, handoff flag,
 * and one notification (the dedupe key is per event, so retries do not repeat it).
 * No fallback reply is sent to the customer.
 */
async function escalateStuckConversation(
  ctx: MutationCtx,
  eventId: Id<"whatsappWebhookEvents">,
  conversationId: Id<"conversations">,
  contactId: Id<"whatsappContacts"> | undefined,
): Promise<void> {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) return;
  // Never downgrade an urgent thread.
  await ctx.db.patch(conversationId, {
    status: "open",
    ...(conversation.priority === "urgent" ? {} : { priority: "high" as const }),
  });
  let alreadyHandedOff = false;
  if (contactId) {
    const contact = await ctx.db.get(contactId);
    if (contact) {
      alreadyHandedOff = contact.humanHandoff && contact.botState === "handoff";
      // Same state staff get from whatsappAdmin.setHandoff: the bot stays quiet.
      await ctx.db.patch(contactId, {
        humanHandoff: true,
        botState: "handoff",
        stateHistory: [],
        updatedAt: Date.now(),
      });
    }
  }
  // A person already owns this thread: no second alert.
  if (alreadyHandedOff) return;
  await ctx.scheduler.runAfter(0, internal.notifications.dispatchToStaff, {
    permission: PERMISSIONS.CONVERSATION_REPLY,
    type: NOTIFICATION_TYPES.CUSTOMER_REPLIED,
    title: "WhatsApp: the assistant could not answer a customer",
    body: `${conversation.customerName} messaged on WhatsApp and the assistant failed to process it. Please reply by hand.`,
    link: "/admin/conversations",
    dedupeKeyPrefix: `wa:botfail:${eventId}`,
    conversationId,
  });
}

export const markBotFailed = internalMutation({
  args: {
    eventId: v.id("whatsappWebhookEvents"),
    error: v.string(),
    contactId: v.optional(v.id("whatsappContacts")),
    conversationId: v.optional(v.id("conversations")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.processingState !== "pending") return null;
    await ctx.db.patch(args.eventId, {
      processingState: "failed",
      processedAt: Date.now(),
      lastError: `bot_step_failed:${args.error}`.slice(0, 80),
    });
    if (args.conversationId) {
      await escalateStuckConversation(ctx, args.eventId, args.conversationId, args.contactId);
    }
    return null;
  },
});

const STUCK_AFTER_MS = 10 * 60 * 1000;
const STUCK_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const STUCK_BATCH = 100;

/**
 * Cron safety net: an event still "pending" after ten minutes lost its job
 * (crashed action, dropped schedule). Mark it failed and alert staff once.
 * Bounded to the last day and one batch per tick.
 */
export const sweepStuckEvents = internalMutation({
  args: {},
  returns: v.object({ failed: v.number() }),
  handler: async (ctx): Promise<{ failed: number }> => {
    const now = Date.now();
    const candidates = await ctx.db
      .query("whatsappWebhookEvents")
      .withIndex("by_state_receivedAt", (q) =>
        q
          .eq("processingState", "pending")
          .gt("receivedAt", now - STUCK_LOOKBACK_MS)
          .lt("receivedAt", now - STUCK_AFTER_MS),
      )
      .order("desc")
      .take(STUCK_BATCH);

    let failed = 0;
    for (const event of candidates) {
      if (event.processingState !== "pending") continue;
      await ctx.db.patch(event._id, {
        processingState: "failed",
        processedAt: now,
        lastError: "stuck_pending",
      });
      failed += 1;
      if (event.kind === "message" && event.waMessageId) {
        const waMessageId = event.waMessageId;
        const inbound = await ctx.db
          .query("messages")
          .withIndex("by_externalId", (q) => q.eq("externalId", waMessageId))
          .first();
        if (inbound) {
          const conversation = await ctx.db.get(inbound.conversationId);
          await escalateStuckConversation(
            ctx,
            event._id,
            inbound.conversationId,
            conversation?.whatsappContactId,
          );
        }
      }
    }
    return { failed };
  },
});

/**
 * The bot step proper: engine, effects, new state, queued replies and the
 * event's "done" flip all commit together or not at all. A replay finds the
 * event no longer pending and does nothing, so it cannot reply twice.
 */
export const applyBotStep = internalMutation({
  args: botStepArgs,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.processingState !== "pending") return null;

    const contact = await ctx.db.get(args.contactId);
    const conversation = await ctx.db.get(args.conversationId);
    if (!contact || !conversation) {
      await ctx.db.patch(args.eventId, {
        processingState: "failed",
        processedAt: Date.now(),
        lastError: "record_missing",
      });
      return null;
    }

    const now = Date.now();
    const env = readWhatsAppEnv(process.env);
    const waId = contact.waId;
    const displayName = contact.displayName ?? contact.profileName ?? `+${waId}`;

    const catalogue = await loadCatalogue(ctx);
    const inbound: InboundMessage =
      args.message.type === "interactive"
        ? { type: "interactive", id: args.message.id }
        : args.message;
    // A STOP was already recorded by `processMessage`; the engine must still
    // see the contact as subscribed so it produces the confirmation reply.
    const isStop = args.message.type === "text" && isOptOutText(args.message.text);
    const result = step({
      state: contact.botState as StepId,
      data: contact.botData as BotData,
      history: contact.stateHistory as StepId[],
      message: inbound,
      catalogue,
      now,
      siteUrl: SITE.url,
      optedOut: isStop ? false : contact.optedOut,
      language: "en",
    });

    /* ---- persist new bot state ---------------------------------------- */
    // Handoff is exactly "the engine ended in the handoff state".
    let humanHandoff = result.state === "handoff";
    let optedOut = contact.optedOut;
    const outbound: QueuedMessage[] = result.replies.map((payload) => ({ payload: payload as OutboundPayload }));

    for (const effect of result.effects) {
      switch (effect.type) {
        case "handoff": {
          humanHandoff = true;
          await ctx.db.patch(conversation._id, { status: "open", priority: "high" });
          await ctx.scheduler.runAfter(0, internal.notifications.dispatchToStaff, {
            permission: PERMISSIONS.CONVERSATION_REPLY,
            type: NOTIFICATION_TYPES.CUSTOMER_REPLIED,
            title: "WhatsApp: a customer asked for a person",
            body: `${displayName} asked to talk to the team on WhatsApp.`,
            link: "/admin/conversations",
            dedupeKeyPrefix: `wa:handoff:${args.eventId}`,
            conversationId: conversation._id,
          });
          break;
        }
        case "opt_out": {
          optedOut = true;
          if (contact.linkedUserId) await ctx.db.patch(contact.linkedUserId, { whatsappOptIn: false });
          // Only the confirmation of this very request may still be sent.
          for (const m of outbound) m.optOutAcknowledgement = true;
          break;
        }
        case "opt_in": {
          optedOut = false;
          if (contact.linkedUserId) await ctx.db.patch(contact.linkedUserId, { whatsappOptIn: true });
          break;
        }
        case "lookup_status": {
          outbound.push({ payload: textMessage(await statusReply(ctx, effect.reference, waId)) });
          break;
        }
        case "create_enquiry": {
          const reference = await createBotEnquiry(ctx, contact, conversation, effect.data, now, contact.isDemo);
          const text = reference
            ? `Your enquiry reference is ${reference}. Please quote it if you contact us.`
            : "We have already received several enquiries from this number. Our team will be in touch.";
          // Directly after the engine's "enquiry sent" message.
          outbound.splice(1, 0, { payload: textMessage(text) });
          break;
        }
      }
    }

    await ctx.db.patch(contact._id, {
      botState: result.state,
      botData: result.data,
      stateHistory: result.history,
      humanHandoff,
      optedOut,
      updatedAt: now,
    });

    await queueOutbound(ctx, {
      conversationId: conversation._id,
      contactId: contact._id,
      messages: outbound,
      authorRole: "system",
      authorName: BOT_NAME,
    });

    await ctx.db.patch(args.eventId, { processingState: "done", processedAt: now, lastError: undefined });
    return null;
  },
});
