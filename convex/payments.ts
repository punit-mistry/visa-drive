import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  authError,
  requireApplicationAccess,
  requirePermission,
  requireUser,
} from "./lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "./lib/audit";
import { generateReference } from "./lib/references";
import { pricingForProduct } from "./applications";
import { formatMoney } from "../lib/helpers/pricing";
import { NOTIFICATION_TYPES, dedupeKeys } from "../lib/constants/notifications";
import { PERMISSIONS } from "../lib/constants/roles";

/* ============================================================================
 * Payments.
 *
 * The three rules this file exists to enforce:
 *
 *  1. The amount is ours. `createRazorpayOrder` takes no amount — it loads the
 *     visaProduct and re-runs `computePricing`. A client cannot propose a
 *     total, cannot discount itself, and cannot pay ₹1 for a ₹12,000 visa.
 *
 *  2. There is exactly one way an application becomes paid:
 *     `markPaidInternal`. The browser's post-checkout callback
 *     (`verifyRazorpayPayment`) and the Razorpay webhook
 *     (`handleWebhookEvent`) both funnel into it. The webhook is the
 *     authoritative signal — the browser one is a latency optimisation that
 *     happens to also be signature-verified.
 *
 *  3. It is idempotent. Razorpay retries webhooks; customers double-click;
 *     both paths can race. Idempotency is layered, cheapest check first:
 *       a. `providerEventId`  — the same webhook delivered twice.
 *       b. `razorpayPaymentId` already on a row with status `paid` — the
 *          browser callback and the webhook describing one capture.
 *       c. the payment row's own status — anything else that arrives late.
 *     Only a call that passes all three mutates money, writes revenue or
 *     schedules a notification.
 * ========================================================================== */

const paymentModeValidator = v.union(
  v.literal("razorpay"),
  v.literal("manual_bank_transfer"),
  v.literal("cash"),
  v.literal("upi_offline"),
  v.literal("cheque"),
  v.literal("other"),
);

const paymentRowStatus = v.union(
  v.literal("created"),
  v.literal("pending"),
  v.literal("paid"),
  v.literal("failed"),
  v.literal("refunded"),
  v.literal("partially_refunded"),
  v.literal("cancelled"),
);

const SCAN_LIMIT = 10_000;

/* ----------------------------------------------------------------------------
 * Explicit result types.
 *
 * Several functions here call siblings in this same module through `internal`,
 * which makes TypeScript's inference circular (`createRazorpayOrder`'s type
 * depends on `prepareOrderInternal`'s, which lives in the same file). Naming
 * the shapes breaks the cycle — they are the single source of truth for both
 * the `returns` validators and the call sites.
 * ------------------------------------------------------------------------- */

type PreparedOrder = {
  paymentId: Id<"payments">;
  receiptNumber: string;
  amount: number;
  currency: string;
  razorpayOrderId: string | null;
  referenceId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
};

type SettlementOutcome = "applied" | "duplicate" | "unknown_order";

type MarkPaidResult = {
  outcome: SettlementOutcome;
  paymentId: Id<"payments"> | null;
};

type CreateOrderResult = {
  paymentId: Id<"payments">;
  razorpayOrderId: string;
  keyId: string;
  amount: number;
  currency: string;
  receiptNumber: string;
  referenceId: string;
  prefill: { name: string; email: string; contact: string | null };
};

type VerifyResult = {
  verified: boolean;
  outcome: SettlementOutcome;
  paymentId: Id<"payments"> | null;
};

type WebhookResult = {
  handled: boolean;
  event: string | null;
  outcome: string | null;
};

/* -------------------------------------------------------------------------- */
/*                                   crypto                                   */
/* -------------------------------------------------------------------------- */

/**
 * HMAC-SHA256 as lowercase hex, via Web Crypto so it works in the Convex
 * default runtime (no `"use node"` needed just to check a signature).
 */
async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time-ish comparison so a bad signature leaks no timing signal. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function razorpayConfig(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    // Catchable on purpose: the checkout screen falls back to the
    // "pay offline / we will send a link" flow instead of erroring out.
    throw new ConvexError({
      code: "PAYMENT_NOT_CONFIGURED",
      message:
        "Online payments are not configured yet. The VisaDrive team will send you payment instructions.",
    });
  }

  return { keyId, keySecret };
}

/* -------------------------------------------------------------------------- */
/*                            application roll-up                             */
/* -------------------------------------------------------------------------- */

/**
 * Recompute an application's `paymentStatus` from its actual payment rows.
 * Never set it directly anywhere else — this is the only function that decides
 * whether a booking is paid, partially paid or refunded.
 */
async function rollUpApplicationPayment(
  ctx: MutationCtx,
  applicationId: Id<"applications">,
): Promise<void> {
  const application = await ctx.db.get(applicationId);
  if (!application) return;
  if (application.paymentStatus === "not_required") return;

  const payments = await ctx.db
    .query("payments")
    .withIndex("by_applicationId", (q) => q.eq("applicationId", applicationId))
    .collect();

  const settled = payments.filter(
    (p) =>
      p.status === "paid" ||
      p.status === "refunded" ||
      p.status === "partially_refunded",
  );

  const gross = settled.reduce((sum, p) => sum + p.amount, 0);
  const refunded = settled.reduce((sum, p) => sum + (p.refundedAmount ?? 0), 0);
  const net = gross - refunded;
  const total = application.pricing.total;

  let next: Doc<"applications">["paymentStatus"];
  if (gross === 0) {
    next = payments.some((p) => p.status === "failed")
      ? "failed"
      : payments.some((p) => p.status === "pending" || p.status === "created")
        ? "pending"
        : "unpaid";
  } else if (refunded > 0 && net <= 0) {
    next = "refunded";
  } else if (refunded > 0) {
    next = "partially_refunded";
  } else if (net >= total) {
    next = "paid";
  } else {
    next = "partially_paid";
  }

  if (next !== application.paymentStatus) {
    await ctx.db.patch(applicationId, {
      paymentStatus: next,
      updatedAt: Date.now(),
    });
  }
}

/* -------------------------------------------------------------------------- */
/*                               order creation                               */
/* -------------------------------------------------------------------------- */

/**
 * Auth + server-side pricing + the payment row, in one transaction.
 *
 * Deliberately internal: the only caller is `createRazorpayOrder`, which runs
 * in an action and therefore cannot touch the database itself. The caller's
 * Clerk identity is carried through `ctx.runMutation`, so `requireUser` still
 * resolves the real signed-in person here.
 */
export const prepareOrderInternal = internalMutation({
  args: { applicationId: v.id("applications") },
  returns: v.object({
    paymentId: v.id("payments"),
    receiptNumber: v.string(),
    amount: v.number(),
    currency: v.string(),
    razorpayOrderId: v.union(v.string(), v.null()),
    referenceId: v.string(),
    customerName: v.string(),
    customerEmail: v.string(),
    customerPhone: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const access = await requireApplicationAccess(ctx, args.applicationId);
    const application = access.application;

    // Paying is something the customer does for their own booking. Staff
    // collecting money use `recordManualPayment`, which is audited.
    if (access.viaStaff) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Staff cannot start a checkout on a customer's behalf.",
      });
    }

    if (application.isDraft) {
      throw new ConvexError({
        code: "NOT_SUBMITTED",
        message: "Submit the application before paying for it.",
      });
    }
    if (application.paymentStatus === "paid") {
      throw new ConvexError({
        code: "ALREADY_PAID",
        message: "This application has already been paid for.",
      });
    }
    if (application.paymentStatus === "not_required") {
      throw new ConvexError({
        code: "PAYMENT_NOT_REQUIRED",
        message: "There is nothing to pay for this service.",
      });
    }
    if (
      application.paymentMode === "manual_offline" ||
      application.paymentMode === "free_consultation"
    ) {
      throw new ConvexError({
        code: "PAYMENT_MODE_OFFLINE",
        message:
          "This service is settled offline. The VisaDrive team will send you payment instructions.",
      });
    }

    /* --------------------------- recompute price --------------------------- */

    const product = await ctx.db.get(application.visaProductId);
    if (!product) authError("NOT_FOUND", "This visa service is no longer available.");

    const now = Date.now();
    // The authoritative amount. Not the client's, and not even the stored
    // snapshot — the catalogue row is re-read and the maths re-run here so a
    // tampered or stale snapshot cannot be charged.
    const pricing = pricingForProduct(product, application.travellerCount, now);

    if (pricing.total <= 0) {
      throw new ConvexError({
        code: "PAYMENT_NOT_REQUIRED",
        message: "There is nothing to pay for this service.",
      });
    }

    if (pricing.total !== application.pricing.total) {
      // Keep the snapshot and the receipt in step, so what the customer is
      // charged is also what their invoice and the finance report show.
      await ctx.db.patch(application._id, { pricing, updatedAt: now });
    }

    /* ---------------------------- payment row ----------------------------- */

    const existingRows = await ctx.db
      .query("payments")
      .withIndex("by_applicationId", (q) => q.eq("applicationId", application._id))
      .collect();

    // Reuse an un-settled attempt of the same size rather than littering the
    // ledger with a row per click of the Pay button.
    const reusable = existingRows.find(
      (p) =>
        p.mode === "razorpay" &&
        (p.status === "created" || p.status === "pending") &&
        p.amount === pricing.total,
    );

    if (reusable) {
      return {
        paymentId: reusable._id,
        receiptNumber: reusable.receiptNumber,
        amount: reusable.amount,
        currency: reusable.currency,
        razorpayOrderId: reusable.razorpayOrderId ?? null,
        referenceId: application.referenceId,
        customerName: application.customerName,
        customerEmail: application.customerEmail,
        customerPhone: application.customerPhone ?? null,
      };
    }

    const receiptNumber = await generateReference(ctx, "receipt", now);
    const paymentId = await ctx.db.insert("payments", {
      applicationId: application._id,
      userId: application.userId,
      receiptNumber,
      amount: pricing.total,
      currency: pricing.currency,
      mode: "razorpay",
      status: "created",
      refundedAmount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return {
      paymentId,
      receiptNumber,
      amount: pricing.total,
      currency: pricing.currency,
      razorpayOrderId: null,
      referenceId: application.referenceId,
      customerName: application.customerName,
      customerEmail: application.customerEmail,
      customerPhone: application.customerPhone ?? null,
    };
  },
});

export const attachOrderInternal = internalMutation({
  args: { paymentId: v.id("payments"), razorpayOrderId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) return null;
    if (payment.status === "paid") return null; // never walk a settled row back

    await ctx.db.patch(args.paymentId, {
      razorpayOrderId: args.razorpayOrderId,
      status: "pending",
      updatedAt: Date.now(),
    });

    if (payment.applicationId) {
      await rollUpApplicationPayment(ctx, payment.applicationId);
    }
    return null;
  },
});

/**
 * Create (or reuse) a Razorpay order for an application the caller owns.
 *
 * Takes no amount — see the file header. Returns everything the browser needs
 * to open checkout, including the *publishable* key id. The secret never
 * leaves the server.
 */
export const createRazorpayOrder = action({
  args: { applicationId: v.id("applications") },
  returns: v.object({
    paymentId: v.id("payments"),
    razorpayOrderId: v.string(),
    keyId: v.string(),
    amount: v.number(),
    currency: v.string(),
    receiptNumber: v.string(),
    referenceId: v.string(),
    prefill: v.object({
      name: v.string(),
      email: v.string(),
      contact: v.union(v.string(), v.null()),
    }),
  }),
  handler: async (ctx, args): Promise<CreateOrderResult> => {
    // Checked before any database work so an unconfigured deployment fails
    // fast and the UI can offer the manual flow instead.
    const { keyId } = razorpayConfig();

    const prepared: PreparedOrder = await ctx.runMutation(
      internal.payments.prepareOrderInternal,
      { applicationId: args.applicationId },
    );

    let razorpayOrderId = prepared.razorpayOrderId;

    if (!razorpayOrderId) {
      const order = await ctx.runAction(internal.payments_node.createOrder, {
        amount: prepared.amount, // already in paise — our storage unit matches
        currency: prepared.currency,
        receipt: prepared.receiptNumber,
        notes: {
          applicationReference: prepared.referenceId,
          paymentId: prepared.paymentId,
        },
      });
      razorpayOrderId = order.orderId;

      await ctx.runMutation(internal.payments.attachOrderInternal, {
        paymentId: prepared.paymentId,
        razorpayOrderId,
      });
    }

    return {
      paymentId: prepared.paymentId,
      razorpayOrderId,
      keyId,
      amount: prepared.amount,
      currency: prepared.currency,
      receiptNumber: prepared.receiptNumber,
      referenceId: prepared.referenceId,
      prefill: {
        name: prepared.customerName,
        email: prepared.customerEmail,
        contact: prepared.customerPhone,
      },
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                          the one way money lands                           */
/* -------------------------------------------------------------------------- */

export const markPaidInternal = internalMutation({
  args: {
    razorpayOrderId: v.string(),
    razorpayPaymentId: v.string(),
    razorpaySignature: v.optional(v.string()),
    razorpayMethod: v.optional(v.string()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    /** Razorpay's `x-razorpay-event-id`, or `verify:<paymentId>`. */
    providerEventId: v.optional(v.string()),
    source: v.union(v.literal("verify"), v.literal("webhook")),
  },
  returns: v.object({
    outcome: v.union(
      v.literal("applied"),
      v.literal("duplicate"),
      v.literal("unknown_order"),
    ),
    paymentId: v.union(v.id("payments"), v.null()),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();

    /* ---- (a) the same provider event, delivered twice -------------------- */
    if (args.providerEventId) {
      const seen = await ctx.db
        .query("payments")
        .withIndex("by_providerEventId", (q) =>
          q.eq("providerEventId", args.providerEventId),
        )
        .first();
      if (seen) return { outcome: "duplicate" as const, paymentId: seen._id };
    }

    /* ---- (b) this capture already credited, via the other path ----------- */
    const byPaymentId = await ctx.db
      .query("payments")
      .withIndex("by_razorpayPaymentId", (q) =>
        q.eq("razorpayPaymentId", args.razorpayPaymentId),
      )
      .first();

    if (byPaymentId && byPaymentId.status === "paid") {
      // Record which event we saw so a third delivery short-circuits at (a),
      // but do not touch money, revenue or notifications again.
      if (args.providerEventId && !byPaymentId.providerEventId) {
        await ctx.db.patch(byPaymentId._id, {
          providerEventId: args.providerEventId,
        });
      }
      return { outcome: "duplicate" as const, paymentId: byPaymentId._id };
    }

    /* ---- locate the row this capture belongs to -------------------------- */
    const payment =
      byPaymentId ??
      (await ctx.db
        .query("payments")
        .withIndex("by_razorpayOrderId", (q) =>
          q.eq("razorpayOrderId", args.razorpayOrderId),
        )
        .first());

    if (!payment) {
      // A webhook for an order this deployment never created (shared test key,
      // restored database, someone else's account). Never fabricate a row.
      console.warn(
        "[payments] capture for an unknown order",
        args.razorpayOrderId,
        args.razorpayPaymentId,
      );
      return { outcome: "unknown_order" as const, paymentId: null };
    }

    /* ---- (c) the row itself is already settled --------------------------- */
    if (payment.status === "paid") {
      return { outcome: "duplicate" as const, paymentId: payment._id };
    }

    await ctx.db.patch(payment._id, {
      status: "paid",
      razorpayPaymentId: args.razorpayPaymentId,
      razorpayOrderId: args.razorpayOrderId,
      razorpaySignature: args.razorpaySignature ?? payment.razorpaySignature,
      razorpayMethod: args.razorpayMethod ?? payment.razorpayMethod,
      providerEventId: args.providerEventId ?? payment.providerEventId,
      // The ledger keeps the amount we asked for. A mismatch is recorded in the
      // note rather than silently adopting whatever the provider reports.
      notes:
        args.amount !== undefined && args.amount !== payment.amount
          ? `${payment.notes ? `${payment.notes} ` : ""}[provider amount ${args.amount} differs from invoiced ${payment.amount}]`
          : payment.notes,
      paidAt: now,
      failureReason: undefined,
      updatedAt: now,
    });

    if (payment.applicationId) {
      await rollUpApplicationPayment(ctx, payment.applicationId);
    }

    const application = payment.applicationId
      ? await ctx.db.get(payment.applicationId)
      : null;

    await recordAudit(ctx, {
      // No actor: this is the server crediting money off a verified signal.
      actor: null,
      action: AUDIT_ACTIONS.PAYMENT_VERIFIED,
      entityType: "payment",
      entityId: payment._id,
      summary: `Payment ${payment.receiptNumber} of ${formatMoney(payment.amount, payment.currency)} confirmed via Razorpay (${args.source}).`,
      before: { status: payment.status },
      after: {
        status: "paid",
        razorpayPaymentId: args.razorpayPaymentId,
        source: args.source,
      },
    });

    // The dedupe key is the payment row, not the event — so the verify path and
    // the webhook path describing one capture produce one email, whichever wins.
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      userId: payment.userId,
      type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
      title: "Payment received",
      body: `We have received ${formatMoney(payment.amount, payment.currency)}${application ? ` for ${application.referenceId}` : ""}. Receipt ${payment.receiptNumber}.`,
      link: application
        ? `/dashboard/applications/${application._id}`
        : "/dashboard/payments",
      dedupeKey: dedupeKeys.paymentReceived(payment._id),
      applicationId: payment.applicationId,
    });

    return { outcome: "applied" as const, paymentId: payment._id };
  },
});

export const markFailedInternal = internalMutation({
  args: {
    razorpayOrderId: v.optional(v.string()),
    razorpayPaymentId: v.optional(v.string()),
    reason: v.string(),
    providerEventId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = args.razorpayOrderId
      ? await ctx.db
          .query("payments")
          .withIndex("by_razorpayOrderId", (q) =>
            q.eq("razorpayOrderId", args.razorpayOrderId),
          )
          .first()
      : args.razorpayPaymentId
        ? await ctx.db
            .query("payments")
            .withIndex("by_razorpayPaymentId", (q) =>
              q.eq("razorpayPaymentId", args.razorpayPaymentId),
            )
            .first()
        : null;

    if (!payment) return null;
    // A failure notice must never undo a capture that already succeeded.
    if (payment.status === "paid") return null;
    // Same failure event delivered twice — already recorded, already notified.
    if (
      payment.status === "failed" &&
      args.providerEventId !== undefined &&
      payment.providerEventId === args.providerEventId
    ) {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(payment._id, {
      status: "failed",
      failureReason: args.reason,
      razorpayPaymentId: args.razorpayPaymentId ?? payment.razorpayPaymentId,
      providerEventId: args.providerEventId ?? payment.providerEventId,
      updatedAt: now,
    });

    if (payment.applicationId) {
      await rollUpApplicationPayment(ctx, payment.applicationId);
    }

    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      userId: payment.userId,
      type: NOTIFICATION_TYPES.PAYMENT_FAILED,
      title: "Payment could not be completed",
      body: `${args.reason} No money has been taken — you can try again from your application.`,
      link: payment.applicationId
        ? `/dashboard/applications/${payment.applicationId}`
        : "/dashboard/payments",
      // Keyed on the provider event rather than a counter, so Razorpay
      // redelivering one declined attempt does not email the customer twice,
      // while a genuine second attempt still gets its own notice.
      dedupeKey: `payment:${payment._id}:failed:${args.providerEventId ?? args.razorpayPaymentId ?? now}`,
      applicationId: payment.applicationId,
    });

    return null;
  },
});

/* -------------------------------------------------------------------------- */
/*                        browser callback verification                       */
/* -------------------------------------------------------------------------- */

/**
 * Verify the handshake Razorpay Checkout hands back to the browser.
 *
 * The signature is `HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id)`
 * keyed with `RAZORPAY_KEY_SECRET`. Nothing the browser sends is trusted until
 * that check passes — the ids alone prove nothing.
 */
export const verifyRazorpayPayment = action({
  args: {
    razorpayOrderId: v.string(),
    razorpayPaymentId: v.string(),
    razorpaySignature: v.string(),
  },
  returns: v.object({
    verified: v.boolean(),
    outcome: v.union(
      v.literal("applied"),
      v.literal("duplicate"),
      v.literal("unknown_order"),
    ),
    paymentId: v.union(v.id("payments"), v.null()),
  }),
  handler: async (ctx, args): Promise<VerifyResult> => {
    const { keySecret } = razorpayConfig();

    const expected = await hmacSha256Hex(
      keySecret,
      `${args.razorpayOrderId}|${args.razorpayPaymentId}`,
    );

    if (!safeEqual(expected, args.razorpaySignature.trim().toLowerCase())) {
      await ctx.runMutation(internal.payments.markFailedInternal, {
        razorpayOrderId: args.razorpayOrderId,
        reason: "The payment confirmation could not be verified.",
      });
      throw new ConvexError({
        code: "SIGNATURE_INVALID",
        message:
          "We could not verify this payment. If money has left your account, contact VisaDrive support with your reference number.",
      });
    }

    const result: MarkPaidResult = await ctx.runMutation(
      internal.payments.markPaidInternal,
      {
        razorpayOrderId: args.razorpayOrderId,
        razorpayPaymentId: args.razorpayPaymentId,
        razorpaySignature: args.razorpaySignature,
        // Namespaced so it can never collide with a real Razorpay event id.
        providerEventId: `verify:${args.razorpayPaymentId}`,
        source: "verify",
      },
    );

    return { verified: true, outcome: result.outcome, paymentId: result.paymentId };
  },
});

/* -------------------------------------------------------------------------- */
/*                                  webhook                                   */
/* -------------------------------------------------------------------------- */

interface RazorpayWebhookEntity {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  method?: string;
  error_description?: string;
  error_reason?: string;
}

interface RazorpayWebhookPayload {
  payment?: {
    entity?: RazorpayWebhookEntity;
  };
  order?: {
    entity?: RazorpayWebhookEntity;
  };
}

interface RazorpayWebhook {
  event?: string;
  payload?: RazorpayWebhookPayload;
}

/**
 * The authoritative paid signal. Called by `http.ts` for `POST /razorpay-webhook`.
 *
 * Pass the raw request body plus the `x-razorpay-signature` header and the
 * signature is verified here; a caller that already verified upstream may pass
 * a parsed `payload` instead. Idempotency is handled downstream by
 * `markPaidInternal`, so a retried delivery is free.
 */
export const handleWebhookEvent = internalAction({
  args: {
    body: v.optional(v.string()),
    payload: v.optional(v.any()),
    signature: v.optional(v.string()),
    eventId: v.optional(v.string()),
  },
  returns: v.object({
    handled: v.boolean(),
    event: v.union(v.string(), v.null()),
    outcome: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<WebhookResult> => {
    let parsed: RazorpayWebhook | null =
      (args.payload as RazorpayWebhook | null) ?? null;

    if (args.body !== undefined) {
      const secret =
        process.env.RAZORPAY_WEBHOOK_SECRET ?? process.env.RAZORPAY_KEY_SECRET;
      if (!secret) {
        console.error("[payments] webhook received but no webhook secret is set");
        return { handled: false, event: null, outcome: "not_configured" };
      }
      if (!args.signature) {
        return { handled: false, event: null, outcome: "missing_signature" };
      }

      const expected = await hmacSha256Hex(secret, args.body);
      if (!safeEqual(expected, args.signature.trim().toLowerCase())) {
        console.warn("[payments] webhook signature mismatch — ignoring");
        return { handled: false, event: null, outcome: "invalid_signature" };
      }

      try {
        parsed = JSON.parse(args.body);
      } catch {
        return { handled: false, event: null, outcome: "unparseable" };
      }
    } else if (parsed === null) {
      return { handled: false, event: null, outcome: "empty" };
    }

    const event: string = parsed?.event ?? "";
    const paymentEntity: RazorpayWebhookEntity =
      parsed?.payload?.payment?.entity ?? {};
    const orderEntity: RazorpayWebhookEntity = parsed?.payload?.order?.entity ?? {};

    const razorpayPaymentId = paymentEntity.id ?? "";
    const razorpayOrderId = paymentEntity.order_id ?? orderEntity.id ?? "";

    // Razorpay's event id arrives as a header; fall back to a deterministic key
    // so a retry without one still dedupes.
    const providerEventId =
      args.eventId ?? (razorpayPaymentId ? `${event}:${razorpayPaymentId}` : undefined);

    if (event === "payment.captured" || event === "order.paid") {
      if (!razorpayPaymentId || !razorpayOrderId) {
        return { handled: false, event, outcome: "incomplete_payload" };
      }
      const result: MarkPaidResult = await ctx.runMutation(
        internal.payments.markPaidInternal,
        {
          razorpayOrderId,
          razorpayPaymentId,
          razorpayMethod: paymentEntity.method,
          amount: paymentEntity.amount,
          currency: paymentEntity.currency,
          providerEventId,
          source: "webhook",
        },
      );
      return { handled: true, event, outcome: result.outcome };
    }

    if (event === "payment.failed") {
      await ctx.runMutation(internal.payments.markFailedInternal, {
        razorpayOrderId: razorpayOrderId || undefined,
        razorpayPaymentId: razorpayPaymentId || undefined,
        reason:
          paymentEntity.error_description ??
          paymentEntity.error_reason ??
          "The payment was declined.",
        providerEventId,
      });
      return { handled: true, event, outcome: "failed_recorded" };
    }

    // Refunds, settlements, disputes: acknowledged so Razorpay stops retrying,
    // but acted on by a human through `recordRefund`.
    return { handled: false, event: event || null, outcome: "ignored" };
  },
});

/* -------------------------------------------------------------------------- */
/*                              offline / manual                              */
/* -------------------------------------------------------------------------- */

export const recordManualPayment = mutation({
  args: {
    applicationId: v.id("applications"),
    amount: v.number(),
    mode: paymentModeValidator,
    currency: v.optional(v.string()),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    paidAt: v.optional(v.number()),
  },
  returns: v.object({ paymentId: v.id("payments"), receiptNumber: v.string() }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.PAYMENT_RECORD);

    const application = await ctx.db.get(args.applicationId);
    if (!application) authError("NOT_FOUND", "Application not found.");

    if (args.mode === "razorpay") {
      throw new ConvexError({
        code: "INVALID_MODE",
        message:
          "Razorpay payments are recorded automatically by the gateway, not by hand.",
      });
    }
    if (!Number.isInteger(args.amount) || args.amount <= 0) {
      throw new ConvexError({
        code: "INVALID_AMOUNT",
        message: "Enter a positive amount in paise.",
      });
    }

    const now = Date.now();
    const receiptNumber = await generateReference(ctx, "receipt", now);

    const paymentId = await ctx.db.insert("payments", {
      applicationId: application._id,
      userId: application.userId,
      receiptNumber,
      amount: args.amount,
      currency: args.currency ?? application.pricing.currency,
      mode: args.mode,
      status: "paid",
      paidAt: args.paidAt ?? now,
      refundedAmount: 0,
      refundReference: undefined,
      recordedByStaffId: staff.user._id,
      notes: [args.reference ? `Ref: ${args.reference}` : null, args.notes]
        .filter(Boolean)
        .join(" — ") || undefined,
      createdAt: now,
      updatedAt: now,
    });

    await rollUpApplicationPayment(ctx, application._id);

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.PAYMENT_RECORDED,
      entityType: "payment",
      entityId: paymentId,
      summary: `${staff.user.fullName} recorded ${formatMoney(args.amount, args.currency ?? application.pricing.currency)} (${args.mode}) against ${application.referenceId}.`,
      after: { amount: args.amount, mode: args.mode, receiptNumber },
    });

    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      userId: application.userId,
      type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
      title: "Payment recorded",
      body: `We have recorded ${formatMoney(args.amount, args.currency ?? application.pricing.currency)} against ${application.referenceId}. Receipt ${receiptNumber}.`,
      link: `/dashboard/applications/${application._id}`,
      dedupeKey: dedupeKeys.paymentReceived(paymentId),
      applicationId: application._id,
    });

    return { paymentId, receiptNumber };
  },
});

export const recordRefund = mutation({
  args: {
    paymentId: v.id("payments"),
    amount: v.number(),
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.PAYMENT_REFUND);

    const payment = await ctx.db.get(args.paymentId);
    if (!payment) authError("NOT_FOUND", "Payment not found.");

    if (payment.status !== "paid" && payment.status !== "partially_refunded") {
      throw new ConvexError({
        code: "NOT_REFUNDABLE",
        message: "Only a settled payment can be refunded.",
      });
    }

    const alreadyRefunded = payment.refundedAmount ?? 0;
    const remaining = payment.amount - alreadyRefunded;

    if (!Number.isInteger(args.amount) || args.amount <= 0) {
      throw new ConvexError({
        code: "INVALID_AMOUNT",
        message: "Enter a positive refund amount in paise.",
      });
    }
    if (args.amount > remaining) {
      throw new ConvexError({
        code: "REFUND_TOO_LARGE",
        message: `At most ${formatMoney(remaining, payment.currency)} can still be refunded on this payment.`,
      });
    }

    const now = Date.now();
    const refundedAmount = alreadyRefunded + args.amount;

    await ctx.db.patch(payment._id, {
      refundedAmount,
      status: refundedAmount >= payment.amount ? "refunded" : "partially_refunded",
      refundReference: args.reference ?? payment.refundReference,
      refundedAt: now,
      refundNote: args.note ?? payment.refundNote,
      updatedAt: now,
    });

    if (payment.applicationId) {
      await rollUpApplicationPayment(ctx, payment.applicationId);
    }

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.PAYMENT_REFUNDED,
      entityType: "payment",
      entityId: payment._id,
      summary: `${staff.user.fullName} refunded ${formatMoney(args.amount, payment.currency)} on receipt ${payment.receiptNumber}.`,
      before: { refundedAmount: alreadyRefunded, status: payment.status },
      after: {
        refundedAmount,
        status: refundedAmount >= payment.amount ? "refunded" : "partially_refunded",
        reference: args.reference,
        note: args.note,
      },
    });

    return null;
  },
});

/* -------------------------------------------------------------------------- */
/*                                   reads                                    */
/* -------------------------------------------------------------------------- */

export const listMine = query({
  args: { applicationId: v.optional(v.id("applications")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    if (args.applicationId) {
      // Ownership of the application implies ownership of its payments.
      await requireApplicationAccess(ctx, args.applicationId);
      return await ctx.db
        .query("payments")
        .withIndex("by_applicationId", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .order("desc")
        .take(100);
    }

    return await ctx.db
      .query("payments")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);
  },
});

const paymentFilterArgs = {
  search: v.optional(v.string()),
  status: v.optional(paymentRowStatus),
  mode: v.optional(paymentModeValidator),
  applicationId: v.optional(v.id("applications")),
  userId: v.optional(v.id("users")),
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
};

type PaymentFilters = {
  search?: string;
  status?: Doc<"payments">["status"];
  mode?: Doc<"payments">["mode"];
  applicationId?: Id<"applications">;
  userId?: Id<"users">;
  dateFrom?: number;
  dateTo?: number;
};

function paymentStream(ctx: QueryCtx, args: PaymentFilters) {
  const { applicationId, userId, status, dateFrom, dateTo } = args;
  if (applicationId) {
    return ctx.db
      .query("payments")
      .withIndex("by_applicationId", (q) => q.eq("applicationId", applicationId))
      .order("desc");
  }
  if (userId) {
    return ctx.db
      .query("payments")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc");
  }
  if (status) {
    return ctx.db
      .query("payments")
      .withIndex("by_status_createdAt", (q) => {
        let r = q.eq("status", status);
        if (dateFrom !== undefined) r = r.gte("createdAt", dateFrom) as typeof r;
        if (dateTo !== undefined) r = r.lte("createdAt", dateTo) as typeof r;
        return r;
      })
      .order("desc");
  }
  return ctx.db
    .query("payments")
    .withIndex("by_createdAt", (q) => {
      let r = q;
      if (dateFrom !== undefined) r = r.gte("createdAt", dateFrom) as typeof r;
      if (dateTo !== undefined) r = r.lte("createdAt", dateTo) as typeof r;
      return r;
    })
    .order("desc");
}

function applyPaymentFilters(
  stream: ReturnType<typeof paymentStream>,
  args: PaymentFilters,
  indexedDates: boolean,
): ReturnType<typeof paymentStream> {
  let s = stream;
  const { applicationId, userId, status, mode, dateFrom, dateTo } = args;
  if (status && (applicationId || userId)) {
    s = s.filter((q) => q.eq(q.field("status"), status));
  }
  if (mode) s = s.filter((q) => q.eq(q.field("mode"), mode));
  if (!indexedDates && dateFrom !== undefined) {
    s = s.filter((q) => q.gte(q.field("createdAt"), dateFrom));
  }
  if (!indexedDates && dateTo !== undefined) {
    s = s.filter((q) => q.lte(q.field("createdAt"), dateTo));
  }
  return s;
}

export const listForAdmin = query({
  args: { paginationOpts: paginationOptsValidator, ...paymentFilterArgs },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PAYMENT_VIEW);

    // A search term here is a receipt number, not fuzzy text — there is no
    // search index on payments and a receipt is an exact, indexed lookup.
    const term = args.search?.trim();
    if (term) {
      const byReceipt = await ctx.db
        .query("payments")
        .withIndex("by_receiptNumber", (q) =>
          q.eq("receiptNumber", term.toUpperCase()),
        )
        .first();
      const byOrder = byReceipt
        ? null
        : await ctx.db
            .query("payments")
            .withIndex("by_razorpayOrderId", (q) => q.eq("razorpayOrderId", term))
            .first();
      const match = byReceipt ?? byOrder;
      const page = match ? [match] : [];
      return {
        page: await decoratePayments(ctx, page),
        isDone: true,
        continueCursor: "",
      };
    }

    const indexedDates = !args.applicationId && !args.userId;
    const stream = applyPaymentFilters(
      paymentStream(ctx, args),
      args,
      indexedDates,
    );
    const result = await stream.paginate(args.paginationOpts);

    return { ...result, page: await decoratePayments(ctx, result.page) };
  },
});

async function decoratePayments(ctx: QueryCtx, rows: Doc<"payments">[]) {
  const applicationIds = [
    ...new Set(
      rows
        .map((p) => p.applicationId)
        .filter((id): id is Id<"applications"> => !!id),
    ),
  ];
  const applications = await Promise.all(
    applicationIds.map((id) => ctx.db.get(id)),
  );
  const byId = new Map(
    applications
      .filter((a): a is Doc<"applications"> => a !== null)
      .map((a) => [a._id, a]),
  );

  return rows.map((payment) => {
    const application = payment.applicationId
      ? byId.get(payment.applicationId)
      : undefined;
    return {
      ...payment,
      applicationReference: application?.referenceId ?? null,
      customerName: application?.customerName ?? null,
      destinationName: application?.destinationName ?? null,
      netAmount: payment.amount - (payment.refundedAmount ?? 0),
    };
  });
}

/**
 * Finance dashboard totals, computed from real payment rows — nothing here is
 * hardcoded or estimated. Scans are bounded by `SCAN_LIMIT` and the result says
 * so when it had to stop early, rather than quietly under-reporting revenue.
 */
export const financeSummary = query({
  args: {
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PAYMENT_VIEW);

    const dateFrom = args.dateFrom ?? Date.now() - 90 * 24 * 60 * 60 * 1000;
    const dateTo = args.dateTo ?? Date.now();

    const statuses = [
      "paid",
      "partially_refunded",
      "refunded",
      "failed",
      "pending",
      "created",
    ] as const;

    const batches = await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query("payments")
          .withIndex("by_status_createdAt", (q) =>
            q.eq("status", status).gte("createdAt", dateFrom).lte("createdAt", dateTo),
          )
          .take(SCAN_LIMIT),
      ),
    );

    const rows = batches.flat();
    const truncated = batches.some((b) => b.length >= SCAN_LIMIT);

    const settled = rows.filter(
      (p) =>
        p.status === "paid" ||
        p.status === "refunded" ||
        p.status === "partially_refunded",
    );

    const collectedGross = settled.reduce((sum, p) => sum + p.amount, 0);
    const refunded = settled.reduce((sum, p) => sum + (p.refundedAmount ?? 0), 0);

    const failedRows = rows.filter((p) => p.status === "failed");
    const inFlightRows = rows.filter(
      (p) => p.status === "pending" || p.status === "created",
    );

    const byMode: Record<string, { count: number; amount: number }> = {};
    for (const payment of settled) {
      const entry = (byMode[payment.mode] ??= { count: 0, amount: 0 });
      entry.count += 1;
      entry.amount += payment.amount - (payment.refundedAmount ?? 0);
    }

    // Outstanding is an application-side figure: money invoiced but not yet
    // collected, which no payment row represents.
    const outstandingApplications = await ctx.db
      .query("applications")
      .withIndex("by_paymentStatus", (q) => q.eq("paymentStatus", "unpaid"))
      .take(SCAN_LIMIT);
    const partiallyPaid = await ctx.db
      .query("applications")
      .withIndex("by_paymentStatus", (q) => q.eq("paymentStatus", "partially_paid"))
      .take(SCAN_LIMIT);

    const outstanding = [...outstandingApplications, ...partiallyPaid]
      .filter(
        (a) =>
          !a.isDraft && a.status !== "cancelled" && a.paymentMode !== "free_consultation",
      )
      .reduce((sum, a) => sum + a.pricing.total, 0);

    const currency = settled[0]?.currency ?? "INR";

    return {
      currency,
      range: { from: dateFrom, to: dateTo },
      collections: {
        gross: collectedGross,
        net: collectedGross - refunded,
        count: settled.length,
      },
      refunds: {
        amount: refunded,
        count: settled.filter((p) => (p.refundedAmount ?? 0) > 0).length,
      },
      failed: {
        amount: failedRows.reduce((sum, p) => sum + p.amount, 0),
        count: failedRows.length,
      },
      inFlight: {
        amount: inFlightRows.reduce((sum, p) => sum + p.amount, 0),
        count: inFlightRows.length,
      },
      pending: {
        amount: outstanding,
        count: outstandingApplications.length + partiallyPaid.length,
      },
      byMode,
      truncated,
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                                   export                                   */
/* -------------------------------------------------------------------------- */

const EXPORT_LIMIT = 5000;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\r\n");
}

export const exportRows = internalQuery({
  args: paymentFilterArgs,
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PAYMENT_EXPORT);

    const indexedDates = !args.applicationId && !args.userId;
    const stream = applyPaymentFilters(
      paymentStream(ctx, args),
      args,
      indexedDates,
    );
    const rows: Doc<"payments">[] = await stream.take(EXPORT_LIMIT);
    const decorated = await decoratePayments(ctx, rows);

    return decorated.map((p) => ({
      receiptNumber: p.receiptNumber,
      applicationReference: p.applicationReference ?? "",
      customerName: p.customerName ?? "",
      amount: p.amount,
      refundedAmount: p.refundedAmount ?? 0,
      netAmount: p.netAmount,
      currency: p.currency,
      mode: p.mode,
      status: p.status,
      razorpayOrderId: p.razorpayOrderId ?? "",
      razorpayPaymentId: p.razorpayPaymentId ?? "",
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : "",
      paidAt: p.paidAt ? new Date(p.paidAt).toISOString() : "",
      refundedAt: p.refundedAt ? new Date(p.refundedAt).toISOString() : "",
    }));
  },
});

type PaymentExportRow = {
  receiptNumber: string;
  applicationReference: string;
  customerName: string;
  amount: number;
  refundedAmount: number;
  netAmount: number;
  currency: string;
  mode: string;
  status: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  createdAt: string;
  paidAt: string;
  refundedAt: string;
};

export const exportCsv = action({
  args: paymentFilterArgs,
  returns: v.object({ csv: v.string(), rowCount: v.number(), truncated: v.boolean() }),
  handler: async (ctx, args) => {
    const rows: PaymentExportRow[] = await ctx.runQuery(
      internal.payments.exportRows,
      args,
    );

    const headers = [
      "Receipt",
      "Application",
      "Customer",
      "Amount (minor units)",
      "Refunded (minor units)",
      "Net (minor units)",
      "Currency",
      "Mode",
      "Status",
      "Razorpay order",
      "Razorpay payment",
      "Created at",
      "Paid at",
      "Refunded at",
    ];

    const csv = toCsv(
      headers,
      rows.map((r) => [
        r.receiptNumber,
        r.applicationReference,
        r.customerName,
        r.amount,
        r.refundedAmount,
        r.netAmount,
        r.currency,
        r.mode,
        r.status,
        r.razorpayOrderId,
        r.razorpayPaymentId,
        r.createdAt,
        r.paidAt,
        r.refundedAt,
      ]),
    );

    return { csv, rowCount: rows.length, truncated: rows.length >= EXPORT_LIMIT };
  },
});
