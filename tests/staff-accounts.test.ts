/**
 * Staff accounts: invitation, role changes, per-person permission tuning and
 * deactivation.
 *
 * This is the part of the system where a bug is worth the most to an attacker,
 * so the tests are written as attacks: can a lower role mint a higher one, can
 * anyone strand the deployment without a super admin, can a staff member widen
 * their own grant, does deactivation actually take effect.
 */
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { as, codeOf, makeUser, newTest } from "./harness";

describe("inviting a colleague", () => {
  test("a super admin can invite at any level", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });

    const { userId, promoted } = await as(t, boss.clerkId).mutation(
      api.users.inviteStaff,
      { email: "new.manager@visadrive.in", fullName: "New Manager", role: "manager" },
    );

    expect(promoted).toBe(false);
    const row = await t.run((ctx) => ctx.db.get(userId));
    expect(row?.role).toBe("manager");
    // Until they sign in there is no Clerk account to attach.
    expect(row?.clerkId).toBe("pending:new.manager@visadrive.in");

    const profile = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique(),
    );
    expect(profile?.isActive).toBe(true);
    expect(profile?.invitedBy).toBe(boss.id);
  });

  test("an admin cannot mint a super admin", async () => {
    const t = newTest();
    await makeUser(t, { role: "super_admin" });
    const admin = await makeUser(t, { role: "admin" });

    expect(
      await codeOf(() =>
        as(t, admin.clerkId).mutation(api.users.inviteStaff, {
          email: "backdoor@visadrive.in",
          fullName: "Backdoor",
          role: "super_admin",
        }),
      ),
    ).toBe("FORBIDDEN");

    expect(
      await t.run((ctx) =>
        ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", "backdoor@visadrive.in"))
          .first(),
      ),
    ).toBeNull();
  });

  test("a manager cannot invite anybody", async () => {
    const t = newTest();
    const manager = await makeUser(t, { role: "manager" });

    expect(
      await codeOf(() =>
        as(t, manager.clerkId).mutation(api.users.inviteStaff, {
          email: "friend@visadrive.in",
          fullName: "Friend",
          role: "support_agent",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a customer role is not an invitation", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });

    expect(
      await codeOf(() =>
        as(t, boss.clerkId).mutation(api.users.inviteStaff, {
          email: "someone@example.test",
          fullName: "Someone",
          role: "customer",
        }),
      ),
    ).toBe("VALIDATION");
  });

  test("a malformed email is refused", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });

    expect(
      await codeOf(() =>
        as(t, boss.clerkId).mutation(api.users.inviteStaff, {
          email: "not-an-email",
          fullName: "Nope",
          role: "support_agent",
        }),
      ),
    ).toBe("VALIDATION");
  });

  test("inviting an existing customer promotes that same row", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const customer = await makeUser(t, { role: "customer", email: "hire.me@example.test" });

    const { userId, promoted } = await as(t, boss.clerkId).mutation(
      api.users.inviteStaff,
      { email: "Hire.Me@Example.test", fullName: "Hire Me", role: "visa_agent" },
    );

    expect(promoted).toBe(true);
    expect(userId).toBe(customer.id);
    expect((await t.run((ctx) => ctx.db.get(customer.id)))?.role).toBe("visa_agent");
  });

  test("an invitation cannot be used to demote a colleague who outranks the inviter", async () => {
    const t = newTest();
    const boss = await makeUser(t, {
      role: "super_admin",
      email: "boss@visadrive.in",
    });
    const admin = await makeUser(t, { role: "admin" });

    // `setRole` blocks this; `inviteStaff` grants a role too, so it has to
    // block it as well — otherwise it is a one-call demotion of the owner.
    const code = await codeOf(() =>
      as(t, admin.clerkId).mutation(api.users.inviteStaff, {
        email: "boss@visadrive.in",
        fullName: "Boss",
        role: "manager",
      }),
    );
    expect(code).not.toBeNull();
    expect((await t.run((ctx) => ctx.db.get(boss.id)))?.role).toBe("super_admin");
  });

  test("an invitation cannot un-suspend a colleague past the suspension rules", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const suspended = await makeUser(t, {
      role: "customer",
      email: "banned@example.test",
      status: "suspended",
    });

    // Re-hiring a suspended person is a legitimate admin act, but it must be
    // a deliberate one: the row is reactivated and the change is audited.
    await as(t, boss.clerkId).mutation(api.users.inviteStaff, {
      email: "banned@example.test",
      fullName: "Rehired",
      role: "support_agent",
    });

    const row = await t.run((ctx) => ctx.db.get(suspended.id));
    expect(row?.status).toBe("active");
    expect(row?.suspendedReason).toBeUndefined();

    const audits = await t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(audits.some((a) => a.action === "staff.invited")).toBe(true);
  });
});

describe("changing roles", () => {
  test("a super admin can promote a customer to staff and a profile appears", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const customer = await makeUser(t);

    await as(t, boss.clerkId).mutation(api.users.setRole, {
      userId: customer.id,
      role: "visa_agent",
      designation: "Processing",
    });

    expect((await t.run((ctx) => ctx.db.get(customer.id)))?.role).toBe("visa_agent");
    const profile = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", customer.id))
        .unique(),
    );
    expect(profile?.isActive).toBe(true);
  });

  test("demoting to customer parks the staff profile but keeps the history", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const agent = await makeUser(t, { role: "visa_agent" });

    await as(t, boss.clerkId).mutation(api.users.setRole, {
      userId: agent.id,
      role: "customer",
    });

    const profile = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", agent.id))
        .unique(),
    );
    expect(profile).not.toBeNull();
    expect(profile?.isActive).toBe(false);
  });

  test("an admin cannot grant super admin, nor touch one", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const admin = await makeUser(t, { role: "admin" });
    const customer = await makeUser(t);

    // An admin has no ROLE_ASSIGN at all, so both calls stop at the permission.
    expect(
      await codeOf(() =>
        as(t, admin.clerkId).mutation(api.users.setRole, {
          userId: customer.id,
          role: "super_admin",
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(() =>
        as(t, admin.clerkId).mutation(api.users.setRole, {
          userId: boss.id,
          role: "customer",
        }),
      ),
    ).toBe("FORBIDDEN");

    expect((await t.run((ctx) => ctx.db.get(boss.id)))?.role).toBe("super_admin");
  });

  test("the last super admin cannot be demoted, not even by themselves", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });

    expect(
      await codeOf(() =>
        as(t, boss.clerkId).mutation(api.users.setRole, {
          userId: boss.id,
          role: "admin",
        }),
      ),
    ).toBe("LAST_SUPER_ADMIN");

    expect((await t.run((ctx) => ctx.db.get(boss.id)))?.role).toBe("super_admin");
  });

  test("with a second super admin in place the demotion is allowed", async () => {
    const t = newTest();
    const first = await makeUser(t, { role: "super_admin" });
    const second = await makeUser(t, { role: "super_admin" });

    await as(t, first.clerkId).mutation(api.users.setRole, {
      userId: second.id,
      role: "admin",
    });
    expect((await t.run((ctx) => ctx.db.get(second.id)))?.role).toBe("admin");
  });

  test("a suspended super admin does not count towards the lockout guard", async () => {
    const t = newTest();
    const active = await makeUser(t, { role: "super_admin" });
    await makeUser(t, { role: "super_admin", status: "suspended" });

    expect(
      await codeOf(() =>
        as(t, active.clerkId).mutation(api.users.setRole, {
          userId: active.id,
          role: "admin",
        }),
      ),
    ).toBe("LAST_SUPER_ADMIN");
  });

  test("a role change is audited with both the before and the after", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const customer = await makeUser(t);

    await as(t, boss.clerkId).mutation(api.users.setRole, {
      userId: customer.id,
      role: "manager",
      reason: "Promoted after review",
    });

    const audits = await t.run((ctx) => ctx.db.query("auditLogs").collect());
    const entry = audits.find((a) => a.entityId === customer.id);
    expect(entry?.action).toBe("staff.role_changed");
    expect(entry?.actorUserId).toBe(boss.id);
    expect(entry?.before).toMatchObject({ role: "customer" });
    expect(entry?.after).toMatchObject({ role: "manager" });
  });
});

describe("per-person permission tuning", () => {
  test("a revoked permission is actually refused at the endpoint", async () => {
    const t = newTest();
    const manager = await makeUser(t, {
      role: "manager",
      revokedPermissions: ["application:view_all"],
    });

    expect(
      await codeOf(() =>
        as(t, manager.clerkId).query(api.applications.listForAdmin, {
          paginationOpts: { numItems: 5, cursor: null },
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("an extra permission is honoured without changing the role", async () => {
    const t = newTest();
    const support = await makeUser(t, {
      role: "support_agent",
      extraPermissions: ["payment:view"],
    });

    const page = await as(t, support.clerkId).query(api.payments.listForAdmin, {
      paginationOpts: { numItems: 5, cursor: null },
    });
    expect(page).toBeTruthy();
    expect((await t.run((ctx) => ctx.db.get(support.id)))?.role).toBe("support_agent");
  });

  test("staff cannot widen their own grant beyond what their role allows", async () => {
    const t = newTest();
    await makeUser(t, { role: "super_admin" });
    const admin = await makeUser(t, { role: "admin" });

    // `staff:assign_role` belongs to super_admin alone. STAFF_MANAGE lets an
    // admin edit staff profiles — it must not let them hand themselves a
    // permission their role was never granted.
    const code = await codeOf(() =>
      as(t, admin.clerkId).mutation(api.users.updateStaffProfile, {
        userId: admin.id,
        extraPermissions: ["staff:assign_role"],
      }),
    );
    expect(code).not.toBeNull();

    const me = await as(t, admin.clerkId).query(api.users.current, {});
    expect(me?.permissions).not.toContain("staff:assign_role");
  });

  test("an admin cannot lock a super admin out through their staff profile", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const admin = await makeUser(t, { role: "admin" });

    // `deactivateStaff` refuses to strand the deployment. Flipping `isActive`
    // through the profile editor has exactly the same effect, so it has to be
    // refused too.
    const code = await codeOf(() =>
      as(t, admin.clerkId).mutation(api.users.updateStaffProfile, {
        userId: boss.id,
        isActive: false,
      }),
    );
    expect(code).not.toBeNull();

    // And the super admin can still do their job.
    expect(
      await codeOf(() =>
        as(t, boss.clerkId).query(api.users.listStaff, { includeInactive: true }),
      ),
    ).toBeNull();
  });

  test("a staff profile cannot be edited for someone who is not staff", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const customer = await makeUser(t);

    expect(
      await codeOf(() =>
        as(t, boss.clerkId).mutation(api.users.updateStaffProfile, {
          userId: customer.id,
          designation: "Nice try",
        }),
      ),
    ).toBe("VALIDATION");
  });
});

describe("deactivating a colleague", () => {
  test("a deactivated staff member loses admin access immediately", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const agent = await makeUser(t, { role: "visa_agent" });

    // Proves access before the change, so the assertion afterwards means
    // something.
    expect(
      await codeOf(() =>
        as(t, agent.clerkId).query(api.applications.listForAdmin, {
          paginationOpts: { numItems: 5, cursor: null },
        }),
      ),
    ).toBeNull();

    await as(t, boss.clerkId).mutation(api.users.deactivateStaff, {
      userId: agent.id,
      reason: "Left the company",
    });

    expect(
      await codeOf(() =>
        as(t, agent.clerkId).query(api.applications.listForAdmin, {
          paginationOpts: { numItems: 5, cursor: null },
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a deactivated agent also loses access to the applications assigned to them", async () => {
    const t = newTest();
    const agent = await makeUser(t, { role: "visa_agent", profileActive: false });

    expect(
      await codeOf(() => as(t, agent.clerkId).query(api.users.listStaff, {})),
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(() =>
        as(t, agent.clerkId).query(api.internalNotes.listForEntity, {
          entityType: "application",
          entityId: "anything",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("you cannot deactivate yourself", async () => {
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });

    expect(
      await codeOf(() =>
        as(t, admin.clerkId).mutation(api.users.deactivateStaff, { userId: admin.id }),
      ),
    ).toBe("VALIDATION");
  });

  test("the last super admin cannot be deactivated", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const admin = await makeUser(t, { role: "admin" });

    expect(
      await codeOf(() =>
        as(t, admin.clerkId).mutation(api.users.deactivateStaff, { userId: boss.id }),
      ),
    ).toBe("LAST_SUPER_ADMIN");
  });

  test("suspend is for customers, not colleagues", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const agent = await makeUser(t, { role: "visa_agent" });

    expect(
      await codeOf(() =>
        as(t, boss.clerkId).mutation(api.users.suspendCustomer, {
          userId: agent.id,
          reason: "wrong tool",
        }),
      ),
    ).toBe("VALIDATION");
  });

  test("suspending a customer stops them and reactivating lets them back in", async () => {
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });
    const customer = await makeUser(t);

    await as(t, admin.clerkId).mutation(api.users.suspendCustomer, {
      userId: customer.id,
      reason: "Chargeback abuse",
    });
    expect(
      await codeOf(() => as(t, customer.clerkId).query(api.applications.listMyDrafts, {})),
    ).toBe("SUSPENDED");

    await as(t, admin.clerkId).mutation(api.users.reactivateCustomer, {
      userId: customer.id,
    });
    expect(
      await codeOf(() => as(t, customer.clerkId).query(api.applications.listMyDrafts, {})),
    ).toBeNull();
  });
});

describe("linking a provisioned sign-in to an invitation", () => {
  async function invite(t: ReturnType<typeof newTest>, email: string) {
    const boss = await makeUser(t, { role: "super_admin" });
    const { userId } = await as(t, boss.clerkId).mutation(api.users.inviteStaff, {
      email,
      fullName: "Provisioned Colleague",
      role: "visa_agent",
    });
    return { boss, userId };
  }

  test("a pending invitation is linked and the colleague can sign straight in", async () => {
    const t = newTest();
    const { boss, userId } = await invite(t, "provisioned@visadrive.in");

    await as(t, boss.clerkId).mutation(api.users.linkClerkAccount, {
      userId,
      clerkId: "user_provisioned_1",
    });

    const me = await as(t, "user_provisioned_1").query(api.users.current, {});
    expect(me?.role).toBe("visa_agent");
    expect(me?._id).toBe(userId);

    const audits = await t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(audits.some((a) => a.action === "staff.sign_in_linked")).toBe(true);
  });

  test("an already-linked colleague cannot be repointed at another sign-in", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const agent = await makeUser(t, {
      role: "visa_agent",
      clerkId: "user_real_agent",
      email: "real.agent@visadrive.in",
    });

    expect(
      await codeOf(() =>
        as(t, boss.clerkId).mutation(api.users.linkClerkAccount, {
          userId: agent.id,
          clerkId: "user_attacker_account",
        }),
      ),
    ).toBe("ALREADY_LINKED");

    expect((await t.run((ctx) => ctx.db.get(agent.id)))?.clerkId).toBe("user_real_agent");
  });

  test("a sign-in already in use cannot be attached to a second row", async () => {
    const t = newTest();
    const { boss, userId } = await invite(t, "second@visadrive.in");
    const existing = await makeUser(t, { clerkId: "user_taken", email: "taken@example.test" });

    expect(
      await codeOf(() =>
        as(t, boss.clerkId).mutation(api.users.linkClerkAccount, {
          userId,
          clerkId: "user_taken",
        }),
      ),
    ).toBe("CONFLICT");

    expect((await t.run((ctx) => ctx.db.get(existing.id)))?.clerkId).toBe("user_taken");
  });

  test("a pending sentinel cannot be written in as a real sign-in", async () => {
    const t = newTest();
    const { boss, userId } = await invite(t, "sentinel@visadrive.in");

    for (const clerkId of ["pending:someone@else.test", "   "]) {
      expect(
        await codeOf(() =>
          as(t, boss.clerkId).mutation(api.users.linkClerkAccount, { userId, clerkId }),
        ),
      ).toBe("VALIDATION");
    }
  });

  test("linking needs staff:manage", async () => {
    const t = newTest();
    const { userId } = await invite(t, "needs.perm@visadrive.in");
    const manager = await makeUser(t, { role: "manager" });
    const customer = await makeUser(t);

    for (const actor of [manager, customer]) {
      expect(
        await codeOf(() =>
          as(t, actor.clerkId).mutation(api.users.linkClerkAccount, {
            userId,
            clerkId: "user_nope",
          }),
        ),
      ).toBe("FORBIDDEN");
    }
  });
});

describe("invited-but-not-signed-in accounts", () => {
  test("a pending invitation cannot be used as a session", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });

    await as(t, boss.clerkId).mutation(api.users.inviteStaff, {
      email: "pending.agent@visadrive.in",
      fullName: "Pending Agent",
      role: "manager",
    });

    // The sentinel clerkId is not a Clerk subject anyone can present, but a
    // caller who guessed it must still get nowhere — the placeholder is not a
    // session, so it does not even resolve to the row it is parked on.
    expect(
      await codeOf(() =>
        as(t, "pending:pending.agent@visadrive.in").query(api.users.listStaff, {}),
      ),
    ).toBe("UNAUTHENTICATED");
  });

  test("the staff roster flags pending invitations", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    await as(t, boss.clerkId).mutation(api.users.inviteStaff, {
      email: "roster.pending@visadrive.in",
      fullName: "Roster Pending",
      role: "support_agent",
    });

    const roster = await as(t, boss.clerkId).query(api.users.listStaff, {});
    const invited = roster.find((r) => r.email === "roster.pending@visadrive.in");
    expect(invited?.isPendingInvite).toBe(true);
  });

  test("employee codes stay unique across a batch of invitations", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const signedIn = as(t, boss.clerkId);

    for (let i = 0; i < 5; i += 1) {
      await signedIn.mutation(api.users.inviteStaff, {
        email: `batch${i}@visadrive.in`,
        fullName: `Batch ${i}`,
        role: "support_agent",
      });
    }

    const profiles = await t.run((ctx) => ctx.db.query("staffProfiles").collect());
    const codes = profiles.map((p) => p.employeeCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
