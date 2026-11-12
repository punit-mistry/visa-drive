import { z } from "zod";

/* ============================================================================
 * Meta webhook payload -> a minimal, typed list of items.
 *
 * Only what the bot needs survives: wamid, sender number, profile name, the
 * text or button id, and the *type* of any media. Media ids/urls, locations,
 * contacts and every other field are dropped here and never stored.
 * ========================================================================== */

const MAX_TEXT = 4096;
const MAX_ITEMS = 100;

const messageSchema = z.object({
  from: z.string(),
  id: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  interactive: z
    .object({
      type: z.string().optional(),
      button_reply: z.object({ id: z.string(), title: z.string().optional() }).optional(),
      list_reply: z.object({ id: z.string(), title: z.string().optional() }).optional(),
    })
    .optional(),
  button: z.object({ text: z.string().optional(), payload: z.string().optional() }).optional(),
});

const statusSchema = z.object({
  id: z.string(),
  status: z.string(),
  errors: z
    .array(z.object({ code: z.union([z.number(), z.string()]).optional(), title: z.string().optional() }))
    .optional(),
});

// Messages and statuses are validated one by one (below) so a single malformed
// item cannot fail the whole batch.
const valueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string().optional() }).optional(),
  contacts: z
    .array(z.object({ profile: z.object({ name: z.string().optional() }).optional(), wa_id: z.string().optional() }))
    .optional(),
  messages: z.array(z.unknown()).optional(),
  statuses: z.array(z.unknown()).optional(),
});

export const webhookPayloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({ changes: z.array(z.object({ value: valueSchema })) })),
});

export type IngestMessage =
  | { type: "text"; text: string }
  | { type: "interactive"; id: string; title?: string }
  | { type: "unsupported"; mediaType: string };

export type IngestItem =
  | { kind: "message"; wamid: string; from: string; profileName?: string; message: IngestMessage }
  | {
      kind: "status";
      wamid: string;
      status: "sent" | "delivered" | "read" | "failed";
      errorCode?: string;
      errorTitle?: string;
    };

const STATUSES = new Set(["sent", "delivered", "read", "failed"]);

export interface WebhookNormalisation {
  items: IngestItem[];
  /** Individually malformed messages/statuses that were skipped. */
  skipped: number;
  /** Valid items beyond the per-request cap; these are dropped, not deferred. */
  truncated: number;
  /** Items addressed to a different WhatsApp phone number id than ours. */
  foreign: number;
}

/** Returns null when the payload is not a valid WhatsApp Business webhook. */
export function normaliseWebhook(json: unknown): IngestItem[] | null {
  return normaliseWebhookDetailed(json)?.items ?? null;
}


/** As `normaliseWebhook`, plus counts of skipped and over-cap items. */
export function normaliseWebhookDetailed(
  json: unknown,
  /** When set, values addressed to a different phone number id are skipped. */
  expectedPhoneNumberId?: string,
): WebhookNormalisation | null {
  const parsed = webhookPayloadSchema.safeParse(json);
  if (!parsed.success) return null;

  const items: IngestItem[] = [];
  let skipped = 0;
  let foreign = 0;
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const value = change.value;
      const target = value.metadata?.phone_number_id;
      if (expectedPhoneNumberId && target && target !== expectedPhoneNumberId) {
        foreign += (value.messages?.length ?? 0) + (value.statuses?.length ?? 0);
        continue;
      }
      const names = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name.slice(0, 100));
      }

      for (const raw of value.messages ?? []) {
        const parsedMessage = messageSchema.safeParse(raw);
        if (!parsedMessage.success) {
          skipped += 1;
          continue;
        }
        const m = parsedMessage.data;
        let message: IngestMessage;
        if (m.type === "text" && m.text) {
          message = { type: "text", text: m.text.body.slice(0, MAX_TEXT) };
        } else if (m.type === "interactive" && m.interactive) {
          const reply = m.interactive.button_reply ?? m.interactive.list_reply;
          message = reply
            ? {
                type: "interactive",
                id: reply.id.slice(0, 200),
                ...(reply.title ? { title: reply.title.slice(0, 100) } : {}),
              }
            : { type: "unsupported", mediaType: "interactive" };
        } else if (m.type === "button" && (m.button?.text || m.button?.payload)) {
          message = { type: "text", text: (m.button.text ?? m.button.payload ?? "").slice(0, MAX_TEXT) };
        } else {
          message = { type: "unsupported", mediaType: m.type.replace(/[^a-z_]/gi, "").slice(0, 30) || "unknown" };
        }
        items.push({ kind: "message", wamid: m.id, from: m.from, profileName: names.get(m.from), message });
      }

      for (const raw of value.statuses ?? []) {
        const parsedStatus = statusSchema.safeParse(raw);
        if (!parsedStatus.success) {
          skipped += 1;
          continue;
        }
        const s = parsedStatus.data;
        if (!STATUSES.has(s.status)) continue;
        const err = s.errors?.[0];
        items.push({
          kind: "status",
          wamid: s.id,
          status: s.status as "sent" | "delivered" | "read" | "failed",
          ...(err?.code !== undefined ? { errorCode: String(err.code).slice(0, 20) } : {}),
          ...(err?.title ? { errorTitle: err.title.slice(0, 100) } : {}),
        });
      }
    }
  }
  return {
    items: items.slice(0, MAX_ITEMS),
    skipped,
    truncated: Math.max(0, items.length - MAX_ITEMS),
    foreign,
  };
}
