/**
 * Razorpay Checkout — client side only.
 *
 * This module loads the hosted checkout script and opens it. It holds no
 * secrets: the key id it receives is the publishable one, and the order was
 * created server-side by `payments.createRazorpayOrder`, which recomputed the
 * amount from the catalogue. Everything this file returns is treated as
 * unverified until `payments.verifyRazorpayPayment` checks the signature.
 */

const CHECKOUT_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

export interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayFailureResponse {
  error: {
    code: string;
    description: string;
    source?: string;
    step?: string;
    reason?: string;
    metadata?: { order_id?: string; payment_id?: string };
  };
}

export interface RazorpayCheckoutOptions {
  key: string;
  /** Smallest currency unit (paise) — matches what the backend stores. */
  amount: number;
  currency: string;
  name: string;
  description?: string;
  image?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  modal?: { ondismiss?: () => void; confirm_close?: boolean; escape?: boolean };
  handler?: (response: RazorpaySuccessResponse) => void;
}

interface RazorpayInstance {
  open: () => void;
  close: () => void;
  on: (event: "payment.failed", handler: (r: RazorpayFailureResponse) => void) => void;
}

type RazorpayConstructor = new (options: RazorpayCheckoutOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loader: Promise<RazorpayConstructor> | null = null;

/**
 * Inject the checkout script once and resolve with the global constructor.
 * Concurrent callers share one in-flight load; a failed load clears the cache
 * so a retry (after the network comes back) can succeed.
 */
export function loadRazorpayScript(): Promise<RazorpayConstructor> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("Razorpay Checkout can only be opened in the browser."),
    );
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loader) return loader;

  loader = new Promise<RazorpayConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CHECKOUT_SCRIPT_URL}"]`,
    );

    const onLoad = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error("Razorpay Checkout loaded but did not initialise."));
    };
    const onError = () => reject(new Error("Could not load Razorpay Checkout."));

    if (existing) {
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", onError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT_URL;
    script.async = true;
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    document.body.appendChild(script);
  }).catch((error: unknown) => {
    loader = null;
    throw error;
  });

  return loader;
}

export type CheckoutOutcome =
  | { status: "success"; response: RazorpaySuccessResponse }
  | { status: "failed"; error: RazorpayFailureResponse["error"] }
  | { status: "dismissed" };

export interface OpenCheckoutInput {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name?: string;
  description?: string;
  image?: string;
  prefill?: { name?: string; email?: string; contact?: string | null };
  notes?: Record<string, string>;
  themeColor?: string;
}

/**
 * Open checkout and resolve once the customer leaves it, however they leave.
 *
 * Resolving (rather than rejecting) on failure and dismissal keeps the calling
 * component's control flow linear: a `success` outcome still has to be handed
 * to `verifyRazorpayPayment` before anything is treated as paid.
 */
export async function openRazorpayCheckout(
  input: OpenCheckoutInput,
): Promise<CheckoutOutcome> {
  const Razorpay = await loadRazorpayScript();

  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    const settle = (outcome: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const checkout = new Razorpay({
      key: input.keyId,
      amount: input.amount,
      currency: input.currency,
      name: input.name ?? "VisaDrive",
      description: input.description,
      image: input.image,
      order_id: input.orderId,
      prefill: {
        name: input.prefill?.name,
        email: input.prefill?.email,
        contact: input.prefill?.contact ?? undefined,
      },
      notes: input.notes,
      theme: { color: input.themeColor ?? "#D82828" },
      modal: {
        confirm_close: true,
        ondismiss: () => settle({ status: "dismissed" }),
      },
      handler: (response) => settle({ status: "success", response }),
    });

    checkout.on("payment.failed", (failure) =>
      settle({ status: "failed", error: failure.error }),
    );

    checkout.open();
  });
}
