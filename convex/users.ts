import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { userRole, userStatus } from "./schema";
import {
  authError,
  getAuthUser,
  requirePermission,
  requireStaff,
  requireUser,
} from "./lib/auth";
import { AUDIT_ACTIONS, diffFields, recordAudit } from "./lib/audit";
import {
  PERMISSIONS,
  assignableRoles,
  isStaffRole,
  resolvePermissions,
  type UserRole,
} from "../lib/constants/roles";
import { NOTIFICATION_TYPES, dedupeKeys } from "../lib/constants/notifications";

/* ============================================================================
 * Users, staff profiles and the Clerk -> Convex bridge.
 *
 * Clerk owns identity (email / name / avatar / verification). Convex owns
 * authorisation (role, status, staff profile). The webhook therefore only ever
 * writes the identity columns - see `upsertFromClerk`.
 * ========================================================================== */

/**
 * Sibling Convex modules land in the same change set; `_generated/api.d.ts`
 * only learns about them after `npx convex dev` regenerates it, so the
 * scheduler reference is the generated one, so a change to dispatch's
 * argument shape is caught at build time.
 */
const notificationsDispatch = internal.notifications.dispatch;

/* -------------------------------------------------------------------------- */
/*                                  helpers                                   */
/* -------------------------------------------------------------------------- */

async function loadStaffProfile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"staffProfiles"> | null> {
  const profile = await ctx.db
    .query("staffProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  return profile ?? null;
}

/** The user row decorated with the permission set the UI uses to hide chrome. */
async function decorate(ctx: QueryCtx | MutationCtx, user: Doc<"users">) {
  const profile = await loadStaffProfile(ctx, user._id);
  const permissions = resolvePermissions(
    user.role as UserRole,
    profile?.extraPermissions ?? [],
    profile?.revokedPermissions ?? [],
  );

  return {
    ...user,
    permissions: Array.from(permissions),
    isStaff: isStaffRole(user.role),
    staffProfile: profile,
  };
}

/**
 * Allocate the next free employee code. `staffProfiles` is an operational
 * table of tens of rows, so a scan is cheaper than maintaining a counter; the
 * uniqueness loop covers manually edited or imported codes.
 */
async function nextEmployeeCode(ctx: MutationCtx): Promise<string> {
  const existing = await ctx.db.query("staffProfiles").collect();
  let n = existing.length + 1;

  for (let i = 0; i < 1000; i += 1) {
    const code = `VD-S-${String(n).padStart(4, "0")}`;
    const clash = await ctx.db
      .query("staffProfiles")
      .withIndex("by_employeeCode", (q) => q.eq("employeeCode", code))
      .unique();
    if (!clash) return code;
    n += 1;
  }

  throw new ConvexError({
    code: "CONFLICT",
    message: "Could not allocate a staff employee code.",
  });
}

/** Create the staffProfile on promotion, or revive it if one already exists. */
async function ensureStaffProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
  options: {
    invitedBy?: Id<"users">;
    designation?: string;
    department?: string;
    extraPermissions?: string[];
    revokedPermissions?: string[];
    assignedDestinationIds?: Id<"destinations">[];
    maxConcurrentApplications?: number;
  } = {},
): Promise<Id<"staffProfiles">> {
  const existing = await loadStaffProfile(ctx, userId);

  if (existing) {
    const patch: Partial<Doc<"staffProfiles">> = { isActive: true };
    if (options.designation !== undefined) patch.designation = options.designation;
    if (options.department !== undefined) patch.department = options.department;
    if (options.extraPermissions !== undefined) {
      patch.extraPermissions = options.extraPermissions;
    }
    if (options.revokedPermissions !== undefined) {
      patch.revokedPermissions = options.revokedPermissions;
    }
    if (options.assignedDestinationIds !== undefined) {
      patch.assignedDestinationIds = options.assignedDestinationIds;
    }
    if (options.maxConcurrentApplications !== undefined) {
      patch.maxConcurrentApplications = options.maxConcurrentApplications;
    }
    await ctx.db.patch(existing._id, patch);
    return existing._id;
  }

  return await ctx.db.insert("staffProfiles", {
    userId,
    employeeCode: await nextEmployeeCode(ctx),
    designation: options.designation,
    department: options.department,
    extraPermissions: options.extraPermissions ?? [],
    revokedPermissions: options.revokedPermissions ?? [],
    assignedDestinationIds: options.assignedDestinationIds ?? [],
    maxConcurrentApplications: options.maxConcurrentApplications,
    isActive: true,
    invitedBy: options.invitedBy,
    createdAt: Date.now(),
  });
}

/**
 * Number of super admins who can still sign in. Used to stop the platform
 * being locked out of its own role management.
 */
async function activeSuperAdminCount(
  ctx: QueryCtx | MutationCtx,
): Promise<number> {
  const rows = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "super_admin"))
    .collect();
  return rows.filter((u) => u.status === "active").length;
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/* -------------------------------------------------------------------------- */
/*                                  queries                                   */
/* -------------------------------------------------------------------------- */

/**
 * The signed-in user, with their resolved permissions.
 * Returns `null` rather than throwing so the layout can render for signed-out
 * visitors and during the brief window before the Clerk webhook has landed.
 */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) return null;
    if (user.status === "deleted") return null;
    return await decorate(ctx, user);
  },
});

/** Staff-only lookup of one user (customer or colleague). */
export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return await decorate(ctx, user);
  },
});

/**
 * Paginated customer directory.
 *
 * `search` goes through the `search_users` search index (which carries `role`
 * and `status` as filter fields); without it we page an ordinary index so the
 * query never scans the whole table.
 */
export const listCustomers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.optional(userStatus),
    sort: v.optional(v.union(v.literal("newest"), v.literal("oldest"))),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CUSTOMER_VIEW);

    const term = args.search?.trim();
    const status = args.status;

    if (term) {
      return await ctx.db
        .query("users")
        .withSearchIndex("search_users", (q) => {
          const base = q.search("fullName", term).eq("role", "customer");
          return status ? base.eq("status", status) : base;
        })
        .paginate(args.paginationOpts);
    }

    const order = args.sort === "oldest" ? "asc" : "desc";

    if (status) {
      return await ctx.db
        .query("users")
        .withIndex("by_status_role", (q) =>
          q.eq("status", status).eq("role", "customer"),
        )
        .order(order)
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "customer"))
      .order(order)
      .paginate(args.paginationOpts);
  },
});

/** One customer plus the counts and recent rows the profile drawer shows. */
export const customerProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CUSTOMER_VIEW);

    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    // Bounded reads: every query below is scoped to this one customer by an
    // index, and capped so a prolific account cannot blow the read limit.
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_lastMessage", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(20);

    const statusCounts: Record<string, number> = {};
    for (const app of applications) {
      statusCounts[app.status] = (statusCounts[app.status] ?? 0) + 1;
    }

    const paid = payments.filter((p) => p.status === "paid");
    const totalPaid = paid.reduce((sum, p) => sum + p.amount, 0);
    const totalRefunded = payments.reduce((sum, p) => sum + p.refundedAmount, 0);

    return {
      user: await decorate(ctx, user),
      counts: {
        applications: user.applicationCount,
        drafts: applications.filter((a) => a.isDraft).length,
        openConversations: conversations.filter(
          (c) => c.status === "open" || c.status === "pending",
        ).length,
        payments: payments.length,
      },
      totals: {
        currency: paid[0]?.currency ?? "INR",
        paid: totalPaid,
        refunded: totalRefunded,
        net: totalPaid - totalRefunded,
      },
      statusCounts,
      recentApplications: applications.slice(0, 10),
      recentPayments: payments.slice(0, 10),
      recentConversations: conversations.slice(0, 10),
    };
  },
});

/** Everyone who can reach /admin, with their staff profile joined. */
export const listStaff = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.STAFF_VIEW);

    const staffRoles: UserRole[] = [
      "support_agent",
      "visa_agent",
      "manager",
      "admin",
      "super_admin",
    ];

    const rows = [];

    // One indexed read per staff role - the roster is a handful of rows.
    for (const role of staffRoles) {
      const users = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", role))
        .collect();

      for (const user of users) {
        if (user.status === "deleted") continue;
        const profile = await loadStaffProfile(ctx, user._id);
        if (!args.includeInactive && profile && !profile.isActive) continue;

        rows.push({
          ...user,
          isStaff: true,
          staffProfile: profile,
          permissions: Array.from(
            resolvePermissions(
              user.role as UserRole,
              profile?.extraPermissions ?? [],
              profile?.revokedPermissions ?? [],
            ),
          ),
          /** Invited but never signed in - no Clerk account linked yet. */
          isPendingInvite: user.clerkId.startsWith("pending:"),
        });
      }
    }

    return rows;
  },
});

/* -------------------------------------------------------------------------- */
/*                                 mutations                                  */
/* -------------------------------------------------------------------------- */

/** The caller edits their own profile. No other field is reachable from here. */
export const updateProfile = mutation({
  args: {
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    marketingOptIn: v.optional(v.boolean()),
    whatsappOptIn: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const patch: Partial<Doc<"users">> = { lastActiveAt: Date.now() };

    if (args.fullName !== undefined) {
      const name = args.fullName.trim();
      if (name.length < 2) {
        throw new ConvexError({
          code: "VALIDATION",
          message: "Please enter your full name.",
        });
      }
      patch.fullName = name;
    }
    if (args.phone !== undefined) patch.phone = args.phone.trim() || undefined;
    if (args.marketingOptIn !== undefined) {
      patch.marketingOptIn = args.marketingOptIn;
    }
    if (args.whatsappOptIn !== undefined) {
      patch.whatsappOptIn = args.whatsappOptIn;
    }

    await ctx.db.patch(user._id, patch);
    return null;
  },
});

/**
 * Change someone's role.
 *
 * Two guards are the reason this is not a generic patch:
 *  1. The actor may only grant roles `assignableRoles()` allows, so an admin
 *     can never mint a super_admin (privilege escalation).
 *  2. The last active super_admin cannot be demoted - including by themselves
 *     - or nobody can ever assign a role again.
 */
export const setRole = mutation({
  args: {
    userId: v.id("users"),
    role: userRole,
    reason: v.optional(v.string()),
    designation: v.optional(v.string()),
    department: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.ROLE_ASSIGN);

    const target = await ctx.db.get(args.userId);
    if (!target) authError("NOT_FOUND", "That user no longer exists.");

    const allowed = assignableRoles(staff.role);
    if (!allowed.includes(args.role)) {
      authError(
        "FORBIDDEN",
        `Your role cannot grant "${args.role}". Allowed: ${
          allowed.join(", ") || "none"
        }.`,
      );
    }

    // You also may not touch someone who already outranks what you can grant.
    if (!allowed.includes(target.role as UserRole)) {
      authError(
        "FORBIDDEN",
        "You cannot change the role of a user who outranks you.",
      );
    }

    if (target.role === args.role) {
      return { userId: target._id, role: args.role, changed: false };
    }

    if (target.role === "super_admin" && args.role !== "super_admin") {
      const remaining = await activeSuperAdminCount(ctx);
      if (remaining <= 1) {
        throw new ConvexError({
          code: "LAST_SUPER_ADMIN",
          message:
            "This is the only active super admin. Promote someone else before changing this role.",
        });
      }
    }

    await ctx.db.patch(target._id, { role: args.role });

    if (isStaffRole(args.role)) {
      await ensureStaffProfile(ctx, target._id, {
        invitedBy: staff.user._id,
        designation: args.designation,
        department: args.department,
      });
    } else {
      // Demoted to customer: keep the profile row for history, deactivate it.
      const profile = await loadStaffProfile(ctx, target._id);
      if (profile) await ctx.db.patch(profile._id, { isActive: false });
    }

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.STAFF_ROLE_CHANGED,
      entityType: "user",
      entityId: target._id,
      summary: `Changed ${target.fullName}'s role from ${target.role} to ${
        args.role
      }${args.reason ? ` - ${args.reason}` : ""}`,
      before: { role: target.role },
      after: { role: args.role },
    });

    return { userId: target._id, role: args.role, changed: true };
  },
});

export const suspendCustomer = mutation({
  args: { userId: v.id("users"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CUSTOMER_SUSPEND);

    const target = await ctx.db.get(args.userId);
    if (!target) authError("NOT_FOUND", "That user no longer exists.");

    // Colleagues go through `deactivateStaff`, which also parks their profile;
    // suspending here would leave an active staffProfile behind.
    if (isStaffRole(target.role)) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Use Deactivate staff for colleagues, not Suspend.",
      });
    }
    if (target.status === "suspended") return null;

    await ctx.db.patch(target._id, {
      status: "suspended",
      suspendedAt: Date.now(),
      suspendedReason: args.reason,
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CUSTOMER_SUSPENDED,
      entityType: "user",
      entityId: target._id,
      summary: `Suspended ${target.fullName} - ${args.reason}`,
      before: { status: target.status },
      after: { status: "suspended", suspendedReason: args.reason },
    });

    return null;
  },
});

export const reactivateCustomer = mutation({
  args: { userId: v.id("users"), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.CUSTOMER_SUSPEND);

    const target = await ctx.db.get(args.userId);
    if (!target) authError("NOT_FOUND", "That user no longer exists.");
    if (target.status === "active") return null;

    // `undefined` in a patch clears the optional column.
    await ctx.db.patch(target._id, {
      status: "active",
      suspendedAt: undefined,
      suspendedReason: undefined,
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.CUSTOMER_REACTIVATED,
      entityType: "user",
      entityId: target._id,
      summary: `Reactivated ${target.fullName}${
        args.note ? ` - ${args.note}` : ""
      }`,
      before: { status: target.status },
      after: { status: "active" },
    });

    return null;
  },
});

/**
 * Invite a colleague.
 *
 * If the email already has an account we promote it. Otherwise we create a
 * placeholder row with a `pending:` sentinel clerkId; `upsertFromClerk` later
 * matches on email and links the real Clerk account to that row, which is why
 * the role granted here survives first sign-in.
 */
export const inviteStaff = mutation({
  args: {
    email: v.string(),
    fullName: v.string(),
    role: userRole,
    designation: v.optional(v.string()),
    department: v.optional(v.string()),
    extraPermissions: v.optional(v.array(v.string())),
    assignedDestinationIds: v.optional(v.array(v.id("destinations"))),
    maxConcurrentApplications: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.STAFF_MANAGE);

    if (!isStaffRole(args.role)) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Pick a staff role. Customers do not need an invitation.",
      });
    }

    // Inviting is a role grant, so it carries the same escalation guard.
    const allowed = assignableRoles(staff.role);
    if (!allowed.includes(args.role)) {
      authError(
        "FORBIDDEN",
        `Your role cannot grant "${args.role}". Allowed: ${
          allowed.join(", ") || "none"
        }.`,
      );
    }

    const email = normaliseEmail(args.email);
    if (!email.includes("@")) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Enter a valid email address.",
      });
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    let userId: Id<"users">;
    let wasPromotion = false;

    if (existing) {
      wasPromotion = true;
      await ctx.db.patch(existing._id, {
        role: args.role,
        status: "active",
        suspendedAt: undefined,
        suspendedReason: undefined,
      });
      userId = existing._id;
    } else {
      userId = await ctx.db.insert("users", {
        clerkId: `pending:${email}`,
        email,
        fullName: args.fullName.trim() || email.split("@")[0],
        role: args.role,
        status: "active",
        emailVerified: false,
        applicationCount: 0,
        createdAt: Date.now(),
      });
    }

    await ensureStaffProfile(ctx, userId, {
      invitedBy: staff.user._id,
      designation: args.designation,
      department: args.department,
      extraPermissions: args.extraPermissions,
      assignedDestinationIds: args.assignedDestinationIds,
      maxConcurrentApplications: args.maxConcurrentApplications,
    });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.STAFF_INVITED,
      entityType: "staff",
      entityId: userId,
      summary: `${wasPromotion ? "Promoted" : "Invited"} ${email} as ${args.role}`,
      after: { email, role: args.role },
    });

    return { userId, promoted: wasPromotion };
  },
});

export const updateStaffProfile = mutation({
  args: {
    userId: v.id("users"),
    designation: v.optional(v.string()),
    department: v.optional(v.string()),
    extraPermissions: v.optional(v.array(v.string())),
    revokedPermissions: v.optional(v.array(v.string())),
    assignedDestinationIds: v.optional(v.array(v.id("destinations"))),
    maxConcurrentApplications: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.STAFF_MANAGE);

    const target = await ctx.db.get(args.userId);
    if (!target) authError("NOT_FOUND", "That user no longer exists.");
    if (!isStaffRole(target.role)) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "That user is not a staff member.",
      });
    }

    const profile = await loadStaffProfile(ctx, target._id);
    if (!profile) {
      authError("NOT_FOUND", "That staff member has no profile yet.");
    }

    const patch: Partial<Doc<"staffProfiles">> = {};
    if (args.designation !== undefined) patch.designation = args.designation;
    if (args.department !== undefined) patch.department = args.department;
    if (args.extraPermissions !== undefined) {
      patch.extraPermissions = args.extraPermissions;
    }
    if (args.revokedPermissions !== undefined) {
      patch.revokedPermissions = args.revokedPermissions;
    }
    if (args.assignedDestinationIds !== undefined) {
      patch.assignedDestinationIds = args.assignedDestinationIds;
    }
    if (args.maxConcurrentApplications !== undefined) {
      patch.maxConcurrentApplications = args.maxConcurrentApplications;
    }
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    const { before, after } = diffFields(
      profile as unknown as Record<string, unknown>,
      patch as Record<string, unknown>,
    );

    await ctx.db.patch(profile._id, patch);

    await recordAudit(ctx, {
      actor: staff.user,
      action: "staff.profile_updated",
      entityType: "staff",
      entityId: target._id,
      summary: `Updated the staff profile for ${target.fullName}`,
      before,
      after,
    });

    return null;
  },
});

export const deactivateStaff = mutation({
  args: { userId: v.id("users"), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.STAFF_MANAGE);

    const target = await ctx.db.get(args.userId);
    if (!target) authError("NOT_FOUND", "That user no longer exists.");

    if (target._id === staff.user._id) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "You cannot deactivate your own staff account.",
      });
    }

    // Never strand the platform without a super admin.
    if (
      target.role === "super_admin" &&
      (await activeSuperAdminCount(ctx)) <= 1
    ) {
      throw new ConvexError({
        code: "LAST_SUPER_ADMIN",
        message:
          "This is the only active super admin and cannot be deactivated.",
      });
    }

    const profile = await loadStaffProfile(ctx, target._id);
    if (profile) await ctx.db.patch(profile._id, { isActive: false });

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.STAFF_DEACTIVATED,
      entityType: "staff",
      entityId: target._id,
      summary: `Deactivated ${target.fullName}${
        args.reason ? ` - ${args.reason}` : ""
      }`,
      before: { isActive: true },
      after: { isActive: false },
    });

    return null;
  },
});

/* -------------------------------------------------------------------------- */
/*                            Clerk webhook targets                           */
/* -------------------------------------------------------------------------- */

/**
 * Create or refresh a user from a Clerk `user.created` / `user.updated` event.
 *
 * Idempotent, and deliberately one-directional: Clerk is the source of truth
 * for email / name / avatar / verification only. Role and status live in
 * Convex, so an update event never downgrades a role an admin set here.
 */
interface ClerkIdentityFields {
  clerkId: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  phone?: string;
  emailVerified?: boolean;
}

/**
 * The one write path from Clerk identity into the `users` table.
 *
 * Shared by the webhook and by `syncFromClerk` so a delayed webhook and a
 * self-heal cannot diverge: both link an invited placeholder by email, both
 * respect a role an admin set, both revive a soft-deleted row.
 */
async function applyClerkIdentity(
  ctx: MutationCtx,
  args: ClerkIdentityFields,
): Promise<Id<"users">> {
  const email = normaliseEmail(args.email);
  const fullName = args.fullName.trim() || email.split("@")[0];

  const identityPatch = {
    email,
    fullName,
    avatarUrl: args.avatarUrl,
    emailVerified: args.emailVerified ?? false,
    ...(args.phone ? { phone: args.phone } : {}),
  };

  const byClerkId = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
    .unique();

  if (byClerkId) {
    await ctx.db.patch(byClerkId._id, {
      ...identityPatch,
      // A Clerk account re-created under the same id un-deletes the profile;
      // a suspension set in Convex is deliberately left alone.
      ...(byClerkId.status === "deleted" ? { status: "active" as const } : {}),
    });
    return byClerkId._id;
  }

  // An invited colleague signing in for the first time: link the placeholder
  // row (which already carries the role we granted) to their Clerk account.
  const byEmail = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();

  if (byEmail) {
    await ctx.db.patch(byEmail._id, {
      ...identityPatch,
      clerkId: args.clerkId,
      ...(byEmail.status === "deleted" ? { status: "active" as const } : {}),
    });
    return byEmail._id;
  }

  // Bootstrap: the first operator is named by a deployment env var so a
  // fresh deployment has somebody who can grant roles.
  const seedEmail = normaliseEmail(process.env.SEED_SUPER_ADMIN_EMAIL ?? "");
  const isSeedSuperAdmin = seedEmail.length > 0 && seedEmail === email;

  const userId = await ctx.db.insert("users", {
    clerkId: args.clerkId,
    ...identityPatch,
    role: isSeedSuperAdmin ? "super_admin" : "customer",
    status: "active",
    applicationCount: 0,
    createdAt: Date.now(),
  });

  if (isSeedSuperAdmin) {
    await ensureStaffProfile(ctx, userId, {
      designation: "Founder",
      department: "Management",
    });
  } else {
    await ctx.scheduler.runAfter(0, notificationsDispatch, {
      userId,
      type: NOTIFICATION_TYPES.USER_REGISTERED,
      title: "Welcome to VisaDrive",
      body: "Your account is ready. Pick a destination to start your visa application.",
      link: "/destinations",
      dedupeKey: dedupeKeys.userRegistered(userId),
    });
  }

  return userId;
}

export const upsertFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    fullName: v.string(),
    avatarUrl: v.optional(v.string()),
    phone: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => await applyClerkIdentity(ctx, args),
});

/**
 * Self-heal the profile from the caller's own Clerk identity.
 *
 * Clerk's `user.created` webhook is normally what creates the row, but it can
 * be delayed, retried, or missing in a fresh deployment - and until it lands
 * every protected query fails with `NO_PROFILE`. The signed JWT already proves
 * who the caller is, so they can be created here instead of staring at an
 * error.
 *
 * Identity fields come from the verified token, never from the client: an
 * attacker cannot claim an arbitrary email and inherit an invited staff role.
 * Returns `null` when the token carries no email (nothing safe to key a row
 * on) - the UI then keeps showing its "setting up" state.
 */
export const syncFromClerk = mutation({
  args: {},
  returns: v.object({
    status: v.union(
      v.literal("ready"),
      v.literal("incomplete"),
      v.literal("deleted"),
    ),
    userId: v.optional(v.id("users")),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { status: "incomplete" as const };

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existing) {
      if (existing.status === "deleted") return { status: "deleted" as const };
      return { status: "ready" as const, userId: existing._id };
    }

    const email = identity.email?.trim().toLowerCase();
    if (!email) return { status: "incomplete" as const };

    const fullName =
      identity.name?.trim() ||
      [identity.givenName, identity.familyName]
        .filter((part): part is string => !!part?.trim())
        .join(" ")
        .trim() ||
      email.split("@")[0];

    const userId = await applyClerkIdentity(ctx, {
      clerkId: identity.subject,
      email,
      fullName,
      avatarUrl: identity.pictureUrl,
      phone: identity.phoneNumber,
      emailVerified: identity.emailVerified ?? false,
    });

    return { status: "ready" as const, userId };
  },
});

/**
 * Soft-delete on `user.deleted`.
 *
 * Rows are never removed: applications, payments and audit logs reference the
 * user id, and the business needs those records to outlive the account.
 */
export const deleteFromClerk = internalMutation({
  args: { clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) return null; // already gone - the webhook retries safely
    if (user.status === "deleted") return null;

    await ctx.db.patch(user._id, { status: "deleted" });

    const profile = await loadStaffProfile(ctx, user._id);
    if (profile) await ctx.db.patch(profile._id, { isActive: false });

    await recordAudit(ctx, {
      actor: null,
      action: "user.deleted_from_clerk",
      entityType: "user",
      entityId: user._id,
      summary: `${user.fullName} deleted their Clerk account - profile soft-deleted`,
      before: { status: user.status },
      after: { status: "deleted" },
    });

    return null;
  },
});
