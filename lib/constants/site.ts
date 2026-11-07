/**
 * VisaDrive business information.
 *
 * Everything here was taken from the live visadrive.in site (audited
 * 2026-11-02) so the new platform stays recognisably the same business.
 *
 * At runtime these act as FALLBACKS only — the `appSettings` table overrides
 * them, so staff can change the phone number or address from Admin → Settings
 * without a deploy. Use `useSiteSettings()` / `getSiteSettings()` in app code
 * rather than importing these directly, except for build-time metadata.
 *
 * ⚠ Items marked NEEDS_VERIFICATION were inconsistent or looked like leftover
 *   WordPress theme filler. They are deliberately excluded from the UI until
 *   the client confirms them. See README → "Content to verify".
 */

export const SITE = {
  name: "VisaDrive",
  legalName: "VisaDrive LLP",
  /** The site states "(LLP registered company)" but never prints the full
   *  registered name, LLPIN, CIN or GST. Confirm before using on invoices. */
  legalNameVerified: false,

  domain: "visadrive.in",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://visadrive.in",

  tagline: "Your Next Destination. Your Visa, Simplified.",
  heroSubline:
    "Apply for visas with expert assistance, secure document handling and a transparent application experience.",

  /** From the existing About / Services pages, verbatim. */
  shortDescription:
    "VisaDrive is a private visa consultancy based in Khar West, Mumbai.",
  footerDescription:
    "VisaDrive helps you with your visa application: DS-160 form filling, interview guidance and appointment support, with clear and honest advice at every step.",
  mission: "To make the visa process simple and stress-free.",

  founder: "Prem Desai",

  contact: {
    phonePrimary: "+917710020694",
    phonePrimaryDisplay: "+91 77100 20694",
    phoneSecondary: "+917208590694",
    phoneSecondaryDisplay: "+91 72085 90694",
    /** Listed only on the privacy page as "24×7 customer service".
     *  Appears nowhere else — hidden until confirmed. */
    phoneSupport24x7: "+918693898794",
    phoneSupport24x7Verified: false,

    email: "premdesai@visadrive.in",
    /** Founder's personal address; a role address (hello@/support@) would be
     *  better for a booking platform. Flagged for the client. */
    emailIsPersonal: true,

    /** The privacy notice says customers may be contacted on WhatsApp but no
     *  number is published. Defaults to the primary line; override in
     *  Admin → Settings → WhatsApp. */
    whatsapp: "+917710020694",
    whatsappVerified: false,
  },

  address: {
    /** The privacy page carries the fuller version; other pages abbreviate. */
    line1: "114 Chintamani Niwas",
    line2: "Govind Patil Road, Danda",
    locality: "Khar West",
    city: "Mumbai",
    state: "Maharashtra",
    postalCode: "400052",
    country: "India",
    countryCode: "IN",
    short: "114 Chintamani Niwas, Khar West, Mumbai 400052",
    full:
      "114 Chintamani Niwas, Govind Patil Road, Danda, Khar West, Mumbai 400052, India",
  },

  /** No business hours are published other than the unverified 24×7 line. */
  businessHours: null as string | null,

  /** No social profiles are linked anywhere on the current site. */
  social: {} as Partial<Record<"instagram" | "facebook" | "linkedin" | "x" | "youtube", string>>,

  jurisdiction: "Mumbai, India",
  defaultCurrency: "INR",
  defaultLocale: "en-IN",
  defaultTimezone: "Asia/Kolkata",
} as const;

/* -------------------------------------------------------------------------- */
/*                 Legal disclaimers — reproduce verbatim                     */
/* -------------------------------------------------------------------------- */

/**
 * These are the client's own words and are their legal guard against the
 * guarantee-style marketing claims elsewhere on the site. Do not paraphrase,
 * shorten, or drop them from the footer.
 */
export const LEGAL = {
  notAffiliated:
    "VisaDrive is a private visa consultancy. We are not affiliated with, endorsed by, or part of any government, embassy or consulate.",
  noGuarantee:
    "Visa decisions are made solely by the relevant authorities, and we cannot guarantee visa approval or appointment dates.",
  governmentFeesSeparate:
    "Government visa fees are paid separately to the authorities.",
  appointmentAvailability:
    "Appointment dates depend on availability at the relevant authorities and cannot be guaranteed.",
  noAdvancePayment:
    "You are not charged in advance for appointment services. Our service fee becomes payable only once your appointment has been officially booked.",
  governmentFeesNonRefundable:
    "Official visa fees paid to the authorities are separate, are set by them and are generally non-refundable.",
  accuracyObligation:
    "You must provide accurate, complete and truthful information and genuine documents.",
  governingLaw:
    "These terms are governed by the laws of India, and the courts at Mumbai shall have jurisdiction.",
  dataNotSold: "We do not sell your personal information.",
  privacyLastUpdated: "19 October 2026",
} as const;

/* -------------------------------------------------------------------------- */
/*                         Existing service lines                             */
/* -------------------------------------------------------------------------- */

/**
 * The services VisaDrive already sells, using the names from their own site.
 * These seed the catalogue as service-type visa products (category "service")
 * so the existing business is preserved rather than replaced.
 */
export const EXISTING_SERVICES = [
  {
    key: "ds160_form_filling",
    name: "DS-160 Form Filling",
    summary:
      "Focus on your visa interview, while we take care of the application process. Accurate and error-free submission of the DS-160 form.",
    icon: "FileText",
  },
  {
    key: "express_appointment",
    name: "Express Appointment Assistance",
    summary:
      "Travelling urgently? We help you look for an earlier visa interview date and guide you through every step of the booking.",
    icon: "CalendarClock",
  },
  {
    key: "interview_guidance",
    name: "Visa Interview Guidance",
    summary:
      "Get expert guidance from our seasoned professionals to prepare for your interview with confidence.",
    icon: "MessagesSquare",
  },
  {
    key: "dropbox_renewal",
    name: "Dropbox (Renewal) Guidance",
    summary:
      "Dropbox is a visa renewal process without an interview, for eligible applicants who held a previous visa. We help you prepare and submit your documents correctly.",
    icon: "RefreshCw",
  },
  {
    key: "appointment_rescheduling",
    name: "Appointment Re-scheduling",
    summary:
      "Need to change your visa appointment date? We help you find and book a new date that suits your travel plans.",
    icon: "CalendarSync",
  },
] as const;

export type ExistingServiceKey = (typeof EXISTING_SERVICES)[number]["key"];

/* -------------------------------------------------------------------------- */
/*                         Why VisaDrive (real strengths)                     */
/* -------------------------------------------------------------------------- */

/**
 * Taken from the client's own value-proposition headings. Phrased to stay
 * consistent with their disclaimers — no approval-rate or timeline promises.
 */
export const VALUE_PROPS = [
  {
    title: "Clear, Honest Advice",
    body: "We tell you what is possible and what is not. No false promises, and no confusion about what each step involves.",
    icon: "ShieldCheck",
  },
  {
    title: "Step-by-Step Guidance",
    body: "From the application form to interview preparation, our team is with you at every stage and answers your questions.",
    icon: "Route",
  },
  {
    title: "No Advance Payment",
    body: "For appointment services, you are not charged until your appointment is officially booked, so you can start with confidence.",
    icon: "HandCoins",
  },
  {
    title: "Experienced Visa Professionals",
    body: "A specialist team that has handled visa documentation and appointment processes for years.",
    icon: "Users",
  },
  {
    title: "Careful Document Checking",
    body: "Every document is reviewed before submission so avoidable errors are caught early.",
    icon: "FileSearch",
  },
  {
    title: "Dedicated Customer Support",
    body: "Reach your assigned team on the portal, by phone or on WhatsApp, with every update recorded in one place.",
    icon: "Headset",
  },
] as const;

/* -------------------------------------------------------------------------- */
/*                                 Who we are                                 */
/* -------------------------------------------------------------------------- */

/**
 * The "who we are" block on the homepage.
 *
 * The client supplied this copy. Two superlatives in their draft — "the
 * fastest possible U.S. visa appointments" and "the most competitive rates" —
 * are deliberately not printed: this project does not make timeline or price
 * claims it cannot source, which is the same rule that already governs
 * `VALUE_PROPS`. The sentence keeps their meaning and names the work we
 * actually do instead. If the client confirms both claims, they can go back.
 *
 * `yearsOfExperience` is the client's own figure, carried over from their
 * current site and listed in NEEDS_VERIFICATION. It is on screen now, so it
 * is the one number here that has to be right.
 */
export const WHO_WE_ARE = {
  eyebrow: "Who we are",
  title: "Where opportunity meets expertise.",
  body: "We believe every plan deserves a fair chance, and that paperwork should never be the reason one stalls. We handle U.S. visa appointments and the documentation around them — from the DS-160 to interview day — with our fees stated before you commit. Our job is to simplify the journey and get you one step closer to your goal.",
  /** U.S. non-immigrant categories we prepare and support applications for. */
  visaTypes: [
    "Business & tourism visa",
    "Student visa",
    "Exchange visitor programme visa",
    "Temporary work visa",
  ],
  yearsOfExperience: 10,
} as const;

/* -------------------------------------------------------------------------- */
/*                                 Navigation                                 */
/* -------------------------------------------------------------------------- */

export const MARKETING_NAV = [
  { label: "Destinations", href: "/destinations" },
  { label: "Services", href: "/services" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
] as const;

export const FOOTER_NAV = {
  services: [
    { label: "DS-160 Form Filling", href: "/services/ds-160-form-filling" },
    { label: "Express Appointment", href: "/services/express-appointment" },
    { label: "Interview Guidance", href: "/services/interview-guidance" },
    { label: "Dropbox (Renewal)", href: "/services/dropbox-renewal" },
    { label: "Appointment Re-scheduling", href: "/services/appointment-rescheduling" },
  ],
  company: [
    { label: "About VisaDrive", href: "/about" },
    { label: "How It Works", href: "/how-it-works" },
    { label: "Contact Us", href: "/contact" },
    { label: "Track Application", href: "/dashboard/applications" },
    // The B2B front door. Agents arrive here from a colleague's word of
    // mouth, so the link has to exist somewhere a visitor can find it —
    // `/partner/register` asks them to sign in and then takes the
    // registration.
    { label: "Partner With Us", href: "/partner/register" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Refund Policy", href: "/refund-policy" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/*                      Content the client must verify                        */
/* -------------------------------------------------------------------------- */

/**
 * Surfaced in Admin → Settings so the client sees exactly what was carried
 * over as unverified, rather than it silently going live.
 */
export const NEEDS_VERIFICATION = [
  {
    item: "Headline statistics",
    detail:
      '"500 Satisfied Customers" and "100 Leads in Pipeline" appear on the current site but read as WordPress theme filler. They are NOT displayed on the new site.',
  },
  {
    item: "Years of experience",
    detail:
      'The current site claims "over 10+ years of experience in the travel industry". It is now displayed on the homepage in the "Who we are" section (WHO_WE_ARE.yearsOfExperience). Confirm the figure or tell us to drop it.',
  },
  {
    item: "30-day appointment claim",
    detail:
      '"Skip the 365-day wait and get interview dates within 30 days" contradicts the site\'s own no-guarantee disclaimer. Reworded to remove the promise.',
  },
  {
    item: "24×7 support number",
    detail:
      "8693898794 appears only on the privacy page. Hidden until confirmed.",
  },
  {
    item: "Office address",
    detail:
      "Pages disagree: most show \"114 Chintamani Niwas, Khar West, Mumbai 400052\"; the privacy page adds \"Govind Patil Road, Danda\". The longer form is used.",
  },
  {
    item: "Contact email",
    detail:
      "premdesai@visadrive.in is the founder's personal address. A role address is recommended for a booking platform.",
  },
  {
    item: "Visa fees and processing times",
    detail:
      "All seeded catalogue pricing and timelines are demonstration content and are flagged as such until an admin verifies them against the official source.",
  },
  {
    item: "Testimonials",
    detail:
      "The current site has none. Seeded testimonials are clearly labelled as demo content and must be replaced with real, consented quotes.",
  },
] as const;
