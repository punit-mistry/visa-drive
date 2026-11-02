"use node";

import { ConvexError, v } from "convex/values";
import Razorpay from "razorpay";
import { internalAction } from "./_generated/server";

/* ============================================================================
 * Razorpay calls that need the Node runtime.
 *
 * The `razorpay` npm package is CommonJS and pulls in Node built-ins, so it can
 * only be imported from a `"use node"` module — and a `"use node"` module can
 * only export actions, never mutations. `payments.ts` therefore keeps all the
 * database logic and reaches in here through `internal.payments_node.*`.
 *
 * Nothing in this file decides what to charge. It is handed an amount that
 * `payments.prepareOrderInternal` already recomputed from the catalogue.
 * ========================================================================== */

function client(): Razorpay {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    throw new ConvexError({
      code: "PAYMENT_NOT_CONFIGURED",
      message:
        "Online payments are not configured yet. The VisaDrive team will send you payment instructions.",
    });
  }

  return new Razorpay({ key_id, key_secret });
}

export const createOrder = internalAction({
  args: {
    /** Smallest currency unit (paise). Our storage unit already matches. */
    amount: v.number(),
    currency: v.string(),
    receipt: v.string(),
    notes: v.optional(v.record(v.string(), v.string())),
  },
  returns: v.object({
    orderId: v.string(),
    amount: v.number(),
    currency: v.string(),
    status: v.string(),
  }),
  handler: async (_ctx, args) => {
    if (!Number.isInteger(args.amount) || args.amount <= 0) {
      throw new ConvexError({
        code: "INVALID_AMOUNT",
        message: "A payment amount must be a positive whole number of paise.",
      });
    }

    const razorpay = client();

    try {
      const order = await razorpay.orders.create({
        amount: args.amount,
        currency: args.currency,
        // Our receipt number travels with the order so a gateway-side
        // reconciliation can be matched back to a row in `payments`.
        receipt: args.receipt,
        notes: args.notes,
      });

      return {
        orderId: String(order.id),
        amount: Number(order.amount),
        currency: String(order.currency),
        status: String(order.status),
      };
    } catch (error: unknown) {
      const description =
        (error as { error?: { description?: string } })?.error?.description ??
        (error as Error)?.message ??
        "Unknown gateway error";
      console.error("[payments_node] order creation failed", description);
      throw new ConvexError({
        code: "PAYMENT_GATEWAY_ERROR",
        message: `We could not start the payment: ${description}`,
      });
    }
  },
});

/**
 * Read one payment back from Razorpay. Used for reconciliation when a webhook
 * arrives without a usable payload — never as a substitute for the signature
 * check, which stays in `payments.ts`.
 */
export const fetchPayment = internalAction({
  args: { razorpayPaymentId: v.string() },
  returns: v.object({
    id: v.string(),
    orderId: v.union(v.string(), v.null()),
    status: v.string(),
    amount: v.number(),
    currency: v.string(),
    method: v.union(v.string(), v.null()),
  }),
  handler: async (_ctx, args) => {
    const razorpay = client();

    try {
      const payment = await razorpay.payments.fetch(args.razorpayPaymentId);
      return {
        id: String(payment.id),
        orderId: payment.order_id ? String(payment.order_id) : null,
        status: String(payment.status),
        amount: Number(payment.amount),
        currency: String(payment.currency),
        method: payment.method ? String(payment.method) : null,
      };
    } catch (error: unknown) {
      const description =
        (error as { error?: { description?: string } })?.error?.description ??
        (error as Error)?.message ??
        "Unknown gateway error";
      throw new ConvexError({
        code: "PAYMENT_GATEWAY_ERROR",
        message: `Could not read that payment from Razorpay: ${description}`,
      });
    }
  },
});
