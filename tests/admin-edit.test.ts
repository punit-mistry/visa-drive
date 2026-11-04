/**
 * Staff correcting a booking from the CRM.
 *
 * Three edit paths, three different grants:
 *   • `users.updateCustomer`          — `customer:edit`
 *   • `applications.updateTripDetails` — `application:update_status`
 *   • `applicants.upsert` (as staff)   — `application:update_status`
 *
 * The last one is the sharp edge: a support agent can see every application
 * in the CRM, and passport numbers live on the traveller rows. Reading is not
 * editing.
 */
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import {
  as,
  codeOf,
  makeApplication,
  makeCatalogue,
  makeUser,
  newTest,
} from "./harness";

describe("editing a customer's contact details", () => {
  test("a manager can fix a name and phone, and the bookings follow", async () => {
    const t = newTest();
    const customer = await makeUser(t, { role: "customer", fullName: "Asha Mehtaa" });
    const manager = await makeUser(t, { role: "manager" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner: customer, catalogue: cat });

    await as(t, manager.clerkId).mutation(api.users.updateCustomer, {
      userId: customer.id,
      fullName: "Asha Mehta",
      phone: " +91 98200 11111 ",
    });

    const row = await t.run((ctx) => ctx.db.get(customer.id));
    expect(row?.fullName).toBe("Asha Mehta");
    expect(row?.phone).toBe("+91 98200 11111");

    // The CRM table reads the snapshot, so the correction has to reach it.
    const application = await t.run((ctx) => ctx.db.get(applicationId));
    expect(application?.customerName).toBe("Asha Mehta");
    expect(application?.customerPhone).toBe("+91 98200 11111");
  });

  test("a visa agent cannot edit a customer", async () => {
    const t = newTest();
    const customer = await makeUser(t, { fullName: "Original Name" });
    const agent = await makeUser(t, { role: "visa_agent" });

    expect(
      await codeOf(() =>
        as(t, agent.clerkId).mutation(api.users.updateCustomer, {
          userId: customer.id,
          fullName: "Changed By Agent",
        }),
      ),
    ).toBe("FORBIDDEN");

    expect((await t.run((ctx) => ctx.db.get(customer.id)))?.fullName).toBe(
      "Original Name",
    );
  });

  test("a customer cannot edit another customer", async () => {
    const t = newTest();
    const victim = await makeUser(t, { fullName: "Victim" });
    const attacker = await makeUser(t);

    expect(
      await codeOf(() =>
        as(t, attacker.clerkId).mutation(api.users.updateCustomer, {
          userId: victim.id,
          fullName: "Owned",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("it cannot reach email, role or status", async () => {
    const t = newTest();
    const customer = await makeUser(t, { email: "real@example.test" });
    const manager = await makeUser(t, { role: "manager" });

    await expect(
      as(t, manager.clerkId).mutation(api.users.updateCustomer, {
        userId: customer.id,
        // @ts-expect-error — the validator must reject every one of these.
        email: "attacker@example.test",
        role: "super_admin",
        status: "active",
      }),
    ).rejects.toThrow();

    const row = await t.run((ctx) => ctx.db.get(customer.id));
    expect(row?.email).toBe("real@example.test");
    expect(row?.role).toBe("customer");
  });

  test("it refuses a colleague — staff are managed from the staff screens", async () => {
    const t = newTest();
    const manager = await makeUser(t, { role: "manager" });
    const agent = await makeUser(t, { role: "visa_agent", fullName: "Agent Name" });

    expect(
      await codeOf(() =>
        as(t, manager.clerkId).mutation(api.users.updateCustomer, {
          userId: agent.id,
          fullName: "Renamed Colleague",
        }),
      ),
    ).toBe("VALIDATION");
  });

  test("a blank name is refused and the edit is audited", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const admin = await makeUser(t, { role: "admin" });
    const signedIn = as(t, admin.clerkId);

    expect(
      await codeOf(() =>
        signedIn.mutation(api.users.updateCustomer, {
          userId: customer.id,
          fullName: " ",
        }),
      ),
    ).toBe("VALIDATION");

    await signedIn.mutation(api.users.updateCustomer, {
      userId: customer.id,
      phone: "+919820000000",
    });

    const audits = await t.run((ctx) => ctx.db.query("auditLogs").collect());
    const entry = audits.find((a) => a.action === "customer.updated");
    expect(entry?.actorUserId).toBe(admin.id);
  });
});

describe("editing the trip details on a submitted booking", () => {
  test("a visa agent can correct the dates after submission", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const agent = await makeUser(t, { role: "visa_agent" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "under_review",
    });

    const arrival = Date.UTC(2026, 2, 10);
    const departure = Date.UTC(2026, 2, 24);

    await as(t, agent.clerkId).mutation(api.applications.updateTripDetails, {
      applicationId,
      patch: {
        intendedArrivalDate: arrival,
        intendedDepartureDate: departure,
        travelPurpose: "Business meetings",
        customerPhone: "+919820000001",
      },
      note: "Customer rang to move the trip",
    });

    const row = await t.run((ctx) => ctx.db.get(applicationId));
    expect(row?.intendedArrivalDate).toBe(arrival);
    expect(row?.intendedDepartureDate).toBe(departure);
    expect(row?.travelPurpose).toBe("Business meetings");

    const audits = await t.run((ctx) => ctx.db.query("auditLogs").collect());
    const entry = audits.find((a) => a.action === "application.trip_details_updated");
    expect(entry?.summary).toContain("Customer rang to move the trip");
  });

  test("a return date before the arrival date is refused", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const manager = await makeUser(t, { role: "manager" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "under_review",
    });

    expect(
      await codeOf(() =>
        as(t, manager.clerkId).mutation(api.applications.updateTripDetails, {
          applicationId,
          patch: {
            intendedArrivalDate: Date.UTC(2026, 5, 20),
            intendedDepartureDate: Date.UTC(2026, 5, 1),
          },
        }),
      ),
    ).toBe("VALIDATION");
  });

  test("a date can be cleared with null", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const manager = await makeUser(t, { role: "manager" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "under_review",
    });
    const signedIn = as(t, manager.clerkId);

    await signedIn.mutation(api.applications.updateTripDetails, {
      applicationId,
      patch: { intendedArrivalDate: Date.UTC(2026, 1, 1) },
    });
    await signedIn.mutation(api.applications.updateTripDetails, {
      applicationId,
      patch: { intendedArrivalDate: null },
    });

    expect(
      (await t.run((ctx) => ctx.db.get(applicationId)))?.intendedArrivalDate,
    ).toBeUndefined();
  });

  test("a support agent cannot rewrite a booking they can read", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const support = await makeUser(t, { role: "support_agent" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "under_review",
    });

    expect(
      await codeOf(() =>
        as(t, support.clerkId).mutation(api.applications.updateTripDetails, {
          applicationId,
          patch: { travelPurpose: "Rewritten" },
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("the customer cannot drive it on their own booking", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "under_review",
    });

    expect(
      await codeOf(() =>
        as(t, customer.clerkId).mutation(api.applications.updateTripDetails, {
          applicationId,
          patch: { travelPurpose: "Self-serve after lock" },
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("it cannot reach status, pricing or the traveller count", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const manager = await makeUser(t, { role: "manager" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "under_review",
    });
    const signedIn = as(t, manager.clerkId);

    for (const patch of [
      { status: "approved" },
      { paymentStatus: "paid" },
      { travellerCount: 9 },
      { userId: manager.id },
    ]) {
      await expect(
        signedIn.mutation(api.applications.updateTripDetails, {
          applicationId,
          // @ts-expect-error — each of these must be rejected by the validator.
          patch,
        }),
      ).rejects.toThrow();
    }

    const row = await t.run((ctx) => ctx.db.get(applicationId));
    expect(row?.status).toBe("under_review");
    expect(row?.userId).toBe(customer.id);
  });
});

describe("editing travellers from the CRM", () => {
  test("a visa agent can correct a passport number on a locked booking", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const agent = await makeUser(t, { role: "visa_agent" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "visa_processing",
    });

    const { applicantId } = await as(t, agent.clerkId).mutation(api.applicants.upsert, {
      applicationId,
      data: { firstName: "Asha", lastName: "Mehta", passportNumber: "Z1234567" },
    });

    const applicant = await t.run((ctx) => ctx.db.get(applicantId));
    expect(applicant?.passportNumber).toBe("Z1234567");
    expect(applicant?.userId).toBe(customer.id);
  });

  test("a support agent can read the booking but not rewrite its travellers", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const support = await makeUser(t, { role: "support_agent" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "under_review",
    });

    // Reading is theirs...
    expect(
      await codeOf(() =>
        as(t, support.clerkId).query(api.applicants.listByApplication, {
          applicationId,
        }),
      ),
    ).toBeNull();

    // ...rewriting a passport number is not.
    expect(
      await codeOf(() =>
        as(t, support.clerkId).mutation(api.applicants.upsert, {
          applicationId,
          data: { firstName: "Edited", lastName: "BySupport" },
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a support agent cannot delete a traveller either", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const support = await makeUser(t, { role: "support_agent" });
    const manager = await makeUser(t, { role: "manager" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "under_review",
    });

    const first = await as(t, manager.clerkId).mutation(api.applicants.upsert, {
      applicationId,
      data: { firstName: "One", lastName: "Traveller" },
    });
    await as(t, manager.clerkId).mutation(api.applicants.upsert, {
      applicationId,
      data: { firstName: "Two", lastName: "Traveller" },
    });

    expect(
      await codeOf(() =>
        as(t, support.clerkId).mutation(api.applicants.remove, {
          applicationId,
          applicantId: first.applicantId,
        }),
      ),
    ).toBe("FORBIDDEN");

    expect(await t.run((ctx) => ctx.db.get(first.applicantId))).not.toBeNull();
  });

  test("a support agent can still fill in their own draft", async () => {
    const t = newTest();
    const support = await makeUser(t, { role: "support_agent" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: support,
      catalogue: cat,
      status: "draft",
    });

    expect(
      await codeOf(() =>
        as(t, support.clerkId).mutation(api.applicants.upsert, {
          applicationId,
          data: { firstName: "Own", lastName: "Booking" },
        }),
      ),
    ).toBeNull();
  });
});
