import { normaliseWhatsAppNumber } from "../notifications/whatsapp";
import type { OutboundMessage } from "./types";

/* ============================================================================
 * Thin typed wrapper over the WhatsApp Cloud API `messages` endpoint.
 *
 * Shares the number normalisation and pinned Graph version with
 * `convex/notifications.ts`. The access token is only ever placed in the
 * Authorization header; errors are reduced to a short code + title so neither
 * the token nor a raw response can reach the database or the logs.
 * ========================================================================== */

export { normaliseWhatsAppNumber };

/** What can be sent: an engine message, or a pre-approved template (no params). */
export type OutboundPayload =
  | OutboundMessage
  | { type: "template"; name: string; language: string };

export function graphMessagesUrl(version: string, phoneNumberId: string): string {
  return `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`;
}

/** Map a payload to the Graph API request body. */
export function toGraphBody(to: string, payload: OutboundPayload): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  switch (payload.type) {
    case "text":
      return { ...base, type: "text", text: { preview_url: true, body: payload.body } };
    case "buttons":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: payload.body },
          action: {
            buttons: payload.buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })),
          },
        },
      };
    case "list":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: payload.body },
          action: {
            button: payload.buttonLabel,
            sections: [
              {
                title: "Options",
                rows: payload.rows.map((r) => ({
                  id: r.id,
                  title: r.title,
                  ...(r.description ? { description: r.description } : {}),
                })),
              },
            ],
          },
        },
      };
    case "template":
      return {
        ...base,
        type: "template",
        template: { name: payload.name, language: { code: payload.language } },
      };
  }
}

/** Plain-text rendering of a payload, for the staff-visible thread. */
export function renderPayloadText(payload: OutboundPayload): string {
  switch (payload.type) {
    case "text":
      return payload.body;
    case "buttons":
      return [payload.body, ...payload.buttons.map((b) => `• ${b.title}`)].join("\n");
    case "list":
      return [payload.body, ...payload.rows.map((r, i) => `${i + 1}. ${r.title}`)].join("\n");
    case "template":
      return `[template: ${payload.name}]`;
  }
}

export type GraphSendResult =
  | { ok: true; wamid: string }
  | { ok: false; retryable: boolean; code: string; title: string };

function safe(text: string, token: string): string {
  const cleaned = token ? text.split(token).join("[redacted]") : text;
  return cleaned.replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, 100);
}

export async function sendGraphMessage(args: {
  token: string;
  phoneNumberId: string;
  version: string;
  to: string;
  payload: OutboundPayload;
}): Promise<GraphSendResult> {
  let response: Response;
  try {
    response = await fetch(graphMessagesUrl(args.version, args.phoneNumberId), {
      method: "POST",
      headers: { Authorization: `Bearer ${args.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(toGraphBody(args.to, args.payload)),
    });
  } catch {
    // Deliberately no error text: it could echo the request.
    return { ok: false, retryable: true, code: "NETWORK", title: "Network error" };
  }

  if (response.ok) {
    try {
      const json = (await response.json()) as { messages?: { id?: string }[] };
      const wamid = json.messages?.[0]?.id;
      if (wamid) return { ok: true, wamid };
    } catch {
      /* fall through */
    }
    return { ok: false, retryable: false, code: "BAD_RESPONSE", title: "No message id in response" };
  }

  let code = String(response.status);
  let title = "Request failed";
  try {
    const json = (await response.json()) as { error?: { code?: number; message?: string } };
    if (json.error?.code !== undefined) code = `${response.status}/${json.error.code}`;
    if (json.error?.message) title = safe(json.error.message, args.token);
  } catch {
    /* keep defaults */
  }
  const retryable = response.status === 429 || response.status >= 500;
  return { ok: false, retryable, code: code.slice(0, 20), title };
}
