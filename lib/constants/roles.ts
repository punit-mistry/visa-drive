/**
 * Roles and permissions.
 *
 * This file is the single source of truth for authorisation and is imported by
 * BOTH the Next.js app (for hiding UI) and Convex functions (for enforcing
 * access). UI hiding is a convenience only — every protected Convex function
 * re-checks permission server-side. A role arriving from client state is never
 * trusted.
 */

export const USER_ROLES = [
  "customer",
  "support_agent",
  "visa_agent",
  "manager",
  "admin",
  "super_admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Roles that may access /admin at all. */
export const STAFF_ROLES = [
  "support_agent",
  "visa_agent",
  "manager",
  "admin",
  "super_admin",
] as const satisfies readonly UserRole[];

export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

/** Ordering used for "at least this role" comparisons. */
export const ROLE_RANK: Record<UserRole, number> = {
  customer: 0,
  support_agent: 10,
  visa_agent: 20,
  manager: 30,
  admin: 40,
  super_admin: 50,
};

export function roleAtLeast(role: UserRole, minimum: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  customer: "Customer",
  support_agent: "Support Agent",
  visa_agent: "Visa Processing Agent",
  manager: "Manager",
  admin: "Admin",
  super_admin: "Super Admin",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  customer: "Can book visas, upload documents and track their own applications.",
  support_agent: "Handles customer conversations and enquiries. Read-only on applications.",
  visa_agent: "Processes assigned applications, reviews documents and updates status.",
  manager: "Oversees all applications, assigns agents, manages the catalogue and reports.",
  admin: "Full operational access including payments, staff and settings.",
  super_admin: "Unrestricted, including destructive actions and role changes.",
};

/* -------------------------------------------------------------------------- */
/*                                 Permissions                                */
/* -------------------------------------------------------------------------- */

export const PERMISSIONS = {
  // Applications
  APPLICATION_VIEW_ALL: "application:view_all",
  APPLICATION_VIEW_ASSIGNED: "application:view_assigned",
  APPLICATION_UPDATE_STATUS: "application:update_status",
  APPLICATION_ASSIGN: "application:assign",
  APPLICATION_BULK_UPDATE: "application:bulk_update",
  APPLICATION_DELETE: "application:delete",
  APPLICATION_EXPORT: "application:export",
  APPLICATION_UPLOAD_FINAL: "application:upload_final_document",

  // Documents
  DOCUMENT_VIEW: "document:view",
  DOCUMENT_REVIEW: "document:review",
  DOCUMENT_REQUEST: "document:request",
  DOCUMENT_DOWNLOAD: "document:download",
  DOCUMENT_DELETE: "document:delete",

  // Customers
  CUSTOMER_VIEW: "customer:view",
  CUSTOMER_EDIT: "customer:edit",
  CUSTOMER_SUSPEND: "customer:suspend",
  CUSTOMER_EXPORT: "customer:export",

  // Enquiries / leads
  ENQUIRY_VIEW: "enquiry:view",
  ENQUIRY_MANAGE: "enquiry:manage",
  ENQUIRY_ASSIGN: "enquiry:assign",
  ENQUIRY_CONVERT: "enquiry:convert",

  // Catalogue (destinations + visa products)
  CATALOGUE_VIEW: "catalogue:view",
  CATALOGUE_EDIT: "catalogue:edit",
  CATALOGUE_PUBLISH: "catalogue:publish",
  CATALOGUE_DELETE: "catalogue:delete",

  // Payments
  PAYMENT_VIEW: "payment:view",
  PAYMENT_RECORD: "payment:record",
  PAYMENT_REFUND: "payment:refund",
  PAYMENT_EXPORT: "payment:export",

  // Conversations
  CONVERSATION_VIEW_ALL: "conversation:view_all",
  CONVERSATION_REPLY: "conversation:reply",
  CONVERSATION_ASSIGN: "conversation:assign",
  CONVERSATION_INTERNAL_NOTE: "conversation:internal_note",

  // Staff & settings
  STAFF_VIEW: "staff:view",
  STAFF_MANAGE: "staff:manage",
  ROLE_ASSIGN: "staff:assign_role",
  SETTINGS_VIEW: "settings:view",
  SETTINGS_EDIT: "settings:edit",
  AUDIT_LOG_VIEW: "audit:view",
  ANALYTICS_VIEW: "analytics:view",

  // Dev / seed
  SEED_RUN: "seed:run",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

const SUPPORT_AGENT_PERMISSIONS: Permission[] = [
  P.APPLICATION_VIEW_ALL,
  P.CUSTOMER_VIEW,
  P.ENQUIRY_VIEW,
  P.ENQUIRY_MANAGE,
  P.CONVERSATION_VIEW_ALL,
  P.CONVERSATION_REPLY,
  P.CONVERSATION_INTERNAL_NOTE,
  P.CATALOGUE_VIEW,
  P.DOCUMENT_VIEW,
];

const VISA_AGENT_PERMISSIONS: Permission[] = [
  ...SUPPORT_AGENT_PERMISSIONS,
  P.APPLICATION_VIEW_ASSIGNED,
  P.APPLICATION_UPDATE_STATUS,
  P.APPLICATION_UPLOAD_FINAL,
  P.DOCUMENT_REVIEW,
  P.DOCUMENT_REQUEST,
  P.DOCUMENT_DOWNLOAD,
  P.PAYMENT_VIEW,
  P.ANALYTICS_VIEW,
];

const MANAGER_PERMISSIONS: Permission[] = [
  ...VISA_AGENT_PERMISSIONS,
  P.APPLICATION_ASSIGN,
  P.APPLICATION_BULK_UPDATE,
  P.APPLICATION_EXPORT,
  P.CUSTOMER_EDIT,
  P.CUSTOMER_EXPORT,
  P.ENQUIRY_ASSIGN,
  P.ENQUIRY_CONVERT,
  P.CATALOGUE_EDIT,
  P.CATALOGUE_PUBLISH,
  P.CONVERSATION_ASSIGN,
  P.PAYMENT_RECORD,
  P.PAYMENT_EXPORT,
  P.STAFF_VIEW,
  P.SETTINGS_VIEW,
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...MANAGER_PERMISSIONS,
  P.APPLICATION_DELETE,
  P.CUSTOMER_SUSPEND,
  P.CATALOGUE_DELETE,
  P.DOCUMENT_DELETE,
  P.PAYMENT_REFUND,
  P.STAFF_MANAGE,
  P.SETTINGS_EDIT,
  P.AUDIT_LOG_VIEW,
  P.SEED_RUN,
];

const SUPER_ADMIN_PERMISSIONS: Permission[] = [
  ...ADMIN_PERMISSIONS,
  P.ROLE_ASSIGN,
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  customer: [],
  support_agent: dedupe(SUPPORT_AGENT_PERMISSIONS),
  visa_agent: dedupe(VISA_AGENT_PERMISSIONS),
  manager: dedupe(MANAGER_PERMISSIONS),
  admin: dedupe(ADMIN_PERMISSIONS),
  super_admin: dedupe(SUPER_ADMIN_PERMISSIONS),
};

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

/**
 * Resolve the effective permission set for a user.
 * `extra` / `revoked` come from their staffProfile and allow per-person
 * tuning without inventing new roles.
 */
export function resolvePermissions(
  role: UserRole,
  extra: readonly string[] = [],
  revoked: readonly string[] = [],
): Set<string> {
  const set = new Set<string>(ROLE_PERMISSIONS[role] ?? []);
  for (const p of extra) set.add(p);
  for (const p of revoked) set.delete(p);
  return set;
}

export function hasPermission(
  role: UserRole,
  permission: Permission,
  extra: readonly string[] = [],
  revoked: readonly string[] = [],
): boolean {
  return resolvePermissions(role, extra, revoked).has(permission);
}

/** Roles a given role is allowed to grant. Prevents privilege escalation. */
export function assignableRoles(actor: UserRole): UserRole[] {
  if (actor === "super_admin") return [...USER_ROLES];
  if (actor === "admin") {
    return ["customer", "support_agent", "visa_agent", "manager"];
  }
  return [];
}
