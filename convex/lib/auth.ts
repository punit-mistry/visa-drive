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

/**
 * `users.inviteStaff` parks an invited colleague on a `pending:<email>`
 * clerkId until they actually sign in. That sentinel is a placeholder, never a
 * Clerk subject, so a token presenting one is not a session — it is somebody
 * guessing. Both lookups below refuse to resolve it.
 */
function isPendingPlaceholder(clerkId: string): boolean {
  return clerkId.startsWith("pending:");
}

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
  if (isPendingPlaceholder(identity.subject)) return null;

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
  if (isPendingPlaceholder(identity.subject)) {
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
  /** True when the caller is the customer this application belongs to. */
  isOwner: boolean;
  /**
   * True when the caller reaches this application through a staff grant.
   *
   * Independent of `isOwner`: a colleague who booked a visa through their own
   * portal account is both. The CRM screens key off this flag, so collapsing
   * the two would lock a staff member out of any application they happen to
   * own — which is exactly what used to happen.
   */
  viaStaff: boolean;
  /**
   * True when the caller is exercising staff powers over somebody else's
   * booking. This is the flag behavioural switches want — who the author of a
   * message is, whether the customer upload window applies, whether the
   * assigned agent gets a "customer uploaded" nudge. `viaStaff` on its own
   * answers a different question: may this caller see the CRM view.
   */
  actingAsStaff: boolean;
  staff: StaffContext | null;
}

/**
 * Resolve access to one application.
 *
 * A customer may only reach their own. Staff need `application:view_all`, or
 * `application:view_assigned` with the application actually assigned to them.
 * Owning the row and holding a staff grant are evaluated separately, because a
 * member of the team is allowed to be a customer too.
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

  const isOwner = application.userId === user._id;

  /* ----------------------------- customers ------------------------------ */
  if (!isStaffRole(user.role)) {
    if (!isOwner) {
      authError("FORBIDDEN", "You do not have access to this application.");
    }
    if (opts.write) {
      authError(
        "FORBIDDEN",
        "You do not have permission to modify this application.",
      );
    }
    return {
      user,
      application,
      isOwner,
      viaStaff: false,
      actingAsStaff: false,
      staff: null,
    };
  }

  /* ------------------------------- staff -------------------------------- */
  const staff = await getStaffContext(ctx, user);
  const profileActive = !staff.profile || staff.profile.isActive;

  const canViewAll = profileActive && staff.permissions.has("application:view_all");
  const canViewAssigned =
    profileActive &&
    staff.permissions.has("application:view_assigned") &&
    application.assignedAgentId === user._id;

  const viaStaff = canViewAll || canViewAssigned;

  if (!viaStaff && !isOwner) {
    authError(
      "FORBIDDEN",
      profileActive
        ? "You do not have access to this application."
        : "Your staff account has been deactivated.",
    );
  }

  // `write` means "acting as staff", so it always needs the grant — owning the
  // row is not a way around the permission.
  if (opts.write && (!viaStaff || !staff.permissions.has("application:update_status"))) {
    authError("FORBIDDEN", "You do not have permission to modify this application.");
  }

  return {
    user,
    application,
    isOwner,
    viaStaff,
    actingAsStaff: viaStaff && !isOwner,
    staff: viaStaff ? staff : null,
  };
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
