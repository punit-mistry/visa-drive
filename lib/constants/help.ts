/**
 * The help assistant's knowledge base.
 *
 * Every answer here describes **how VisaDrive works** — our statuses, our
 * cancellation window, our permission model. None of it states a visa fee, a
 * processing time or a document requirement, because those are per-consulate
 * facts that only the admin-configured catalogue and FAQs may speak to
 * (CLAUDE.md, "No invented facts"). The assistant mixes these entries with the
 * live published FAQs at query time, so an answer about Schengen processing
 * comes from a row an administrator wrote, never from this file.
 *
 * Matching is deterministic keyword scoring, not a language model. That is a
 * deliberate trade: the assistant will sometimes say "I do not have an answer
 * for that" and hand the question to a human, which is the correct failure for
 * a product where a confidently wrong answer about a passport costs a trip.
 */

export type HelpAudience = "customer" | "staff" | "both";

export interface HelpEntry {
  id: string;
  audience: HelpAudience;
  question: string;
  answer: string;
  /** Extra match terms beyond the words already in `question`. */
  keywords: string[];
  action?: { label: string; href: string };
}

export const HELP_ENTRIES: HelpEntry[] = [
  /* ------------------------------- customer ------------------------------- */
  {
    id: "c-apply",
    audience: "customer",
    question: "How do I start a new application?",
    answer:
      "Open ‘New application’, choose your destination and the visa type, and we create a draft for you. The wizard has four steps — trip details, travellers, documents, then review. Each step saves as you finish it, so you can close the tab and come back to exactly where you were.",
    keywords: ["new", "start", "book", "apply", "begin", "create", "draft"],
    action: { label: "Start an application", href: "/apply" },
  },
  {
    id: "c-draft",
    audience: "customer",
    question: "I did not finish my application. Is it lost?",
    answer:
      "No. Unfinished applications stay as drafts under Applications, and the wizard reopens on the step you stopped at. Drafts are kept for 30 days; we notify you before one expires.",
    keywords: ["draft", "unfinished", "incomplete", "lost", "saved", "resume", "later"],
    action: { label: "My applications", href: "/dashboard/applications" },
  },
  {
    id: "c-status",
    audience: "customer",
    question: "What do the application statuses mean?",
    answer:
      "Submitted means we have it. Documents Pending means we are waiting on a file from you. Under Review means a specialist is checking everything against the consulate's requirements. Appointment Scheduled, Visa Processing, then Approved or Rejected follow. Every change is written to your application's timeline with the date.",
    keywords: ["status", "meaning", "stage", "progress", "timeline", "under review", "pending"],
  },
  {
    id: "c-documents",
    audience: "customer",
    question: "How do I upload or replace a document?",
    answer:
      "Open the application and use the Documents section. If we have asked for a replacement, that document is marked and the reason is shown next to it — upload the new file there and the old version is superseded automatically. Your files are private: they are never reachable by a link alone.",
    keywords: ["upload", "document", "file", "passport", "photo", "replace", "reject", "scan"],
  },
  {
    id: "c-cancel",
    audience: "customer",
    question: "Can I cancel my application?",
    answer:
      "You can cancel it yourself while it is still a draft, submitted, waiting on documents, or has documents submitted — the Cancel button appears on the application page in those states. Once it moves into review or processing the consulate work has started, so cancellation goes through our team instead. Ask here and we will pass it on.",
    keywords: ["cancel", "cancellation", "stop", "withdraw", "refund", "abort"],
  },
  {
    id: "c-payment",
    audience: "customer",
    question: "How do I pay, and is it secure?",
    answer:
      "Payment is through Razorpay — card, UPI, net banking or wallet. We never see or store your card details, and the amount is always recalculated on our server before checkout, so the total you are charged is the total we quoted. Receipts appear under Payments the moment the payment clears.",
    keywords: ["pay", "payment", "razorpay", "card", "upi", "secure", "receipt", "invoice", "money"],
    action: { label: "My payments", href: "/dashboard/payments" },
  },
  {
    id: "c-refund",
    audience: "customer",
    question: "How do refunds work?",
    answer:
      "Refunds are issued by our team to the original payment method, and the amount depends on how far the application has progressed — consulate fees already paid cannot be recovered. Our refund policy page has the full terms. Ask here to start a refund and we will pass it to the team.",
    keywords: ["refund", "money back", "return", "reimburse", "cancel payment"],
    action: { label: "Refund policy", href: "/refund-policy" },
  },
  {
    id: "c-notify",
    audience: "customer",
    question: "How will you contact me?",
    answer:
      "Everything important appears under Notifications in the portal, and we email you in parallel. If you have opted in, we also send WhatsApp updates. Nothing that needs your action is sent only by email.",
    keywords: ["contact", "notify", "notification", "email", "whatsapp", "message", "update", "alert"],
    action: { label: "Notifications", href: "/dashboard/notifications" },
  },
  {
    id: "c-travellers",
    audience: "customer",
    question: "Can I add more travellers to one application?",
    answer:
      "Yes. Set the traveller count on the first step of the wizard and fill in each person's passport details on the travellers step. Pricing updates for the whole group. After submission, our team can still correct traveller details for you — just ask.",
    keywords: ["traveller", "traveler", "family", "group", "people", "add", "passenger", "child"],
  },
  {
    id: "c-edit-after",
    audience: "customer",
    question: "I made a mistake after submitting. Can it be fixed?",
    answer:
      "Yes, for the details that are not yet locked by the consulate — travel dates, purpose, contact number and traveller details. Our team edits these for you after submission. Tell us what is wrong and we will correct it.",
    keywords: ["mistake", "wrong", "edit", "change", "correct", "fix", "update", "spelling", "typo"],
  },

  /* -------------------------------- staff --------------------------------- */
  {
    id: "s-queue",
    audience: "staff",
    question: "Where do I start my day?",
    answer:
      "The Dashboard carries a pending work queue — applications waiting on a decision, documents waiting on review, and follow-ups due today. Work down that list and you have covered everything that is actually blocked on us.",
    keywords: ["start", "day", "queue", "work", "todo", "pending", "dashboard", "begin"],
    action: { label: "Dashboard", href: "/admin" },
  },
  {
    id: "s-status",
    audience: "staff",
    question: "Why can I not set a particular status?",
    answer:
      "Status changes follow a transition table — a status can only move to the ones that genuinely follow it, so Approved cannot jump back to Draft. The dropdown only offers the legal next steps. If the one you want is missing, the application is not in the state you expect; check its timeline.",
    keywords: ["status", "transition", "change", "cannot", "missing", "dropdown", "locked", "stuck"],
  },
  {
    id: "s-permissions",
    audience: "staff",
    question: "Why is a page or button missing for me?",
    answer:
      "Your role decides it. Pages your role cannot open are left out of the sidebar entirely, and controls you cannot use are not rendered — so a support agent sees no Payments area and no refund button. The server enforces the same rules independently, so this is never cosmetic. A super admin can grant extra permissions on the Staff page.",
    keywords: ["permission", "missing", "cannot", "access", "denied", "forbidden", "role", "button", "hidden", "disabled"],
  },
  {
    id: "s-documents",
    audience: "staff",
    question: "How do I review documents?",
    answer:
      "Open the application and click View on any document — it opens in a viewer with the file inline, arrow keys to move between documents, and Approve/Reject on the same screen. Rejecting asks for a reason, which the customer sees verbatim, and the viewer jumps to the next pending file automatically.",
    keywords: ["document", "review", "approve", "reject", "verify", "check", "viewer", "passport", "scan"],
  },
  {
    id: "s-edit",
    audience: "staff",
    question: "How do I correct a customer's details?",
    answer:
      "On the application page, each card has an Edit button: Customer for name and phone, Trip for dates, purpose and departure country, Travellers for passport details. Email is read-only because it is the customer's sign-in identity. Every edit is written to the audit log with before and after values.",
    keywords: ["edit", "correct", "change", "customer", "details", "trip", "traveller", "update", "fix", "name", "phone"],
  },
  {
    id: "s-notes",
    audience: "staff",
    question: "Can the customer see my internal notes?",
    answer:
      "No. Internal notes are stripped from the thread before a customer ever loads it — that filtering happens on the server, not in the UI. You can brief a colleague in the same conversation the customer is reading, safely.",
    keywords: ["internal", "note", "private", "customer", "see", "visible", "hidden", "comment"],
  },
  {
    id: "s-assign",
    audience: "staff",
    question: "How do I assign work to someone?",
    answer:
      "Applications and enquiries both have an Assign action. Assignment drives the assigned-agent filter and each person's work queue, so an assigned item stops floating in the unassigned pool. Assigning notifies the person you picked.",
    keywords: ["assign", "allocate", "agent", "owner", "delegate", "handover", "give"],
  },
  {
    id: "s-enquiry",
    audience: "staff",
    question: "What is the difference between an enquiry and an application?",
    answer:
      "An enquiry is a lead — someone asked a question through the website form or the help assistant, and nothing is booked. An application is a real booking with travellers, documents and money attached. When a lead commits, use Convert to application on the enquiry so the history follows them.",
    keywords: ["enquiry", "inquiry", "lead", "application", "difference", "convert", "booking"],
    action: { label: "Enquiries", href: "/admin/enquiries" },
  },
  {
    id: "s-payment",
    audience: "staff",
    question: "How do I record an offline payment or a refund?",
    answer:
      "The Payments area has Record payment for cash, cheque or bank transfer, and Record refund against an existing payment. Both need the matching permission, both are audited, and both recompute against the application's frozen pricing — you cannot record more than is owed.",
    keywords: ["payment", "offline", "cash", "cheque", "manual", "record", "refund", "bank", "money"],
    action: { label: "Payments", href: "/admin/payments" },
  },
  {
    id: "s-staff",
    audience: "staff",
    question: "How do I add a new staff member?",
    answer:
      "On the Staff page, Add staff member creates the Convex record and the sign-in account together and emails the credentials. You can only grant roles below your own — an admin cannot create another admin, and the last active super admin cannot be demoted or deactivated.",
    keywords: ["staff", "add", "new", "colleague", "invite", "account", "user", "hire", "team"],
    action: { label: "Staff", href: "/admin/staff" },
  },
  {
    id: "s-search",
    audience: "staff",
    question: "How do I find a specific customer or booking?",
    answer:
      "Each list page has its own search box above the table. On Applications it matches a reference number, a customer name or an email, and it combines with the status, payment, destination and assigned-agent filters. Customers and Enquiries search the same way on their own pages.",
    keywords: ["search", "find", "lookup", "reference", "customer", "booking", "locate", "number", "filter"],
    action: { label: "Applications", href: "/admin/applications" },
  },
  {
    id: "s-audit",
    audience: "staff",
    question: "How do I see who changed something?",
    answer:
      "The Audit log records every status change, payment, permission change and customer-visible edit, with who did it, when, and the before and after values. It needs the audit permission, which managers do not hold by default.",
    keywords: ["audit", "log", "who", "history", "changed", "track", "trail", "accountability"],
    action: { label: "Audit log", href: "/admin/audit" },
  },

  /* --------------------------------- both --------------------------------- */
  {
    id: "b-reference",
    audience: "both",
    question: "What is the reference number?",
    answer:
      "Every application gets a reference like VD-2026-00041 when it is submitted. It identifies the booking in every email, message and conversation about it — quoting it is the fastest way to get to the right record. Enquiries use their own ENQ series, and payment receipts an RCP one.",
    keywords: ["reference", "number", "id", "code", "vd", "booking number", "tracking"],
  },
  {
    id: "b-contact",
    audience: "both",
    question: "How do I reach a real person?",
    answer:
      "Type your question below and send it — it goes to the VisaDrive team with your details attached, and you will get a reply by email and in your notifications. For anything urgent, our office in Khar West, Mumbai is reachable on the number on our contact page.",
    keywords: ["human", "person", "agent", "support", "contact", "talk", "call", "phone", "real", "help"],
    action: { label: "Contact page", href: "/contact" },
  },
];

/* ------------------------------- matching -------------------------------- */

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "do", "does", "did",
  "how", "what", "when", "where", "why", "who", "which", "can", "could", "should",
  "would", "will", "i", "my", "me", "we", "our", "you", "your", "it", "its", "to",
  "of", "in", "on", "at", "for", "with", "and", "or", "if", "that", "this", "there",
  "from", "about", "get", "got", "have", "has", "please", "tell", "want", "need",
]);

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export interface HelpMatch {
  question: string;
  answer: string;
  action?: { label: string; href: string };
  /** Where the answer came from, so the UI can say so honestly. */
  source: "product" | "faq";
  score: number;
}

export interface FaqRow {
  question: string;
  answer: string;
}

/**
 * Score a question against the knowledge base.
 *
 * A term in the *question text* is worth more than one in the keyword list,
 * and a whole phrase appearing verbatim outranks scattered word hits — so
 * "can I cancel" beats an entry that merely happens to mention cancelling.
 */
export function searchHelp(
  query: string,
  audience: Exclude<HelpAudience, "both">,
  faqs: FaqRow[] = [],
): HelpMatch[] {
  const terms = tokenise(query);
  if (terms.length === 0) return [];
  const needle = query.toLowerCase().trim();

  const scoreOf = (haystackQuestion: string, haystackAnswer: string, keywords: string[]) => {
    const questionWords = new Set(tokenise(haystackQuestion));
    const keywordText = keywords.join(" ").toLowerCase();
    const answerWords = new Set(tokenise(haystackAnswer));

    let score = 0;
    for (const term of terms) {
      if (questionWords.has(term)) score += 3;
      else if (keywordText.includes(term)) score += 2;
      else if (answerWords.has(term)) score += 1;
    }
    if (needle.length > 6 && haystackQuestion.toLowerCase().includes(needle)) score += 5;
    // Long questions should not win simply by containing more words.
    return score / Math.sqrt(terms.length);
  };

  const entries: HelpMatch[] = HELP_ENTRIES.filter(
    (entry) => entry.audience === audience || entry.audience === "both",
  ).map((entry) => ({
    question: entry.question,
    answer: entry.answer,
    action: entry.action,
    source: "product" as const,
    score: scoreOf(entry.question, entry.answer, entry.keywords),
  }));

  const faqMatches: HelpMatch[] = faqs.map((faq) => ({
    question: faq.question,
    answer: faq.answer,
    source: "faq" as const,
    score: scoreOf(faq.question, faq.answer, []),
  }));

  return [...entries, ...faqMatches]
    .filter((match) => match.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/** The chips offered before anyone has typed anything. */
export function suggestedQuestions(
  audience: Exclude<HelpAudience, "both">,
): string[] {
  const ids =
    audience === "customer"
      ? ["c-status", "c-documents", "c-cancel", "c-payment", "c-edit-after"]
      : ["s-permissions", "s-documents", "s-edit", "s-status", "s-staff"];

  return ids
    .map((id) => HELP_ENTRIES.find((entry) => entry.id === id)?.question)
    .filter((question): question is string => Boolean(question));
}
