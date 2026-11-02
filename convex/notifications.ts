import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { requireUser } from "./lib/auth";
import {
  NOTIFICATION_DEFINITIONS,
  type NotificationType,
} from "../lib/constants/notifications";
import { resolvePermissions, STAFF_ROLES } from "../lib/constants/roles";
import { renderEmail } from "../lib/notifications/templates";
import {
  buildWhatsAppBody,
  normaliseWhatsAppNumber,
} from "../lib/notifications/whatsapp";

/* ============================================================================
 * Notifications — the single outbound path for everything the platform says
 * to a human.
 *
 * Every other module reaches this file the same way:
 *
 *   await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {...})
 *
 * and never writes a `notifications` row or calls Resend itself. That matters
 * for three reasons:
 *
 *  1. **Idempotency.** `dispatch` drops anything whose `dedupeKey` already
 *     exists. A Razorpay webhook that Razorpay retries four times produces one
 *     row and one email, because all four carry `payment:<id>:received`.
 *  2. **Consent and channel policy live in one place** rather than being
 *     re-derived (differently) at every call site.
 *  3. **A failing provider can never roll back the business transaction.**
 *     Email and WhatsApp go out from scheduled actions; their failures land in
 *     `deliveryError` on the row, not in an exception on the mutation that
 *     changed the application's status.
 * ========================================================================== */

type Channel = "in_app" | "email" | "whatsapp";

const channelValidator = v.union(
  v.literal("in_app"),
  v.literal("email"),
  v.literal("whatsapp"),
);

/** Cap on how many staff one fan-out may touch. The staff table is small;
 *  this is a guard against a runaway loop, not a product limit. */
const STAFF_FANOUT_LIMIT = 200;

/* -------------------------------------------------------------------------- */
/*                             Channel resolution                             */
/* -------------------------------------------------------------------------- */

/**
 * Decide which channels this notification may actually use for this person.
 *
 * - Unknown `type` (a module invented one that is not in the catalogue yet)
 *   falls back to in-app only: never surprise someone with an email from a
 *   code path nobody reviewed.
 * - Opt-outs are honoured **only for `optional: true` notifications**.
 *   "Your document was rejected" is operational — a customer who muted
 *   marketing still has to receive it, or the application silently stalls.
 * - A channel with no address (no email, no usable phone) is dropped here
 *   rather than failing later in the action.
 *
 * NOTE for whoever wires the WhatsApp number: Meta's own Business Messaging
 * policy requires prior opt-in for *any* business-initiated WhatsApp message,
 * not just optional ones. The rule below follows this project's contract
 * (operational notices always send); if compliance pushes back, the one-line
 * change is to drop `whatsapp` whenever `whatsappOptIn !== true`.
 */
function resolveChannels(
  user: Doc<"users">,
  type: string,
  requested: Channel[] | undefined,
): Channel[] {
  const definition = NOTIFICATION_DEFINITIONS[type as NotificationType] as
    | (typeof NOTIFICATION_DEFINITIONS)[NotificationType]
    | undefined;

  const base: Channel[] =
    requested && requested.length > 0
      ? requested
      : ((definition?.defaultChannels as Channel[] | undefined) ?? ["in_app"]);

  const isOptional = definition?.optional ?? false;

  // De-duplicate, keeping the caller's order.
  const unique = Array.from(new Set(base));

  return unique.filter((channel) => {
    if (channel === "in_app") return true;

    if (channel === "email") {
      if (!user.email) return false;
      // marketingOptIn gates optional mail only.
      if (isOptional && user.marketingOptIn === false) return false;
      return true;
    }

    // whatsapp
    if (!normaliseWhatsAppNumber(user.phone)) return false;
    if (isOptional && user.whatsappOptIn !== true) return false;
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/*                              Core dispatch                                 */
/* -------------------------------------------------------------------------- */

interface DispatchInput {
  userId: Id<"users">;
  type: string;
  title: string;
  body: string;
  link?: string;
  dedupeKey: string;
  channels?: Channel[];
  applicationId?: Id<"applications">;
  conversationId?: Id<"conversations">;
  enquiryId?: Id<"enquiries">;
  emailTemplate?: string;
  emailData?: unknown;
}

/**
 * The real implementation, shared by `dispatch` and `dispatchToStaff`.
 *
 * Returns the new notification id, or `null` when nothing was created —
 * either because the key was already used or because the recipient is gone.
 * Callers treat `null` as success: "this event has already been announced".
 */
async function dispatchOne(
  ctx: MutationCtx,
  input: DispatchInput,
): Promise<Id<"notifications"> | null> {
  // ---- 1. Idempotency gate --------------------------------------------
  // Convex mutations are serialisable, so two concurrent dispatches with the
  // same key cannot both pass this check: the loser is retried by OCC, sees
  // the row, and bails. No extra locking is needed.
  const existing = await ctx.db
    .query("notifications")
    .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", input.dedupeKey))
    .first();

  if (existing) return null;

  // ---- 2. Recipient ----------------------------------------------------
  const user = await ctx.db.get(input.userId);
  if (!user) {
    console.warn(
      `[notifications] dropped ${input.type}: user ${input.userId} no longer exists`,
    );
    return null;
  }
  if (user.status === "deleted") return null;

  const definition = NOTIFICATION_DEFINITIONS[input.type as NotificationType] as
    | (typeof NOTIFICATION_DEFINITIONS)[NotificationType]
    | undefined;

  const channels = resolveChannels(user, input.type, input.channels);

  // ---- 3. The in-app row ----------------------------------------------
  // Written first and unconditionally (even when `in_app` was not requested)
  // so the dedupe key is claimed and the delivery attempt has somewhere to
  // record its outcome. `channelsDelivered` is what the admin UI reads to
  // answer "did the customer actually get told?".
  const inApp = channels.includes("in_app");
  const delivered: Channel[] = inApp ? ["in_app"] : [];
  const now = Date.now();

  const notificationId = await ctx.db.insert("notifications", {
    userId: user._id,
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link,
    icon: definition?.icon,
    applicationId: input.applicationId,
    conversationId: input.conversationId,
    enquiryId: input.enquiryId,
    // An email-only or WhatsApp-only notification still gets a row — that row
    // *is* the dedupe ledger — but it is born read, so it never lights up a
    // bell the caller did not ask to ring.
    isRead: !inApp,
    readAt: inApp ? undefined : now,
    dedupeKey: input.dedupeKey,
    channelsRequested: channels,
    channelsDelivered: delivered,
    createdAt: now,
  });

  // ---- 4. Out-of-band channels ----------------------------------------
  // `runAfter(0, ...)` schedules the action to run *after this mutation
  // commits*. If the surrounding transaction is retried or rolled back the
  // scheduled send goes with it, so a rolled-back status change can never
  // leave a customer holding an email about it.
  if (channels.includes("email")) {
    await ctx.scheduler.runAfter(0, internal.notifications.sendEmail, {
      notificationId,
      to: user.email,
      toName: user.fullName,
      notificationType: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      template: input.emailTemplate,
      data: input.emailData ?? {},
      recipientName: user.fullName,
    });
  }

  if (channels.includes("whatsapp")) {
    await ctx.scheduler.runAfter(0, internal.notifications.sendWhatsApp, {
      notificationId,
      to: user.phone ?? "",
      notificationType: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      data: input.emailData ?? {},
      recipientName: user.fullName,
    });
  }

  return notificationId;
}

/* ------------------------------- dispatch -------------------------------- */

/**
 * **The single entry point for sending anything to anyone.**
 *
 * Argument shape is contract-binding — `convex/applications.ts`,
 * `convex/payments.ts`, `convex/documents.ts` and `convex/crons.ts` all call
 * it with exactly these keys.
 */
export const dispatch = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.string(),
    title: v.string(),
    body: v.string(),
    link: v.optional(v.string()),
    dedupeKey: v.string(),
    channels: v.optional(v.array(channelValidator)),
    applicationId: v.optional(v.id("applications")),
    conversationId: v.optional(v.id("conversations")),
    enquiryId: v.optional(v.id("enquiries")),
    emailTemplate: v.optional(v.string()),
    emailData: v.optional(v.any()),
  },
  returns: v.union(v.id("notifications"), v.null()),
  handler: async (ctx, args) => dispatchOne(ctx, args),
});

/* ---------------------------- dispatchToStaff ---------------------------- */

/**
 * Fan a staff-audience notification out to every active user who holds
 * `permission`.
 *
 * Used for "a new enquiry arrived" and "a new application was created", where
 * the recipient is a role rather than a person.
 *
 * Dedupe is **per recipient**: the final key is
 * `${dedupeKeyPrefix}:${recipientUserId}`, which matches the recipe in
 * `dedupeKeys.enquiryReceived(enquiryId, staffUserId)`. Without the suffix the
 * first agent to be notified would consume the key and everyone else would be
 * silently skipped.
 */
export const dispatchToStaff = internalMutation({
  args: {
    permission: v.string(),
    type: v.string(),
    title: v.string(),
    body: v.string(),
    link: v.optional(v.string()),
    /** Recipient id is appended with a ":" separator. */
    dedupeKeyPrefix: v.string(),
    channels: v.optional(v.array(channelValidator)),
    applicationId: v.optional(v.id("applications")),
    conversationId: v.optional(v.id("conversations")),
    enquiryId: v.optional(v.id("enquiries")),
    emailTemplate: v.optional(v.string()),
    emailData: v.optional(v.any()),
    /** Never notify the person who caused the event. */
    excludeUserId: v.optional(v.id("users")),
  },
  returns: v.object({ notified: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    let notified = 0;
    let skipped = 0;

    for (const role of STAFF_ROLES) {
      const candidates = await ctx.db
        .query("users")
        .withIndex("by_status_role", (q) =>
          q.eq("status", "active").eq("role", role),
        )
        .take(STAFF_FANOUT_LIMIT);

      for (const candidate of candidates) {
        if (args.excludeUserId && candidate._id === args.excludeUserId) continue;

        // Effective permissions = role defaults + per-person grants/revocations
        // from the staff profile. A deactivated profile gets nothing.
        const profile = await ctx.db
          .query("staffProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", candidate._id))
          .unique();

        if (profile && !profile.isActive) {
          skipped += 1;
          continue;
        }

        const permissions = resolvePermissions(
          candidate.role,
          profile?.extraPermissions ?? [],
          profile?.revokedPermissions ?? [],
        );

        if (!permissions.has(args.permission)) {
          skipped += 1;
          continue;
        }

        const created = await dispatchOne(ctx, {
          userId: candidate._id,
          type: args.type,
          title: args.title,
          body: args.body,
          link: args.link,
          dedupeKey: `${args.dedupeKeyPrefix}:${candidate._id}`,
          channels: args.channels,
          applicationId: args.applicationId,
          conversationId: args.conversationId,
          enquiryId: args.enquiryId,
          emailTemplate: args.emailTemplate,
          emailData: args.emailData,
        });

        if (created) notified += 1;
        else skipped += 1;
      }
    }

    if (notified === 0) {
      // Not an error — a fresh install has no staff yet — but it is worth a
      // log line, because "nobody was told about the new enquiry" is the kind
      // of silence that otherwise goes unnoticed for weeks.
      console.warn(
        `[notifications] ${args.type}: no active staff hold ${args.permission}`,
      );
    }

    return { notified, skipped };
  },
});

/* -------------------------- delivery bookkeeping ------------------------- */

/**
 * Record the outcome of one out-of-band channel back onto the row.
 * Called only from `sendEmail` / `sendWhatsApp`.
 */
export const recordDelivery = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    channel: channelValidator,
    delivered: v.boolean(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.notificationId);
    if (!row) return null;

    const channelsDelivered = args.delivered
      ? Array.from(new Set([...row.channelsDelivered, args.channel]))
      : row.channelsDelivered;

    // Errors accumulate as one readable line per channel so the admin UI can
    // show "email: 422 domain not verified" without a second table.
    const deliveryError = args.error
      ? [row.deliveryError, `${args.channel}: ${args.error}`]
          .filter(Boolean)
          .join(" | ")
          .slice(0, 1000)
      : row.deliveryError;

    await ctx.db.patch(args.notificationId, {
      channelsDelivered,
      deliveryError,
    });

    return null;
  },
});

/* -------------------------------------------------------------------------- */
/*                                  Email                                     */
/* -------------------------------------------------------------------------- */

const DEFAULT_FROM = "VisaDrive <notifications@visadrive.in>";

/**
 * Send one transactional email through Resend.
 *
 * `fetch` rather than the `resend` SDK on purpose: the SDK is installed for
 * the Next.js side, but a bare HTTPS call keeps this action runtime-agnostic
 * and free of a dependency Convex would have to bundle.
 *
 * Failure policy: this action **never throws**. A missing API key, a 4xx from
 * Resend or a network blip is recorded on the notification row and swallowed.
 * The customer still has the in-app notification; an exception here would only
 * produce a scheduler retry storm.
 */
export const sendEmail = internalAction({
  args: {
    notificationId: v.optional(v.id("notifications")),
    to: v.string(),
    toName: v.optional(v.string()),
    notificationType: v.optional(v.string()),
    title: v.string(),
    body: v.string(),
    link: v.optional(v.string()),
    template: v.optional(v.string()),
    data: v.optional(v.any()),
    recipientName: v.optional(v.string()),
    /** Overrides the template's subject when supplied. */
    subject: v.optional(v.string()),
  },
  returns: v.object({ delivered: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;
    const replyTo = process.env.RESEND_REPLY_TO;

    const rendered = renderEmail({
      template: args.template,
      notificationType: args.notificationType,
      data: {
        ...(args.data && typeof args.data === "object" ? args.data : {}),
        title: args.title,
        body: args.body,
        link: args.link,
        recipientName: args.recipientName ?? args.toName,
        customerName:
          (args.data as { customerName?: string } | undefined)?.customerName ??
          args.recipientName ??
          args.toName,
      },
    });

    const subject = args.subject ?? rendered.subject;

    if (!apiKey) {
      // Expected in local development. Loud enough to find in the logs,
      // quiet enough not to look like a failure.
      console.log(
        `[notifications] email skipped (RESEND_API_KEY unset) to=${args.to} subject="${subject}"`,
      );
      if (args.notificationId) {
        await ctx.runMutation(internal.notifications.recordDelivery, {
          notificationId: args.notificationId,
          channel: "email",
          delivered: false,
          error: "RESEND_API_KEY unset",
        });
      }
      return { delivered: false, reason: "RESEND_API_KEY unset" };
    }

    if (!args.to || !args.to.includes("@")) {
      console.warn(`[notifications] email skipped: invalid address "${args.to}"`);
      if (args.notificationId) {
        await ctx.runMutation(internal.notifications.recordDelivery, {
          notificationId: args.notificationId,
          channel: "email",
          delivered: false,
          error: "invalid recipient address",
        });
      }
      return { delivered: false, reason: "invalid recipient address" };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [args.to],
          subject,
          html: rendered.html,
          text: rendered.text,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 400);
        const reason = `HTTP ${response.status} ${detail}`;
        console.error(`[notifications] Resend rejected the email: ${reason}`);
        if (args.notificationId) {
          await ctx.runMutation(internal.notifications.recordDelivery, {
            notificationId: args.notificationId,
            channel: "email",
            delivered: false,
            error: reason,
          });
        }
        return { delivered: false, reason };
      }

      if (args.notificationId) {
        await ctx.runMutation(internal.notifications.recordDelivery, {
          notificationId: args.notificationId,
          channel: "email",
          delivered: true,
        });
      }
      return { delivered: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[notifications] email send failed: ${reason}`);
      if (args.notificationId) {
        await ctx.runMutation(internal.notifications.recordDelivery, {
          notificationId: args.notificationId,
          channel: "email",
          delivered: false,
          error: reason.slice(0, 400),
        });
      }
      return { delivered: false, reason };
    }
  },
});

/* -------------------------------------------------------------------------- */
/*                                 WhatsApp                                   */
/* -------------------------------------------------------------------------- */

const WHATSAPP_API_VERSION = "v21.0";

/**
 * Send one WhatsApp message through the WhatsApp Business Cloud API.
 *
 * Same failure policy as `sendEmail`: log, record, never throw.
 *
 * Caveat worth knowing before reading the delivery errors: a free-form text
 * message is only accepted inside the 24-hour customer-service window. Outside
 * it Meta returns error 131047 and the message must be a pre-approved
 * template (see `WHATSAPP_TEMPLATE_HINTS`). That rejection lands in
 * `deliveryError` on the notification row, which is exactly where someone
 * investigating "why didn't they get the WhatsApp" will look.
 */
export const sendWhatsApp = internalAction({
  args: {
    notificationId: v.optional(v.id("notifications")),
    to: v.string(),
    notificationType: v.string(),
    title: v.string(),
    body: v.string(),
    link: v.optional(v.string()),
    data: v.optional(v.any()),
    recipientName: v.optional(v.string()),
  },
  returns: v.object({ delivered: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    const to = normaliseWhatsAppNumber(args.to);

    const record = async (delivered: boolean, error?: string) => {
      if (!args.notificationId) return;
      await ctx.runMutation(internal.notifications.recordDelivery, {
        notificationId: args.notificationId,
        channel: "whatsapp",
        delivered,
        error,
      });
    };

    if (!token || !phoneNumberId) {
      console.log(
        `[notifications] whatsapp skipped (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID unset) to=${args.to} type=${args.notificationType}`,
      );
      await record(false, "WhatsApp credentials unset");
      return { delivered: false, reason: "WhatsApp credentials unset" };
    }

    if (!to) {
      console.warn(
        `[notifications] whatsapp skipped: "${args.to}" is not a usable number`,
      );
      await record(false, "unusable phone number");
      return { delivered: false, reason: "unusable phone number" };
    }

    const messageBody = buildWhatsAppBody(args.notificationType, {
      ...(args.data && typeof args.data === "object" ? args.data : {}),
      title: args.title,
      body: args.body,
      link: args.link,
      recipientName: args.recipientName,
      customerName:
        (args.data as { customerName?: string } | undefined)?.customerName ??
        args.recipientName,
    });

    try {
      const response = await fetch(
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to,
            type: "text",
            text: { preview_url: true, body: messageBody },
          }),
        },
      );

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 400);
        const reason = `HTTP ${response.status} ${detail}`;
        console.error(`[notifications] WhatsApp rejected the message: ${reason}`);
        await record(false, reason);
        return { delivered: false, reason };
      }

      await record(true);
      return { delivered: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[notifications] whatsapp send failed: ${reason}`);
      await record(false, reason.slice(0, 400));
      return { delivered: false, reason };
    }
  },
});

/* -------------------------------------------------------------------------- */
/*                            Owner-facing surface                            */
/* -------------------------------------------------------------------------- */

const MAX_LIST = 100;

/** The signed-in user's notifications, newest first. Never another user's. */
export const listMine = query({
  args: {
    limit: v.optional(v.number()),
    onlyUnread: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const limit = Math.min(Math.max(args.limit ?? 30, 1), MAX_LIST);

    if (args.onlyUnread) {
      return await ctx.db
        .query("notifications")
        .withIndex("by_user_isRead", (q) =>
          q.eq("userId", user._id).eq("isRead", false),
        )
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("notifications")
      .withIndex("by_user_created", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);
  },
});

/**
 * Unread badge count.
 *
 * Deliberately bounded: this runs on every page load, and nobody needs to see
 * "247". Anything at or above the cap is reported as the cap, and the UI
 * renders it as "99+".
 */
export const unreadCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_isRead", (q) =>
        q.eq("userId", user._id).eq("isRead", false),
      )
      .take(99);

    return unread.length;
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(args.notificationId);

    if (!row) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Notification not found.",
      });
    }
    // Ownership is checked against the row, never against an argument.
    if (row.userId !== user._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "This notification does not belong to you.",
      });
    }

    if (!row.isRead) {
      await ctx.db.patch(row._id, { isRead: true, readAt: Date.now() });
    }

    return null;
  },
});

export const markAllRead = mutation({
  args: {},
  returns: v.object({ marked: v.number() }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    // Bounded: a user with more than 200 unread gets the rest on the next
    // click. Unbounded writes in one mutation would risk the transaction
    // size limit on an account that has been ignoring the bell for a year.
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_isRead", (q) =>
        q.eq("userId", user._id).eq("isRead", false),
      )
      .take(200);

    for (const row of unread) {
      await ctx.db.patch(row._id, { isRead: true, readAt: now });
    }

    return { marked: unread.length };
  },
});
