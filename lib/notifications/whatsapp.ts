/**
 * WhatsApp message-body builders.
 *
 * These produce the *text* of a WhatsApp Business Cloud API message. They do
 * not call the API — `convex/notifications.ts` (`sendWhatsApp`) does that.
 *
 * Practical rules baked in here:
 *
 *  - WhatsApp is a phone screen. Keep it to a few short lines, lead with the
 *    thing the customer must know, and put the link last so it is tappable
 *    without scrolling.
 *  - Formatting is WhatsApp's own markup: `*bold*`, `_italic_`, `` ```mono``` ``.
 *    HTML does nothing. Markdown links do nothing either — a bare URL is what
 *    gets linkified.
 *  - A free-form text message can only be delivered inside the 24-hour
 *    customer-service window. Outside it Meta requires a pre-approved
 *    template, which has to be registered in the WhatsApp Manager first. See
 *    `WHATSAPP_TEMPLATE_HINTS` for the per-event mapping we expect to register;
 *    until those exist, `sendWhatsApp` sends free-form text and records the
 *    API's rejection in `deliveryError` rather than failing the mutation.
 *  - The hard cap on a text body is 4096 characters. We clamp well below it.
 */

import { LEGAL, SITE } from "../constants/site";
import { formatMoney } from "../helpers/pricing";

/** Comfortably below WhatsApp's 4096-character limit for a text body. */
export const WHATSAPP_MAX_BODY = 1024;

/* -------------------------------------------------------------------------- */
/*                               Phone numbers                                */
/* -------------------------------------------------------------------------- */

/**
 * Normalise a stored phone number into the digits-only international form the
 * Cloud API expects in `to` (no `+`, no spaces, no leading zeros).
 *
 * Indian numbers are stored in several shapes across the CRM (`+91 77100
 * 20694`, `07710020694`, `7710020694`), so a ten-digit local number is
 * assumed to be Indian and gets the 91 country code. Anything that does not
 * resolve to a plausible international number returns null and the WhatsApp
 * channel is skipped — better a missing message than one sent to a stranger.
 */
export function normaliseWhatsAppNumber(
  raw: string | undefined | null,
  defaultCountryCode = "91",
): string | null {
  if (!raw) return null;

  const hadPlus = String(raw).trim().startsWith("+");
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;

  // "0771002..." — a national trunk prefix, never part of the E.164 number.
  while (digits.startsWith("0")) digits = digits.slice(1);

  if (!hadPlus && digits.length === 10) {
    digits = `${defaultCountryCode}${digits}`;
  }

  // E.164 allows up to 15 digits; fewer than 8 cannot be a mobile number.
  if (digits.length < 8 || digits.length > 15) return null;

  return digits;
}

/** `wa.me` deep link for "message us" buttons in the UI. */
export function whatsAppDeepLink(text?: string): string {
  const to = normaliseWhatsAppNumber(SITE.contact.whatsapp) ?? "";
  const query = text ? `?text=${encodeURIComponent(clampBody(text, 600))}` : "";
  return `https://wa.me/${to}${query}`;
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

function clampBody(value: string, max = WHATSAPP_MAX_BODY): string {
  const text = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function firstName(name: string | undefined): string {
  if (!name) return "there";
  const first = String(name).trim().split(/\s+/)[0];
  return first || "there";
}

function line(value: string | undefined | null): string[] {
  return value ? [value] : [];
}

function compose(lines: (string | null | undefined)[]): string {
  return clampBody(lines.filter((l) => l !== null && l !== undefined).join("\n"));
}

function money(
  amount: number | undefined,
  currency: string | undefined,
  preformatted?: string,
): string | null {
  if (preformatted) return preformatted;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return formatMoney(amount, currency ?? SITE.defaultCurrency);
}

/** The sign-off every outbound message carries. */
const SIGNATURE = `— ${SITE.name}`;

export interface WhatsAppData {
  customerName?: string;
  recipientName?: string;
  referenceId?: string;
  destinationName?: string;
  visaProductName?: string;
  link?: string;
  applicationUrl?: string;

  amount?: number;
  amountFormatted?: string;
  currency?: string;
  payUrl?: string;
  dueDate?: number;

  statusLabel?: string;
  statusNote?: string;
  documentLabel?: string;
  documentLabels?: string[];
  rejectionReason?: string;
  reason?: string;

  conversationSubject?: string;
  agentName?: string;
  messagePreview?: string;

  title?: string;
  body?: string;

  [key: string]: unknown;
}

function link(data: WhatsAppData, fallbackPath: string): string | null {
  const raw = data.applicationUrl ?? data.link;
  if (raw && /^https?:\/\//i.test(String(raw))) return String(raw);
  if (raw && String(raw).startsWith("/")) {
    return `${SITE.url.replace(/\/$/, "")}${raw}`;
  }
  return `${SITE.url.replace(/\/$/, "")}${fallbackPath}`;
}

function refSuffix(data: WhatsAppData): string | null {
  return data.referenceId ? `Reference: *${data.referenceId}*` : null;
}

/* -------------------------------------------------------------------------- */
/*                                  Builders                                  */
/* -------------------------------------------------------------------------- */

export function bookingSubmittedMessage(data: WhatsAppData): string {
  return compose([
    `Hi ${firstName(data.customerName ?? data.recipientName)}, thank you for choosing ${SITE.name}.`,
    "",
    `We have received your application${
      data.destinationName ? ` for *${data.destinationName}*` : ""
    } and our team has started reviewing it.`,
    refSuffix(data),
    "",
    `Track it here: ${link(data, "/dashboard/applications")}`,
    "",
    SIGNATURE,
  ]);
}

export function paymentReceivedMessage(data: WhatsAppData): string {
  const amount = money(data.amount, data.currency, data.amountFormatted);
  return compose([
    `Hi ${firstName(data.customerName ?? data.recipientName)}, we have received your payment${
      amount ? ` of *${amount}*` : ""
    }. Thank you.`,
    refSuffix(data),
    "",
    `Your receipt is in your portal: ${link(data, "/dashboard/payments")}`,
    "",
    SIGNATURE,
  ]);
}

export function paymentRequestedMessage(data: WhatsAppData): string {
  const amount = money(data.amount, data.currency, data.amountFormatted);
  return compose([
    `Hi ${firstName(data.customerName ?? data.recipientName)}, your appointment is confirmed, so our service fee${
      amount ? ` of *${amount}*` : ""
    } is now due.`,
    refSuffix(data),
    "",
    `Pay securely here: ${
      data.payUrl && /^https?:\/\//i.test(String(data.payUrl))
        ? data.payUrl
        : link(data, "/dashboard/payments")
    }`,
    "",
    `_${LEGAL.governmentFeesSeparate}_`,
    "",
    SIGNATURE,
  ]);
}

export function paymentFailedMessage(data: WhatsAppData): string {
  const amount = money(data.amount, data.currency, data.amountFormatted);
  return compose([
    `Hi ${firstName(data.customerName ?? data.recipientName)}, your payment${
      amount ? ` of *${amount}*` : ""
    } did not go through. No money has been taken.`,
    ...line(data.reason ? `Reason: ${data.reason}` : null),
    "",
    `You can try again here: ${link(data, "/dashboard/payments")}`,
    `Need help? Call us on ${SITE.contact.phonePrimaryDisplay}.`,
    "",
    SIGNATURE,
  ]);
}

export function documentRejectedMessage(data: WhatsAppData): string {
  return compose([
    `Hi ${firstName(data.customerName ?? data.recipientName)}, *${
      data.documentLabel ?? "one of your documents"
    }* could not be accepted and needs to be uploaded again.`,
    ...line(
      data.rejectionReason || data.reason
        ? `Reason: ${data.rejectionReason ?? data.reason}`
        : null,
    ),
    refSuffix(data),
    "",
    `Upload a replacement here: ${link(data, "/dashboard/documents")}`,
    "",
    SIGNATURE,
  ]);
}

export function additionalDocumentsRequestedMessage(data: WhatsAppData): string {
  const list = Array.isArray(data.documentLabels)
    ? data.documentLabels.filter(Boolean).slice(0, 8)
    : data.documentLabel
      ? [data.documentLabel]
      : [];

  return compose([
    `Hi ${firstName(data.customerName ?? data.recipientName)}, we need a few more documents before we can continue with your application.`,
    ...(list.length ? ["", ...list.map((item) => `• ${item}`)] : []),
    ...line(data.reason ? `\nNote from your agent: ${data.reason}` : null),
    refSuffix(data),
    "",
    `Upload them here: ${link(data, "/dashboard/documents")}`,
    "",
    SIGNATURE,
  ]);
}

export function applicationStatusChangedMessage(data: WhatsAppData): string {
  return compose([
    `Hi ${firstName(data.customerName ?? data.recipientName)}, there is an update on your application.`,
    "",
    `Status: *${data.statusLabel ?? "Updated"}*`,
    refSuffix(data),
    ...line(data.statusNote ? `\n${data.statusNote}` : null),
    "",
    `Full timeline: ${link(data, "/dashboard/applications")}`,
    "",
    SIGNATURE,
  ]);
}

export function applicationCompletedMessage(data: WhatsAppData): string {
  return compose([
    `Hi ${firstName(data.customerName ?? data.recipientName)}, your application is now *complete*. Thank you for trusting ${SITE.name}.`,
    refSuffix(data),
    "",
    `Any final documents are in your portal: ${link(data, "/dashboard/applications")}`,
    "",
    SIGNATURE,
  ]);
}

export function finalDocumentReadyMessage(data: WhatsAppData): string {
  return compose([
    `Hi ${firstName(data.customerName ?? data.recipientName)}, your final document is ready to download.`,
    refSuffix(data),
    "",
    `Sign in to download it: ${link(data, "/dashboard/applications")}`,
    "",
    `_For your security we never send visa documents as an attachment._`,
    "",
    SIGNATURE,
  ]);
}

export function adminRepliedMessage(data: WhatsAppData): string {
  return compose([
    `Hi ${firstName(data.customerName ?? data.recipientName)}, ${
      data.agentName ? `*${data.agentName}*` : `the ${SITE.name} team`
    } has replied to your message${
      data.conversationSubject ? ` about *${data.conversationSubject}*` : ""
    }.`,
    ...line(data.messagePreview ? `\n"${data.messagePreview}"` : null),
    "",
    `Read and reply here: ${link(data, "/dashboard/messages")}`,
    "",
    SIGNATURE,
  ]);
}

export function documentsReminderMessage(data: WhatsAppData): string {
  return compose([
    `Hi ${firstName(data.customerName ?? data.recipientName)}, a quick reminder — your application is waiting on documents from you.`,
    refSuffix(data),
    "",
    `Upload them here: ${link(data, "/dashboard/documents")}`,
    `Stuck? Call us on ${SITE.contact.phonePrimaryDisplay}.`,
    "",
    SIGNATURE,
  ]);
}

/**
 * Fallback: render the notification's own title and body. Used for any type
 * without a bespoke builder, so a new notification type still sends something
 * coherent rather than nothing.
 */
export function genericMessage(data: WhatsAppData): string {
  return compose([
    data.title ? `*${data.title}*` : null,
    data.body ?? null,
    data.link || data.applicationUrl ? `\n${link(data, "/dashboard")}` : null,
    "",
    SIGNATURE,
  ]);
}

/* -------------------------------------------------------------------------- */
/*                                  Registry                                  */
/* -------------------------------------------------------------------------- */

/** Keyed by the notification `type` from `lib/constants/notifications.ts`. */
export const WHATSAPP_BUILDERS: Record<string, (data: WhatsAppData) => string> = {
  "booking.submitted": bookingSubmittedMessage,
  "payment.received": paymentReceivedMessage,
  "payment.requested": paymentRequestedMessage,
  "payment.failed": paymentFailedMessage,
  "document.rejected": documentRejectedMessage,
  "documents.additional_requested": additionalDocumentsRequestedMessage,
  "application.status_changed": applicationStatusChangedMessage,
  "application.completed": applicationCompletedMessage,
  "application.final_document_ready": finalDocumentReadyMessage,
  "conversation.admin_replied": adminRepliedMessage,
  "application.documents_reminder": documentsReminderMessage,
};

/**
 * The pre-approved WhatsApp template names we expect to register in Meta's
 * WhatsApp Manager, one per event that can fall outside the 24-hour window.
 * Registering them is an operations task, not a code change — until then
 * `sendWhatsApp` falls back to free-form text.
 */
export const WHATSAPP_TEMPLATE_HINTS: Record<string, string> = {
  "booking.submitted": "visadrive_booking_submitted",
  "payment.requested": "visadrive_payment_due",
  "document.rejected": "visadrive_document_rejected",
  "documents.additional_requested": "visadrive_documents_requested",
  "application.status_changed": "visadrive_status_update",
  "application.completed": "visadrive_application_complete",
  "application.final_document_ready": "visadrive_document_ready",
};

/**
 * Build the body for one notification. Never throws — a broken builder must
 * not stop the notification that triggered it.
 */
export function buildWhatsAppBody(
  notificationType: string,
  data: WhatsAppData,
): string {
  const builder = WHATSAPP_BUILDERS[notificationType] ?? genericMessage;
  try {
    const body = builder(data);
    return body.length > 0 ? body : genericMessage(data);
  } catch (error) {
    console.error(`[whatsapp] builder for ${notificationType} failed`, error);
    return genericMessage(data);
  }
}
