/**
 * Transactional email templates.
 *
 * Design constraints (these drive every odd-looking decision below):
 *
 *  - **Gmail and Outlook only understand inline styles.** No <style> block, no
 *    external stylesheet, no CSS classes. Outlook on Windows renders with the
 *    Word engine, which ignores `max-width` on a <div> — so the single outer
 *    wrapper is a table with a fixed `width` attribute *and* a `max-width`
 *    style. Everything inside the content cell is plain divs and paragraphs.
 *  - Every template returns `{ subject, html, text }`. The text part is not a
 *    courtesy: without it a lot of corporate filters score the mail as spam.
 *  - All interpolated values go through `esc()`. Customer-supplied strings
 *    (names, rejection reasons, message bodies) reach these templates, so a
 *    missed escape is a real HTML-injection hole in someone's inbox.
 *  - Copy stays inside VisaDrive's own disclaimers: no approval promises, no
 *    guaranteed dates. `LEGAL.notAffiliated` and `LEGAL.noGuarantee` are in
 *    every footer verbatim.
 */

import { LEGAL, SITE } from "../constants/site";
import { APPLICATION_STATUS_CONFIG } from "../constants/statuses";
import { formatMoney } from "../helpers/pricing";

/* -------------------------------------------------------------------------- */
/*                                   Theme                                    */
/* -------------------------------------------------------------------------- */

const BRAND = "#c62222";
const BRAND_DEEP = "#a81a1a";
const INK = "#17141a";
const MUTED = "#716d78";
const HAIRLINE = "#e7e5ea";
const CANVAS = "#F4F4F5";
const PANEL = "#FAFAFA";

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

export interface EmailTemplateResult {
  subject: string;
  html: string;
  text: string;
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

/** Escape for an HTML text node or a double-quoted attribute. */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Only allow links we are willing to put behind a button. A `javascript:` or
 * `data:` href in a transactional email is a phishing vector, and `link` can
 * originate from a caller that built it from user input.
 */
function safeUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return `${SITE.url.replace(/\/$/, "")}${trimmed}`;
  return null;
}

/** First name only — "Hi Prem," reads better than "Hi Prem Desai,". */
function firstName(name: string | undefined): string {
  if (!name) return "there";
  const first = String(name).trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : "there";
}

function money(
  amount: number | undefined,
  currency: string | undefined,
  preformatted?: string,
): string {
  if (preformatted) return preformatted;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "";
  return formatMoney(amount, currency ?? SITE.defaultCurrency);
}

function formatDate(value: number | string | undefined): string {
  if (value === undefined || value === null || value === "") return "";
  const ts = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(ts)) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: SITE.defaultTimezone,
  }).format(new Date(ts));
}

/** Strip control characters and clamp, so a pasted blob cannot blow up a mail. */
function clamp(value: unknown, max: number): string {
  const text = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface DetailRow {
  label: string;
  value: string;
  /** Renders the value in the brand colour — used for amounts and references. */
  emphasis?: boolean;
}

interface LayoutInput {
  /** Hidden text shown in the inbox list next to the subject. */
  preheader: string;
  heading: string;
  /** Paragraphs rendered above the detail panel. */
  intro: string[];
  details?: DetailRow[];
  cta?: { label: string; url: string } | null;
  /** Paragraphs rendered below the detail panel / button. */
  outro?: string[];
  /** Highlighted callout box — used for rejection reasons and warnings. */
  callout?: { title: string; body: string; tone?: "warning" | "info" } | null;
  /** Small print directly above the footer. */
  footnote?: string | null;
}

const ADDRESS = SITE.address.full;
const PHONE = SITE.contact.phonePrimaryDisplay;
const EMAIL = SITE.contact.email;

function renderLayout(input: LayoutInput): { html: string; text: string } {
  const {
    preheader,
    heading,
    intro,
    details = [],
    cta = null,
    outro = [],
    callout = null,
    footnote = null,
  } = input;

  const ctaUrl = cta ? safeUrl(cta.url) : null;

  const introHtml = intro
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:${INK};">${p}</p>`,
    )
    .join("");

  const outroHtml = outro
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:${INK};">${p}</p>`,
    )
    .join("");

  const detailsHtml = details.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:${PANEL};border:1px solid ${HAIRLINE};border-radius:10px;margin:0 0 22px;">
${details
  .map(
    (row, index) => `<tr>
<td style="padding:${index === 0 ? "14px" : "10px"} 16px ${
      index === details.length - 1 ? "14px" : "10px"
    };font-size:13px;line-height:20px;color:${MUTED};width:45%;vertical-align:top;">${esc(
      row.label,
    )}</td>
<td style="padding:${index === 0 ? "14px" : "10px"} 16px ${
      index === details.length - 1 ? "14px" : "10px"
    };font-size:14px;line-height:20px;color:${
      row.emphasis ? BRAND : INK
    };font-weight:${row.emphasis ? "700" : "600"};text-align:right;vertical-align:top;">${esc(
      row.value,
    )}</td>
</tr>`,
  )
  .join("\n")}
</table>`
    : "";

  const calloutHtml = callout
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 22px;">
<tr><td style="padding:14px 16px;background-color:${
        callout.tone === "info" ? "#EEF4FF" : "#FFF6EC"
      };border-left:4px solid ${
        callout.tone === "info" ? "#2563EB" : "#C2700B"
      };border-radius:0 8px 8px 0;">
<div style="font-size:13px;font-weight:700;color:${INK};margin:0 0 6px;">${esc(
        callout.title,
      )}</div>
<div style="font-size:14px;line-height:22px;color:${INK};">${esc(callout.body).replace(
        /\n/g,
        "<br />",
      )}</div>
</td></tr>
</table>`
    : "";

  // The button is a padded anchor. Outlook will not round the corners; that is
  // an accepted degradation rather than a VML fallback nobody can maintain.
  const ctaHtml =
    cta && ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
<tr><td style="background-color:${BRAND};border-radius:8px;">
<a href="${esc(ctaUrl)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;">${esc(
          cta.label,
        )}</a>
</td></tr>
</table>
<p style="margin:0 0 20px;font-size:12px;line-height:18px;color:${MUTED};">If the button does not work, copy this link into your browser:<br /><span style="color:${BRAND_DEEP};word-break:break-all;">${esc(
          ctaUrl,
        )}</span></p>`
      : "";

  const footnoteHtml = footnote
    ? `<p style="margin:0 0 4px;font-size:12px;line-height:19px;color:${MUTED};">${footnote}</p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${CANVAS};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;visibility:hidden;">${esc(
    preheader,
  )}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:${CANVAS};">
<tr>
<td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;background-color:#FFFFFF;border:1px solid ${HAIRLINE};border-radius:12px;">

<tr>
<td style="padding:22px 28px;background-color:${BRAND};border-radius:12px 12px 0 0;">
<div style="font-family:${FONT};font-size:21px;font-weight:800;letter-spacing:-0.3px;color:#FFFFFF;">${esc(
    SITE.name,
  )}</div>
<div style="font-family:${FONT};font-size:12px;line-height:18px;color:#FBE3E3;margin-top:3px;">${esc(
    SITE.tagline,
  )}</div>
</td>
</tr>

<tr>
<td style="padding:28px;font-family:${FONT};">
<h1 style="margin:0 0 16px;font-size:20px;line-height:28px;font-weight:700;color:${INK};">${esc(
    heading,
  )}</h1>
${introHtml}
${detailsHtml}
${calloutHtml}
${ctaHtml}
${outroHtml}
<p style="margin:22px 0 0;font-size:15px;line-height:24px;color:${INK};">Warm regards,<br /><strong>Team ${esc(
    SITE.name,
  )}</strong></p>
</td>
</tr>

<tr>
<td style="padding:20px 28px 24px;background-color:${PANEL};border-top:1px solid ${HAIRLINE};border-radius:0 0 12px 12px;font-family:${FONT};">
${footnoteHtml}
<p style="margin:0 0 8px;font-size:12px;line-height:19px;color:${INK};"><strong>${esc(
    SITE.name,
  )}</strong><br />${esc(ADDRESS)}<br /><a href="tel:${esc(
    SITE.contact.phonePrimary,
  )}" style="color:${BRAND_DEEP};text-decoration:none;">${esc(
    PHONE,
  )}</a> &nbsp;·&nbsp; <a href="mailto:${esc(
    EMAIL,
  )}" style="color:${BRAND_DEEP};text-decoration:none;">${esc(EMAIL)}</a></p>
<p style="margin:0 0 6px;font-size:11px;line-height:17px;color:${MUTED};">${esc(
    LEGAL.notAffiliated,
  )}</p>
<p style="margin:0;font-size:11px;line-height:17px;color:${MUTED};">${esc(
    LEGAL.noGuarantee,
  )}</p>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;

  /* ------------------------------ plain text ----------------------------- */

  const stripTags = (s: string) =>
    s
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

  const textParts: string[] = [
    SITE.name.toUpperCase(),
    SITE.tagline,
    "",
    heading,
    "",
    ...intro.map(stripTags),
  ];

  if (details.length) {
    textParts.push("");
    for (const row of details) textParts.push(`${row.label}: ${row.value}`);
  }

  if (callout) {
    textParts.push("", `${callout.title.toUpperCase()}`, callout.body);
  }

  if (cta && ctaUrl) {
    textParts.push("", `${cta.label}: ${ctaUrl}`);
  }

  if (outro.length) {
    textParts.push("", ...outro.map(stripTags));
  }

  textParts.push(
    "",
    `Warm regards,`,
    `Team ${SITE.name}`,
    "",
    "----------------------------------------",
    SITE.name,
    ADDRESS,
    `${PHONE} · ${EMAIL}`,
    "",
  );

  if (footnote) textParts.push(stripTags(footnote), "");

  textParts.push(LEGAL.notAffiliated, LEGAL.noGuarantee);

  return { html, text: textParts.join("\n") };
}

/* -------------------------------------------------------------------------- */
/*                                  Templates                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every template receives a loose bag of data. `dispatch` forwards
 * `emailData` straight through from the calling mutation, so each builder
 * treats every field as optional and degrades to a still-sensible email.
 */
export interface EmailTemplateData {
  customerName?: string;
  recipientName?: string;
  referenceId?: string;
  applicationUrl?: string;
  link?: string;

  destinationName?: string;
  visaProductName?: string;
  travellerCount?: number;
  statusLabel?: string;
  status?: string;
  previousStatus?: string;
  statusNote?: string;

  amount?: number;
  amountFormatted?: string;
  currency?: string;
  receiptNumber?: string;
  paymentMode?: string;
  paidAt?: number;
  dueDate?: number;
  payUrl?: string;

  documentLabel?: string;
  documentLabels?: string[];
  rejectionReason?: string;
  reason?: string;
  requestedBy?: string;

  // Conversation
  conversationSubject?: string;
  messagePreview?: string;
  agentName?: string;

  // Enquiry (staff-facing)
  enquiryReference?: string;
  enquiryName?: string;
  enquiryEmail?: string;
  enquiryPhone?: string;
  enquirySubject?: string;
  enquiryMessage?: string;
  interestedCountry?: string;

  // Generic fallback
  title?: string;
  body?: string;

  [key: string]: unknown;
}

const PORTAL = `${SITE.url.replace(/\/$/, "")}`;

function applicationLink(data: EmailTemplateData): string {
  return (
    safeUrl(data.applicationUrl) ??
    safeUrl(data.link) ??
    `${PORTAL}/dashboard/applications`
  );
}

/**
 * The email's opening paragraph.
 *
 * Most callers pass only the notification's own `title`/`body` and no
 * structured `emailData` — `applications.submit` sends "We have your DS-160
 * application for United States. Our team will review it shortly." That
 * sentence is specific and already written for the customer, so it *replaces*
 * the template's canned line rather than sitting redundantly next to it. The
 * canned line is the fallback for callers that pass structured data instead.
 */
function lead(data: EmailTemplateData, canned: string): string {
  const body = clamp(data.body, 1200);
  return body ? esc(body).replace(/\n/g, "<br />") : canned;
}

/** Prefer the notification's own title when the template lacks the data to
 *  build a better subject of its own. */
function titleOr(data: EmailTemplateData, fallback: string): string {
  const title = clamp(data.title, 140);
  return title || fallback;
}

function bookingLines(data: EmailTemplateData): DetailRow[] {
  const rows: DetailRow[] = [];
  if (data.referenceId)
    rows.push({
      label: "Reference number",
      value: clamp(data.referenceId, 40),
      emphasis: true,
    });
  if (data.destinationName)
    rows.push({ label: "Destination", value: clamp(data.destinationName, 60) });
  if (data.visaProductName)
    rows.push({ label: "Service", value: clamp(data.visaProductName, 80) });
  if (typeof data.travellerCount === "number" && data.travellerCount > 0)
    rows.push({ label: "Travellers", value: String(data.travellerCount) });
  return rows;
}

/* ----------------------------- booking submitted -------------------------- */

export function bookingSubmittedEmail(
  data: EmailTemplateData,
): EmailTemplateResult {
  const name = firstName(data.customerName ?? data.recipientName);
  const ref = data.referenceId ? ` ${clamp(data.referenceId, 40)}` : "";

  const { html, text } = renderLayout({
    preheader: `We have received your application${ref}. Here is what happens next.`,
    heading: "We have received your application",
    intro: [
      `Hi ${esc(name)},`,
      lead(
        data,
        `Thank you for choosing ${esc(
          SITE.name,
        )}. Your application has been received and our team has started reviewing it.`,
      ),
    ],
    details: bookingLines(data),
    cta: {
      label: "Track your application",
      url: applicationLink(data),
    },
    outro: [
      `<strong>What happens next</strong><br />A VisaDrive agent will check your details and tell you exactly which documents to upload. You can follow every update in your portal, and you will get an email whenever the status changes.`,
      `Please keep your reference number handy when you contact us.`,
    ],
    footnote: esc(LEGAL.governmentFeesSeparate),
  });

  return {
    subject: `Application received${ref ? ` —${ref}` : ""} | ${SITE.name}`,
    html,
    text,
  };
}

/* ----------------------------- payment received --------------------------- */

export function paymentReceivedEmail(
  data: EmailTemplateData,
): EmailTemplateResult {
  const name = firstName(data.customerName ?? data.recipientName);
  const amount = money(data.amount, data.currency, data.amountFormatted);

  const details: DetailRow[] = [];
  if (amount) details.push({ label: "Amount paid", value: amount, emphasis: true });
  if (data.receiptNumber)
    details.push({ label: "Receipt number", value: clamp(data.receiptNumber, 40) });
  if (data.paymentMode)
    details.push({ label: "Paid by", value: clamp(data.paymentMode, 40) });
  if (data.paidAt) details.push({ label: "Date", value: formatDate(data.paidAt) });
  details.push(...bookingLines(data).filter((r) => r.label !== "Reference number"));
  if (data.referenceId)
    details.push({ label: "Application", value: clamp(data.referenceId, 40) });

  const { html, text } = renderLayout({
    preheader: `We have received your payment${amount ? ` of ${amount}` : ""}. Thank you.`,
    heading: "Payment received — thank you",
    intro: [
      `Hi ${esc(name)},`,
      lead(
        data,
        `We have received your payment${
          amount ? ` of <strong>${esc(amount)}</strong>` : ""
        }. This email is your receipt.`,
      ),
      // The canned line above already says this; a caller-supplied body does not.
      ...(clamp(data.body, 1200) ? ["This email is your receipt."] : []),
    ],
    details,
    cta: { label: "View your application", url: applicationLink(data) },
    outro: [
      `Your application continues as normal — there is nothing further for you to do right now.`,
    ],
    footnote: esc(LEGAL.governmentFeesSeparate),
  });

  return {
    subject: `Payment received${amount ? ` — ${amount}` : ""} | ${SITE.name}`,
    html,
    text,
  };
}

/* ---------------------------- payment requested --------------------------- */

export function paymentRequestedEmail(
  data: EmailTemplateData,
): EmailTemplateResult {
  const name = firstName(data.customerName ?? data.recipientName);
  const amount = money(data.amount, data.currency, data.amountFormatted);

  const details: DetailRow[] = [];
  if (amount) details.push({ label: "Amount due", value: amount, emphasis: true });
  if (data.dueDate) details.push({ label: "Pay by", value: formatDate(data.dueDate) });
  details.push(...bookingLines(data));

  const { html, text } = renderLayout({
    preheader: `A payment${amount ? ` of ${amount}` : ""} is now due on your application.`,
    heading: "Your payment is now due",
    intro: [
      `Hi ${esc(name)},`,
      lead(
        data,
        `Your appointment has been confirmed, so our service fee${
          amount ? ` of <strong>${esc(amount)}</strong>` : ""
        } is now payable. You can pay securely from your VisaDrive portal.`,
      ),
    ],
    details,
    cta: {
      label: "Pay now",
      url: safeUrl(data.payUrl) ?? applicationLink(data),
    },
    outro: [
      `If you have already paid, please ignore this email — receipts can take a few minutes to arrive.`,
      `Any questions about this amount? Reply to this email or call us on ${esc(
        PHONE,
      )}.`,
    ],
    footnote: `${esc(LEGAL.noAdvancePayment)} ${esc(LEGAL.governmentFeesSeparate)}`,
  });

  return {
    subject: `Payment due${amount ? ` — ${amount}` : ""} | ${SITE.name}`,
    html,
    text,
  };
}

/* ------------------------------ payment failed ---------------------------- */

export function paymentFailedEmail(data: EmailTemplateData): EmailTemplateResult {
  const name = firstName(data.customerName ?? data.recipientName);
  const amount = money(data.amount, data.currency, data.amountFormatted);

  const { html, text } = renderLayout({
    preheader: "Your last payment attempt did not go through.",
    heading: "Your payment did not go through",
    intro: [
      `Hi ${esc(name)},`,
      lead(
        data,
        `Your recent payment attempt${
          amount ? ` of <strong>${esc(amount)}</strong>` : ""
        } was not completed. No money has been taken from your account.`,
      ),
    ],
    details: bookingLines(data),
    callout: data.reason
      ? { title: "Reason given by the payment provider", body: clamp(data.reason, 400) }
      : null,
    cta: { label: "Try again", url: safeUrl(data.payUrl) ?? applicationLink(data) },
    outro: [
      `If the problem continues, it is usually a bank limit or a card restriction on online payments. Call us on ${esc(
        PHONE,
      )} and we will help.`,
    ],
  });

  return { subject: `Payment unsuccessful | ${SITE.name}`, html, text };
}

/* ---------------------------- document rejected --------------------------- */

export function documentRejectedEmail(
  data: EmailTemplateData,
): EmailTemplateResult {
  const name = firstName(data.customerName ?? data.recipientName);
  const docLabel = clamp(data.documentLabel, 80);

  const { html, text } = renderLayout({
    preheader: `${docLabel || "A document"} needs to be uploaded again.`,
    heading: "One of your documents needs replacing",
    intro: [
      `Hi ${esc(name)},`,
      lead(
        data,
        docLabel
          ? `We reviewed <strong>${esc(
              docLabel,
            )}</strong> and it cannot be used as submitted. Please upload a replacement so we can carry on with your application.`
          : `One of your documents cannot be used as submitted. Please upload a replacement so we can carry on with your application.`,
      ),
    ],
    details: bookingLines(data),
    callout: {
      title: "Why it was not accepted",
      body: clamp(
        data.rejectionReason ?? data.reason ?? "Please see your portal for details.",
        600,
      ),
    },
    cta: { label: "Upload a replacement", url: applicationLink(data) },
    outro: [
      `Tips that solve most re-uploads: use the original document rather than a photocopy, make sure all four corners are visible, and check that the text is readable.`,
    ],
  });

  return {
    subject: docLabel
      ? `Action needed: ${docLabel} | ${SITE.name}`
      : `${titleOr(data, "Action needed on your documents")} | ${SITE.name}`,
    html,
    text,
  };
}

/* --------------------- additional documents requested --------------------- */

export function additionalDocumentsRequestedEmail(
  data: EmailTemplateData,
): EmailTemplateResult {
  const name = firstName(data.customerName ?? data.recipientName);
  const list = Array.isArray(data.documentLabels)
    ? data.documentLabels.filter(Boolean).map((d) => clamp(d, 90))
    : data.documentLabel
      ? [clamp(data.documentLabel, 90)]
      : [];

  const listHtml = list.length
    ? `<strong>What we need from you</strong><ul style="margin:8px 0 14px;padding-left:20px;font-size:15px;line-height:24px;color:${INK};">${list
        .map((item) => `<li style="margin:0 0 6px;">${esc(item)}</li>`)
        .join("")}</ul>`
    : "";

  const { html, text } = renderLayout({
    preheader: "We need a few more documents to continue your application.",
    heading: "We need a few more documents",
    intro: [
      `Hi ${esc(name)},`,
      lead(
        data,
        `Our team has reviewed your application and needs some additional documents before we can take the next step.`,
      ),
      ...(listHtml ? [listHtml] : []),
    ],
    details: bookingLines(data),
    callout: data.reason
      ? { title: "Note from your agent", body: clamp(data.reason, 600), tone: "info" }
      : null,
    cta: { label: "Upload documents", url: applicationLink(data) },
    outro: [
      `Your application stays on hold until these arrive, so uploading them promptly keeps things moving.`,
    ],
  });

  return {
    subject: `Additional documents needed${
      data.referenceId ? ` — ${clamp(data.referenceId, 40)}` : ""
    } | ${SITE.name}`,
    html,
    text,
  };
}

/* ------------------------ application status changed ---------------------- */

export function applicationStatusChangedEmail(
  data: EmailTemplateData,
): EmailTemplateResult {
  const name = firstName(data.customerName ?? data.recipientName);

  // Prefer the customer-facing wording from the shared status vocabulary, so
  // the email never leaks an internal label like "ready_for_processing".
  const config =
    data.status && data.status in APPLICATION_STATUS_CONFIG
      ? APPLICATION_STATUS_CONFIG[
          data.status as keyof typeof APPLICATION_STATUS_CONFIG
        ]
      : null;

  const label = clamp(data.statusLabel ?? config?.customerLabel ?? "", 60);

  const details = bookingLines(data);
  if (label) {
    details.unshift({ label: "Current status", value: label, emphasis: true });
  }

  const { html, text } = renderLayout({
    preheader: label
      ? `Your application status is now "${label}".`
      : titleOr(data, "There is an update on your application."),
    heading: "Your application has been updated",
    intro: [
      `Hi ${esc(name)},`,
      lead(
        data,
        label
          ? `There is an update on your application. Its status is now <strong>${esc(
              label,
            )}</strong>.`
          : `There is an update on your application.`,
      ),
      ...(config?.description && !data.statusNote && !data.body
        ? [esc(config.description)]
        : []),
    ],
    details,
    callout: data.statusNote
      ? { title: "Note from your agent", body: clamp(data.statusNote, 600), tone: "info" }
      : null,
    cta: { label: "View full timeline", url: applicationLink(data) },
    outro: [
      `You do not need to do anything unless we have asked you to. Every update is also recorded in your portal.`,
    ],
  });

  return {
    subject: label
      ? `Application update: ${label}${
          data.referenceId ? ` — ${clamp(data.referenceId, 40)}` : ""
        } | ${SITE.name}`
      : // `applications.updateStatus` titles its notification
        // "VD-2026-00042: Under review", which is already the better subject.
        `${titleOr(data, "Application update")} | ${SITE.name}`,
    html,
    text,
  };
}

/* ------------------------- application completed -------------------------- */

export function applicationCompletedEmail(
  data: EmailTemplateData,
): EmailTemplateResult {
  const name = firstName(data.customerName ?? data.recipientName);

  const { html, text } = renderLayout({
    preheader: "Your application with VisaDrive is now complete.",
    heading: "Your application is complete",
    intro: [
      `Hi ${esc(name)},`,
      lead(
        data,
        `Everything on our side is finished and your application is now marked as complete. Thank you for trusting ${esc(
          SITE.name,
        )} with it.`,
      ),
    ],
    details: bookingLines(data),
    cta: { label: "View your application", url: applicationLink(data) },
    outro: [
      `Any final documents are available in your portal and will stay there for your records.`,
      `Travelling again soon? Start your next application any time — your saved traveller details carry across.`,
    ],
  });

  return {
    subject: `Your application is complete${
      data.referenceId ? ` — ${clamp(data.referenceId, 40)}` : ""
    } | ${SITE.name}`,
    html,
    text,
  };
}

/* ------------------------- final document ready --------------------------- */

export function finalDocumentReadyEmail(
  data: EmailTemplateData,
): EmailTemplateResult {
  const name = firstName(data.customerName ?? data.recipientName);

  const { html, text } = renderLayout({
    preheader: "Your final document is ready to download from your portal.",
    heading: "Your document is ready to download",
    intro: [
      `Hi ${esc(name)},`,
      lead(
        data,
        `Your final document has been uploaded to your VisaDrive portal and is ready for you to download.`,
      ),
    ],
    details: bookingLines(data),
    cta: { label: "Download your document", url: applicationLink(data) },
    outro: [
      `For your security the file is only available after you sign in — we never send visa documents as an email attachment.`,
      `Please download a copy and keep it with your travel papers.`,
    ],
  });

  return {
    subject: `Your document is ready${
      data.referenceId ? ` — ${clamp(data.referenceId, 40)}` : ""
    } | ${SITE.name}`,
    html,
    text,
  };
}

/* --------------------------- enquiry received ----------------------------- */

/** Staff-facing: a new website enquiry has landed in the CRM. */
export function enquiryReceivedEmail(
  data: EmailTemplateData,
): EmailTemplateResult {
  const details: DetailRow[] = [];
  if (data.enquiryReference)
    details.push({
      label: "Reference",
      value: clamp(data.enquiryReference, 40),
      emphasis: true,
    });
  if (data.enquiryName)
    details.push({ label: "Name", value: clamp(data.enquiryName, 80) });
  if (data.enquiryEmail)
    details.push({ label: "Email", value: clamp(data.enquiryEmail, 120) });
  if (data.enquiryPhone)
    details.push({ label: "Phone", value: clamp(data.enquiryPhone, 30) });
  if (data.interestedCountry)
    details.push({
      label: "Interested in",
      value: clamp(data.interestedCountry, 60),
    });
  if (data.enquirySubject)
    details.push({ label: "Subject", value: clamp(data.enquirySubject, 120) });

  const { html, text } = renderLayout({
    preheader: `New enquiry from ${clamp(data.enquiryName ?? "a website visitor", 60)}.`,
    heading: "New enquiry from the website",
    intro: [
      `A new enquiry has just come in through the ${esc(
        SITE.domain,
      )} contact form. It is waiting in the admin CRM.`,
    ],
    details,
    callout: data.enquiryMessage
      ? { title: "Their message", body: clamp(data.enquiryMessage, 1500), tone: "info" }
      : null,
    cta: {
      label: "Open in the CRM",
      url: safeUrl(data.link) ?? `${PORTAL}/admin/enquiries`,
    },
    outro: [`Please pick this up and record your first contact attempt in the CRM.`],
    footnote: `This is an internal notification sent to ${esc(
      SITE.name,
    )} staff only.`,
  });

  return {
    subject: `New enquiry: ${clamp(
      data.enquiryName ?? data.enquirySubject ?? "website contact form",
      60,
    )}${data.enquiryReference ? ` (${clamp(data.enquiryReference, 40)})` : ""}`,
    html,
    text,
  };
}

/* ------------------------------ admin replied ----------------------------- */

export function adminRepliedEmail(data: EmailTemplateData): EmailTemplateResult {
  const name = firstName(data.customerName ?? data.recipientName);
  const subject = clamp(data.conversationSubject ?? "your conversation", 90);
  const agent = clamp(data.agentName ?? `the ${SITE.name} team`, 60);

  const { html, text } = renderLayout({
    preheader: `${agent} has replied to "${subject}".`,
    heading: "You have a new reply from VisaDrive",
    intro: [
      `Hi ${esc(name)},`,
      `<strong>${esc(agent)}</strong> has replied to your conversation <strong>${esc(
        subject,
      )}</strong>.`,
    ],
    callout: data.messagePreview
      ? { title: "Their reply", body: clamp(data.messagePreview, 900), tone: "info" }
      : data.body
        ? { title: "Their reply", body: clamp(data.body, 900), tone: "info" }
        : null,
    cta: {
      label: "Read and reply",
      url: safeUrl(data.link) ?? `${PORTAL}/dashboard/messages`,
    },
    outro: [
      `Please reply from the portal rather than to this email — that keeps your whole conversation, and any attachments, in one place.`,
    ],
  });

  return { subject: `Re: ${subject} | ${SITE.name}`, html, text };
}

/* ---------------------------- documents reminder -------------------------- */

export function documentsReminderEmail(
  data: EmailTemplateData,
): EmailTemplateResult {
  const name = firstName(data.customerName ?? data.recipientName);

  const { html, text } = renderLayout({
    preheader: "Your application is waiting on documents from you.",
    heading: "Your application is waiting on your documents",
    intro: [
      `Hi ${esc(name)},`,
      lead(
        data,
        `We cannot move your application forward until the required documents are uploaded. It only takes a few minutes from your phone.`,
      ),
    ],
    details: bookingLines(data),
    cta: { label: "Upload documents", url: applicationLink(data) },
    outro: [
      `Stuck on a particular document? Reply here or call ${esc(
        PHONE,
      )} and we will talk you through it.`,
    ],
  });

  return {
    subject: `Reminder: documents needed${
      data.referenceId ? ` — ${clamp(data.referenceId, 40)}` : ""
    } | ${SITE.name}`,
    html,
    text,
  };
}

/* -------------------------------- welcome --------------------------------- */

export function welcomeEmail(data: EmailTemplateData): EmailTemplateResult {
  const name = firstName(data.customerName ?? data.recipientName);

  const { html, text } = renderLayout({
    preheader: `Welcome to ${SITE.name}. Your account is ready.`,
    heading: `Welcome to ${SITE.name}`,
    intro: [
      `Hi ${esc(name)},`,
      lead(
        data,
        `Your ${esc(
          SITE.name,
        )} account is ready. From your portal you can start an application, upload documents securely and follow every update in one place.`,
      ),
    ],
    cta: {
      label: "Go to your dashboard",
      url: safeUrl(data.link) ?? `${PORTAL}/dashboard`,
    },
    outro: [
      `<strong>${esc(SITE.mission)}</strong> If anything is unclear at any point, call us on ${esc(
        PHONE,
      )} — a real person answers.`,
    ],
  });

  return { subject: `Welcome to ${SITE.name}`, html, text };
}

/* ------------------------------ staff invite ------------------------------ */

export interface StaffInviteEmailData {
  fullName: string;
  email: string;
  roleLabel: string;
  /** Omitted when the colleague already had an account and kept their own. */
  password?: string;
  designation?: string;
  employeeCode?: string;
  signInUrl?: string;
  invitedByName?: string;
}

/**
 * The credentials mail a new colleague receives.
 *
 * The password is rendered once, here, and is never stored anywhere we can
 * read it back — not in `notifications`, not in the audit log. That is why
 * this template is called directly by the route that provisions the account
 * rather than going through `notifications.dispatch`, which persists the body
 * it sends.
 */
export function staffInviteEmail(
  data: StaffInviteEmailData,
): EmailTemplateResult {
  const name = firstName(data.fullName);
  const signInUrl = safeUrl(data.signInUrl) ?? `${PORTAL}/sign-in`;

  const details: DetailRow[] = [
    { label: "Sign-in email", value: data.email },
    ...(data.password
      ? [{ label: "Temporary password", value: data.password, emphasis: true }]
      : []),
    { label: "Role", value: data.roleLabel, emphasis: !data.password },
    ...(data.designation
      ? [{ label: "Designation", value: data.designation }]
      : []),
    ...(data.employeeCode
      ? [{ label: "Employee code", value: data.employeeCode }]
      : []),
  ];

  const { html, text } = renderLayout({
    preheader: `Your ${SITE.name} staff account is ready.`,
    heading: `Your ${SITE.name} team account`,
    intro: [
      `Hi ${esc(name)},`,
      data.invitedByName
        ? `${esc(
            data.invitedByName,
          )} has set up a ${esc(SITE.name)} staff account for you. Here are your sign-in details.`
        : `A ${esc(
            SITE.name,
          )} staff account has been set up for you. Here are your sign-in details.`,
    ],
    details,
    cta: { label: "Sign in to VisaDrive", url: signInUrl },
    callout: data.password
      ? {
          title: "Change this password after your first sign-in",
          body:
            "This is a temporary password sent by email. Open your profile and set your own as soon as you are in, and never share it with anyone — the VisaDrive team will never ask you for it.",
          tone: "warning",
        }
      : {
          title: "Use your existing password",
          body:
            "You already had a VisaDrive account, so your password has not changed. Sign in exactly as you did before — the new access is attached to the same login.",
          tone: "info",
        },
    outro: [
      `Once you are in, the team tools live at <strong>${esc(
        PORTAL,
      )}/admin</strong>. What you can see there depends on your role.`,
      `If you were not expecting this email, tell us on ${esc(
        PHONE,
      )} or ${esc(EMAIL)} and we will remove the account.`,
    ],
    footnote:
      "This message contains sign-in credentials. Please do not forward it.",
  });

  return { subject: `Your ${SITE.name} team account`, html, text };
}

/* --------------------------- generic fallback ----------------------------- */

/**
 * Used when a caller passes an `emailTemplate` we do not know, or passes none
 * at all. It renders the notification's own title/body so a new notification
 * type still produces a sane email instead of nothing.
 */
export function genericNotificationEmail(
  data: EmailTemplateData,
): EmailTemplateResult {
  const name = firstName(data.customerName ?? data.recipientName);
  const title = clamp(data.title ?? `Update from ${SITE.name}`, 140);
  const body = clamp(data.body ?? "", 2000);

  const { html, text } = renderLayout({
    preheader: title,
    heading: title,
    intro: [
      `Hi ${esc(name)},`,
      ...(body ? [esc(body).replace(/\n/g, "<br />")] : []),
    ],
    cta: data.link ? { label: "Open in VisaDrive", url: String(data.link) } : null,
  });

  return { subject: `${title} | ${SITE.name}`, html, text };
}

/* -------------------------------------------------------------------------- */
/*                                  Registry                                  */
/* -------------------------------------------------------------------------- */

export const EMAIL_TEMPLATES = {
  booking_submitted: bookingSubmittedEmail,
  payment_received: paymentReceivedEmail,
  payment_requested: paymentRequestedEmail,
  payment_failed: paymentFailedEmail,
  document_rejected: documentRejectedEmail,
  additional_documents_requested: additionalDocumentsRequestedEmail,
  application_status_changed: applicationStatusChangedEmail,
  application_completed: applicationCompletedEmail,
  final_document_ready: finalDocumentReadyEmail,
  enquiry_received: enquiryReceivedEmail,
  admin_replied: adminRepliedEmail,
  documents_reminder: documentsReminderEmail,
  welcome: welcomeEmail,
  generic: genericNotificationEmail,
} satisfies Record<string, (data: EmailTemplateData) => EmailTemplateResult>;

export type EmailTemplateName = keyof typeof EMAIL_TEMPLATES;

/**
 * Default template per notification type, so a caller that only supplies a
 * `type` still gets the right-looking email.
 */
export const TEMPLATE_BY_NOTIFICATION_TYPE: Record<string, EmailTemplateName> = {
  "user.registered": "welcome",
  "enquiry.received": "enquiry_received",
  "booking.submitted": "booking_submitted",
  "payment.received": "payment_received",
  "payment.failed": "payment_failed",
  "payment.requested": "payment_requested",
  "document.rejected": "document_rejected",
  "documents.additional_requested": "additional_documents_requested",
  "application.status_changed": "application_status_changed",
  "application.completed": "application_completed",
  "application.final_document_ready": "final_document_ready",
  "conversation.admin_replied": "admin_replied",
  "application.documents_reminder": "documents_reminder",
};

export function isEmailTemplateName(name: string): name is EmailTemplateName {
  return Object.prototype.hasOwnProperty.call(EMAIL_TEMPLATES, name);
}

/**
 * Resolve and render an email.
 *
 * Resolution order: the explicit template name → the default for the
 * notification type → the generic title/body renderer. This never throws:
 * a broken template must not take down the notification that triggered it.
 */
export function renderEmail(input: {
  template?: string;
  notificationType?: string;
  data?: EmailTemplateData;
}): EmailTemplateResult {
  const data: EmailTemplateData = input.data ?? {};

  let name: EmailTemplateName = "generic";
  if (input.template && isEmailTemplateName(input.template)) {
    name = input.template;
  } else if (
    input.notificationType &&
    TEMPLATE_BY_NOTIFICATION_TYPE[input.notificationType]
  ) {
    name = TEMPLATE_BY_NOTIFICATION_TYPE[input.notificationType];
  }

  try {
    return EMAIL_TEMPLATES[name](data);
  } catch (error) {
    console.error(`[templates] ${name} failed to render`, error);
    return genericNotificationEmail(data);
  }
}
