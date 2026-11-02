import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  hasPermission,
  isStaffRole,
  resolvePermissions,
  roleAtLeast,
  type Permission,
  type UserRole,
} from "../../lib/constants/roles";

/* ============================================================================
 * Authorisation helpers.
 *
 * Every protected Convex function starts by calling one of these. The rules:
 *
 *   1. The caller's identity comes from `ctx.auth`, never from an argument.
 *   2. The caller's role comes from the `users` row, never from the JWT claim
 *      or anything the client sent.
 *   3. Ownership is verified against the row being touched, not inferred.
 *
 * All failures throw a `ConvexError` with a stable `code` so the UI can tell
 * "not signed in" apart from "signed in but not allowed".
 * ========================================================================== */

export type AnyCtx = QueryCtx | MutationCtx;

export type AuthErrorCode =
  | "UNAUTHENTICATED"
  | "NO_PROFILE"
  | "SUSPENDED"
  | "FORBIDDEN"
  | "NOT_FOUND";

export function authError(code: AuthErrorCode, message: string): never {
  throw new ConvexError({ code, message });
}

/* ------------------------------- identity -------------------------------- */

/** The signed-in user's row, or null when there is no valid session. */
export async function getAuthUser(ctx: AnyCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();

  return user ?? null;
}

/** Throws unless there is a signed-in, active user. */
export async function requireUser(ctx: AnyCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    authError("UNAUTHENTICATED", "You must be signed in to do this.");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user) {
    authError(
      "NO_PROFILE",
      "Your account is still being set up. Please refresh in a moment.",
    );
  }
  if (user.status === "suspended") {
    authError(
      "SUSPENDED",
      "Your account has been suspended. Please contact VisaDrive support.",
    );
  }
  if (user.status === "deleted") {
    authError("FORBIDDEN", "This account is no longer active.");
  }

  return user;
}

/* ------------------------------ permissions ------------------------------ */

export interface StaffContext {
  user: Doc<"users">;
  profile: Doc<"staffProfiles"> | null;
  role: UserRole;
  permissions: Set<string>;
}

/**
 * Load the caller plus their effective permission set.
 * Per-person grants/revocations on the staff profile are layered on top of
 * the role defaults.
 */
export async function getStaffContext(
  ctx: AnyCtx,
  user: Doc<"users">,
): Promise<StaffContext> {
  const profile = await ctx.db
    .query("staffProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();

  const role = user.role as UserRole;
  const permissions = resolvePermissions(
    role,
    profile?.extraPermissions ?? [],
    profile?.revokedPermissions ?? [],
  );

  return { user, profile: profile ?? null, role, permissions };
}

/** Throws unless the caller holds a staff role and their profile is active. */
export async function requireStaff(ctx: AnyCtx): Promise<StaffContext> {
  const user = await requireUser(ctx);

  if (!isStaffRole(user.role)) {
    authError("FORBIDDEN", "This area is restricted to VisaDrive staff.");
  }

  const staff = await getStaffContext(ctx, user);

  if (staff.profile && !staff.profile.isActive) {
    authError("FORBIDDEN", "Your staff account has been deactivated.");
  }

  return staff;
}

/** Throws unless the caller is staff AND holds `permission`. */
export async function requirePermission(
  ctx: AnyCtx,
  permission: Permission,
): Promise<StaffContext> {
  const staff = await requireStaff(ctx);

  if (!staff.permissions.has(permission)) {
    authError(
      "FORBIDDEN",
      `You do not have permission to perform this action (${permission}).`,
    );
  }

  return staff;
}

/** Throws unless the caller is staff at or above `minimum`. */
export async function requireRole(
  ctx: AnyCtx,
  minimum: UserRole,
): Promise<StaffContext> {
  const staff = await requireStaff(ctx);

  if (!roleAtLeast(staff.role, minimum)) {
    authError("FORBIDDEN", "Your role does not allow this action.");
  }

  return staff;
}

/** Non-throwing check, for conditionally shaping a response. */
export async function callerHasPermission(
  ctx: AnyCtx,
  permission: Permission,
): Promise<boolean> {
  const user = await getAuthUser(ctx);
  if (!user || !isStaffRole(user.role)) return false;

  const profile = await ctx.db
    .query("staffProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();

  if (profile && !profile.isActive) return false;

  return hasPermission(
    user.role as UserRole,
    permission,
    profile?.extraPermissions ?? [],
    profile?.revokedPermissions ?? [],
  );
}

/* ------------------------------- ownership ------------------------------- */

export interface ApplicationAccess {
  user: Doc<"users">;
  application: Doc<"applications">;
  /** True when access was granted by staff permission rather than ownership. */
  viaStaff: boolean;
  staff: StaffContext | null;
}

/**
 * Resolve access to one application.
 *
 * A customer may only reach their own. Staff need `application:view_all`, or
 * `application:view_assigned` with the application actually assigned to them.
 */
export async function requireApplicationAccess(
  ctx: AnyCtx,
  applicationId: Id<"applications">,
  opts: { write?: boolean } = {},
): Promise<ApplicationAccess> {
  const user = await requireUser(ctx);
  const application = await ctx.db.get(applicationId);

  if (!application) {
    authError("NOT_FOUND", "Application not found.");
  }

  // Owner path
  if (application.userId === user._id) {
    return { user, application, viaStaff: false, staff: null };
  }

  // Staff path
  if (!isStaffRole(user.role)) {
    authError("FORBIDDEN", "You do not have access to this application.");
  }

  const staff = await getStaffContext(ctx, user);
  if (staff.profile && !staff.profile.isActive) {
    authError("FORBIDDEN", "Your staff account has been deactivated.");
  }

  const canViewAll = staff.permissions.has("application:view_all");
  const canViewAssigned =
    staff.permissions.has("application:view_assigned") &&
    application.assignedAgentId === user._id;

  if (!canViewAll && !canViewAssigned) {
    authError("FORBIDDEN", "You do not have access to this application.");
  }

  if (opts.write && !staff.permissions.has("application:update_status")) {
    authError("FORBIDDEN", "You do not have permission to modify this application.");
  }

  return { user, application, viaStaff: true, staff };
}

/**
 * Resolve access to one document (and therefore to the underlying file).
 *
 * Passport scans and bank statements live behind this check — Convex storage
 * URLs are only ever minted after it passes.
 */
export async function requireDocumentAccess(
  ctx: AnyCtx,
  documentId: Id<"documents">,
): Promise<{ user: Doc<"users">; document: Doc<"documents">; viaStaff: boolean }> {
  const user = await requireUser(ctx);
  const document = await ctx.db.get(documentId);

  if (!document) {
    authError("NOT_FOUND", "Document not found.");
  }

  if (document.userId === user._id) {
    return { user, document, viaStaff: false };
  }

  if (!isStaffRole(user.role)) {
    authError("FORBIDDEN", "You do not have access to this document.");
  }

  const staff = await getStaffContext(ctx, user);
  if (staff.profile && !staff.profile.isActive) {
    authError("FORBIDDEN", "Your staff account has been deactivated.");
  }
  if (!staff.permissions.has("document:view")) {
    authError("FORBIDDEN", "You do not have permission to view documents.");
  }

  return { user, document, viaStaff: true };
}

/** Resolve access to one conversation thread. */
export async function requireConversationAccess(
  ctx: AnyCtx,
  conversationId: Id<"conversations">,
): Promise<{
  user: Doc<"users">;
  conversation: Doc<"conversations">;
  viaStaff: boolean;
}> {
  const user = await requireUser(ctx);
  const conversation = await ctx.db.get(conversationId);

  if (!conversation) {
    authError("NOT_FOUND", "Conversation not found.");
  }

  if (conversation.userId === user._id) {
    return { user, conversation, viaStaff: false };
  }

  if (!isStaffRole(user.role)) {
    authError("FORBIDDEN", "You do not have access to this conversation.");
  }

  const staff = await getStaffContext(ctx, user);
  if (!staff.permissions.has("conversation:view_all")) {
    authError("FORBIDDEN", "You do not have permission to view conversations.");
  }

  return { user, conversation, viaStaff: true };
}
