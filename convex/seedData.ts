import { EXISTING_SERVICES } from "../lib/constants/site";

/* ============================================================================
 * Demo catalogue content.
 *
 * ⚠ HONESTY CONTRACT ⚠
 *
 * Every product defined in this file is seeded with `isDemoContent: true` and
 * `lastVerifiedAt: undefined`. The fees, validity periods, maximum stays and
 * processing times below are ILLUSTRATIVE PLACEHOLDERS chosen so the UI has
 * realistic-looking shapes to render — they are NOT quoted from any embassy,
 * consulate or visa authority, and `DEMO_FEE_NOTICE` is appended to every
 * product's `importantInformation` so a customer can never mistake them for
 * official figures.
 *
 * `officialSourceUrl` is set ONLY where the genuine government portal is
 * known with confidence. Where it is not, the field is left undefined rather
 * than pointing at a guessed URL.
 *
 * Images: `heroImageUrl` / `cardImageUrl` are deliberately left undefined so
 * the UI falls back to its own placeholder treatment. Inventing Unsplash URLs
 * would produce broken images; real ones belong in Admin → Catalogue.
 *
 * The five USA `category: "service"` products reproduce VisaDrive's REAL
 * service lines and descriptions verbatim from `EXISTING_SERVICES`, and carry
 * `paymentMode: "pay_after_confirmation"` so the business's actual "no advance
 * payment until your appointment is booked" model survives the migration.
 * ========================================================================== */

export const DEMO_FEE_NOTICE =
  "Demonstration content — the fees, validity, maximum stay and processing " +
  "times shown for this product are placeholder figures for the demo " +
  "environment and have not been verified against the official source. " +
  "An administrator must confirm them in Admin → Catalogue before this " +
  "product is published to real customers.";

export const SERVICE_PAYMENT_NOTICE =
  "You are not charged in advance for this service. Our service fee becomes " +
  "payable only once your appointment has been officially booked. Government " +
  "visa fees are paid separately to the authorities.";

/* -------------------------------------------------------------------------- */
/*                                   types                                    */
/* -------------------------------------------------------------------------- */

export type SeedAppliesTo =
  | "all"
  | "adult"
  | "minor"
  | "employed"
  | "self_employed"
  | "student"
  | "retired";

export interface SeedRequirement {
  /** A key from `DOCUMENT_TYPES` in lib/constants/documents.ts. */
  documentKey: string;
  isMandatory?: boolean;
  appliesTo?: SeedAppliesTo;
  /** Overrides the default description from the document catalogue. */
  description?: string;
}

export interface SeedFaq {
  question: string;
  answer: string;
}

export type SeedCategory =
  | "tourist"
  | "business"
  | "student"
  | "transit"
  | "medical"
  | "work"
  | "exchange_visitor"
  | "service"
  | "other";

export type SeedEntryType = "single" | "multiple" | "double" | "not_applicable";

export type SeedPaymentMode =
  | "pay_now"
  | "pay_after_confirmation"
  | "manual_offline"
  | "free_consultation";

export interface SeedProduct {
  slug: string;
  name: string;
  category: SeedCategory;
  visaType: string;
  shortDescription: string;
  detailedDescription?: string;
  entryType: SeedEntryType;
  /** Placeholder figures — see DEMO_FEE_NOTICE. */
  validityDays?: number;
  maxStayDays?: number;
  processingTimeMinDays?: number;
  processingTimeMaxDays?: number;
  processingTimeNote?: string;
  /** Smallest currency unit (paise). Placeholder figures. */
  governmentFee: number;
  serviceFee: number;
  additionalCharges: number;
  taxPercent: number;
  paymentMode: SeedPaymentMode;
  eligibilityNotes?: string;
  /** Product-specific notes. DEMO_FEE_NOTICE is appended automatically. */
  importantInformation?: string;
  requiredApplicantFields: string[];
  officialSourceUrl?: string;
  requirements: SeedRequirement[];
  faqs: SeedFaq[];
}

export interface SeedDestination {
  slug: string;
  name: string;
  countryCode: string;
  flagEmoji: string;
  region: string;
  tagline: string;
  summary: string;
  description: string;
  currency: string;
  highlights: string[];
  travelNotes?: string;
  officialSourceUrl?: string;
  isPopular: boolean;
  seoTitle: string;
  seoDescription: string;
  products: SeedProduct[];
  faqs: SeedFaq[];
}

/* -------------------------------------------------------------------------- */
/*                            shared field presets                            */
/* -------------------------------------------------------------------------- */

const FULL_APPLICANT_FIELDS = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "gender",
  "nationality",
  "maritalStatus",
  "occupation",
  "email",
  "phone",
  "address",
  "passportNumber",
  "passportIssueDate",
  "passportExpiryDate",
  "passportIssuingCountry",
];

const SERVICE_APPLICANT_FIELDS = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "email",
  "phone",
  "passportNumber",
  "passportExpiryDate",
];

const CORE_IDENTITY: SeedRequirement[] = [
  { documentKey: "passport_front", isMandatory: true },
  { documentKey: "passport_back", isMandatory: true },
  { documentKey: "photograph", isMandatory: true },
];

const FINANCIAL_PROOF: SeedRequirement[] = [
  { documentKey: "bank_statement", isMandatory: true },
  { documentKey: "income_tax_return", isMandatory: false },
];

const TRAVEL_PROOF: SeedRequirement[] = [
  { documentKey: "flight_itinerary", isMandatory: false },
  { documentKey: "hotel_booking", isMandatory: false },
  { documentKey: "travel_insurance", isMandatory: false },
];

const WORK_PROOF: SeedRequirement[] = [
  { documentKey: "employment_proof", isMandatory: false, appliesTo: "employed" },
  { documentKey: "salary_slips", isMandatory: false, appliesTo: "employed" },
  {
    documentKey: "business_documents",
    isMandatory: false,
    appliesTo: "self_employed",
  },
];

/* -------------------------------------------------------------------------- */
/*                                destinations                                */
/* -------------------------------------------------------------------------- */

export const SEED_DESTINATIONS: SeedDestination[] = [
  /* ------------------------------------------------------------------ UAE */
  {
    slug: "uae",
    name: "United Arab Emirates",
    countryCode: "AE",
    flagEmoji: "🇦🇪",
    region: "Middle East",
    tagline: "Dubai, Abu Dhabi and everything in between",
    summary:
      "Short-stay, tourist and business visas for the UAE, handled end to end with your documents checked before anything is submitted.",
    description:
      "The UAE is one of the most common first international trips from India, and one of the easiest to get wrong on paperwork. We check your passport validity, photographs and supporting documents against the current checklist before anything is filed, and keep you updated at every stage.",
    currency: "INR",
    highlights: [
      "Popular for both leisure and business travel from Mumbai",
      "Document checking before submission",
      "Status tracked in your VisaDrive portal",
      "Clear guidance on what each stage requires",
    ],
    travelNotes:
      "Requirements differ by nationality and by the emirate you are entering. Confirm the current rules on the official portal before you book travel.",
    officialSourceUrl: "https://u.ae/en/information-and-services/visa-and-emirates-id",
    isPopular: true,
    seoTitle: "UAE Visa from India — Tourist, Business & Short Stay | VisaDrive",
    seoDescription:
      "Apply for a UAE tourist, business or short stay visa with VisaDrive. Document checking, transparent guidance and status tracking throughout.",
    faqs: [
      {
        question: "How long should my passport be valid for a UAE visa?",
        answer:
          "Most authorities ask for a comfortable margin of validity beyond your travel dates. Check the exact requirement on the official UAE government portal, and if you are close to the limit, speak to us before booking flights.",
      },
      {
        question: "Can VisaDrive guarantee my UAE visa will be approved?",
        answer:
          "No. Visa decisions are made solely by the relevant authorities, and nobody can guarantee an approval or a particular date. What we can do is make sure your application is complete, accurate and submitted correctly.",
      },
    ],
    products: [
      {
        slug: "tourist-visa",
        name: "UAE Tourist Visa",
        category: "tourist",
        visaType: "Tourist Visa",
        shortDescription:
          "For holidays, sightseeing and visiting friends or family in the UAE.",
        detailedDescription:
          "A standard leisure visa covering holidays, sightseeing and visits to friends or relatives. We prepare and check the full document set, submit on your behalf and keep the application status visible in your portal.",
        entryType: "single",
        validityDays: 60,
        maxStayDays: 30,
        processingTimeMinDays: 3,
        processingTimeMaxDays: 6,
        governmentFee: 620000,
        serviceFee: 150000,
        additionalCharges: 0,
        taxPercent: 18,
        paymentMode: "pay_now",
        eligibilityNotes:
          "Eligibility depends on your nationality, travel history and the purpose of your trip. We will tell you honestly if we think your profile needs more supporting documents.",
        importantInformation:
          "Government visa fees are paid separately to the authorities and are generally non-refundable once an application has been filed.",
        requiredApplicantFields: FULL_APPLICANT_FIELDS,
        officialSourceUrl:
          "https://u.ae/en/information-and-services/visa-and-emirates-id",
        requirements: [
          ...CORE_IDENTITY,
          { documentKey: "bank_statement", isMandatory: true },
          ...TRAVEL_PROOF,
          { documentKey: "previous_visa", isMandatory: false },
        ],
        faqs: [
          {
            question: "Do I need to book flights before applying?",
            answer:
              "A held reservation is usually enough to show intended travel dates. We recommend not buying non-refundable tickets until you have a decision.",
          },
          {
            question: "Can I extend my stay once I am in the UAE?",
            answer:
              "Extension rules are set by the UAE authorities and change from time to time. Check the official portal, and contact us if you need help understanding the current position.",
          },
        ],
      },
      {
        slug: "business-visa",
        name: "UAE Business Visa",
        category: "business",
        visaType: "Business Visa",
        shortDescription:
          "For meetings, conferences, trade fairs and other short business trips.",
        detailedDescription:
          "For travellers attending meetings, conferences, exhibitions or supplier visits. In addition to the standard set, business applications usually need an invitation from the host company and proof of your employment or business.",
        entryType: "single",
        validityDays: 60,
        maxStayDays: 30,
        processingTimeMinDays: 4,
        processingTimeMaxDays: 8,
        governmentFee: 780000,
        serviceFee: 200000,
        additionalCharges: 0,
        taxPercent: 18,
        paymentMode: "pay_now",
        eligibilityNotes:
          "You will normally need a letter from the host organisation in the UAE as well as proof of your own employment or business.",
        importantInformation:
          "A business visa does not permit you to take up employment in the UAE.",
        requiredApplicantFields: FULL_APPLICANT_FIELDS,
        officialSourceUrl:
          "https://u.ae/en/information-and-services/visa-and-emirates-id",
        requirements: [
          ...CORE_IDENTITY,
          { documentKey: "invitation_letter", isMandatory: true },
          ...FINANCIAL_PROOF,
          ...WORK_PROOF,
          { documentKey: "flight_itinerary", isMandatory: false },
          { documentKey: "cover_letter", isMandatory: false },
        ],
        faqs: [
          {
            question: "Who should write the invitation letter?",
            answer:
              "The company or organisation you are visiting in the UAE. It should state who you are, why you are visiting and the dates involved.",
          },
          {
            question: "Can I attend a trade fair on a tourist visa instead?",
            answer:
              "That depends on the authority's current rules and on what you will actually be doing. Tell us the purpose honestly and we will advise which route fits.",
          },
        ],
      },
      {
        slug: "short-stay-visa",
        name: "UAE Short Stay Visa",
        category: "other",
        visaType: "Short Stay Visa",
        shortDescription:
          "A shorter-duration option for brief trips and stopovers.",
        detailedDescription:
          "Intended for short trips where a full tourist visa duration is not needed. Fewer supporting documents are usually required, but passport validity and photograph standards are the same.",
        entryType: "single",
        validityDays: 30,
        maxStayDays: 14,
        processingTimeMinDays: 2,
        processingTimeMaxDays: 5,
        governmentFee: 420000,
        serviceFee: 120000,
        additionalCharges: 0,
        taxPercent: 18,
        paymentMode: "pay_now",
        importantInformation:
          "A short stay visa cannot usually be converted into a longer stay once you have travelled.",
        requiredApplicantFields: FULL_APPLICANT_FIELDS,
        officialSourceUrl:
          "https://u.ae/en/information-and-services/visa-and-emirates-id",
        requirements: [
          ...CORE_IDENTITY,
          { documentKey: "flight_itinerary", isMandatory: false },
          { documentKey: "hotel_booking", isMandatory: false },
        ],
        faqs: [
          {
            question: "Is a short stay visa cheaper than a tourist visa?",
            answer:
              "Usually yes, because the permitted stay is shorter. The exact official fee is set by the authorities — the figures shown here are demonstration placeholders.",
          },
          {
            question: "What happens if my flight is delayed and I overstay?",
            answer:
              "Overstaying can attract fines set by the UAE authorities. Contact us as soon as you know there is a problem and we will help you understand your options.",
          },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------- Vietnam */
  {
    slug: "vietnam",
    name: "Vietnam",
    countryCode: "VN",
    flagEmoji: "🇻🇳",
    region: "South East Asia",
    tagline: "e-Visas and business travel to Vietnam",
    summary:
      "Vietnam's electronic visa system is straightforward when the form is filled correctly — and unforgiving when it is not.",
    description:
      "Vietnam runs an official e-visa portal. Most of the problems we see are avoidable: a mismatched name, a photograph that does not meet the specification, or a date entered in the wrong format. We check all of it before submission.",
    currency: "INR",
    highlights: [
      "Official e-visa route, filled and checked by our team",
      "Photograph and passport scan specification checked before filing",
      "Business travel supported with invitation handling",
      "Progress tracked in your VisaDrive portal",
    ],
    travelNotes:
      "Entry and exit must usually match the ports declared in the application. Confirm the current rules on the official e-visa portal.",
    officialSourceUrl: "https://evisa.gov.vn/",
    isPopular: true,
    seoTitle: "Vietnam e-Visa & Business Visa from India | VisaDrive",
    seoDescription:
      "Vietnam tourist e-Visa and business visa assistance from VisaDrive — accurate form filling, document checking and clear status tracking.",
    faqs: [
      {
        question: "Is the Vietnam e-visa the same as a visa on arrival?",
        answer:
          "No. The e-visa is applied for and issued before you travel through the official portal. Treat any other route with caution and check the official site.",
      },
      {
        question: "What happens if my name is entered differently from my passport?",
        answer:
          "A mismatch is one of the most common reasons an e-visa causes trouble at the border. We check every field against your passport scan before submitting.",
      },
    ],
    products: [
      {
        slug: "tourist-e-visa",
        name: "Vietnam Tourist e-Visa",
        category: "tourist",
        visaType: "e-Visa",
        shortDescription:
          "The official electronic visa for leisure travel to Vietnam.",
        detailedDescription:
          "We complete the official e-visa application on your behalf, check your photograph and passport scan against the published specification, and send you the approved e-visa to carry.",
        entryType: "single",
        validityDays: 90,
        maxStayDays: 30,
        processingTimeMinDays: 3,
        processingTimeMaxDays: 7,
        governmentFee: 250000,
        serviceFee: 120000,
        additionalCharges: 0,
        taxPercent: 18,
        paymentMode: "pay_now",
        importantInformation:
          "The e-visa is issued electronically. Carry a printed copy as well as the file on your phone.",
        requiredApplicantFields: FULL_APPLICANT_FIELDS,
        officialSourceUrl: "https://evisa.gov.vn/",
        requirements: [
          { documentKey: "passport_front", isMandatory: true },
          { documentKey: "photograph", isMandatory: true },
          { documentKey: "flight_itinerary", isMandatory: false },
          { documentKey: "hotel_booking", isMandatory: false },
        ],
        faqs: [
          {
            question: "What photograph does the Vietnam e-visa need?",
            answer:
              "A plain, recent, straight-on photograph with no glasses. The portal is strict about this; we check yours before uploading it.",
          },
          {
            question: "Can I enter through a different airport than the one I declared?",
            answer:
              "Usually not. The entry and exit points you declare are printed on the e-visa, so tell us your real plan before we file.",
          },
        ],
      },
      {
        slug: "business-visa",
        name: "Vietnam Business Visa",
        category: "business",
        visaType: "Business Visa",
        shortDescription:
          "For meetings, factory visits and supplier trips to Vietnam.",
        detailedDescription:
          "For business travel where a sponsoring company in Vietnam is involved. We handle the invitation paperwork alongside your personal documents.",
        entryType: "multiple",
        validityDays: 90,
        maxStayDays: 30,
        processingTimeMinDays: 5,
        processingTimeMaxDays: 10,
        governmentFee: 480000,
        serviceFee: 200000,
        additionalCharges: 0,
        taxPercent: 18,
        paymentMode: "pay_now",
        eligibilityNotes:
          "A sponsoring company in Vietnam is normally required for the business route.",
        importantInformation:
          "A business visa does not permit you to take up employment in Vietnam.",
        requiredApplicantFields: FULL_APPLICANT_FIELDS,
        officialSourceUrl: "https://evisa.gov.vn/",
        requirements: [
          ...CORE_IDENTITY,
          { documentKey: "invitation_letter", isMandatory: true },
          ...WORK_PROOF,
          { documentKey: "bank_statement", isMandatory: false },
          { documentKey: "flight_itinerary", isMandatory: false },
        ],
        faqs: [
          {
            question: "Do I need a sponsoring company in Vietnam?",
            answer:
              "For the business route, normally yes. If you do not have one, tell us what the trip actually involves and we will advise on the right category.",
          },
          {
            question: "Can a business visa be multiple entry?",
            answer:
              "Multiple entry is available in some cases. The decision rests with the Vietnamese authorities.",
          },
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- Japan */
  {
    slug: "japan",
    name: "Japan",
    countryCode: "JP",
    flagEmoji: "🇯🇵",
    region: "East Asia",
    tagline: "Precise paperwork, patiently prepared",
    summary:
      "Japanese visa applications reward careful, complete documentation. We prepare the full set, in the order the consulate expects it.",
    description:
      "Japan asks for a detailed itinerary and clear evidence of funds. The applications that go smoothly are the ones where every day of the trip is accounted for and every number adds up. That is the part we take off your hands.",
    currency: "INR",
    highlights: [
      "Day-by-day itinerary prepared with you",
      "Financial documents checked for consistency",
      "Tourist and business routes supported",
      "Clear explanation of what each document is for",
    ],
    travelNotes:
      "Requirements vary by nationality and by the consulate handling your region. Confirm the current list on the official Ministry of Foreign Affairs site.",
    officialSourceUrl: "https://www.mofa.go.jp/j_info/visit/visa/index.html",
    isPopular: true,
    seoTitle: "Japan Visa from India — Tourist & Business | VisaDrive",
    seoDescription:
      "Japan tourist and business visa assistance from VisaDrive. Itinerary preparation, document checking and honest guidance at every step.",
    faqs: [
      {
        question: "Why does Japan ask for such a detailed itinerary?",
        answer:
          "The consulate uses it to understand the purpose and shape of your trip. It does not have to be glamorous — it has to be realistic and consistent with your bookings.",
      },
      {
        question: "Do I need to show a minimum bank balance?",
        answer:
          "There is no number we can promise you. What matters is that your funds plausibly cover the trip you have described. We will review your statements with you.",
      },
    ],
    products: [
      {
        slug: "tourist-visa",
        name: "Japan Tourist Visa",
        category: "tourist",
        visaType: "Temporary Visitor (Tourism)",
        shortDescription:
          "For sightseeing, holidays and visiting friends or relatives in Japan.",
        detailedDescription:
          "We help you build the day-by-day schedule the consulate expects, check your financial documents for consistency, and assemble the application in the order it is asked for.",
        entryType: "single",
        validityDays: 90,
        maxStayDays: 15,
        processingTimeMinDays: 5,
        processingTimeMaxDays: 10,
        governmentFee: 90000,
        serviceFee: 250000,
        additionalCharges: 0,
        taxPercent: 18,
        paymentMode: "pay_now",
        importantInformation:
          "A detailed day-by-day itinerary is a core part of this application, not an optional extra.",
        requiredApplicantFields: FULL_APPLICANT_FIELDS,
        officialSourceUrl: "https://www.mofa.go.jp/j_info/visit/visa/index.html",
        requirements: [
          ...CORE_IDENTITY,
          ...FINANCIAL_PROOF,
          { documentKey: "flight_itinerary", isMandatory: true },
          { documentKey: "hotel_booking", isMandatory: true },
          { documentKey: "employment_proof", isMandatory: false, appliesTo: "employed" },
          { documentKey: "cover_letter", isMandatory: false },
          { documentKey: "previous_visa", isMandatory: false },
        ],
        faqs: [
          {
            question: "Can I apply if I have not booked accommodation yet?",
            answer:
              "You will need something concrete to show where you intend to stay. Refundable bookings are usually acceptable — confirm the current requirement before you commit money.",
          },
          {
            question: "Is an interview required?",
            answer:
              "Usually not for tourism, but the consulate may ask to speak to you. If that happens we will prepare you for it.",
          },
        ],
      },
      {
        slug: "business-visa",
        name: "Japan Business Visa",
        category: "business",
        visaType: "Temporary Visitor (Business)",
        shortDescription:
          "For meetings, negotiations, conferences and short business assignments.",
        detailedDescription:
          "Business applications need documents from both sides: a letter of invitation and schedule from the Japanese host, and proof of your position and employer in India. We coordinate both.",
        entryType: "single",
        validityDays: 90,
        maxStayDays: 15,
        processingTimeMinDays: 5,
        processingTimeMaxDays: 12,
        governmentFee: 90000,
        serviceFee: 300000,
        additionalCharges: 0,
        taxPercent: 18,
        paymentMode: "pay_now",
        eligibilityNotes:
          "A letter of invitation and a schedule of activities from the host organisation in Japan are normally required.",
        importantInformation:
          "A temporary visitor visa does not permit paid work in Japan.",
        requiredApplicantFields: FULL_APPLICANT_FIELDS,
        officialSourceUrl: "https://www.mofa.go.jp/j_info/visit/visa/index.html",
        requirements: [
          ...CORE_IDENTITY,
          { documentKey: "invitation_letter", isMandatory: true },
          ...WORK_PROOF,
          { documentKey: "bank_statement", isMandatory: true },
          { documentKey: "flight_itinerary", isMandatory: false },
          { documentKey: "cover_letter", isMandatory: false },
        ],
        faqs: [
          {
            question: "Who provides the schedule of activities?",
            answer:
              "The host organisation in Japan. It should set out what you will be doing on each day of the visit.",
          },
          {
            question: "Can my employer cover my expenses instead of me?",
            answer:
              "Yes, and if they do, the financial evidence should come from them along with a letter confirming it.",
          },
        ],
      },
    ],
  },

  /* ------------------------------------------------------------------ USA */
  {
    slug: "usa",
    name: "United States of America",
    countryCode: "US",
    flagEmoji: "🇺🇸",
    region: "North America",
    tagline: "DS-160, appointments and interview preparation",
    summary:
      "The US process is where VisaDrive started: accurate DS-160 filling, appointment support and honest interview preparation.",
    description:
      "US visa applications turn on two things — a DS-160 that is accurate and consistent, and an interview you are genuinely prepared for. These are the services VisaDrive has been providing since the beginning, and they are offered here with the same no-advance-payment model.",
    currency: "INR",
    highlights: [
      "DS-160 completed accurately and error-free",
      "Express appointment assistance for urgent travel",
      "Interview guidance from experienced professionals",
      "Dropbox (renewal) support for eligible applicants",
      "No advance payment for appointment services",
    ],
    travelNotes:
      "Appointment availability is set by the US authorities and cannot be guaranteed by anyone. Visa decisions are made solely by the consular officer.",
    officialSourceUrl: "https://travel.state.gov/content/travel/en/us-visas.html",
    isPopular: true,
    seoTitle: "US Visa Services — DS-160, Appointments & Interview Prep | VisaDrive",
    seoDescription:
      "DS-160 form filling, express appointment assistance, interview guidance, Dropbox renewal support and appointment re-scheduling from VisaDrive, Mumbai.",
    faqs: [
      {
        question: "Can VisaDrive get me an earlier interview date?",
        answer:
          "We help you look for earlier dates and guide you through booking, but appointment availability is controlled by the US authorities and cannot be guaranteed.",
      },
      {
        question: "When do I pay for appointment services?",
        answer:
          "Our service fee becomes payable only once your appointment has been officially booked. Government visa fees are paid separately to the authorities.",
      },
    ],
    products: [
      {
        slug: "b1-b2-tourist-business",
        name: "B1/B2 Tourist & Business Visa",
        category: "tourist",
        visaType: "B1/B2",
        shortDescription:
          "The combined visitor visa for tourism, family visits and short business trips.",
        detailedDescription:
          "End-to-end support for a B1/B2 application: DS-160 preparation, appointment booking, document checking and interview preparation, with every step tracked in your portal.",
        entryType: "multiple",
        validityDays: 3650,
        maxStayDays: 180,
        processingTimeNote:
          "Driven almost entirely by interview appointment availability, which is set by the US authorities and varies considerably.",
        governmentFee: 1600000,
        serviceFee: 500000,
        additionalCharges: 0,
        taxPercent: 18,
        paymentMode: "pay_now",
        eligibilityNotes:
          "A B1/B2 visa does not permit study or paid employment in the United States.",
        importantInformation:
          "Visa decisions are made solely by the consular officer at the interview. Nobody can guarantee an approval or a particular appointment date.",
        requiredApplicantFields: FULL_APPLICANT_FIELDS,
        officialSourceUrl: "https://travel.state.gov/content/travel/en/us-visas.html",
        requirements: [
          ...CORE_IDENTITY,
          { documentKey: "ds160_confirmation", isMandatory: true },
          { documentKey: "appointment_confirmation", isMandatory: false },
          ...FINANCIAL_PROOF,
          ...WORK_PROOF,
          { documentKey: "previous_visa", isMandatory: false },
          { documentKey: "invitation_letter", isMandatory: false },
          { documentKey: "cover_letter", isMandatory: false },
        ],
        faqs: [
          {
            question: "How long does a B1/B2 application take?",
            answer:
              "The paperwork takes days; the interview date is the variable, and it is set by the US authorities. We will tell you what we are seeing rather than promise you a timeline.",
          },
          {
            question: "What happens if my visa is refused?",
            answer:
              "The consular officer's decision is final for that application. We will go through the refusal with you honestly and explain what, if anything, could be different next time.",
          },
        ],
      },
      {
        slug: "f1-student-visa",
        name: "F1 Student Visa",
        category: "student",
        visaType: "F1",
        shortDescription:
          "For students admitted to an accredited institution in the United States.",
        detailedDescription:
          "Support for the F1 route once you have your admission and I-20: DS-160 preparation, SEVIS and appointment guidance, financial documentation review and interview preparation.",
        entryType: "multiple",
        validityDays: 1825,
        maxStayDays: 0,
        processingTimeNote:
          "Depends on interview appointment availability and on how quickly your institution issues the required paperwork.",
        governmentFee: 1600000,
        serviceFee: 800000,
        additionalCharges: 0,
        taxPercent: 18,
        paymentMode: "pay_now",
        eligibilityNotes:
          "You must already hold an admission offer and the required documentation from an accredited US institution before applying.",
        importantInformation:
          "Duration of stay for F1 is tied to your programme rather than a fixed number of days, so the maximum stay figure shown here is not meaningful for this product.",
        requiredApplicantFields: FULL_APPLICANT_FIELDS,
        officialSourceUrl: "https://travel.state.gov/content/travel/en/us-visas.html",
        requirements: [
          ...CORE_IDENTITY,
          { documentKey: "student_enrolment", isMandatory: true, appliesTo: "student" },
          { documentKey: "ds160_confirmation", isMandatory: true },
          { documentKey: "appointment_confirmation", isMandatory: false },
          { documentKey: "bank_statement", isMandatory: true },
          { documentKey: "income_tax_return", isMandatory: false },
          { documentKey: "cover_letter", isMandatory: false },
          { documentKey: "previous_visa", isMandatory: false },
        ],
        faqs: [
          {
            question: "Can I apply before I have my admission letter?",
            answer:
              "No. The F1 route depends on documentation issued by your institution, so the admission has to come first.",
          },
          {
            question: "Whose financial documents are needed?",
            answer:
              "Usually the sponsor's — often a parent. The documents need to show the funds are real, available and explainable.",
          },
        ],
      },
      // The five products below are VisaDrive's REAL, existing service lines.
      // Descriptions come verbatim from EXISTING_SERVICES in
      // lib/constants/site.ts, and they keep the business's genuine
      // "no advance payment" model via pay_after_confirmation.
      ...buildServiceProducts(),
    ],
  },

  /* ---------------------------------------------------------------- China */
  {
    slug: "china",
    name: "China",
    countryCode: "CN",
    flagEmoji: "🇨🇳",
    region: "East Asia",
    tagline: "Tourist and business travel to mainland China",
    summary:
      "Chinese visa applications are document-heavy and exacting about consistency between the form, the invitation and your itinerary.",
    description:
      "Applications for mainland China are checked closely for consistency: the form, the invitation letter and your travel bookings all have to tell the same story. We assemble the set and check it line by line before submission.",
    currency: "INR",
    highlights: [
      "Full document set assembled and cross-checked",
      "Invitation letter handling for business travel",
      "Itinerary consistency checked before submission",
      "Status visible in your VisaDrive portal",
    ],
    travelNotes:
      "Requirements and the submission route change from time to time and differ by region. Confirm the current position with the official Chinese visa service before you travel.",
    // Deliberately undefined: we are not confident enough in a single
    // canonical official URL for this route to publish one. An administrator
    // should set it in Admin → Catalogue.
    isPopular: false,
    seoTitle: "China Visa from India — Tourist & Business | VisaDrive",
    seoDescription:
      "China tourist and business visa assistance from VisaDrive: document assembly, consistency checking and clear status tracking.",
    faqs: [
      {
        question: "Why is the invitation letter so important for China?",
        answer:
          "For business travel it is the document that establishes who is hosting you and why. It needs to match what the rest of your application says.",
      },
      {
        question: "Do I need to submit my original passport?",
        answer:
          "Typically yes, for the duration of processing. Plan your other travel around that, and talk to us first if the timing is tight.",
      },
    ],
    products: [
      {
        slug: "tourist-visa",
        name: "China Tourist Visa",
        category: "tourist",
        visaType: "L (Tourist)",
        shortDescription:
          "For sightseeing and visiting friends or relatives in mainland China.",
        detailedDescription:
          "We prepare the full tourist application, check that your itinerary and bookings line up with what the form says, and keep you informed while your passport is with the processing centre.",
        entryType: "single",
        validityDays: 90,
        maxStayDays: 30,
        processingTimeMinDays: 5,
        processingTimeMaxDays: 10,
        governmentFee: 700000,
        serviceFee: 250000,
        additionalCharges: 0,
        taxPercent: 18,
        paymentMode: "pay_now",
        importantInformation:
          "Your original passport is normally held for the duration of processing.",
        requiredApplicantFields: FULL_APPLICANT_FIELDS,
        requirements: [
          ...CORE_IDENTITY,
          { documentKey: "flight_itinerary", isMandatory: true },
          { documentKey: "hotel_booking", isMandatory: true },
          ...FINANCIAL_PROOF,
          { documentKey: "employment_proof", isMandatory: false, appliesTo: "employed" },
          { documentKey: "previous_visa", isMandatory: false },
        ],
        faqs: [
          {
            question: "Can I change my travel dates after applying?",
            answer:
              "Changes after submission are awkward because the itinerary forms part of the application. Tell us as early as possible if your plans move.",
          },
          {
            question: "Do I need travel insurance?",
            answer:
              "It is sensible regardless, and may be required depending on the current rules. We will tell you what the checklist says when you apply.",
          },
        ],
      },
      {
        slug: "business-visa",
        name: "China Business Visa",
        category: "business",
        visaType: "M (Business & Trade)",
        shortDescription:
          "For commercial and trade activities, meetings and factory visits.",
        detailedDescription:
          "For commercial and trade travel. The invitation from your Chinese counterpart is the centre of this application, and we help make sure it contains what is actually needed.",
        entryType: "multiple",
        validityDays: 180,
        maxStayDays: 30,
        processingTimeMinDays: 6,
        processingTimeMaxDays: 12,
        governmentFee: 900000,
        serviceFee: 300000,
        additionalCharges: 0,
        taxPercent: 18,
        paymentMode: "pay_now",
        eligibilityNotes:
          "An invitation from the Chinese company or trade body you are visiting is normally required.",
        importantInformation:
          "A business visa does not permit you to take up employment in China.",
        requiredApplicantFields: FULL_APPLICANT_FIELDS,
        requirements: [
          ...CORE_IDENTITY,
          { documentKey: "invitation_letter", isMandatory: true },
          ...WORK_PROOF,
          { documentKey: "bank_statement", isMandatory: false },
          { documentKey: "flight_itinerary", isMandatory: false },
          { documentKey: "previous_visa", isMandatory: false },
        ],
        faqs: [
          {
            question: "What should the invitation letter contain?",
            answer:
              "Who you are, who is inviting you, what the visit is for, the dates, and who is covering costs. We will review a draft before it is finalised.",
          },
          {
            question: "How many entries will I get?",
            answer:
              "That is decided by the authorities based on your profile and purpose. We cannot promise a particular outcome.",
          },
        ],
      },
    ],
  },

  /* ------------------------------------------------------------ Singapore */
  {
    slug: "singapore",
    name: "Singapore",
    countryCode: "SG",
    flagEmoji: "🇸🇬",
    region: "South East Asia",
    tagline: "Quick trips, clean paperwork",
    summary:
      "Singapore applications are usually quick, provided the forms are consistent and the supporting documents are legible.",
    description:
      "Singapore is a common short trip from Mumbai, for both holidays and business. The applications that go wrong are usually the ones with an unreadable scan or a mismatch between the form and the passport. We catch those before filing.",
    currency: "INR",
    highlights: [
      "Tourist and business routes supported",
      "Scans and photographs checked for legibility",
      "Straightforward checklist, clearly explained",
      "Status tracked in your VisaDrive portal",
    ],
    travelNotes:
      "Requirements depend on your nationality. Confirm the current position with the Immigration & Checkpoints Authority before you travel.",
    officialSourceUrl: "https://www.ica.gov.sg/",
    isPopular: false,
    seoTitle: "Singapore Visa from India — Tourist & Business | VisaDrive",
    seoDescription:
      "Singapore tourist and business visa assistance from VisaDrive: checked documents, clear guidance and portal status tracking.",
    faqs: [
      {
        question: "How long does a Singapore visa usually take?",
        answer:
          "Often only a few working days, but processing time is decided by the authorities and we will not promise you a date.",
      },
      {
        question: "Do I need to show a return ticket?",
        answer:
          "Evidence of onward travel is commonly asked for. A held reservation is usually enough at the application stage.",
      },
    ],
    products: [
      {
        slug: "tourist-visa",
        name: "Singapore Tourist Visa",
        category: "tourist",
        visaType: "Tourist Visa",
        shortDescription:
          "For holidays, short breaks and visiting friends or family in Singapore.",
        detailedDescription:
          "A straightforward leisure application. We check your form against your passport, make sure your scans are legible and submit through the appropriate route.",
        entryType: "single",
        validityDays: 60,
        maxStayDays: 30,
        processingTimeMinDays: 3,
        processingTimeMaxDays: 6,
        governmentFee: 300000,
        serviceFee: 120000,
        additionalCharges: 0,
        taxPercent: 18,
        paymentMode: "pay_now",
        importantInformation:
          "The length of stay granted is decided by the immigration officer at the checkpoint, not by the visa itself.",
        requiredApplicantFields: FULL_APPLICANT_FIELDS,
        officialSourceUrl: "https://www.ica.gov.sg/",
        requirements: [
          ...CORE_IDENTITY,
          { documentKey: "flight_itinerary", isMandatory: false },
          { documentKey: "hotel_booking", isMandatory: false },
          { documentKey: "bank_statement", isMandatory: false },
        ],
        faqs: [
          {
            question: "Is a visa needed for a short stopover?",
            answer:
              "That depends on your nationality and the facilities available at the airport. Check the official ICA guidance, and ask us if it is unclear.",
          },
          {
            question: "Can I apply myself?",
            answer:
              "Yes — many people do. We are useful when the paperwork is awkward, the timing is tight, or you would rather have someone check it.",
          },
        ],
      },
      {
        slug: "business-visa",
        name: "Singapore Business Visa",
        category: "business",
        visaType: "Business Visa",
        shortDescription:
          "For meetings, conferences and short business trips to Singapore.",
        detailedDescription:
          "For business travel, with support for the invitation and employment documentation that usually accompanies it.",
        entryType: "multiple",
        validityDays: 90,
        maxStayDays: 30,
        processingTimeMinDays: 4,
        processingTimeMaxDays: 8,
        governmentFee: 400000,
        serviceFee: 180000,
        additionalCharges: 0,
        taxPercent: 18,
        paymentMode: "pay_now",
        eligibilityNotes:
          "A letter from the host organisation in Singapore is usually expected.",
        importantInformation:
          "A business visa does not permit you to take up employment in Singapore.",
        requiredApplicantFields: FULL_APPLICANT_FIELDS,
        officialSourceUrl: "https://www.ica.gov.sg/",
        requirements: [
          ...CORE_IDENTITY,
          { documentKey: "invitation_letter", isMandatory: true },
          ...WORK_PROOF,
          { documentKey: "flight_itinerary", isMandatory: false },
          { documentKey: "bank_statement", isMandatory: false },
        ],
        faqs: [
          {
            question: "Can I attend a conference on a tourist visa?",
            answer:
              "Sometimes, depending on what you will be doing. Tell us the real purpose of the trip and we will advise which route is appropriate.",
          },
          {
            question: "How far ahead should I apply?",
            answer:
              "As early as you can. Processing is usually quick, but leaving no margin is how trips get missed.",
          },
        ],
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*                 VisaDrive's real service lines (USA, service)              */
/* -------------------------------------------------------------------------- */

/**
 * Builds the five `category: "service"` products from `EXISTING_SERVICES`.
 *
 * The `name` and `shortDescription` are the client's own words, copied
 * verbatim. The pricing is placeholder, like everything else here, but the
 * `paymentMode` is NOT a placeholder: `pay_after_confirmation` encodes
 * VisaDrive's real commercial model and must survive a catalogue edit.
 */
function buildServiceProducts(): SeedProduct[] {
  const common = {
    category: "service" as const,
    entryType: "not_applicable" as const,
    additionalCharges: 0,
    taxPercent: 18,
    paymentMode: "pay_after_confirmation" as const,
    requiredApplicantFields: SERVICE_APPLICANT_FIELDS,
    officialSourceUrl: "https://travel.state.gov/content/travel/en/us-visas.html",
  };

  const byKey = Object.fromEntries(
    EXISTING_SERVICES.map((s) => [s.key, s]),
  ) as Record<(typeof EXISTING_SERVICES)[number]["key"], (typeof EXISTING_SERVICES)[number]>;

  return [
    {
      ...common,
      slug: "ds-160-form-filling",
      name: byKey.ds160_form_filling.name,
      visaType: "DS-160 Form Filling",
      shortDescription: byKey.ds160_form_filling.summary,
      detailedDescription:
        "We complete the DS-160 with you, field by field, and check every entry against your passport and supporting documents before it is submitted. A mistake on the DS-160 is one of the most avoidable reasons an application runs into trouble.",
      processingTimeMinDays: 1,
      processingTimeMaxDays: 2,
      processingTimeNote: "Usually completed within a working day of receiving your details.",
      governmentFee: 0,
      serviceFee: 250000,
      eligibilityNotes:
        "Available to anyone applying for a US non-immigrant visa. Government visa fees are paid separately by you to the authorities.",
      importantInformation: SERVICE_PAYMENT_NOTICE,
      requirements: [
        { documentKey: "passport_front", isMandatory: true },
        { documentKey: "photograph", isMandatory: true },
        { documentKey: "previous_visa", isMandatory: false },
        { documentKey: "employment_proof", isMandatory: false, appliesTo: "employed" },
      ],
      faqs: [
        {
          question: "Do you submit the DS-160 on my behalf?",
          answer:
            "We prepare and check it with you and walk you through submission. The declaration is yours, so you confirm the contents before it is filed.",
        },
        {
          question: "What if I spot a mistake after submitting?",
          answer:
            "Tell us immediately. Some corrections are straightforward and some require a fresh form; we will explain which applies and handle it.",
        },
      ],
    },
    {
      ...common,
      slug: "express-appointment-assistance",
      name: byKey.express_appointment.name,
      visaType: "Express Appointment Assistance",
      shortDescription: byKey.express_appointment.summary,
      detailedDescription:
        "If your travel is urgent, we help you look for an earlier interview date and guide you through every step of the booking. Availability is controlled by the US authorities — we work the process diligently, but nobody can promise you a date.",
      processingTimeNote:
        "Entirely dependent on appointment availability, which is set by the US authorities.",
      governmentFee: 0,
      serviceFee: 400000,
      eligibilityNotes:
        "You need an existing DS-160 and a visa fee payment before an appointment can be booked.",
      importantInformation:
        SERVICE_PAYMENT_NOTICE +
        " Appointment dates depend on availability at the relevant authorities and cannot be guaranteed.",
      requirements: [
        { documentKey: "ds160_confirmation", isMandatory: true },
        { documentKey: "passport_front", isMandatory: true },
        { documentKey: "appointment_confirmation", isMandatory: false },
      ],
      faqs: [
        {
          question: "Can you guarantee an earlier date?",
          answer:
            "No. Appointment availability is set by the US authorities. We help you look and we act quickly when a slot appears, but a guarantee would be dishonest.",
        },
        {
          question: "When do I pay?",
          answer:
            "Only once your appointment has been officially booked. There is no advance payment for this service.",
        },
      ],
    },
    {
      ...common,
      slug: "visa-interview-guidance",
      name: byKey.interview_guidance.name,
      visaType: "Visa Interview Guidance",
      shortDescription: byKey.interview_guidance.summary,
      detailedDescription:
        "A preparation session with an experienced member of our team: the questions you are likely to face, how to answer them truthfully and clearly, what to carry, and what to expect on the day.",
      processingTimeMinDays: 1,
      processingTimeMaxDays: 3,
      processingTimeNote: "Scheduled around your interview date.",
      governmentFee: 0,
      serviceFee: 300000,
      eligibilityNotes:
        "Most useful once your interview is booked, though an early session can help you prepare your documents.",
      importantInformation:
        SERVICE_PAYMENT_NOTICE +
        " Visa decisions are made solely by the consular officer; preparation improves your clarity, not your odds of a particular outcome.",
      requirements: [
        { documentKey: "ds160_confirmation", isMandatory: false },
        { documentKey: "appointment_confirmation", isMandatory: false },
        { documentKey: "passport_front", isMandatory: true },
      ],
      faqs: [
        {
          question: "Will you tell me what to say?",
          answer:
            "We will help you answer truthfully and clearly. We will never coach you to say something untrue — that puts your application and your future travel at risk.",
        },
        {
          question: "How long is a session?",
          answer:
            "Long enough to cover your case properly. We would rather run over than send you in half-prepared.",
        },
      ],
    },
    {
      ...common,
      slug: "dropbox-renewal-guidance",
      name: byKey.dropbox_renewal.name,
      visaType: "Dropbox (Renewal) Guidance",
      shortDescription: byKey.dropbox_renewal.summary,
      detailedDescription:
        "Dropbox is a visa renewal process without an interview, open to eligible applicants who have held a previous visa. We check your eligibility honestly, prepare the document set and guide you through submission.",
      processingTimeMinDays: 2,
      processingTimeMaxDays: 5,
      processingTimeNote:
        "Preparation is quick; the overall timeline depends on the processing centre.",
      governmentFee: 0,
      serviceFee: 350000,
      eligibilityNotes:
        "Only available to applicants who meet the current eligibility rules for interview waiver. We will tell you plainly if you do not qualify.",
      importantInformation:
        SERVICE_PAYMENT_NOTICE +
        " Eligibility rules for interview waiver are set by the US authorities and change from time to time.",
      requirements: [
        { documentKey: "passport_front", isMandatory: true },
        { documentKey: "previous_visa", isMandatory: true },
        { documentKey: "ds160_confirmation", isMandatory: true },
        { documentKey: "photograph", isMandatory: true },
        { documentKey: "appointment_confirmation", isMandatory: false },
      ],
      faqs: [
        {
          question: "How do I know if I am eligible for Dropbox?",
          answer:
            "It depends on your previous visa, when it expired and the current rules. Send us the details and we will give you a straight answer.",
        },
        {
          question: "Is Dropbox faster than an interview?",
          answer:
            "It avoids the interview queue, which often helps. It is not a guarantee of speed.",
        },
      ],
    },
    {
      ...common,
      slug: "appointment-re-scheduling",
      name: byKey.appointment_rescheduling.name,
      visaType: "Appointment Re-scheduling",
      shortDescription: byKey.appointment_rescheduling.summary,
      detailedDescription:
        "Plans change. We help you find and book a new interview date that suits your travel, and explain what re-scheduling does and does not affect.",
      processingTimeNote:
        "Depends on what is available when you need to move, which is set by the US authorities.",
      governmentFee: 0,
      serviceFee: 200000,
      eligibilityNotes:
        "Requires an existing booked appointment. Re-scheduling limits are set by the US authorities.",
      importantInformation:
        SERVICE_PAYMENT_NOTICE +
        " There may be limits on how many times an appointment can be re-scheduled.",
      requirements: [
        { documentKey: "appointment_confirmation", isMandatory: true },
        { documentKey: "ds160_confirmation", isMandatory: false },
        { documentKey: "passport_front", isMandatory: true },
      ],
      faqs: [
        {
          question: "Will re-scheduling cost me the visa fee I already paid?",
          answer:
            "Normally the fee stays with your case, but the rules are set by the authorities. We will check the current position for your specific booking.",
        },
        {
          question: "How many times can I re-schedule?",
          answer:
            "There are limits, and they are set by the US authorities. We will tell you where you stand before making a change.",
        },
      ],
    },
  ];
}

/* -------------------------------------------------------------------------- */
/*                                shared FAQs                                 */
/* -------------------------------------------------------------------------- */

export const SEED_GLOBAL_FAQS: SeedFaq[] = [
  {
    question: "Is VisaDrive part of an embassy or government?",
    answer:
      "No. VisaDrive is a private visa consultancy. We are not affiliated with, endorsed by, or part of any government, embassy or consulate.",
  },
  {
    question: "Can you guarantee my visa will be approved?",
    answer:
      "No, and you should be wary of anyone who says they can. Visa decisions are made solely by the relevant authorities. We make sure your application is complete, accurate and submitted properly.",
  },
  {
    question: "When do I have to pay?",
    answer:
      "For appointment services, you are not charged in advance — our service fee becomes payable only once your appointment has been officially booked. Government visa fees are paid separately to the authorities.",
  },
  {
    question: "What happens to my documents?",
    answer:
      "Uploaded documents are stored privately and are only accessible to you and the VisaDrive staff working on your application. We do not sell your personal information.",
  },
  {
    question: "Can I track my application?",
    answer:
      "Yes. Every application has a reference number and a timeline in your VisaDrive portal showing exactly what stage it has reached and what, if anything, is needed from you.",
  },
  {
    question: "What if I need to cancel?",
    answer:
      "Tell us as early as you can. Official visa fees paid to the authorities are separate, are set by them and are generally non-refundable; our own fees are covered by the refund policy.",
  },
];

/* -------------------------------------------------------------------------- */
/*                              demo testimonials                             */
/* -------------------------------------------------------------------------- */

/**
 * The live VisaDrive site carries no testimonials. These are FICTIONAL
 * placeholders so the marketing layout can be designed and reviewed; every one
 * carries `isDemo: true` so the UI can label it as demonstration content, and
 * they must be replaced with real, consented quotes before launch. The names
 * are deliberately not plausible as real private individuals.
 */
export const SEED_TESTIMONIALS = [
  {
    id: "demo-1",
    isDemo: true,
    author: "Demo Reviewer A",
    role: "Sample profile — business traveller",
    destination: "United States of America",
    quote:
      "Placeholder testimonial for layout review. Replace with a real, consented customer quote before this page goes live.",
    rating: 5,
  },
  {
    id: "demo-2",
    isDemo: true,
    author: "Demo Reviewer B",
    role: "Sample profile — family holiday",
    destination: "United Arab Emirates",
    quote:
      "Placeholder testimonial for layout review. Replace with a real, consented customer quote before this page goes live.",
    rating: 5,
  },
  {
    id: "demo-3",
    isDemo: true,
    author: "Demo Reviewer C",
    role: "Sample profile — student",
    destination: "Japan",
    quote:
      "Placeholder testimonial for layout review. Replace with a real, consented customer quote before this page goes live.",
    rating: 4,
  },
  {
    id: "demo-4",
    isDemo: true,
    author: "Demo Reviewer D",
    role: "Sample profile — first-time traveller",
    destination: "Singapore",
    quote:
      "Placeholder testimonial for layout review. Replace with a real, consented customer quote before this page goes live.",
    rating: 5,
  },
];

/* -------------------------------------------------------------------------- */
/*                                demo people                                 */
/* -------------------------------------------------------------------------- */

/** Every seeded account uses this prefix so `reset` can find them exactly. */
export const DEMO_CLERK_PREFIX = "seed_demo_";

/** Reserved by RFC 2606 — can never reach a real mailbox. */
export const DEMO_EMAIL_DOMAIN = "example.com";

export interface SeedPerson {
  key: string;
  fullName: string;
  phone: string;
}

/**
 * Deliberately non-plausible names. These must never read as real private
 * individuals, and the addresses are on the reserved `example.com` domain.
 */
export const SEED_CUSTOMERS: SeedPerson[] = [
  { key: "alpha", fullName: "Demo Customer Alpha", phone: "+910000000101" },
  { key: "bravo", fullName: "Demo Customer Bravo", phone: "+910000000102" },
  { key: "charlie", fullName: "Demo Customer Charlie", phone: "+910000000103" },
  { key: "delta", fullName: "Demo Customer Delta", phone: "+910000000104" },
  { key: "echo", fullName: "Demo Customer Echo", phone: "+910000000105" },
  { key: "foxtrot", fullName: "Demo Customer Foxtrot", phone: "+910000000106" },
  { key: "golf", fullName: "Demo Customer Golf", phone: "+910000000107" },
  { key: "hotel", fullName: "Demo Customer Hotel", phone: "+910000000108" },
  { key: "india", fullName: "Demo Customer India", phone: "+910000000109" },
  { key: "juliett", fullName: "Demo Customer Juliett", phone: "+910000000110" },
  { key: "kilo", fullName: "Demo Customer Kilo", phone: "+910000000111" },
  { key: "lima", fullName: "Demo Customer Lima", phone: "+910000000112" },
];

export interface SeedStaff extends SeedPerson {
  role: "support_agent" | "visa_agent" | "manager";
  employeeCode: string;
  designation: string;
  department: string;
}

export const SEED_STAFF: SeedStaff[] = [
  {
    key: "nova",
    fullName: "Demo Agent Nova",
    phone: "+910000000201",
    role: "visa_agent",
    employeeCode: "DEMO-VA-01",
    designation: "Visa Processing Agent",
    department: "Operations",
  },
  {
    key: "orion",
    fullName: "Demo Agent Orion",
    phone: "+910000000202",
    role: "support_agent",
    employeeCode: "DEMO-SA-01",
    designation: "Support Agent",
    department: "Customer Support",
  },
  {
    key: "vega",
    fullName: "Demo Manager Vega",
    phone: "+910000000203",
    role: "manager",
    employeeCode: "DEMO-MG-01",
    designation: "Operations Manager",
    department: "Operations",
  },
];

export function demoEmail(key: string): string {
  return `${key}@${DEMO_EMAIL_DOMAIN}`;
}

export function demoClerkId(key: string): string {
  return `${DEMO_CLERK_PREFIX}${key}`;
}

/* -------------------------------------------------------------------------- */
/*                         demo enquiry / message text                        */
/* -------------------------------------------------------------------------- */

export const SEED_ENQUIRY_SUBJECTS = [
  "Question about tourist visa timelines",
  "Need an earlier US interview date",
  "Documents required for a business trip",
  "Dropbox eligibility check",
  "Family holiday — four travellers",
  "DS-160 help needed",
  "Re-scheduling an existing appointment",
  "First time applying, where do I start?",
] as const;

export const SEED_ENQUIRY_MESSAGES = [
  "Planning a trip in the next couple of months and want to understand what is involved before I commit to dates.",
  "My travel has been brought forward and the first available date I can see is a long way out. What are my options?",
  "Attending a trade event and my employer has asked me to confirm the paperwork we need from their side.",
  "I held a visa that expired recently and want to know whether I qualify for the interview waiver route.",
  "Travelling with my family including two children. Do the children need separate applications?",
  "I started filling the form myself and got stuck. Would rather have someone check it properly.",
  "Something has come up and I need to move my appointment. Is that possible without starting again?",
  "I have never applied for a visa before and would like someone to walk me through the process.",
] as const;

export const SEED_CONVERSATION_OPENERS = [
  "Hello — I have uploaded my documents. Could you confirm everything is in order?",
  "Is there anything else you need from me before the next stage?",
  "I have a question about the fee breakdown on my application.",
  "My passport expires sooner than I thought. Does that change anything?",
  "Could you let me know what happens after the review is complete?",
] as const;

export const SEED_STAFF_REPLIES = [
  "Thanks for getting in touch — your documents are with our team and we will come back to you shortly.",
  "Everything you have sent so far looks fine. We will let you know as soon as the next stage begins.",
  "Good question. The breakdown on your application separates the official fee from our service fee; the official portion is paid to the authorities.",
] as const;
