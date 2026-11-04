/**
 * Onboarding: Clerk identity -> Convex profile.
 *
 * The threat model here is simple and nasty: the `users` row is where role and
 * status live, so anything that can steer which row a new sign-in lands on is
 * a privilege escalation. These tests drive the two write paths (the signed
 * webhook and the self-heal `syncFromClerk`) and check that neither of them
 * takes a role, a status or an identity from anything the client controls.
 */
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { as, codeOf, makeUser, newTest } from "./harness";

describe("onboarding — first sign-in", () => {
  test("a brand new sign-in creates a customer, never anything higher", async () => {
    const t = newTest();
    const signedIn = as(t, "clerk_new_1", {
      email: "New.Person@Example.test",
      name: "New Person",
      emailVerified: true,
    });

    const result = await signedIn.mutation(api.users.syncFromClerk, {});
    expect(result.status).toBe("ready");

    const me = await signedIn.query(api.users.current, {});
    expect(me?.role).toBe("customer");
    expect(me?.status).toBe("active");
    // Email is normalised, so a later invite on the same address matches.
    expect(me?.email).toBe("new.person@example.test");
    expect(me?.permissions).toEqual([]);
  });

  test("sync is idempotent — a retried call never forks a second profile", async () => {
    const t = newTest();
    const signedIn = as(t, "clerk_new_2", {
      email: "dup@example.test",
      name: "Dup",
    });

    const first = await signedIn.mutation(api.users.syncFromClerk, {});
    const second = await signedIn.mutation(api.users.syncFromClerk, {});
    expect(second.userId).toBe(first.userId);

    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
  });

  test("a token with no email cannot key a profile", async () => {
    const t = newTest();
    const result = await as(t, "clerk_no_email").mutation(
      api.users.syncFromClerk,
      {},
    );
    expect(result.status).toBe("incomplete");
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(0);
  });

  test("a signed-out caller cannot sync a profile into existence", async () => {
    const t = newTest();
    const result = await t.mutation(api.users.syncFromClerk, {});
    expect(result.status).toBe("incomplete");
  });

  test("the webhook and the self-heal converge on one row", async () => {
    const t = newTest();
    const signedIn = as(t, "clerk_race", {
      email: "race@example.test",
      name: "Race Condition",
    });

    // The customer's browser self-heals first; the webhook lands afterwards.
    await signedIn.mutation(api.users.syncFromClerk, {});
    await t.mutation(internal.users.upsertFromClerk, {
      clerkId: "clerk_race",
      email: "race@example.test",
      fullName: "Race Condition",
      emailVerified: true,
    });

    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(1);
  });
});

describe("onboarding — Clerk is identity only, never authorisation", () => {
  test("a user.updated event cannot downgrade a role set in the CRM", async () => {
    const t = newTest();
    const manager = await makeUser(t, {
      role: "manager",
      clerkId: "clerk_mgr",
      email: "mgr@example.test",
    });

    await t.mutation(internal.users.upsertFromClerk, {
      clerkId: manager.clerkId,
      email: manager.email,
      fullName: "Renamed By Clerk",
      emailVerified: true,
    });

    const row = await t.run((ctx) => ctx.db.get(manager.id));
    expect(row?.role).toBe("manager");
    expect(row?.fullName).toBe("Renamed By Clerk");
  });

  test("a suspension survives a Clerk profile update", async () => {
    const t = newTest();
    const customer = await makeUser(t, {
      role: "customer",
      clerkId: "clerk_susp",
      email: "susp@example.test",
      status: "suspended",
    });

    await t.mutation(internal.users.upsertFromClerk, {
      clerkId: customer.clerkId,
      email: customer.email,
      fullName: "Still Suspended",
      emailVerified: true,
    });

    const row = await t.run((ctx) => ctx.db.get(customer.id));
    expect(row?.status).toBe("suspended");
  });

  test("a suspended customer is blocked from every protected path", async () => {
    const t = newTest();
    const customer = await makeUser(t, { status: "suspended" });
    const signedIn = as(t, customer.clerkId);

    expect(await codeOf(() => signedIn.query(api.applications.listMyDrafts, {}))).toBe(
      "SUSPENDED",
    );
    expect(
      await codeOf(() => signedIn.mutation(api.users.updateProfile, { phone: "9" })),
    ).toBe("SUSPENDED");
  });

  test("a deleted account can no longer act, and is invisible to itself", async () => {
    const t = newTest();
    const customer = await makeUser(t, { clerkId: "clerk_del", email: "del@example.test" });

    await t.mutation(internal.users.deleteFromClerk, { clerkId: customer.clerkId });

    const signedIn = as(t, customer.clerkId);
    expect(await signedIn.query(api.users.current, {})).toBeNull();
    expect(await codeOf(() => signedIn.query(api.applications.listMyDrafts, {}))).toBe(
      "FORBIDDEN",
    );
    // Soft delete: the row is kept so applications and payments still resolve.
    expect(await t.run((ctx) => ctx.db.get(customer.id))).not.toBeNull();
  });

  test("deleting a colleague's Clerk account parks their staff profile", async () => {
    const t = newTest();
    const agent = await makeUser(t, {
      role: "visa_agent",
      clerkId: "clerk_agent_del",
      email: "agent.del@example.test",
    });

    await t.mutation(internal.users.deleteFromClerk, { clerkId: agent.clerkId });

    const profile = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", agent.id))
        .unique(),
    );
    expect(profile?.isActive).toBe(false);
  });

  test("a repeated user.deleted webhook is a no-op, not a second audit row", async () => {
    const t = newTest();
    const customer = await makeUser(t, { clerkId: "clerk_del2", email: "del2@example.test" });

    await t.mutation(internal.users.deleteFromClerk, { clerkId: customer.clerkId });
    await t.mutation(internal.users.deleteFromClerk, { clerkId: customer.clerkId });

    const audits = await t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(audits.filter((a) => a.action === "user.deleted_from_clerk")).toHaveLength(1);
  });
});

describe("onboarding — invited colleagues", () => {
  test("an invited colleague keeps the granted role at first sign-in", async () => {
    const t = newTest();
    const superAdmin = await makeUser(t, { role: "super_admin" });

    await as(t, superAdmin.clerkId).mutation(api.users.inviteStaff, {
      email: "Invited.Agent@Example.test",
      fullName: "Invited Agent",
      role: "visa_agent",
    });

    const signedIn = as(t, "clerk_invited", {
      email: "invited.agent@example.test",
      name: "Invited Agent",
      emailVerified: true,
    });
    await signedIn.mutation(api.users.syncFromClerk, {});

    const me = await signedIn.query(api.users.current, {});
    expect(me?.role).toBe("visa_agent");
    expect(me?.isStaff).toBe(true);
    // The placeholder row was linked, not duplicated.
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(2);
  });

  test("an UNVERIFIED email must not inherit an invited colleague's role", async () => {
    const t = newTest();
    const superAdmin = await makeUser(t, { role: "super_admin" });

    await as(t, superAdmin.clerkId).mutation(api.users.inviteStaff, {
      email: "ops@visadrive.in",
      fullName: "Operations Lead",
      role: "manager",
    });

    // The attacker signs up claiming the colleague's address but has not
    // proven control of the inbox. Linking on an unverified address would
    // hand them the manager role.
    const attacker = as(t, "clerk_attacker", {
      email: "ops@visadrive.in",
      name: "Not The Ops Lead",
      emailVerified: false,
    });
    await attacker.mutation(api.users.syncFromClerk, {});

    const me = await attacker.query(api.users.current, {});
    expect(me?.role).not.toBe("manager");
  });

  test("an unverified sign-up on a fresh address is still a normal customer", async () => {
    const t = newTest();
    const signedIn = as(t, "clerk_unverified_new", {
      email: "nobody.else@example.test",
      name: "Nobody Else",
      emailVerified: false,
    });

    // The verification guard only bites when the address already belongs to
    // another row. An address nobody has used is safe to key a new row on,
    // or email/password sign-up would never get a profile.
    const result = await signedIn.mutation(api.users.syncFromClerk, {});
    expect(result.status).toBe("ready");
    expect((await signedIn.query(api.users.current, {}))?.role).toBe("customer");
  });

  test("an unverified claim cannot take over an existing customer's account", async () => {
    const t = newTest();
    const victim = await makeUser(t, {
      role: "customer",
      clerkId: "clerk_victim",
      email: "victim@example.test",
    });

    const attacker = as(t, "clerk_thief", {
      email: "victim@example.test",
      name: "Thief",
      emailVerified: false,
    });
    const result = await attacker.mutation(api.users.syncFromClerk, {});

    expect(result.status).toBe("incomplete");
    expect(await attacker.query(api.users.current, {})).toBeNull();
    // The victim's row still points at the victim's Clerk account.
    expect((await t.run((ctx) => ctx.db.get(victim.id)))?.clerkId).toBe("clerk_victim");
  });

  test("the webhook can still link an invitation when the JWT lacks the claim", async () => {
    const t = newTest();
    const superAdmin = await makeUser(t, { role: "super_admin" });
    await as(t, superAdmin.clerkId).mutation(api.users.inviteStaff, {
      email: "webhook.ops@visadrive.in",
      fullName: "Webhook Ops",
      role: "manager",
    });

    // Clerk's own `verification.status` drives this flag on the webhook path,
    // so a deployment whose JWT template omits `email_verified` still gets
    // its colleagues linked.
    const userId = await t.mutation(internal.users.upsertFromClerk, {
      clerkId: "clerk_webhook_ops",
      email: "webhook.ops@visadrive.in",
      fullName: "Webhook Ops",
      emailVerified: true,
    });
    expect(userId).not.toBeNull();

    expect(
      (await as(t, "clerk_webhook_ops").query(api.users.current, {}))?.role,
    ).toBe("manager");
  });

  test("a verified email may claim the invited placeholder", async () => {
    const t = newTest();
    const superAdmin = await makeUser(t, { role: "super_admin" });

    await as(t, superAdmin.clerkId).mutation(api.users.inviteStaff, {
      email: "verified.ops@visadrive.in",
      fullName: "Verified Ops",
      role: "manager",
    });

    const colleague = as(t, "clerk_verified_ops", {
      email: "verified.ops@visadrive.in",
      name: "Verified Ops",
      emailVerified: true,
    });
    await colleague.mutation(api.users.syncFromClerk, {});

    expect((await colleague.query(api.users.current, {}))?.role).toBe("manager");
  });

  test("the bootstrap super admin comes from a deployment env var, not the client", async () => {
    const t = newTest();
    process.env.SEED_SUPER_ADMIN_EMAIL = "founder@visadrive.in";
    try {
      const founder = as(t, "clerk_founder", {
        email: "founder@visadrive.in",
        name: "Founder",
        emailVerified: true,
      });
      await founder.mutation(api.users.syncFromClerk, {});
      expect((await founder.query(api.users.current, {}))?.role).toBe("super_admin");

      const impostor = as(t, "clerk_impostor", {
        email: "founder@visadrive.in.attacker.test",
        name: "Impostor",
        emailVerified: true,
      });
      await impostor.mutation(api.users.syncFromClerk, {});
      expect((await impostor.query(api.users.current, {}))?.role).toBe("customer");
    } finally {
      delete process.env.SEED_SUPER_ADMIN_EMAIL;
    }
  });
});

describe("onboarding — the customer's own profile", () => {
  test("a customer may edit their name and preferences", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const signedIn = as(t, customer.clerkId);

    await signedIn.mutation(api.users.updateProfile, {
      fullName: "Updated Name",
      phone: " +91 98200 00000 ",
      whatsappOptIn: true,
    });

    const row = await t.run((ctx) => ctx.db.get(customer.id));
    expect(row?.fullName).toBe("Updated Name");
    expect(row?.phone).toBe("+91 98200 00000");
    expect(row?.whatsappOptIn).toBe(true);
  });

  test("updateProfile cannot reach role or status", async () => {
    const t = newTest();
    const customer = await makeUser(t);

    await expect(
      as(t, customer.clerkId).mutation(api.users.updateProfile, {
        // @ts-expect-error — the argument validator must reject this outright.
        role: "super_admin",
        status: "active",
      }),
    ).rejects.toThrow();

    expect((await t.run((ctx) => ctx.db.get(customer.id)))?.role).toBe("customer");
  });

  test("a blank name is refused", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    expect(
      await codeOf(() =>
        as(t, customer.clerkId).mutation(api.users.updateProfile, { fullName: " " }),
      ),
    ).toBe("VALIDATION");
  });
});
