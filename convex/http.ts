import { httpRouter } from "convex/server";
import { Webhook } from "svix";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { hmacSha256Hex, timingSafeEqual } from "./lib/crypto";
import { normaliseWebhookDetailed } from "../lib/whatsapp/webhook";

/* ============================================================================
 * HTTP endpoints.
 *
 * Everything that reaches Convex from the outside world lands here. The one
 * rule that matters: a request is never acted on before its signature has been
 * verified. An unverified Razorpay event in particular would let anyone mark
 * an application paid, so a missing secret fails closed (503) rather than
 * falling back to trusting the body.
 * ========================================================================== */

/**
 * Cross-module calls use the generated `internal` reference directly, so a
 * change to one of these handlers argument shapes breaks the build here
 * rather than at runtime inside a webhook nobody is watching.
 */

const http = httpRouter();

/* -------------------------------------------------------------------------- */
/*                                   health                                   */
/* -------------------------------------------------------------------------- */

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({ status: "ok", service: "visadrive-convex", at: Date.now() }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }),
});

/* -------------------------------------------------------------------------- */
/*                                Clerk webhook                               */
/* -------------------------------------------------------------------------- */

interface ClerkEmailAddress {
  id?: string;
  email_address?: string;
  verification?: { status?: string } | null;
}

interface ClerkPhoneNumber {
  id?: string;
  phone_number?: string;
}

interface ClerkUserData {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  image_url?: string | null;
  primary_email_address_id?: string | null;
  primary_phone_number_id?: string | null;
  email_addresses?: ClerkEmailAddress[];
  phone_numbers?: ClerkPhoneNumber[];
  deleted?: boolean;
}

interface ClerkWebhookEvent {
  type?: string;
  data?: ClerkUserData;
}

/** Clerk sends every address it knows; the primary one is the account email. */
function pickPrimaryEmail(data: ClerkUserData): ClerkEmailAddress | undefined {
  const addresses = data.email_addresses ?? [];
  if (addresses.length === 0) return undefined;
  return (
    addresses.find((a) => a.id === data.primary_email_address_id) ?? addresses[0]
  );
}

function pickPrimaryPhone(data: ClerkUserData): string | undefined {
  const phones = data.phone_numbers ?? [];
  if (phones.length === 0) return undefined;
  const primary =
    phones.find((p) => p.id === data.primary_phone_number_id) ?? phones[0];
  return primary?.phone_number ?? undefined;
}

function buildFullName(data: ClerkUserData, fallback: string): string {
  const name = [data.first_name, data.last_name]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .join(" ")
    .trim();
  return name || data.username?.trim() || fallback;
}

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET is not set");
      return new Response("Webhook not configured", { status: 503 });
    }

    const payload = await request.text();
    const headers = {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    };

    let event: ClerkWebhookEvent;
    try {
      // Svix verifies the signature AND the timestamp, which is what makes a
      // captured payload unusable as a replay.
      //
      // svix v2's `verify()` only *checks* the request - it does not return
      // the parsed body any more, so the payload is parsed separately below.
      new Webhook(secret).verify(payload, headers);
    } catch (error) {
      console.error("[clerk-webhook] signature verification failed", error);
      return new Response("Invalid signature", { status: 400 });
    }

    try {
      event = JSON.parse(payload) as ClerkWebhookEvent;
    } catch (error) {
      console.error("[clerk-webhook] body was not JSON", error);
      return new Response("Invalid payload", { status: 400 });
    }

    const data = event.data ?? {};
    const clerkId = data.id;

    if (!clerkId) {
      console.error("[clerk-webhook] event had no user id", event.type);
      return new Response("Missing user id", { status: 400 });
    }

    try {
      switch (event.type) {
        case "user.created":
        case "user.updated": {
          const primaryEmail = pickPrimaryEmail(data);
          const email = primaryEmail?.email_address;

          if (!email) {
            // Nothing to key the profile on. Acknowledge so Clerk stops
            // retrying an event we can never process.
            console.error("[clerk-webhook] user event with no email", clerkId);
            return new Response("No email address on user", { status: 200 });
          }

          await ctx.runMutation(internal.users.upsertFromClerk, {
            clerkId,
            email,
            fullName: buildFullName(data, email.split("@")[0]),
            avatarUrl: data.image_url ?? undefined,
            phone: pickPrimaryPhone(data),
            emailVerified: primaryEmail?.verification?.status === "verified",
          });
          break;
        }

        case "user.deleted": {
          await ctx.runMutation(internal.users.deleteFromClerk, { clerkId });
          break;
        }

        default:
          // Other Clerk events (sessions, organisations) are not used here.
          break;
      }
    } catch (error) {
      // A 500 makes Clerk retry; the mutations above are idempotent, so that
      // is the right outcome for a transient failure.
      console.error("[clerk-webhook] handler failed", event.type, error);
      return new Response("Handler error", { status: 500 });
    }

    return new Response(null, { status: 200 });
  }),
});

/* -------------------------------------------------------------------------- */
/*                              Razorpay webhook                              */
/* -------------------------------------------------------------------------- */

http.route({
  path: "/razorpay-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Fail closed. An unverified payment event must never reach the ledger,
    // so a missing secret is an outage, not a reason to trust the body.
    if (!secret) {
      console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET is not set");
      return new Response("Webhook not configured", { status: 503 });
    }

    const signature = request.headers.get("x-razorpay-signature");
    if (!signature) {
      return new Response("Missing signature", { status: 400 });
    }

    // Razorpay signs the exact bytes it sent, so the raw body is hashed before
    // it is parsed - re-serialising JSON would change the signature.
    const body = await request.text();

    let expected: string;
    try {
      expected = await hmacSha256Hex(secret, body);
    } catch (error) {
      console.error("[razorpay-webhook] could not compute HMAC", error);
      return new Response("Handler error", { status: 500 });
    }

    if (!timingSafeEqual(expected, signature.trim().toLowerCase())) {
      console.error("[razorpay-webhook] signature mismatch");
      return new Response("Invalid signature", { status: 400 });
    }

    let event: { event?: string; payload?: unknown; created_at?: number };
    try {
      event = JSON.parse(body);
    } catch (error) {
      console.error("[razorpay-webhook] body was not JSON", error);
      return new Response("Invalid payload", { status: 400 });
    }

    if (!event.event) {
      return new Response("Missing event name", { status: 400 });
    }

    try {
      // `payments.handleWebhookEvent` is the authoritative paid signal and is
      // idempotent on the provider event id.
      //
      // It accepts either a raw `body` + `signature` (verifying itself) or an
      // already-verified `payload`. The signature was checked above against
      // the exact bytes Razorpay sent, so the parsed event is handed over
      // directly rather than hashing the same body a second time. `payload`
      // is the WHOLE event object — the handler reads `payload.event` and
      // `payload.payload.payment.entity` from it.
      const result = await ctx.runAction(internal.payments.handleWebhookEvent, {
        payload: event,
        eventId: request.headers.get("x-razorpay-event-id") ?? undefined,
      });

      // A payload we verified but could not act on is a bad request, not a
      // transient failure — retrying it would never succeed.
      if (
        !result.handled &&
        result.outcome !== null &&
        ["unparseable", "empty", "incomplete_payload"].includes(result.outcome)
      ) {
        console.error("[razorpay-webhook] unusable payload", result.outcome);
        return new Response("Unusable payload", { status: 400 });
      }

      return new Response(JSON.stringify({ received: true, ...result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (error) {
      // 500 so Razorpay retries; the handler dedupes on the event id.
      console.error("[razorpay-webhook] handler failed", event.event, error);
      return new Response("Handler error", { status: 500 });
    }
  }),
});

/* -------------------------------------------------------------------------- */
/*                              WhatsApp webhook                              */
/* -------------------------------------------------------------------------- */

// GET: Meta's one-off subscription handshake. The verify token is compared in
// constant time; nothing about the request is logged.
http.route({
  path: "/whatsapp-webhook",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!expected) {
      console.error("[whatsapp-webhook] WHATSAPP_VERIFY_TOKEN is not set");
      return new Response("Webhook not configured", { status: 503 });
    }
    const params = new URL(request.url).searchParams;
    const mode = params.get("hub.mode");
    const token = params.get("hub.verify_token") ?? "";
    const challenge = params.get("hub.challenge");
    if (mode === "subscribe" && challenge !== null && timingSafeEqual(token, expected)) {
      return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }),
});

// POST: nothing is parsed or acted on until the HMAC of the RAW body matches
// `x-hub-signature-256`. Verified payloads are reduced to a minimal item list
// and handed to ONE mutation, which dedupes and schedules the real work, so
// Meta gets its 200 immediately. Bodies, tokens and phone numbers are never
// logged.
http.route({
  path: "/whatsapp-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret) {
      console.error("[whatsapp-webhook] WHATSAPP_APP_SECRET is not set");
      return new Response("Webhook not configured", { status: 503 });
    }

    const header = request.headers.get("x-hub-signature-256");
    if (!header || !header.startsWith("sha256=")) {
      return new Response("Missing signature", { status: 401 });
    }

    // Sign-check the exact bytes Meta sent; decode to text only once verified.
    const rawBody = await request.arrayBuffer();

    let expected: string;
    try {
      expected = await hmacSha256Hex(secret, rawBody);
    } catch {
      console.error("[whatsapp-webhook] could not compute HMAC");
      return new Response("Handler error", { status: 500 });
    }
    if (!timingSafeEqual(expected, header.slice("sha256=".length).trim().toLowerCase())) {
      console.error("[whatsapp-webhook] signature mismatch");
      return new Response("Invalid signature", { status: 401 });
    }

    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return new Response("Invalid payload", { status: 400 });
    }
    const normalised = normaliseWebhookDetailed(json, process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || undefined);
    if (normalised === null) {
      return new Response("Invalid payload", { status: 400 });
    }
    const { items } = normalised;
    if (items.length === 0 && normalised.foreign > 0) {
      // Everything was addressed to another phone number id: almost certainly
      // a wrong WHATSAPP_PHONE_NUMBER_ID. Fail loudly so Meta retries.
      console.error(
        `[whatsapp-webhook] all ${normalised.foreign} item(s) were for another phone number id; check WHATSAPP_PHONE_NUMBER_ID`,
      );
      return new Response("Handler error", { status: 500 });
    }
    if (normalised.skipped > 0 || normalised.truncated > 0 || normalised.foreign > 0) {
      // Counts only — never the content.
      console.warn(
        `[whatsapp-webhook] skipped ${normalised.skipped} malformed, dropped ${normalised.truncated} over the 100-item cap, ignored ${normalised.foreign} for another phone number id`,
      );
    }

    try {
      if (items.length > 0) {
        await ctx.runMutation(internal.whatsapp.ingestWebhook, { items });
      }
    } catch {
      // 500 makes Meta retry; ingest dedupes on the wamid.
      console.error("[whatsapp-webhook] ingest failed");
      return new Response("Handler error", { status: 500 });
    }
    return new Response(null, { status: 200 });
  }),
});

export default http;
