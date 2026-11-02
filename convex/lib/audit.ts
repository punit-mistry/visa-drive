import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/* ============================================================================
 * Audit trail.
 *
 * Every administrative action that changes money, status, permissions or
 * customer-visible data writes a row here. The admin UI reads it back as the
 * activity timeline, so `summary` should read as a sentence a human would
 * understand without needing the diff.
 * ========================================================================== */

export type AuditEntityType =
  | "application"
  | "user"
  | "enquiry"
  | "conversation"
  | "document"
  | "payment"
  | "visa_product"
  | "destination"
  | "setting"
  | "staff";

export const AUDIT_ACTIONS = {
  APPLICATION_STATUS_CHANGED: "application.status_changed",
  APPLICATION_ASSIGNED: "application.assigned",
  APPLICATION_BULK_UPDATED: "application.bulk_updated",
  APPLICATION_COMPLETED: "application.completed",
  APPLICATION_CANCELLED: "application.cancelled",
  APPLICATION_FINAL_DOC_UPLOADED: "application.final_document_uploaded",

  DOCUMENT_APPROVED: "document.approved",
  DOCUMENT_REJECTED: "document.rejected",
  DOCUMENT_REQUESTED: "document.requested",
  DOCUMENT_DOWNLOADED: "document.downloaded",
  DOCUMENT_DELETED: "document.deleted",

  PAYMENT_RECORDED: "payment.recorded",
  PAYMENT_VERIFIED: "payment.verified",
  PAYMENT_REFUNDED: "payment.refunded",
  PAYMENT_REQUEST_SENT: "payment.request_sent",

  CUSTOMER_SUSPENDED: "customer.suspended",
  CUSTOMER_REACTIVATED: "customer.reactivated",
  CUSTOMER_UPDATED: "customer.updated",

  ENQUIRY_ASSIGNED: "enquiry.assigned",
  ENQUIRY_STATUS_CHANGED: "enquiry.status_changed",
  ENQUIRY_CONVERTED: "enquiry.converted",

  CATALOGUE_CREATED: "catalogue.created",
  CATALOGUE_UPDATED: "catalogue.updated",
  CATALOGUE_PUBLISHED: "catalogue.published",
  CATALOGUE_UNPUBLISHED: "catalogue.unpublished",
  CATALOGUE_DELETED: "catalogue.deleted",

  STAFF_INVITED: "staff.invited",
  STAFF_ROLE_CHANGED: "staff.role_changed",
  STAFF_DEACTIVATED: "staff.deactivated",

  SETTINGS_UPDATED: "settings.updated",
  SEED_RUN: "seed.run",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditInput {
  actor: Doc<"users"> | null;
  action: AuditAction | string;
  entityType: AuditEntityType;
  entityId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Write one audit row. Never throws — an audit failure must not roll back the
 * action it is describing, but it is surfaced in the logs.
 */
export async function recordAudit(
  ctx: MutationCtx,
  input: AuditInput,
): Promise<Id<"auditLogs"> | null> {
  try {
    return await ctx.db.insert("auditLogs", {
      actorUserId: input.actor?._id,
      actorName: input.actor?.fullName ?? "System",
      actorRole: input.actor?.role ?? "system",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: Date.now(),
    });
  } catch (error) {
    console.error("[audit] failed to record entry", input.action, error);
    return null;
  }
}

/**
 * Reduce a patch to only the fields that actually changed, so audit rows stay
 * readable instead of storing the whole document twice.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  patch: Partial<T>,
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};

  for (const key of Object.keys(patch) as (keyof T)[]) {
    const nextValue = patch[key];
    if (nextValue === undefined) continue;
    if (JSON.stringify(before[key]) === JSON.stringify(nextValue)) continue;
    b[key] = before[key];
    a[key] = nextValue;
  }

  return { before: b, after: a };
}
