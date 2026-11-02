import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/* ============================================================================
 * VisaDrive — Convex schema
 *
 * Conventions
 *  - Every table that is read by a non-owner path carries the owning `userId`
 *    so ownership can be verified without a second lookup.
 *  - Money is stored in the smallest currency unit (paise for INR) as an
 *    integer. Never store money as a float.
 *  - `_creationTime` is always available; explicit `createdAt` fields exist
 *    only where we need to index or back-date.
 * ========================================================================== */

// ---------------------------------------------------------------------------
// Shared literal unions
// ---------------------------------------------------------------------------

export const userRole = v.union(
  v.literal("customer"),
  v.literal("support_agent"),
  v.literal("visa_agent"),
  v.literal("manager"),
  v.literal("admin"),
  v.literal("super_admin"),
);

export const userStatus = v.union(
  v.literal("active"),
  v.literal("suspended"),
  v.literal("deleted"),
);

export const applicationStatus = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("documents_pending"),
  v.literal("documents_submitted"),
  v.literal("under_review"),
  v.literal("additional_documents_requested"),
  v.literal("ready_for_processing"),
  v.literal("appointment_scheduled"),
  v.literal("visa_processing"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("on_hold"),
);

export const paymentStatus = v.union(
  v.literal("not_required"),
  v.literal("unpaid"),
  v.literal("pending"),
  v.literal("partially_paid"),
  v.literal("paid"),
  v.literal("failed"),
  v.literal("refunded"),
  v.literal("partially_refunded"),
);

/** How a visa product is paid for. Mirrors VisaDrive's existing
 *  "no advance payment" model for appointment services. */
export const paymentMode = v.union(
  v.literal("pay_now"),
  v.literal("pay_after_confirmation"),
  v.literal("manual_offline"),
  v.literal("free_consultation"),
);

export const documentStatus = v.union(
  v.literal("pending_review"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("replacement_requested"),
);

export const leadStatus = v.union(
  v.literal("new"),
  v.literal("contacted"),
  v.literal("follow_up_required"),
  v.literal("qualified"),
  v.literal("converted"),
  v.literal("lost"),
);

export const conversationStatus = v.union(
  v.literal("open"),
  v.literal("pending"),
  v.literal("resolved"),
  v.literal("closed"),
);

export const visaCategory = v.union(
  v.literal("tourist"),
  v.literal("business"),
  v.literal("student"),
  v.literal("transit"),
  v.literal("medical"),
  v.literal("work"),
  v.literal("exchange_visitor"),
  v.literal("service"), // DS-160 filling, appointment assistance, interview prep
  v.literal("other"),
);

export const entryType = v.union(
  v.literal("single"),
  v.literal("multiple"),
  v.literal("double"),
  v.literal("not_applicable"),
);

export const notificationChannel = v.union(
  v.literal("in_app"),
  v.literal("email"),
  v.literal("whatsapp"),
);

/** Polymorphic parent for notes / assignments / audit rows. */
export const entityType = v.union(
  v.literal("application"),
  v.literal("user"),
  v.literal("enquiry"),
  v.literal("conversation"),
  v.literal("document"),
  v.literal("payment"),
  v.literal("visa_product"),
  v.literal("destination"),
  v.literal("setting"),
  v.literal("staff"),
);

// Reusable object validators -------------------------------------------------

/** Price snapshot frozen onto an application at booking time so later
 *  catalogue edits never retroactively change what a customer agreed to. */
const priceBreakdown = v.object({
  currency: v.string(),
  governmentFee: v.number(),
  serviceFee: v.number(),
  additionalCharges: v.number(),
  taxPercent: v.number(),
  taxAmount: v.number(),
  discountAmount: v.number(),
  discountCode: v.optional(v.string()),
  travellerCount: v.number(),
  subtotal: v.number(),
  total: v.number(),
});

const addressValidator = v.object({
  line1: v.string(),
  line2: v.optional(v.string()),
  city: v.string(),
  state: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  country: v.string(),
});

const attachmentValidator = v.object({
  storageId: v.id("_storage"),
  fileName: v.string(),
  mimeType: v.string(),
  size: v.number(),
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export default defineSchema({
  /* ---------------------------------------------------------------- users */
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    fullName: v.string(),
    phone: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    role: userRole,
    status: userStatus,
    emailVerified: v.boolean(),
    /** Denormalised counters kept in sync by mutations; used for list views. */
    applicationCount: v.number(),
    lastActiveAt: v.optional(v.number()),
    suspendedAt: v.optional(v.number()),
    suspendedReason: v.optional(v.string()),
    marketingOptIn: v.optional(v.boolean()),
    whatsappOptIn: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_status_role", ["status", "role"])
    .index("by_createdAt", ["createdAt"])
    .searchIndex("search_users", {
      searchField: "fullName",
      filterFields: ["role", "status"],
    }),

  /* -------------------------------------------------------- staffProfiles */
  staffProfiles: defineTable({
    userId: v.id("users"),
    employeeCode: v.string(),
    designation: v.optional(v.string()),
    department: v.optional(v.string()),
    /** Fine-grained overrides layered on top of the role's default grants. */
    extraPermissions: v.array(v.string()),
    revokedPermissions: v.array(v.string()),
    assignedDestinationIds: v.array(v.id("destinations")),
    maxConcurrentApplications: v.optional(v.number()),
    isActive: v.boolean(),
    invitedBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_employeeCode", ["employeeCode"])
    .index("by_isActive", ["isActive"]),

  /* --------------------------------------------------------- destinations */
  destinations: defineTable({
    slug: v.string(),
    name: v.string(),
    countryCode: v.string(), // ISO-3166 alpha-2, e.g. "AE"
    flagEmoji: v.string(),
    region: v.optional(v.string()),
    tagline: v.optional(v.string()),
    summary: v.string(),
    description: v.optional(v.string()),
    heroImageUrl: v.optional(v.string()),
    cardImageUrl: v.optional(v.string()),
    heroImageStorageId: v.optional(v.id("_storage")),
    cardImageStorageId: v.optional(v.id("_storage")),
    currency: v.string(),
    /** Editorial content, all admin-managed. */
    highlights: v.array(v.string()),
    travelNotes: v.optional(v.string()),
    officialSourceUrl: v.optional(v.string()),
    lastVerifiedAt: v.optional(v.number()),
    isPopular: v.boolean(),
    isPublished: v.boolean(),
    displayOrder: v.number(),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_isPublished", ["isPublished"])
    .index("by_published_order", ["isPublished", "displayOrder"])
    .index("by_countryCode", ["countryCode"]),

  /* --------------------------------------------------------- visaProducts */
  visaProducts: defineTable({
    destinationId: v.id("destinations"),
    destinationSlug: v.string(), // denormalised for public route lookups
    slug: v.string(),
    name: v.string(),
    category: visaCategory,
    visaType: v.string(), // free text, e.g. "B1/B2", "e-Visa", "DS-160 Filling"
    shortDescription: v.string(),
    detailedDescription: v.optional(v.string()),

    eligibleNationalities: v.array(v.string()), // ISO codes; empty = all
    entryType: entryType,
    validityDays: v.optional(v.number()),
    maxStayDays: v.optional(v.number()),
    processingTimeMinDays: v.optional(v.number()),
    processingTimeMaxDays: v.optional(v.number()),
    processingTimeNote: v.optional(v.string()),

    // Pricing — smallest currency unit
    currency: v.string(),
    governmentFee: v.number(),
    serviceFee: v.number(),
    additionalCharges: v.number(),
    taxPercent: v.number(),
    promoPrice: v.optional(v.number()),
    promoLabel: v.optional(v.string()),
    promoEndsAt: v.optional(v.number()),

    paymentMode: paymentMode,

    eligibilityNotes: v.optional(v.string()),
    importantInformation: v.optional(v.string()),
    /** Fields the application wizard should collect for this product. */
    requiredApplicantFields: v.array(v.string()),

    officialSourceUrl: v.optional(v.string()),
    lastVerifiedAt: v.optional(v.number()),
    /** True until an admin has checked fees/rules against the official source. */
    isDemoContent: v.boolean(),

    isPublished: v.boolean(),
    displayOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_destinationId", ["destinationId"])
    .index("by_destination_published", ["destinationId", "isPublished"])
    .index("by_slug", ["destinationSlug", "slug"])
    .index("by_isPublished", ["isPublished"])
    .index("by_category", ["category"]),

  /* ----------------------------------------------------- visaRequirements */
  visaRequirements: defineTable({
    visaProductId: v.id("visaProducts"),
    documentKey: v.string(), // stable key, e.g. "passport_front"
    label: v.string(),
    description: v.optional(v.string()),
    sampleImageUrl: v.optional(v.string()),
    isMandatory: v.boolean(),
    /** Narrow a requirement to a subset of applicants. */
    appliesTo: v.union(
      v.literal("all"),
      v.literal("adult"),
      v.literal("minor"),
      v.literal("employed"),
      v.literal("self_employed"),
      v.literal("student"),
      v.literal("retired"),
    ),
    allowedMimeTypes: v.array(v.string()),
    maxSizeBytes: v.number(),
    displayOrder: v.number(),
    createdAt: v.number(),
  })
    .index("by_visaProductId", ["visaProductId"])
    .index("by_product_order", ["visaProductId", "displayOrder"])
    .index("by_product_key", ["visaProductId", "documentKey"]),

  /* ------------------------------------------------------------ visaFAQs */
  visaFAQs: defineTable({
    scope: v.union(
      v.literal("global"),
      v.literal("destination"),
      v.literal("visa_product"),
    ),
    destinationId: v.optional(v.id("destinations")),
    visaProductId: v.optional(v.id("visaProducts")),
    question: v.string(),
    answer: v.string(),
    displayOrder: v.number(),
    isPublished: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scope", ["scope", "isPublished"])
    .index("by_destinationId", ["destinationId"])
    .index("by_visaProductId", ["visaProductId"]),

  /* -------------------------------------------------------- applications */
  applications: defineTable({
    referenceId: v.string(), // e.g. "VD-2026-0007A3"
    userId: v.id("users"),
    destinationId: v.id("destinations"),
    visaProductId: v.id("visaProducts"),

    // Denormalised for fast admin tables without N+1 joins
    destinationName: v.string(),
    visaProductName: v.string(),
    customerName: v.string(),
    customerEmail: v.string(),
    customerPhone: v.optional(v.string()),

    status: applicationStatus,
    paymentStatus: paymentStatus,
    paymentMode: paymentMode,

    // Travel information (step 3)
    departureCountry: v.optional(v.string()),
    travelPurpose: v.optional(v.string()),
    intendedArrivalDate: v.optional(v.number()),
    intendedDepartureDate: v.optional(v.number()),
    travellerCount: v.number(),
    previousTravelHistory: v.optional(v.string()),
    hasPreviousVisaRejection: v.optional(v.boolean()),
    previousVisaRejectionNote: v.optional(v.string()),

    pricing: priceBreakdown,

    assignedAgentId: v.optional(v.id("users")),
    assignedAt: v.optional(v.number()),

    /** Wizard progress for resumable drafts. */
    currentStep: v.number(),
    isDraft: v.boolean(),
    lastAutosaveAt: v.optional(v.number()),

    termsAcceptedAt: v.optional(v.number()),
    submittedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),

    /** Final visa document delivered by staff. */
    finalDocumentStorageId: v.optional(v.id("_storage")),
    finalDocumentName: v.optional(v.string()),
    finalDocumentUploadedAt: v.optional(v.number()),

    documentsRequiredCount: v.number(),
    documentsApprovedCount: v.number(),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_referenceId", ["referenceId"])
    .index("by_userId", ["userId"])
    .index("by_user_draft", ["userId", "isDraft"])
    .index("by_status", ["status"])
    .index("by_paymentStatus", ["paymentStatus"])
    .index("by_assignedAgentId", ["assignedAgentId"])
    .index("by_destinationId", ["destinationId"])
    .index("by_visaProductId", ["visaProductId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_draft_createdAt", ["isDraft", "createdAt"])
    .searchIndex("search_applications", {
      searchField: "customerName",
      filterFields: ["status", "paymentStatus", "destinationId"],
    }),

  /* ----------------------------------------------------------- applicants */
  applicants: defineTable({
    applicationId: v.id("applications"),
    userId: v.id("users"), // owner, for ownership checks without a join
    travelerId: v.optional(v.id("travelers")), // source profile, if reused
    isPrimary: v.boolean(),
    orderIndex: v.number(),

    firstName: v.string(),
    middleName: v.optional(v.string()),
    lastName: v.string(),
    dateOfBirth: v.optional(v.number()),
    gender: v.optional(
      v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say")),
    ),
    nationality: v.optional(v.string()),
    maritalStatus: v.optional(v.string()),
    occupation: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(addressValidator),

    passportNumber: v.optional(v.string()),
    passportIssueDate: v.optional(v.number()),
    passportExpiryDate: v.optional(v.number()),
    passportIssuingCountry: v.optional(v.string()),
    passportIssuingAuthority: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_applicationId", ["applicationId"])
    .index("by_application_order", ["applicationId", "orderIndex"])
    .index("by_userId", ["userId"]),

  /* ------------------------------------------------------------ travelers */
  /** Saved traveller profiles a customer can reuse across bookings. */
  travelers: defineTable({
    userId: v.id("users"),
    label: v.string(), // "Myself", "Spouse", ...
    firstName: v.string(),
    middleName: v.optional(v.string()),
    lastName: v.string(),
    dateOfBirth: v.optional(v.number()),
    gender: v.optional(v.string()),
    nationality: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(addressValidator),
    passportNumber: v.optional(v.string()),
    passportIssueDate: v.optional(v.number()),
    passportExpiryDate: v.optional(v.number()),
    passportIssuingCountry: v.optional(v.string()),
    isSelf: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_user_isSelf", ["userId", "isSelf"]),

  /* ------------------------------------------------------------ documents */
  documents: defineTable({
    applicationId: v.id("applications"),
    applicantId: v.optional(v.id("applicants")),
    userId: v.id("users"), // owner — never serve a file without checking this
    storageId: v.id("_storage"),

    documentKey: v.string(),
    label: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),

    status: documentStatus,
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    reviewNote: v.optional(v.string()),
    rejectionReason: v.optional(v.string()),

    /** Replaced files are kept (soft superseded) for the audit trail. */
    version: v.number(),
    supersedesId: v.optional(v.id("documents")),
    isCurrent: v.boolean(),
    /** Set when staff upload on the customer's behalf. */
    uploadedByStaffId: v.optional(v.id("users")),
    documentRequestId: v.optional(v.id("documentRequests")),

    createdAt: v.number(),
  })
    .index("by_applicationId", ["applicationId"])
    .index("by_application_current", ["applicationId", "isCurrent"])
    .index("by_applicantId", ["applicantId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_storageId", ["storageId"])
    .index("by_application_key", ["applicationId", "applicantId", "documentKey"]),

  /* ----------------------------------------------------- documentRequests */
  documentRequests: defineTable({
    applicationId: v.id("applications"),
    applicantId: v.optional(v.id("applicants")),
    userId: v.id("users"),
    requestedBy: v.id("users"),
    documentKey: v.string(),
    label: v.string(),
    reason: v.string(),
    dueDate: v.optional(v.number()),
    status: v.union(
      v.literal("open"),
      v.literal("fulfilled"),
      v.literal("cancelled"),
    ),
    fulfilledDocumentId: v.optional(v.id("documents")),
    fulfilledAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_applicationId", ["applicationId"])
    .index("by_application_status", ["applicationId", "status"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),

  /* ------------------------------------------------------------- payments */
  payments: defineTable({
    applicationId: v.optional(v.id("applications")),
    userId: v.id("users"),
    receiptNumber: v.string(),

    amount: v.number(), // smallest currency unit
    currency: v.string(),
    mode: v.union(
      v.literal("razorpay"),
      v.literal("manual_bank_transfer"),
      v.literal("cash"),
      v.literal("upi_offline"),
      v.literal("cheque"),
      v.literal("other"),
    ),
    status: v.union(
      v.literal("created"),
      v.literal("pending"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("refunded"),
      v.literal("partially_refunded"),
      v.literal("cancelled"),
    ),

    // Razorpay
    razorpayOrderId: v.optional(v.string()),
    razorpayPaymentId: v.optional(v.string()),
    razorpaySignature: v.optional(v.string()),
    razorpayMethod: v.optional(v.string()),
    /** Guards against a webhook and the verify route both crediting once. */
    providerEventId: v.optional(v.string()),

    paidAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),

    refundedAmount: v.number(),
    refundReference: v.optional(v.string()),
    refundedAt: v.optional(v.number()),
    refundNote: v.optional(v.string()),

    /** Set when a staff member records an offline payment. */
    recordedByStaffId: v.optional(v.id("users")),
    notes: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_applicationId", ["applicationId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_receiptNumber", ["receiptNumber"])
    .index("by_razorpayOrderId", ["razorpayOrderId"])
    .index("by_razorpayPaymentId", ["razorpayPaymentId"])
    .index("by_providerEventId", ["providerEventId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_status_createdAt", ["status", "createdAt"]),

  /* ------------------------------------------------------------ enquiries */
  enquiries: defineTable({
    referenceId: v.string(), // "ENQ-2026-0042"
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    destinationId: v.optional(v.id("destinations")),
    interestedCountry: v.optional(v.string()),
    visaCategory: v.optional(v.string()),
    travelDate: v.optional(v.number()),
    subject: v.string(),
    message: v.string(),
    source: v.union(
      v.literal("website_form"),
      v.literal("whatsapp"),
      v.literal("phone"),
      v.literal("referral"),
      v.literal("walk_in"),
      v.literal("other"),
    ),

    leadStatus: leadStatus,
    assignedTo: v.optional(v.id("users")),
    assignedAt: v.optional(v.number()),
    followUpAt: v.optional(v.number()),
    contactAttempts: v.number(),
    lastContactedAt: v.optional(v.number()),
    lostReason: v.optional(v.string()),

    /** Set once the lead becomes a real booking. */
    convertedUserId: v.optional(v.id("users")),
    convertedApplicationId: v.optional(v.id("applications")),
    convertedAt: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_referenceId", ["referenceId"])
    .index("by_leadStatus", ["leadStatus"])
    .index("by_assignedTo", ["assignedTo"])
    .index("by_email", ["email"])
    .index("by_createdAt", ["createdAt"])
    .index("by_leadStatus_createdAt", ["leadStatus", "createdAt"])
    .index("by_followUpAt", ["followUpAt"])
    .index("by_destinationId", ["destinationId"])
    .searchIndex("search_enquiries", {
      searchField: "fullName",
      filterFields: ["leadStatus", "assignedTo"],
    }),

  /* -------------------------------------------------------- conversations */
  conversations: defineTable({
    subject: v.string(),
    userId: v.optional(v.id("users")), // absent for guest/enquiry threads
    customerName: v.string(),
    customerEmail: v.string(),
    applicationId: v.optional(v.id("applications")),
    enquiryId: v.optional(v.id("enquiries")),

    status: conversationStatus,
    priority: v.union(v.literal("low"), v.literal("normal"), v.literal("high"), v.literal("urgent")),
    assignedTo: v.optional(v.id("users")),
    channel: v.union(v.literal("portal"), v.literal("email"), v.literal("whatsapp")),

    lastMessageAt: v.number(),
    lastMessagePreview: v.optional(v.string()),
    unreadForCustomer: v.number(),
    unreadForStaff: v.number(),
    messageCount: v.number(),

    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_user_lastMessage", ["userId", "lastMessageAt"])
    .index("by_applicationId", ["applicationId"])
    .index("by_status", ["status"])
    .index("by_status_lastMessage", ["status", "lastMessageAt"])
    .index("by_assignedTo", ["assignedTo"])
    .index("by_lastMessageAt", ["lastMessageAt"])
    .index("by_enquiryId", ["enquiryId"]),

  /* ------------------------------------------------------------- messages */
  messages: defineTable({
    conversationId: v.id("conversations"),
    authorUserId: v.optional(v.id("users")), // absent for system messages
    authorName: v.string(),
    authorRole: v.union(
      v.literal("customer"),
      v.literal("staff"),
      v.literal("system"),
    ),
    body: v.string(),
    attachments: v.array(attachmentValidator),
    /** Internal staff notes are never returned by customer-facing queries. */
    isInternal: v.boolean(),
    readByCustomerAt: v.optional(v.number()),
    readByStaffAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_conversationId", ["conversationId"])
    .index("by_conversation_created", ["conversationId", "createdAt"])
    .index("by_conversation_internal", ["conversationId", "isInternal"])
    .index("by_authorUserId", ["authorUserId"]),

  /* -------------------------------------------------------- statusHistory */
  statusHistory: defineTable({
    applicationId: v.id("applications"),
    userId: v.id("users"), // application owner
    fromStatus: v.optional(applicationStatus),
    toStatus: applicationStatus,
    note: v.optional(v.string()),
    /** Internal transitions stay hidden from the customer timeline. */
    visibleToCustomer: v.boolean(),
    changedBy: v.optional(v.id("users")),
    changedByName: v.string(),
    createdAt: v.number(),
  })
    .index("by_applicationId", ["applicationId"])
    .index("by_application_created", ["applicationId", "createdAt"])
    .index("by_userId", ["userId"]),

  /* --------------------------------------------------------- notifications */
  notifications: defineTable({
    userId: v.id("users"),
    type: v.string(), // see lib/constants/notifications.ts
    title: v.string(),
    body: v.string(),
    link: v.optional(v.string()),
    icon: v.optional(v.string()),

    applicationId: v.optional(v.id("applications")),
    conversationId: v.optional(v.id("conversations")),
    enquiryId: v.optional(v.id("enquiries")),

    isRead: v.boolean(),
    readAt: v.optional(v.number()),

    /** Idempotency key — a duplicate event with the same key is dropped. */
    dedupeKey: v.string(),
    channelsRequested: v.array(notificationChannel),
    channelsDelivered: v.array(notificationChannel),
    deliveryError: v.optional(v.string()),

    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_user_isRead", ["userId", "isRead"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_dedupeKey", ["dedupeKey"])
    .index("by_applicationId", ["applicationId"]),

  /* ------------------------------------------------------ staffAssignments */
  staffAssignments: defineTable({
    entityType: entityType,
    entityId: v.string(), // stringified Convex id of the target row
    staffUserId: v.id("users"),
    staffName: v.string(),
    assignedBy: v.id("users"),
    role: v.optional(v.string()), // "primary_agent", "reviewer", ...
    isActive: v.boolean(),
    unassignedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_staffUserId", ["staffUserId"])
    .index("by_staff_active", ["staffUserId", "isActive"]),

  /* ---------------------------------------------------------- internalNotes */
  internalNotes: defineTable({
    entityType: entityType,
    entityId: v.string(),
    authorId: v.id("users"),
    authorName: v.string(),
    body: v.string(),
    /** @mentioned staff get a notification. */
    mentionedUserIds: v.array(v.id("users")),
    isPinned: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_entity_created", ["entityType", "entityId", "createdAt"])
    .index("by_authorId", ["authorId"]),

  /* ----------------------------------------------------------- appSettings */
  appSettings: defineTable({
    key: v.string(),
    category: v.string(), // "company" | "payments" | "email" | "whatsapp" | ...
    value: v.any(),
    label: v.optional(v.string()),
    description: v.optional(v.string()),
    /** Public settings are readable without auth (company name, phone...). */
    isPublic: v.boolean(),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_category", ["category"])
    .index("by_isPublic", ["isPublic"]),

  /* ------------------------------------------------------------- auditLogs */
  auditLogs: defineTable({
    actorUserId: v.optional(v.id("users")),
    actorName: v.string(),
    actorRole: v.string(),
    action: v.string(), // "application.status_changed", "document.rejected", ...
    entityType: entityType,
    entityId: v.string(),
    summary: v.string(),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_actorUserId", ["actorUserId"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_action", ["action"])
    .index("by_createdAt", ["createdAt"]),

  /* ------------------------------------------------- counters (internal) */
  /** Monotonic counters backing human-readable reference numbers.
   *  Kept in a table so reference generation survives restarts. */
  counters: defineTable({
    name: v.string(), // "application:2026", "enquiry:2026", "receipt:2026"
    value: v.number(),
  }).index("by_name", ["name"]),
});
