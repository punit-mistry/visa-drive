/**
 * Document type catalogue.
 *
 * These are the document kinds the system knows how to label and render.
 * A visa product's actual checklist lives in the `visaRequirements` table and
 * is fully admin-editable — this list just supplies sensible defaults, the
 * human label, and the upload constraints when an admin picks a known type.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"] as const;

export const ACCEPT_ATTRIBUTE = ACCEPTED_MIME_TYPES.join(",");

export interface DocumentTypeDefinition {
  key: string;
  label: string;
  description: string;
  /** Which applicants it normally applies to. */
  appliesTo:
    | "all"
    | "adult"
    | "minor"
    | "employed"
    | "self_employed"
    | "student"
    | "retired";
  defaultMandatory: boolean;
  allowedMimeTypes: string[];
  maxSizeBytes: number;
  /** Shown as a hint under the dropzone. */
  tip?: string;
  group: "identity" | "financial" | "travel" | "employment" | "supporting";
}

export const DOCUMENT_TYPES: DocumentTypeDefinition[] = [
  {
    key: "passport_front",
    label: "Passport — front page",
    description: "The photo page showing your name, date of birth and passport number.",
    appliesTo: "all",
    defaultMandatory: true,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    tip: "Make sure all four corners are visible and the text is readable.",
    group: "identity",
  },
  {
    key: "passport_back",
    label: "Passport — back page",
    description: "The address page at the back of your passport.",
    appliesTo: "all",
    defaultMandatory: true,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    group: "identity",
  },
  {
    key: "photograph",
    label: "Passport-size photograph",
    description: "A recent colour photograph against a plain white background.",
    appliesTo: "all",
    defaultMandatory: true,
    allowedMimeTypes: ["image/jpeg", "image/png"],
    maxSizeBytes: 5 * 1024 * 1024,
    tip: "No glasses, no headwear unless worn for religious reasons.",
    group: "identity",
  },
  {
    key: "bank_statement",
    label: "Bank statement",
    description: "Statement covering the most recent months, stamped by your bank.",
    appliesTo: "all",
    defaultMandatory: true,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    tip: "A single PDF is easier to review than several images.",
    group: "financial",
  },
  {
    key: "income_tax_return",
    label: "Income tax return",
    description: "Your most recent filed return or acknowledgement.",
    appliesTo: "all",
    defaultMandatory: false,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    group: "financial",
  },
  {
    key: "salary_slips",
    label: "Salary slips",
    description: "Recent salary slips from your employer.",
    appliesTo: "employed",
    defaultMandatory: false,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    group: "financial",
  },
  {
    key: "flight_itinerary",
    label: "Flight itinerary",
    description: "A booking or reservation showing your intended travel dates.",
    appliesTo: "all",
    defaultMandatory: false,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    tip: "A held reservation is usually enough — do not buy tickets before approval.",
    group: "travel",
  },
  {
    key: "hotel_booking",
    label: "Hotel booking",
    description: "Accommodation confirmation for your stay.",
    appliesTo: "all",
    defaultMandatory: false,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    group: "travel",
  },
  {
    key: "travel_insurance",
    label: "Travel insurance",
    description: "Policy covering the full duration of your trip.",
    appliesTo: "all",
    defaultMandatory: false,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    group: "travel",
  },
  {
    key: "employment_proof",
    label: "Employment proof",
    description: "Employment letter, no-objection certificate or appointment letter.",
    appliesTo: "employed",
    defaultMandatory: false,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    group: "employment",
  },
  {
    key: "business_documents",
    label: "Business documents",
    description: "Registration certificate, GST certificate or company incorporation papers.",
    appliesTo: "self_employed",
    defaultMandatory: false,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    group: "employment",
  },
  {
    key: "invitation_letter",
    label: "Invitation letter",
    description: "A letter from your host, business contact or the organisation inviting you.",
    appliesTo: "all",
    defaultMandatory: false,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    group: "supporting",
  },
  {
    key: "previous_visa",
    label: "Previous visa copies",
    description: "Copies of visas you have held before, if any.",
    appliesTo: "all",
    defaultMandatory: false,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    group: "supporting",
  },
  {
    key: "student_enrolment",
    label: "Enrolment or admission letter",
    description: "Proof of admission or current enrolment from your institution.",
    appliesTo: "student",
    defaultMandatory: false,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    group: "supporting",
  },
  {
    key: "ds160_confirmation",
    label: "DS-160 confirmation page",
    description: "The confirmation page with the barcode, generated after submitting the DS-160.",
    appliesTo: "all",
    defaultMandatory: false,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    group: "supporting",
  },
  {
    key: "appointment_confirmation",
    label: "Appointment confirmation",
    description: "Your booked interview or biometric appointment confirmation.",
    appliesTo: "all",
    defaultMandatory: false,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    group: "supporting",
  },
  {
    key: "cover_letter",
    label: "Cover letter",
    description: "A letter explaining the purpose and details of your trip.",
    appliesTo: "all",
    defaultMandatory: false,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    group: "supporting",
  },
  {
    key: "other",
    label: "Other document",
    description: "Any additional document requested by the VisaDrive team.",
    appliesTo: "all",
    defaultMandatory: false,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    group: "supporting",
  },
];

export const DOCUMENT_TYPE_MAP: Record<string, DocumentTypeDefinition> =
  Object.fromEntries(DOCUMENT_TYPES.map((d) => [d.key, d]));

export const DOCUMENT_GROUP_LABELS: Record<
  DocumentTypeDefinition["group"],
  string
> = {
  identity: "Identity",
  financial: "Financial",
  travel: "Travel",
  employment: "Employment",
  supporting: "Supporting",
};

export function documentLabel(key: string, fallback?: string): string {
  return DOCUMENT_TYPE_MAP[key]?.label ?? fallback ?? key;
}

/** Client-side guard before an upload is attempted. */
export function validateFile(
  file: { name: string; size: number; type: string },
  constraints?: { allowedMimeTypes?: string[]; maxSizeBytes?: number },
): { ok: true } | { ok: false; reason: string } {
  const allowed = constraints?.allowedMimeTypes?.length
    ? constraints.allowedMimeTypes
    : [...ACCEPTED_MIME_TYPES];
  const maxSize = constraints?.maxSizeBytes ?? MAX_UPLOAD_BYTES;

  if (!allowed.includes(file.type)) {
    return {
      ok: false,
      reason: `${file.name} is not an accepted file type. Upload a PDF, JPG or PNG.`,
    };
  }
  if (file.size > maxSize) {
    return {
      ok: false,
      reason: `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(maxSize)}.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, reason: `${file.name} appears to be empty.` };
  }
  return { ok: true };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
