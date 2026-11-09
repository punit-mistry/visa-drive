/**
 * Turn whatever a Convex call threw into something a customer or an agent can
 * read and act on.
 *
 * Only a `ConvexError` carries copy we wrote on purpose. Anything else — a
 * network failure, "[CONVEX M(...)] Server Error", a stack trace — is never
 * shown; it falls back to a generic line.
 */

export const GENERIC_ERROR = "Something went wrong. Please try again.";

type ConvexErrorData = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

/** The payload of a ConvexError, or null for any other kind of error. */
export function convexErrorData(error: unknown): ConvexErrorData | null {
  if (!error || typeof error !== "object") return null;
  const data = (error as { data?: unknown }).data;
  if (data && typeof data === "object") return data as ConvexErrorData;
  if (typeof data === "string") return { message: data };
  return null;
}

/** An error whose message was written for the person reading it. Throw this
 *  from client code (upload, checkout) so `friendlyError` lets it through;
 *  any other plain `Error` is replaced by generic copy. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/** Fallback copy for a code, used only when the server sent no message. */
const CODE_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Please sign in again to continue.",
  NO_PROFILE: "We could not find your account. Please sign in again.",
  SUSPENDED: "This account is on hold. Please contact VisaDrive support.",
  FORBIDDEN: "You do not have permission to do that.",
  NOT_FOUND: "We could not find that. It may have been removed.",
  RATE_LIMITED: "You are doing that too quickly. Please wait a moment and try again.",
  INTERNAL: GENERIC_ERROR,
};

/** Codes whose server text is raw third-party output and is never shown. */
const FORCED_MESSAGES: Record<string, string> = {
  PAYMENT_GATEWAY_ERROR:
    "The payment service did not respond. Please try again in a moment.",
};

/** One short, friendly sentence for any thrown value. */
export function friendlyError(error: unknown, fallback = GENERIC_ERROR): string {
  if (error instanceof UserFacingError && error.message.trim()) {
    return error.message;
  }
  const data = convexErrorData(error);
  if (!data) return fallback;
  if (data.code && FORCED_MESSAGES[data.code]) return FORCED_MESSAGES[data.code];
  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }
  if (data.code && CODE_MESSAGES[data.code]) return CODE_MESSAGES[data.code];
  return fallback;
}

/* ------------------------- incomplete applications ------------------------ */

/** Applicant field keys, as Convex reports them, in plain words. */
export const APPLICANT_FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  middleName: "Middle name",
  lastName: "Last name",
  dateOfBirth: "Date of birth",
  gender: "Gender",
  nationality: "Nationality",
  maritalStatus: "Marital status",
  occupation: "Occupation",
  email: "Email",
  phone: "Phone",
  address: "Address",
  passportNumber: "Passport number",
  passportIssueDate: "Passport issue date",
  passportExpiryDate: "Passport expiry date",
  passportIssuingCountry: "Passport issuing country",
  passportIssuingAuthority: "Passport issuing authority",
  placeOfBirth: "Place of birth",
};

export function fieldLabel(key: string): string {
  if (APPLICANT_FIELD_LABELS[key]) return APPLICANT_FIELD_LABELS[key];
  // Unknown key: split camelCase into words rather than show it raw.
  const words = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "A required detail";
}

export type IncompleteApplication = {
  /** Plain sentences such as "Add at least one traveller." */
  problems: string[];
  travellers: {
    applicantId: string | null;
    name: string;
    missing: string[];
  }[];
  documents: {
    documentKey: string;
    label: string;
    applicantId?: string;
    applicantName?: string;
  }[];
};

/** Parse an INCOMPLETE_APPLICATION error, or null when it is something else. */
export function parseIncompleteApplication(
  error: unknown,
): IncompleteApplication | null {
  const data = convexErrorData(error);
  if (!data || data.code !== "INCOMPLETE_APPLICATION") return null;

  const problems = Array.isArray(data.problems)
    ? (data.problems as unknown[]).filter((p): p is string => typeof p === "string")
    : [];

  const travellers = (
    Array.isArray(data.applicants)
      ? (data.applicants as {
          applicantId?: string | null;
          name?: string;
          missingFields?: string[];
        }[])
      : []
  ).map((a) => ({
    applicantId: a.applicantId ?? null,
    name: a.name?.trim() || "Traveller",
    missing: (a.missingFields ?? []).map(fieldLabel),
  }));

  const documents = (
    Array.isArray(data.documents)
      ? (data.documents as {
          documentKey?: string;
          label?: string;
          applicantId?: string;
          applicantName?: string;
        }[])
      : []
  ).map((d) => ({
    documentKey: d.documentKey ?? "",
    label: d.label?.trim() || "A required document",
    applicantId: d.applicantId,
    applicantName: d.applicantName,
  }));

  return {
    problems,
    travellers,
    documents,
  };
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Drop whatever the user has since fixed, so a refused-submit checklist never
 * keeps listing things that are done. Returns null once nothing is left.
 */
export function pruneIncomplete(
  info: IncompleteApplication,
  live: {
    travellers: { id: string; missingKeys: string[] }[];
    uploaded: { documentKey: string; applicantId?: string }[];
    termsAccepted: boolean;
    travellerCount: number;
  },
): IncompleteApplication | null {
  const travellers = info.travellers
    .map((t) => {
      if (t.applicantId === null) {
        return live.travellers.length === 0 ? t : { ...t, missing: [] };
      }
      const now = live.travellers.find((l) => l.id === t.applicantId);
      return { ...t, missing: now ? now.missingKeys.map(fieldLabel) : [] };
    })
    .filter((t) => t.missing.length > 0);

  const documents = info.documents.filter(
    (d) =>
      !live.uploaded.some(
        (u) =>
          u.documentKey === d.documentKey &&
          (!d.applicantId || u.applicantId === d.applicantId),
      ),
  );

  const countOk =
    live.travellers.length > 0 && live.travellers.length === live.travellerCount;
  const problems = info.problems.filter((p) => {
    if (live.termsAccepted && /terms/i.test(p)) return false;
    if (countOk && /traveller/i.test(p) && !/primary/i.test(p)) return false;
    return true;
  });

  if (travellers.length + documents.length + problems.length === 0) return null;
  return { problems, travellers, documents };
}

/** Short summary for a toast; the full checklist is rendered on the page. */
export function incompleteApplicationSummary(info: IncompleteApplication): string {
  const parts: string[] = [];
  if (info.travellers.length > 0) {
    parts.push(
      `${info.travellers.length} traveller${info.travellers.length === 1 ? "" : "s"} with missing details`,
    );
  }
  if (info.documents.length > 0) {
    parts.push(
      `${info.documents.length} document${info.documents.length === 1 ? "" : "s"} to upload`,
    );
  }
  if (parts.length === 0 && info.problems.length > 0) return info.problems[0];
  return parts.length > 0
    ? `A few things are still missing: ${joinList(parts)}.`
    : "This booking is not complete yet.";
}
