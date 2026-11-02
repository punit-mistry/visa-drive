/**
 * Status vocabularies shared by the portal, the admin CRM and Convex.
 *
 * Note on the timeline: not every destination or visa type passes through
 * every stage (a DS-160 filling service has no appointment stage; an e-Visa
 * has no interview). `timelineOrder` is a display hint only — the real
 * progression of an application is whatever is recorded in `statusHistory`.
 */

import type { LucideIcon } from "lucide-react";

export const APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "documents_pending",
  "documents_submitted",
  "under_review",
  "additional_documents_requested",
  "ready_for_processing",
  "appointment_scheduled",
  "visa_processing",
  "approved",
  "rejected",
  "completed",
  "cancelled",
  "on_hold",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type StatusTone =
  | "neutral"
  | "info"
  | "progress"
  | "warning"
  | "success"
  | "danger";

export interface StatusConfig {
  value: ApplicationStatus;
  label: string;
  /** Shown to the customer on their timeline. */
  customerLabel: string;
  description: string;
  tone: StatusTone;
  /** Position on the visual timeline; null = off-timeline (terminal/aside). */
  timelineOrder: number | null;
  /** Terminal states cannot transition further except by an admin override. */
  isTerminal: boolean;
  /** Whether a customer may still edit/upload while in this state. */
  customerCanUpload: boolean;
}

export const APPLICATION_STATUS_CONFIG: Record<ApplicationStatus, StatusConfig> = {
  draft: {
    value: "draft",
    label: "Draft",
    customerLabel: "Draft",
    description: "Started but not yet submitted. Only visible to the customer.",
    tone: "neutral",
    timelineOrder: null,
    isTerminal: false,
    customerCanUpload: true,
  },
  submitted: {
    value: "submitted",
    label: "Submitted",
    customerLabel: "Application created",
    description: "The customer has submitted the booking request.",
    tone: "info",
    timelineOrder: 1,
    isTerminal: false,
    customerCanUpload: true,
  },
  documents_pending: {
    value: "documents_pending",
    label: "Documents Pending",
    customerLabel: "Awaiting your documents",
    description: "Waiting on the customer to upload the required checklist.",
    tone: "warning",
    timelineOrder: 2,
    isTerminal: false,
    customerCanUpload: true,
  },
  documents_submitted: {
    value: "documents_submitted",
    label: "Documents Submitted",
    customerLabel: "Documents submitted",
    description: "All required documents have been uploaded.",
    tone: "info",
    timelineOrder: 3,
    isTerminal: false,
    customerCanUpload: true,
  },
  under_review: {
    value: "under_review",
    label: "Under Review",
    customerLabel: "Under review",
    description: "A VisaDrive agent is checking the application and documents.",
    tone: "progress",
    timelineOrder: 4,
    isTerminal: false,
    customerCanUpload: true,
  },
  additional_documents_requested: {
    value: "additional_documents_requested",
    label: "Additional Documents Requested",
    customerLabel: "Action needed from you",
    description: "The team has asked the customer for more or replacement documents.",
    tone: "warning",
    timelineOrder: 5,
    isTerminal: false,
    customerCanUpload: true,
  },
  ready_for_processing: {
    value: "ready_for_processing",
    label: "Ready for Processing",
    customerLabel: "Ready for processing",
    description: "Review complete. Queued for submission or appointment booking.",
    tone: "progress",
    timelineOrder: 6,
    isTerminal: false,
    customerCanUpload: false,
  },
  appointment_scheduled: {
    value: "appointment_scheduled",
    label: "Appointment Scheduled",
    customerLabel: "Appointment scheduled",
    description: "An appointment or biometric slot has been booked.",
    tone: "progress",
    timelineOrder: 7,
    isTerminal: false,
    customerCanUpload: false,
  },
  visa_processing: {
    value: "visa_processing",
    label: "Visa Processing",
    customerLabel: "With the authorities",
    description: "The application is with the relevant authority for a decision.",
    tone: "progress",
    timelineOrder: 8,
    isTerminal: false,
    customerCanUpload: false,
  },
  approved: {
    value: "approved",
    label: "Approved",
    customerLabel: "Approved",
    description: "A decision has been received and the outcome is positive.",
    tone: "success",
    timelineOrder: 9,
    isTerminal: false,
    customerCanUpload: false,
  },
  rejected: {
    value: "rejected",
    label: "Rejected",
    customerLabel: "Not approved",
    description: "The authority did not approve this application.",
    tone: "danger",
    timelineOrder: 9,
    isTerminal: true,
    customerCanUpload: false,
  },
  completed: {
    value: "completed",
    label: "Completed",
    customerLabel: "Completed",
    description: "Everything is finished and any final documents have been issued.",
    tone: "success",
    timelineOrder: 10,
    isTerminal: true,
    customerCanUpload: false,
  },
  cancelled: {
    value: "cancelled",
    label: "Cancelled",
    customerLabel: "Cancelled",
    description: "Cancelled by the customer or by VisaDrive.",
    tone: "neutral",
    timelineOrder: null,
    isTerminal: true,
    customerCanUpload: false,
  },
  on_hold: {
    value: "on_hold",
    label: "On Hold",
    customerLabel: "On hold",
    description: "Paused — usually pending clarification or a customer decision.",
    tone: "warning",
    timelineOrder: null,
    isTerminal: false,
    customerCanUpload: true,
  },
};

/** Ordered stages for the customer-facing timeline component. */
export const TIMELINE_STAGES = APPLICATION_STATUSES.filter(
  (s) => APPLICATION_STATUS_CONFIG[s].timelineOrder !== null,
).sort(
  (a, b) =>
    (APPLICATION_STATUS_CONFIG[a].timelineOrder ?? 0) -
    (APPLICATION_STATUS_CONFIG[b].timelineOrder ?? 0),
);

/** Statuses an application may move to from its current one. */
export const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["documents_pending", "under_review", "on_hold", "cancelled"],
  documents_pending: ["documents_submitted", "under_review", "on_hold", "cancelled"],
  documents_submitted: ["under_review", "additional_documents_requested", "on_hold", "cancelled"],
  under_review: [
    "additional_documents_requested",
    "ready_for_processing",
    "rejected",
    "on_hold",
    "cancelled",
  ],
  additional_documents_requested: ["under_review", "documents_submitted", "on_hold", "cancelled"],
  ready_for_processing: ["appointment_scheduled", "visa_processing", "on_hold", "cancelled"],
  appointment_scheduled: ["visa_processing", "on_hold", "cancelled", "approved", "rejected"],
  visa_processing: ["approved", "rejected", "on_hold", "cancelled"],
  approved: ["completed", "on_hold"],
  rejected: ["completed", "on_hold"],
  completed: [],
  cancelled: [],
  on_hold: [
    "submitted",
    "documents_pending",
    "documents_submitted",
    "under_review",
    "ready_for_processing",
    "appointment_scheduled",
    "visa_processing",
    "cancelled",
  ],
};

export function canTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/* ------------------------------- payments -------------------------------- */

export const PAYMENT_STATUSES = [
  "not_required",
  "unpaid",
  "pending",
  "partially_paid",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
] as const;

export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_CONFIG: Record<
  PaymentStatusValue,
  { label: string; tone: StatusTone; description: string }
> = {
  not_required: {
    label: "No Payment Required",
    tone: "neutral",
    description: "This service is a free consultation or is billed later.",
  },
  unpaid: {
    label: "Unpaid",
    tone: "warning",
    description: "Payment has not been collected yet.",
  },
  pending: {
    label: "Pending",
    tone: "info",
    description: "A payment has been initiated but not confirmed.",
  },
  partially_paid: {
    label: "Partially Paid",
    tone: "warning",
    description: "Some of the total has been collected.",
  },
  paid: { label: "Paid", tone: "success", description: "Paid in full." },
  failed: {
    label: "Failed",
    tone: "danger",
    description: "The last payment attempt failed.",
  },
  refunded: {
    label: "Refunded",
    tone: "neutral",
    description: "The full amount has been refunded.",
  },
  partially_refunded: {
    label: "Partially Refunded",
    tone: "neutral",
    description: "Part of the amount has been refunded.",
  },
};

/* ------------------------------- documents ------------------------------- */

export const DOCUMENT_STATUSES = [
  "pending_review",
  "approved",
  "rejected",
  "replacement_requested",
] as const;

export type DocumentStatusValue = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_CONFIG: Record<
  DocumentStatusValue,
  { label: string; tone: StatusTone }
> = {
  pending_review: { label: "Pending Review", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  replacement_requested: { label: "Replacement Requested", tone: "warning" },
};

/* --------------------------------- leads --------------------------------- */

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "follow_up_required",
  "qualified",
  "converted",
  "lost",
] as const;

export type LeadStatusValue = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_CONFIG: Record<
  LeadStatusValue,
  { label: string; tone: StatusTone }
> = {
  new: { label: "New", tone: "info" },
  contacted: { label: "Contacted", tone: "progress" },
  follow_up_required: { label: "Follow-up Required", tone: "warning" },
  qualified: { label: "Qualified", tone: "progress" },
  converted: { label: "Converted", tone: "success" },
  lost: { label: "Lost", tone: "neutral" },
};

/* ----------------------------- conversations ----------------------------- */

export const CONVERSATION_STATUSES = ["open", "pending", "resolved", "closed"] as const;
export type ConversationStatusValue = (typeof CONVERSATION_STATUSES)[number];

export const CONVERSATION_STATUS_CONFIG: Record<
  ConversationStatusValue,
  { label: string; tone: StatusTone }
> = {
  open: { label: "Open", tone: "info" },
  pending: { label: "Pending", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

/* --------------------------- tone -> tailwind ---------------------------- */

/** Badge classes per tone. Kept here so every surface renders a status
 *  identically in the portal and the admin CRM. */
export const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-info-soft text-info border-info/20",
  progress: "bg-navy/10 text-navy border-navy/20 dark:text-blue-300",
  warning: "bg-warning-soft text-warning border-warning/25",
  success: "bg-success-soft text-success border-success/25",
  danger: "bg-brand-tint text-brand-deep border-brand/25 dark:text-red-300",
};

export const TONE_DOT_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground/50",
  info: "bg-info",
  progress: "bg-navy",
  warning: "bg-warning",
  success: "bg-success",
  danger: "bg-brand",
};

export type { LucideIcon };
