import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  hasPermission,
  isPartnerRole,
  isStaffRole,
  resolvePermissions,
  roleAtLeast,
  type Permission,
  type UserRole,
} from "../../lib/constants/roles";
import { partnerCanTrade } from "../../lib/constants/partners";

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

/* -------------------------------- partners ------------------------------- */

/**
 * The `partners` row for a login, if there is one.
 *
 * Lives here rather than in `convex/lib/partners.ts` so that
 * `requireApplicationAccess` can resolve a partner caller without the two
 * modules importing each other.
 */
export async function getPartnerForUser(
  ctx: AnyCtx,
  userId: Id<"users">,
): Promise<Doc<"partners"> | null> {
  const partner = await ctx.db
    .query("partners")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();

  if (!partner || partner.isDeleted) return null;
  return partner;
}

export interface PartnerContext {
  user: Doc<"users">;
  partner: Doc<"partners">;
}

/**
 * Throws unless the caller is a signed-in, **approved** partner.
 *
 * Three distinct failures, three distinct codes, because the portal shows a
 * different screen for each: no partner record at all (offer registration),
 * a record that is not approved yet (show the pending screen), and a record
 * that was suspended or rejected (show why).
 */
export async function requirePartner(ctx: AnyCtx): Promise<PartnerContext> {
  const user = await requireUser(ctx);

  const partner = await getPartnerForUser(ctx, user._id);
  if (!partner) {
    throw new ConvexError({
      code: "NO_PARTNER_ACCOUNT",
      message: "This account is not registered as a VisaDrive partner.",
    });
  }

  if (!partnerCanTrade(partner.status)) {
    throw new ConvexError({
      code: "PARTNER_NOT_APPROVED",
      message:
        partner.status === "rejected"
          ? "This partner application was not approved."
          : partner.status === "suspended"
            ? "This partner account is currently suspended."
            : "This partner account is still being reviewed.",
      status: partner.status,
      reason: partner.statusReason,
    });
  }

  // A partner whose `users.role` was changed out from under their partner row
  // is a mismatch we refuse rather than paper over.
  if (!isPartnerRole(user.role)) {
    authError(
      "FORBIDDEN",
      "This account is no longer set up as a partner login.",
    );
  }

  return { user, partner };
}

/**
 * The caller's partner row without insisting it be approved, for the screens
 * that exist precisely to show an unapproved state. Returns `null` for a
 * caller who has never registered.
 */
export async function getPartnerContext(
  ctx: AnyCtx,
): Promise<{ user: Doc<"users">; partner: Doc<"partners"> | null } | null> {
  const user = await getAuthUser(ctx);
  if (!user) return null;
  return { user, partner: await getPartnerForUser(ctx, user._id) };
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
  /**
   * True when the caller reaches this application as the B2B partner that
   * placed it. A partner has the *applicant side* of the booking — they may
   * read it, fill it in and upload for it — and never the office side: no
   * status changes, no internal timeline, no other partner's rows.
   */
  viaPartner: boolean;
  partner: Doc<"partners"> | null;
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

  /* ------------------------------ partners ------------------------------ */
  // Checked before the customer branch, because a partner is not the owner of
  // the bookings they place — the traveller is — and the customer branch
  // would refuse them on exactly that ground.
  if (isPartnerRole(user.role)) {
    const partner = await getPartnerForUser(ctx, user._id);
    const viaPartner =
      !!partner &&
      !!application.partnerId &&
      application.partnerId === partner._id &&
      partnerCanTrade(partner.status);

    if (!viaPartner && !isOwner) {
      authError("FORBIDDEN", "You do not have access to this application.");
    }

    // `write` means "acting as staff". A partner never is: they cannot move
    // an application's official status, however their own booking it is.
    if (opts.write) {
      authError(
        "FORBIDDEN",
        "Only VisaDrive staff can change an application's status.",
      );
    }

    return {
      user,
      application,
      isOwner,
      viaStaff: false,
      actingAsStaff: false,
      staff: null,
      viaPartner,
      partner: viaPartner ? partner : null,
    };
  }

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
      viaPartner: false,
      partner: null,
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
    viaPartner: false,
    partner: null,
  };
}

/**
 * Who may still fill in, submit or walk away from a booking: the customer who
 * owns it, or the partner who placed it.
 *
 * The wizard mutations (`getDraft`, `saveDraftStep`, `submit`, `cancelMine`)
 * all used a bare `application.userId !== user._id`, which is correct for a
 * direct booking and wrong for a B2B one — the traveller owns the row, but it
 * is the agent who is typing. This is the one place that distinction is made,
 * so the whole wizard keeps one definition of "the applicant side".
 *
 * Deliberately *not* staff: the office has its own, audited mutations for
 * correcting a submitted booking, and autosaving over a customer's half-typed
 * form from the CRM is the bug this avoids.
 */
export async function requireBookingEditor(
  ctx: AnyCtx,
  applicationId: Id<"applications">,
): Promise<{
  user: Doc<"users">;
  application: Doc<"applications">;
  isOwner: boolean;
  viaPartner: boolean;
  partner: Doc<"partners"> | null;
}> {
  const user = await requireUser(ctx);
  const application = await ctx.db.get(applicationId);

  if (!application) {
    authError("NOT_FOUND", "Application not found.");
  }

  if (application.userId === user._id) {
    return { user, application, isOwner: true, viaPartner: false, partner: null };
  }

  if (isPartnerRole(user.role) && application.partnerId) {
    const partner = await getPartnerForUser(ctx, user._id);
    if (
      partner &&
      application.partnerId === partner._id &&
      partnerCanTrade(partner.status)
    ) {
      return {
        user,
        application,
        isOwner: false,
        viaPartner: true,
        partner,
      };
    }
  }

  authError("FORBIDDEN", "You do not have access to this application.");
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

  // A partner uploaded these on their customer's behalf and has to be able to
  // check what went in — but only on an application they themselves placed.
  if (isPartnerRole(user.role)) {
    const application = await ctx.db.get(document.applicationId);
    const partner = await getPartnerForUser(ctx, user._id);
    if (
      application &&
      partner &&
      application.partnerId === partner._id &&
      partnerCanTrade(partner.status)
    ) {
      return { user, document, viaStaff: false };
    }
    authError("FORBIDDEN", "You do not have access to this document.");
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
