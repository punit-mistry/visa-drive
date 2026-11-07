/**
 * Notification event catalogue.
 *
 * Every notification in the system is one of these types. The `dedupeKey`
 * recipe matters: `notifications.dispatch` drops a second row with the same
 * key, which is what stops a retried webhook or a double-clicked button from
 * emailing a customer twice.
 */

export const NOTIFICATION_TYPES = {
  USER_REGISTERED: "user.registered",
  ENQUIRY_RECEIVED: "enquiry.received",
  ENQUIRY_ASSIGNED: "enquiry.assigned",
  APPLICATION_CREATED: "application.created",
  BOOKING_SUBMITTED: "booking.submitted",
  PAYMENT_RECEIVED: "payment.received",
  PAYMENT_FAILED: "payment.failed",
  PAYMENT_REQUESTED: "payment.requested",
  DOCUMENTS_UPLOADED: "documents.uploaded",
  DOCUMENT_APPROVED: "document.approved",
  DOCUMENT_REJECTED: "document.rejected",
  ADDITIONAL_DOCUMENTS_REQUESTED: "documents.additional_requested",
  APPLICATION_STATUS_CHANGED: "application.status_changed",
  APPLICATION_ASSIGNED: "application.assigned",
  ADMIN_REPLIED: "conversation.admin_replied",
  CUSTOMER_REPLIED: "conversation.customer_replied",
  APPLICATION_COMPLETED: "application.completed",
  FINAL_DOCUMENT_READY: "application.final_document_ready",
  FOLLOW_UP_DUE: "lead.follow_up_due",
  DOCUMENTS_REMINDER: "application.documents_reminder",

  // B2B partners
  PARTNER_REGISTRATION_RECEIVED: "partner.registration_received",
  PARTNER_APPROVED: "partner.approved",
  PARTNER_REJECTED: "partner.rejected",
  PARTNER_SUSPENDED: "partner.suspended",
  PARTNER_BOOKING_CREATED: "partner.booking_created",
  PARTNER_DOCUMENTS_REQUESTED: "partner.documents_requested",
  PARTNER_BOOKING_STATUS_CHANGED: "partner.booking_status_changed",
  PARTNER_BOOKING_COMPLETED: "partner.booking_completed",
  PARTNER_PRICING_UPDATED: "partner.pricing_updated",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export type NotificationAudience = "customer" | "staff";

export interface NotificationDefinition {
  type: NotificationType;
  audience: NotificationAudience;
  /** Channels attempted unless the caller overrides them. */
  defaultChannels: ("in_app" | "email" | "whatsapp")[];
  icon: string;
  /** Customers can turn these off; `false` means it is operational. */
  optional: boolean;
}

export const NOTIFICATION_DEFINITIONS: Record<
  NotificationType,
  NotificationDefinition
> = {
  "user.registered": {
    type: NOTIFICATION_TYPES.USER_REGISTERED,
    audience: "customer",
    defaultChannels: ["in_app", "email"],
    icon: "UserPlus",
    optional: false,
  },
  "enquiry.received": {
    type: NOTIFICATION_TYPES.ENQUIRY_RECEIVED,
    audience: "staff",
    defaultChannels: ["in_app", "email"],
    icon: "Inbox",
    optional: false,
  },
  "enquiry.assigned": {
    type: NOTIFICATION_TYPES.ENQUIRY_ASSIGNED,
    audience: "staff",
    defaultChannels: ["in_app"],
    icon: "UserCheck",
    optional: false,
  },
  "application.created": {
    type: NOTIFICATION_TYPES.APPLICATION_CREATED,
    audience: "staff",
    defaultChannels: ["in_app"],
    icon: "FilePlus",
    optional: false,
  },
  "booking.submitted": {
    type: NOTIFICATION_TYPES.BOOKING_SUBMITTED,
    audience: "customer",
    defaultChannels: ["in_app", "email", "whatsapp"],
    icon: "CheckCircle2",
    optional: false,
  },
  "payment.received": {
    type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
    audience: "customer",
    defaultChannels: ["in_app", "email"],
    icon: "CreditCard",
    optional: false,
  },
  "payment.failed": {
    type: NOTIFICATION_TYPES.PAYMENT_FAILED,
    audience: "customer",
    defaultChannels: ["in_app", "email"],
    icon: "XCircle",
    optional: false,
  },
  "payment.requested": {
    type: NOTIFICATION_TYPES.PAYMENT_REQUESTED,
    audience: "customer",
    defaultChannels: ["in_app", "email", "whatsapp"],
    icon: "Receipt",
    optional: false,
  },
  "documents.uploaded": {
    type: NOTIFICATION_TYPES.DOCUMENTS_UPLOADED,
    audience: "staff",
    defaultChannels: ["in_app"],
    icon: "Upload",
    optional: false,
  },
  "document.approved": {
    type: NOTIFICATION_TYPES.DOCUMENT_APPROVED,
    audience: "customer",
    defaultChannels: ["in_app"],
    icon: "FileCheck",
    optional: true,
  },
  "document.rejected": {
    type: NOTIFICATION_TYPES.DOCUMENT_REJECTED,
    audience: "customer",
    defaultChannels: ["in_app", "email", "whatsapp"],
    icon: "FileX",
    optional: false,
  },
  "documents.additional_requested": {
    type: NOTIFICATION_TYPES.ADDITIONAL_DOCUMENTS_REQUESTED,
    audience: "customer",
    defaultChannels: ["in_app", "email", "whatsapp"],
    icon: "FileWarning",
    optional: false,
  },
  "application.status_changed": {
    type: NOTIFICATION_TYPES.APPLICATION_STATUS_CHANGED,
    audience: "customer",
    defaultChannels: ["in_app", "email"],
    icon: "Activity",
    optional: false,
  },
  "application.assigned": {
    type: NOTIFICATION_TYPES.APPLICATION_ASSIGNED,
    audience: "staff",
    defaultChannels: ["in_app"],
    icon: "UserCheck",
    optional: false,
  },
  "conversation.admin_replied": {
    type: NOTIFICATION_TYPES.ADMIN_REPLIED,
    audience: "customer",
    defaultChannels: ["in_app", "email"],
    icon: "MessageSquare",
    optional: false,
  },
  "conversation.customer_replied": {
    type: NOTIFICATION_TYPES.CUSTOMER_REPLIED,
    audience: "staff",
    defaultChannels: ["in_app"],
    icon: "MessageSquare",
    optional: false,
  },
  "application.completed": {
    type: NOTIFICATION_TYPES.APPLICATION_COMPLETED,
    audience: "customer",
    defaultChannels: ["in_app", "email", "whatsapp"],
    icon: "PartyPopper",
    optional: false,
  },
  "application.final_document_ready": {
    type: NOTIFICATION_TYPES.FINAL_DOCUMENT_READY,
    audience: "customer",
    defaultChannels: ["in_app", "email", "whatsapp"],
    icon: "Download",
    optional: false,
  },
  "lead.follow_up_due": {
    type: NOTIFICATION_TYPES.FOLLOW_UP_DUE,
    audience: "staff",
    defaultChannels: ["in_app"],
    icon: "BellRing",
    optional: false,
  },
  "application.documents_reminder": {
    type: NOTIFICATION_TYPES.DOCUMENTS_REMINDER,
    audience: "customer",
    defaultChannels: ["in_app", "email"],
    icon: "Clock",
    optional: true,
  },

  /* ------------------------------ B2B partners ------------------------------
   * A partner is a business, not a consumer: every notice below is
   * operational (`optional: false`), because muting "your account was
   * suspended" or "this booking needs documents" would strand their own
   * customer. The partner-facing copies of application events are separate
   * types from the customer ones so they get their own dedupe keys — the end
   * customer and the agent must both be told about the same status change.
   */
  "partner.registration_received": {
    type: NOTIFICATION_TYPES.PARTNER_REGISTRATION_RECEIVED,
    audience: "staff",
    defaultChannels: ["in_app", "email"],
    icon: "Building2",
    optional: false,
  },
  "partner.approved": {
    type: NOTIFICATION_TYPES.PARTNER_APPROVED,
    audience: "customer",
    defaultChannels: ["in_app", "email", "whatsapp"],
    icon: "BadgeCheck",
    optional: false,
  },
  "partner.rejected": {
    type: NOTIFICATION_TYPES.PARTNER_REJECTED,
    audience: "customer",
    defaultChannels: ["in_app", "email"],
    icon: "XCircle",
    optional: false,
  },
  "partner.suspended": {
    type: NOTIFICATION_TYPES.PARTNER_SUSPENDED,
    audience: "customer",
    defaultChannels: ["in_app", "email"],
    icon: "PauseCircle",
    optional: false,
  },
  "partner.booking_created": {
    type: NOTIFICATION_TYPES.PARTNER_BOOKING_CREATED,
    audience: "customer",
    defaultChannels: ["in_app", "email", "whatsapp"],
    icon: "FilePlus",
    optional: false,
  },
  "partner.documents_requested": {
    type: NOTIFICATION_TYPES.PARTNER_DOCUMENTS_REQUESTED,
    audience: "customer",
    defaultChannels: ["in_app", "email", "whatsapp"],
    icon: "FileWarning",
    optional: false,
  },
  "partner.booking_status_changed": {
    type: NOTIFICATION_TYPES.PARTNER_BOOKING_STATUS_CHANGED,
    audience: "customer",
    defaultChannels: ["in_app", "email"],
    icon: "Activity",
    optional: false,
  },
  "partner.booking_completed": {
    type: NOTIFICATION_TYPES.PARTNER_BOOKING_COMPLETED,
    audience: "customer",
    defaultChannels: ["in_app", "email", "whatsapp"],
    icon: "PartyPopper",
    optional: false,
  },
  "partner.pricing_updated": {
    type: NOTIFICATION_TYPES.PARTNER_PRICING_UPDATED,
    audience: "customer",
    defaultChannels: ["in_app"],
    icon: "Tags",
    optional: false,
  },
};

/* ------------------------------ dedupe keys ------------------------------ */

/**
 * Deterministic dedupe keys. Two calls describing the *same real-world event*
 * must produce the same key.
 */
export const dedupeKeys = {
  applicationStatus: (applicationId: string, status: string) =>
    `app:${applicationId}:status:${status}`,
  bookingSubmitted: (applicationId: string) => `app:${applicationId}:submitted`,
  paymentReceived: (paymentId: string) => `payment:${paymentId}:received`,
  paymentFailed: (paymentId: string, attempt: number) =>
    `payment:${paymentId}:failed:${attempt}`,
  documentReviewed: (documentId: string, status: string) =>
    `doc:${documentId}:${status}`,
  documentRequested: (requestId: string) => `docreq:${requestId}`,
  newMessage: (messageId: string) => `msg:${messageId}`,
  enquiryReceived: (enquiryId: string, staffUserId: string) =>
    `enq:${enquiryId}:staff:${staffUserId}`,
  followUpDue: (enquiryId: string, dayStamp: string) =>
    `enq:${enquiryId}:followup:${dayStamp}`,
  documentsReminder: (applicationId: string, dayStamp: string) =>
    `app:${applicationId}:docreminder:${dayStamp}`,
  userRegistered: (userId: string) => `user:${userId}:registered`,
  finalDocument: (applicationId: string) => `app:${applicationId}:finaldoc`,
  applicationAssigned: (applicationId: string, agentId: string) =>
    `app:${applicationId}:assigned:${agentId}`,

  /* ------------------------------ B2B partners ------------------------------
   * Partner-facing keys are namespaced `partner:` so they can never collide
   * with the customer's key for the same underlying event — both people have
   * to be told, and `dispatch` drops the second row when the key repeats.
   */
  partnerRegistration: (partnerId: string, staffUserId: string) =>
    `partner:${partnerId}:registered:staff:${staffUserId}`,
  partnerStatus: (partnerId: string, status: string) =>
    `partner:${partnerId}:status:${status}`,
  partnerBookingCreated: (applicationId: string) =>
    `partner:app:${applicationId}:created`,
  partnerBookingStatus: (applicationId: string, status: string) =>
    `partner:app:${applicationId}:status:${status}`,
  partnerDocumentsRequested: (requestId: string) =>
    `partner:docreq:${requestId}`,
  partnerPricingUpdated: (partnerId: string, stamp: string) =>
    `partner:${partnerId}:pricing:${stamp}`,
};

/** `YYYY-MM-DD` in IST, used to make daily cron keys stable. */
export function dayStamp(timestamp: number = Date.now()): string {
  const ist = new Date(timestamp + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}
