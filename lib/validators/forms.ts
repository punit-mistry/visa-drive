import { z } from "zod";

import { APPLICATION_STATUSES } from "@/lib/constants/statuses";

/**
 * Form schemas shared by the marketing site, the booking wizard and the admin
 * CRM. These validate *shape and sanity* at the edge for a good user
 * experience; Convex re-validates independently with its own `v.*` validators,
 * because a schema that only runs in the browser secures nothing.
 *
 * Zod v4 syntax (`z.email()` rather than `z.string().email()`).
 */

/* --------------------------------- atoms --------------------------------- */

export const emailField = z
  .email({ message: "Enter a valid email address." })
  .trim()
  .toLowerCase()
  .max(254, "That email address is too long.");

/** Indian mobile numbers, with or without +91. Kept permissive for other
 *  country codes so overseas applicants are not locked out. */
export const phoneField = z
  .string()
  .trim()
  .min(8, "Enter a valid phone number.")
  .max(20, "Enter a valid phone number.")
  .regex(/^[+]?[\d\s()-]{8,20}$/, "Enter a valid phone number.");

export const nameField = z
  .string()
  .trim()
  .min(2, "Please enter at least 2 characters.")
  .max(80, "That is longer than 80 characters.")
  .regex(
    /^[\p{L}\p{M}\s.'-]+$/u,
    "Use letters, spaces, apostrophes and hyphens only.",
  );

export const optionalNameField = nameField.optional().or(z.literal(""));

/** Passports vary by country; this catches obvious typos without rejecting
 *  valid formats we have not anticipated. */
export const passportField = z
  .string()
  .trim()
  .toUpperCase()
  .min(5, "Passport numbers are at least 5 characters.")
  .max(15, "Passport numbers are at most 15 characters.")
  .regex(/^[A-Z0-9]+$/, "Use letters and numbers only, with no spaces.");

export const countryCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .length(2, "Select a country.");

/** Dates travel as epoch ms so they match how Convex stores them. */
export const timestampField = z
  .number()
  .int()
  .positive("Select a date.");

export const futureDateField = timestampField.refine(
  (value) => value > Date.now() - 86_400_000,
  "Choose a date that is not in the past.",
);

export const pastDateField = timestampField.refine(
  (value) => value < Date.now(),
  "Choose a date in the past.",
);

/* ------------------------------- enquiries ------------------------------- */

export const enquirySchema = z.object({
  fullName: nameField,
  email: emailField,
  phone: phoneField,
  interestedCountry: z.string().trim().max(60).optional().or(z.literal("")),
  visaCategory: z.string().trim().max(60).optional().or(z.literal("")),
  travelDate: timestampField.optional(),
  subject: z
    .string()
    .trim()
    .min(3, "Give your enquiry a short subject.")
    .max(120, "Keep the subject under 120 characters."),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more — at least 10 characters.")
    .max(2000, "Please keep your message under 2000 characters."),
  consent: z.literal(true, {
    message: "Please agree before submitting so we can contact you.",
  }),
});

export type EnquiryFormValues = z.infer<typeof enquirySchema>;

/* --------------------------- discovery / search -------------------------- */

export const visaDiscoverySchema = z.object({
  fromCountry: z.string().trim().min(1, "Where are you travelling from?"),
  toCountry: z.string().trim().min(1, "Which country are you visiting?"),
  travelDate: timestampField.optional(),
  purpose: z
    .enum(["tourist", "business", "student", "transit", "medical", "other"])
    .optional(),
});

export type VisaDiscoveryValues = z.infer<typeof visaDiscoverySchema>;

/* ------------------------- application wizard ---------------------------- */

export const travelInfoSchema = z
  .object({
    departureCountry: countryCodeField,
    travelPurpose: z
      .string()
      .trim()
      .min(2, "Tell us the purpose of your travel.")
      .max(120),
    intendedArrivalDate: futureDateField,
    intendedDepartureDate: futureDateField,
    travellerCount: z
      .number()
      .int()
      .min(1, "At least one traveller.")
      .max(12, "For more than 12 travellers, please contact us directly."),
    previousTravelHistory: z.string().trim().max(1000).optional(),
    hasPreviousVisaRejection: z.boolean().default(false),
    previousVisaRejectionNote: z.string().trim().max(1000).optional(),
  })
  .refine(
    (data) => data.intendedDepartureDate > data.intendedArrivalDate,
    {
      message: "Your return date must be after your arrival date.",
      path: ["intendedDepartureDate"],
    },
  )
  .refine(
    (data) =>
      !data.hasPreviousVisaRejection ||
      (data.previousVisaRejectionNote ?? "").trim().length >= 10,
    {
      message:
        "Please describe the previous rejection — it helps us prepare your application.",
      path: ["previousVisaRejectionNote"],
    },
  );

export type TravelInfoValues = z.infer<typeof travelInfoSchema>;

export const addressSchema = z.object({
  line1: z.string().trim().min(3, "Enter your address.").max(120),
  line2: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().min(2, "Enter your city.").max(60),
  state: z.string().trim().max(60).optional().or(z.literal("")),
  postalCode: z.string().trim().max(16).optional().or(z.literal("")),
  country: countryCodeField,
});

export const applicantSchema = z
  .object({
    firstName: nameField,
    middleName: optionalNameField,
    lastName: nameField,
    dateOfBirth: pastDateField,
    gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
    nationality: countryCodeField,
    maritalStatus: z.string().trim().max(40).optional().or(z.literal("")),
    occupation: z.string().trim().max(80).optional().or(z.literal("")),
    email: emailField.optional().or(z.literal("")),
    phone: phoneField.optional().or(z.literal("")),
    address: addressSchema.optional(),
    passportNumber: passportField,
    passportIssueDate: pastDateField,
    passportExpiryDate: timestampField,
    passportIssuingCountry: countryCodeField,
    passportIssuingAuthority: z.string().trim().max(80).optional().or(z.literal("")),
  })
  .refine((d) => d.passportExpiryDate > d.passportIssueDate, {
    message: "Passport expiry must be after the issue date.",
    path: ["passportExpiryDate"],
  })
  .refine((d) => d.passportExpiryDate > Date.now(), {
    message: "This passport has expired.",
    path: ["passportExpiryDate"],
  })
  // Most destinations want six months of validity beyond the travel date.
  // A warning would be better than a hard error, so this is deliberately
  // lenient: it only blocks a passport expiring within 30 days.
  .refine((d) => d.passportExpiryDate > Date.now() + 30 * 86_400_000, {
    message:
      "This passport expires within 30 days. Most destinations require at least six months of validity.",
    path: ["passportExpiryDate"],
  });

export type ApplicantFormValues = z.infer<typeof applicantSchema>;

export const reviewConsentSchema = z.object({
  informationIsAccurate: z.literal(true, {
    message: "Please confirm the information you have given is accurate.",
  }),
  acceptTerms: z.literal(true, {
    message: "Please accept the terms to continue.",
  }),
  understandsNoGuarantee: z.literal(true, {
    message:
      "Please confirm you understand VisaDrive cannot guarantee the outcome.",
  }),
});

export type ReviewConsentValues = z.infer<typeof reviewConsentSchema>;

/* -------------------------------- profile -------------------------------- */

export const profileSchema = z.object({
  fullName: nameField,
  phone: phoneField.optional().or(z.literal("")),
  marketingOptIn: z.boolean().default(false),
  whatsappOptIn: z.boolean().default(true),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

/** Saved traveller profiles reuse the applicant shape plus a label. */
export const travelerProfileSchema = z.object({
  label: z.string().trim().min(1, "Name this traveller profile.").max(40),
  isSelf: z.boolean().default(false),
  applicant: applicantSchema,
});

export type TravelerProfileValues = z.infer<typeof travelerProfileSchema>;

/* -------------------------------- support -------------------------------- */

export const messageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Type a message.")
    .max(5000, "Messages are limited to 5000 characters."),
});

export const newConversationSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(3, "Give your message a subject.")
    .max(120),
  body: z
    .string()
    .trim()
    .min(10, "Tell us a bit more so we can help.")
    .max(5000),
  applicationId: z.string().optional(),
});

export type NewConversationValues = z.infer<typeof newConversationSchema>;

/* ------------------------------ admin forms ------------------------------ */

export const destinationSchema = z.object({
  name: z.string().trim().min(2, "Enter a country name.").max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only."),
  countryCode: countryCodeField,
  flagEmoji: z.string().trim().min(1, "Add a flag emoji.").max(8),
  region: z.string().trim().max(40).optional().or(z.literal("")),
  tagline: z.string().trim().max(120).optional().or(z.literal("")),
  summary: z.string().trim().min(10, "Write a short summary.").max(400),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  heroImageUrl: z.url("Enter a valid URL.").optional().or(z.literal("")),
  cardImageUrl: z.url("Enter a valid URL.").optional().or(z.literal("")),
  currency: z.string().trim().length(3, "Use a 3-letter currency code."),
  highlights: z.array(z.string().trim().max(120)).max(8).default([]),
  travelNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  officialSourceUrl: z.url("Enter a valid URL.").optional().or(z.literal("")),
  isPopular: z.boolean().default(false),
  isPublished: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
  seoTitle: z.string().trim().max(70).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(160).optional().or(z.literal("")),
});

export type DestinationFormValues = z.infer<typeof destinationSchema>;

/** Money fields are entered in rupees and converted to paise on submit. */
export const visaProductSchema = z
  .object({
    destinationId: z.string().min(1, "Choose a destination."),
    name: z.string().trim().min(2, "Name this visa product.").max(80),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only."),
    category: z.enum([
      "tourist",
      "business",
      "student",
      "transit",
      "medical",
      "work",
      "exchange_visitor",
      "service",
      "other",
    ]),
    visaType: z.string().trim().min(1, "Enter the visa type.").max(60),
    shortDescription: z.string().trim().min(10, "Write a short description.").max(300),
    detailedDescription: z.string().trim().max(8000).optional().or(z.literal("")),
    eligibleNationalities: z.array(countryCodeField).default([]),
    entryType: z.enum(["single", "multiple", "double", "not_applicable"]),
    validityDays: z.number().int().min(0).max(3650).optional(),
    maxStayDays: z.number().int().min(0).max(3650).optional(),
    processingTimeMinDays: z.number().int().min(0).max(365).optional(),
    processingTimeMaxDays: z.number().int().min(0).max(365).optional(),
    processingTimeNote: z.string().trim().max(200).optional().or(z.literal("")),
    currency: z.string().trim().length(3),
    governmentFee: z.number().int().min(0, "Fees cannot be negative."),
    serviceFee: z.number().int().min(0, "Fees cannot be negative."),
    additionalCharges: z.number().int().min(0).default(0),
    taxPercent: z.number().min(0).max(100).default(0),
    promoPrice: z.number().int().min(0).optional(),
    promoLabel: z.string().trim().max(40).optional().or(z.literal("")),
    promoEndsAt: timestampField.optional(),
    paymentMode: z.enum([
      "pay_now",
      "pay_after_confirmation",
      "manual_offline",
      "free_consultation",
    ]),
    eligibilityNotes: z.string().trim().max(4000).optional().or(z.literal("")),
    importantInformation: z.string().trim().max(4000).optional().or(z.literal("")),
    requiredApplicantFields: z.array(z.string()).default([]),
    officialSourceUrl: z.url("Enter a valid URL.").optional().or(z.literal("")),
    lastVerifiedAt: timestampField.optional(),
    isPublished: z.boolean().default(false),
    displayOrder: z.number().int().min(0).default(0),
  })
  .refine(
    (d) =>
      d.processingTimeMinDays == null ||
      d.processingTimeMaxDays == null ||
      d.processingTimeMaxDays >= d.processingTimeMinDays,
    {
      message: "Maximum processing time must be at least the minimum.",
      path: ["processingTimeMaxDays"],
    },
  )
  .refine(
    (d) => d.promoPrice == null || d.promoPrice <= d.governmentFee + d.serviceFee,
    {
      message: "A promotional price should be lower than the standard price.",
      path: ["promoPrice"],
    },
  )
  // Publishing unverified figures as if official is the one thing we must not
  // let an admin do by accident.
  .refine(
    (d) => !d.isPublished || (!!d.officialSourceUrl && !!d.lastVerifiedAt),
    {
      message:
        "Add an official source URL and mark it verified before publishing.",
      path: ["officialSourceUrl"],
    },
  );

export type VisaProductFormValues = z.infer<typeof visaProductSchema>;

export const visaRequirementSchema = z.object({
  documentKey: z.string().trim().min(1, "Choose a document type."),
  label: z.string().trim().min(2, "Give it a label.").max(80),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  isMandatory: z.boolean().default(true),
  appliesTo: z
    .enum(["all", "adult", "minor", "employed", "self_employed", "student", "retired"])
    .default("all"),
  maxSizeBytes: z.number().int().positive().default(10 * 1024 * 1024),
  displayOrder: z.number().int().min(0).default(0),
});

export const faqSchema = z.object({
  question: z.string().trim().min(5, "Write the question.").max(200),
  answer: z.string().trim().min(10, "Write the answer.").max(4000),
  displayOrder: z.number().int().min(0).default(0),
  isPublished: z.boolean().default(true),
});

export const statusUpdateSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
  visibleToCustomer: z.boolean().default(true),
});

export const manualPaymentSchema = z.object({
  amount: z.number().int().positive("Enter an amount."),
  mode: z.enum([
    "manual_bank_transfer",
    "cash",
    "upi_offline",
    "cheque",
    "other",
  ]),
  reference: z.string().trim().max(80).optional().or(z.literal("")),
  paidAt: timestampField,
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const refundSchema = z.object({
  amount: z.number().int().positive("Enter a refund amount."),
  reference: z.string().trim().max(80).optional().or(z.literal("")),
  note: z.string().trim().min(3, "Record why this was refunded.").max(1000),
});

export const documentRequestSchema = z.object({
  documentKey: z.string().trim().min(1, "Choose a document type."),
  label: z.string().trim().min(2).max(80),
  reason: z
    .string()
    .trim()
    .min(10, "Explain what is needed — the customer sees this.")
    .max(1000),
  dueDate: futureDateField.optional(),
});

export const staffInviteSchema = z.object({
  email: emailField,
  fullName: nameField,
  role: z.enum(["support_agent", "visa_agent", "manager", "admin"]),
  designation: z.string().trim().max(60).optional().or(z.literal("")),
  department: z.string().trim().max(60).optional().or(z.literal("")),
});

export const companySettingsSchema = z.object({
  companyName: z.string().trim().min(2).max(80),
  supportEmail: emailField,
  supportPhone: phoneField,
  whatsappNumber: phoneField.optional().or(z.literal("")),
  addressLine1: z.string().trim().max(120),
  addressLine2: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().max(60),
  state: z.string().trim().max(60).optional().or(z.literal("")),
  postalCode: z.string().trim().max(16).optional().or(z.literal("")),
  defaultCurrency: z.string().trim().length(3),
  defaultTaxPercent: z.number().min(0).max(100),
  bookingReferencePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(6)
    .regex(/^[A-Z]+$/, "Letters only."),
});

export type CompanySettingsValues = z.infer<typeof companySettingsSchema>;
