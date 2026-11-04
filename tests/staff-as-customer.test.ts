/**
 * A colleague who is also a customer.
 *
 * VisaDrive is a small office: the people who run the CRM book their own
 * visas through the same portal. That makes "owns this row" and "has a staff
 * grant" two independent facts, and the whole file exists because collapsing
 * them locked staff out of any application they happened to own — the CRM
 * detail page answered FORBIDDEN on their own booking.
 */
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import {
  as,
  codeOf,
  makeApplication,
  makeCatalogue,
  makeUser,
  newTest,
} from "./harness";

describe("a staff member who owns the application", () => {
  test("can open it in the CRM", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: boss,
      catalogue: cat,
      status: "submitted",
    });

    const detail = await as(t, boss.clerkId).query(api.applications.getForAdmin, {
      applicationId,
    });
    expect(detail.application._id).toBe(applicationId);
  });

  test.each(["visa_agent", "manager", "admin", "super_admin"] as const)(
    "%s sees their own booking in the CRM detail view",
    async (role) => {
      const t = newTest();
      const staff = await makeUser(t, { role });
      const cat = await makeCatalogue(t);
      const applicationId = await makeApplication(t, {
        owner: staff,
        catalogue: cat,
        status: "submitted",
      });

      expect(
        await codeOf(() =>
          as(t, staff.clerkId).query(api.applications.getForAdmin, { applicationId }),
        ),
      ).toBeNull();
    },
  );

  test("a support agent sees it too — view_all is what the CRM needs", async () => {
    const t = newTest();
    const support = await makeUser(t, { role: "support_agent" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: support,
      catalogue: cat,
    });

    expect(
      await codeOf(() =>
        as(t, support.clerkId).query(api.applications.getForAdmin, { applicationId }),
      ),
    ).toBeNull();
  });

  test("can still see it as a customer in their own portal", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner: boss, catalogue: cat });

    const mine = await as(t, boss.clerkId).query(api.applications.getMine, {
      applicationId,
    });
    expect(mine?.application._id).toBe(applicationId);

    const page = await as(t, boss.clerkId).query(api.applications.listMine, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page.map((a) => a._id)).toContain(applicationId);
  });

  test("can pay for their own booking — the staff-checkout block is about other people", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const cat = await makeCatalogue(t, { paymentMode: "pay_now" });
    const applicationId = await makeApplication(t, {
      owner: boss,
      catalogue: cat,
      status: "submitted",
      paymentStatus: "unpaid",
    });

    const order = await as(t, boss.clerkId).mutation(
      internal.payments.prepareOrderInternal,
      { applicationId },
    );
    expect(order.amount).toBeGreaterThan(0);
  });

  test("still cannot start a checkout on somebody else's booking", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const boss = await makeUser(t, { role: "super_admin" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "submitted",
    });

    expect(
      await codeOf(() =>
        as(t, boss.clerkId).mutation(internal.payments.prepareOrderInternal, {
          applicationId,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a document they upload on their own booking is not marked staff-uploaded", async () => {
    const t = newTest();
    const boss = await makeUser(t, { role: "super_admin" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: boss,
      catalogue: cat,
      status: "draft",
    });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["scan"])));

    const documentId = await as(t, boss.clerkId).mutation(api.documents.attach, {
      applicationId,
      storageId,
      documentKey: "passport_front",
      fileName: "passport.pdf",
      mimeType: "application/pdf",
      size: 4,
    });

    expect((await t.run((ctx) => ctx.db.get(documentId)))?.uploadedByStaffId).toBeUndefined();
  });

  test("a document they upload on a customer's booking is marked staff-uploaded", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const agent = await makeUser(t, { role: "visa_agent" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "under_review",
    });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["scan"])));

    const documentId = await as(t, agent.clerkId).mutation(api.documents.attach, {
      applicationId,
      storageId,
      documentKey: "passport_front",
      fileName: "passport.pdf",
      mimeType: "application/pdf",
      size: 4,
    });

    expect((await t.run((ctx) => ctx.db.get(documentId)))?.uploadedByStaffId).toBe(
      agent.id,
    );
  });
});

describe("owning a row is never a way past a permission", () => {
  test("a support agent cannot change the status of their own booking", async () => {
    const t = newTest();
    const support = await makeUser(t, { role: "support_agent" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: support,
      catalogue: cat,
      status: "submitted",
    });

    // They can read it in the CRM, but `application:update_status` is not
    // theirs and owning the row does not conjure it.
    expect(
      await codeOf(() =>
        as(t, support.clerkId).mutation(api.applications.updateStatus, {
          applicationId,
          status: "approved",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a customer still cannot reach the CRM view of their own application", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner: customer, catalogue: cat });

    expect(
      await codeOf(() =>
        as(t, customer.clerkId).query(api.applications.getForAdmin, { applicationId }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a deactivated colleague loses the CRM view of their own booking", async () => {
    const t = newTest();
    const agent = await makeUser(t, { role: "visa_agent", profileActive: false });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner: agent, catalogue: cat });

    expect(
      await codeOf(() =>
        as(t, agent.clerkId).query(api.applications.getForAdmin, { applicationId }),
      ),
    ).toBe("FORBIDDEN");
    // ...but their own portal still works, because they are still a customer.
    expect(
      await codeOf(() =>
        as(t, agent.clerkId).query(api.applications.getMine, { applicationId }),
      ),
    ).toBeNull();
  });

  test("a visa agent without view_all only reaches applications assigned to them", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const agent = await makeUser(t, {
      role: "visa_agent",
      revokedPermissions: ["application:view_all"],
    });
    const cat = await makeCatalogue(t);

    const assigned = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      assignedAgentId: agent.id,
    });
    const notAssigned = await makeApplication(t, { owner: customer, catalogue: cat });

    expect(
      await codeOf(() =>
        as(t, agent.clerkId).query(api.applications.getForAdmin, {
          applicationId: assigned,
        }),
      ),
    ).toBeNull();
    expect(
      await codeOf(() =>
        as(t, agent.clerkId).query(api.applications.getForAdmin, {
          applicationId: notAssigned,
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});
