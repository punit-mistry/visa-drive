/* ============================================================================
 * WhatsApp send policy — pure, no I/O, so it is testable without Convex.
 *
 * Three independent gates, checked before every outbound message:
 *   (a) the contact has not opted out,
 *   (b) demo mode only ever messages numbers on an explicit allow-list,
 *   (c) free-form text only inside Meta's 24-hour customer-service window;
 *       outside it only a pre-approved template whose name is configured.
 * ========================================================================== */

export const WINDOW_MS = 24 * 60 * 60 * 1000;

export type SendRefusalCode = "OPTED_OUT" | "DEMO_RECIPIENT_BLOCKED" | "WINDOW_CLOSED";

export interface WhatsAppEnv {
  demoMode: boolean;
  /** Digits-only numbers allowed to receive messages in demo mode. */
  testRecipients: string[];
  graphVersion: string;
  /** Pre-approved template for handoff follow-ups; undefined when unconfigured. */
  templateHandoffName?: string;
  templateLanguage: string;
  botEnvEnabled: boolean;
}

export const DEFAULT_GRAPH_VERSION = "v21.0";

type EnvLike = Record<string, string | undefined>;

/** Parse the WhatsApp-related Convex env vars. Never reads the access token. */
export function readWhatsAppEnv(env: EnvLike): WhatsAppEnv {
  return {
    demoMode: env.WHATSAPP_DEMO_MODE === "true",
    testRecipients: parseRecipients(env.WHATSAPP_TEST_RECIPIENTS),
    graphVersion: env.WHATSAPP_GRAPH_API_VERSION?.trim() || DEFAULT_GRAPH_VERSION,
    templateHandoffName: env.WHATSAPP_TEMPLATE_HANDOFF_NAME?.trim() || undefined,
    templateLanguage: env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en",
    botEnvEnabled: env.WHATSAPP_BOT_ENABLED === "true",
  };
}

export function parseRecipients(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((n) => n.replace(/\D/g, ""))
    .filter((n) => n.length >= 7);
}

export interface SendCheckInput {
  waId: string;
  optedOut: boolean;
  /** Epoch ms of the contact's last inbound message. */
  lastInboundAt: number | undefined;
  now: number;
  env: Pick<WhatsAppEnv, "demoMode" | "testRecipients">;
  /** True when a configured template will be used instead of free-form text. */
  usingTemplate?: boolean;
  /**
   * The one reply allowed to an opted-out contact: the confirmation of their
   * own STOP request. Every other message to them is refused.
   */
  optOutAcknowledgement?: boolean;
}

export type SendDecision =
  | { ok: true }
  | { ok: false; code: SendRefusalCode; message: string };

export function isWindowOpen(lastInboundAt: number | undefined, now: number): boolean {
  return lastInboundAt !== undefined && now - lastInboundAt < WINDOW_MS;
}

export function checkSendPolicy(input: SendCheckInput): SendDecision {
  if (input.optedOut && !input.optOutAcknowledgement) {
    return { ok: false, code: "OPTED_OUT", message: "This contact has opted out of WhatsApp messages." };
  }
  if (input.env.demoMode && !input.env.testRecipients.includes(input.waId)) {
    return {
      ok: false,
      code: "DEMO_RECIPIENT_BLOCKED",
      message: "Demo mode is on and this number is not on the test-recipient list.",
    };
  }
  if (!input.usingTemplate && !isWindowOpen(input.lastInboundAt, input.now)) {
    return {
      ok: false,
      code: "WINDOW_CLOSED",
      message:
        "The 24-hour WhatsApp reply window has closed. Free-form messages can only be sent within 24 hours of the customer's last message.",
    };
  }
  return { ok: true };
}

/** Last ten digits — how Indian mobile numbers are compared across formats. */
export function lastTenDigits(value: string | undefined | null): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Backoff delays after attempt 1, 2 and 3. After attempt 4 the message fails. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000] as const;
export const MAX_SEND_ATTEMPTS = 4;

/** Delay before the next attempt, or null when `attemptsMade` is the last. */
export function retryDelayMs(attemptsMade: number): number | null {
  if (attemptsMade >= MAX_SEND_ATTEMPTS) return null;
  return RETRY_DELAYS_MS[attemptsMade - 1] ?? null;
}
