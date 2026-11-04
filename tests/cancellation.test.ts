/**
 * Cancelling a booking.
 *
 * Two separate paths exist and they must not blur into each other:
 *   • `applications.cancelMine` — the customer walking away, allowed only
 *     while nothing has been lodged with an embassy yet.
 *   • `applications.updateStatus` — staff cancelling, which still has to obey
 *     the transition table and still has to be permissioned.
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
import type { Doc } from "../convex/_generated/dataModel";

type Status = Doc<"applications">["status"];

const CUSTOMER_MAY_CANCEL: Status[] = [
  "draft",
  "submitted",
  "documents_pending",
  "documents_submitted",
  "additional_documents_requested",
];

const CUSTOMER_MAY_NOT_CANCEL: Status[] = [
  "under_review",
  "ready_for_processing",
  "appointment_scheduled",
  "visa_processing",
  "approved",
  "rejected",
  "completed",
  "cancelled",
  "on_hold",
];

describe("the customer cancelling their own booking", () => {
  test.each(CUSTOMER_MAY_CANCEL)("can cancel from %s", async (status) => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status,
    });

    await as(t, customer.clerkId).mutation(api.applications.cancelMine, {
      applicationId,
      reason: "Changed my plans",
    });

    const row = await t.run((ctx) => ctx.db.get(applicationId));
    expect(row?.status).toBe("cancelled");
    expect(row?.isDraft).toBe(false);
    expect(row?.cancelledAt).toBeTypeOf("number");
  });

  test.each(CUSTOMER_MAY_NOT_CANCEL)("cannot cancel from %s", async (status) => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status,
    });

    expect(
      await codeOf(() =>
        as(t, customer.clerkId).mutation(api.applications.cancelMine, { applicationId }),
      ),
    ).toBe("CANCELLATION_CLOSED");

    expect((await t.run((ctx) => ctx.db.get(applicationId)))?.status).toBe(status);
  });

  test("a cancellation is recorded in the timeline and the audit log", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "submitted",
    });

    await as(t, customer.clerkId).mutation(api.applications.cancelMine, {
      applicationId,
      reason: "Trip postponed",
    });

    const history = await t.run((ctx) =>
      ctx.db
        .query("statusHistory")
        .withIndex("by_applicationId", (q) => q.eq("applicationId", applicationId))
        .collect(),
    );
    const cancelled = history.find((h) => h.toStatus === "cancelled");
    expect(cancelled?.fromStatus).toBe("submitted");
    expect(cancelled?.note).toBe("Trip postponed");
    expect(cancelled?.visibleToCustomer).toBe(true);
    expect(cancelled?.changedBy).toBe(customer.id);

    const audits = await t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(audits.some((a) => a.entityId === applicationId)).toBe(true);
  });

  test("cancelling twice is refused rather than silently re-cancelling", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "submitted",
    });
    const signedIn = as(t, customer.clerkId);

    await signedIn.mutation(api.applications.cancelMine, { applicationId });
    expect(
      await codeOf(() =>
        signedIn.mutation(api.applications.cancelMine, { applicationId }),
      ),
    ).toBe("CANCELLATION_CLOSED");

    const history = await t.run((ctx) =>
      ctx.db
        .query("statusHistory")
        .withIndex("by_applicationId", (q) => q.eq("applicationId", applicationId))
        .collect(),
    );
    expect(history.filter((h) => h.toStatus === "cancelled")).toHaveLength(1);
  });

  test("a stranger cannot cancel someone else's booking", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const stranger = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner,
      catalogue: cat,
      status: "submitted",
    });

    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).mutation(api.applications.cancelMine, { applicationId }),
      ),
    ).toBe("FORBIDDEN");

    expect((await t.run((ctx) => ctx.db.get(applicationId)))?.status).toBe("submitted");
  });

  test("staff cannot cancel through the customer's own endpoint", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const admin = await makeUser(t, { role: "admin" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "submitted",
    });

    // Staff cancellations go through `updateStatus`, which is audited as a
    // staff action; `cancelMine` is strictly owner-only.
    expect(
      await codeOf(() =>
        as(t, admin.clerkId).mutation(api.applications.cancelMine, { applicationId }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a signed-out caller cannot cancel anything", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "submitted",
    });

    expect(
      await codeOf(() => t.mutation(api.applications.cancelMine, { applicationId })),
    ).toBe("UNAUTHENTICATED");
  });

  test("a suspended customer cannot cancel", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "submitted",
    });
    await t.run((ctx) => ctx.db.patch(customer.id, { status: "suspended" }));

    expect(
      await codeOf(() =>
        as(t, customer.clerkId).mutation(api.applications.cancelMine, { applicationId }),
      ),
    ).toBe("SUSPENDED");
  });
});

describe("staff cancelling and rescheduling", () => {
  test("a manager can cancel an application the customer no longer can", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const manager = await makeUser(t, { role: "manager" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "visa_processing",
    });

    await as(t, manager.clerkId).mutation(api.applications.updateStatus, {
      applicationId,
      status: "cancelled",
      note: "Embassy withdrew the slot",
    });

    expect((await t.run((ctx) => ctx.db.get(applicationId)))?.status).toBe("cancelled");
  });

  test("an illegal transition is refused even for staff", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const manager = await makeUser(t, { role: "manager" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "completed",
    });

    expect(
      await codeOf(() =>
        as(t, manager.clerkId).mutation(api.applications.updateStatus, {
          applicationId,
          status: "cancelled",
        }),
      ),
    ).toBe("INVALID_TRANSITION");
  });

  test("a cancelled application cannot be revived by a status change", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const manager = await makeUser(t, { role: "manager" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "cancelled",
    });

    expect(
      await codeOf(() =>
        as(t, manager.clerkId).mutation(api.applications.updateStatus, {
          applicationId,
          status: "under_review",
        }),
      ),
    ).toBe("INVALID_TRANSITION");
  });

  test("rescheduling an appointment slot is a normal, audited status move", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const manager = await makeUser(t, { role: "manager" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "ready_for_processing",
    });
    const signedIn = as(t, manager.clerkId);

    await signedIn.mutation(api.applications.updateStatus, {
      applicationId,
      status: "appointment_scheduled",
      note: "Slot booked for 12 Jan",
    });
    // Put it back on hold and reschedule — both legal moves.
    await signedIn.mutation(api.applications.updateStatus, {
      applicationId,
      status: "on_hold",
      note: "Customer asked to move the date",
    });
    await signedIn.mutation(api.applications.updateStatus, {
      applicationId,
      status: "appointment_scheduled",
      note: "Rebooked for 20 Jan",
    });

    const row = await t.run((ctx) => ctx.db.get(applicationId));
    expect(row?.status).toBe("appointment_scheduled");

    const history = await t.run((ctx) =>
      ctx.db
        .query("statusHistory")
        .withIndex("by_applicationId", (q) => q.eq("applicationId", applicationId))
        .collect(),
    );
    expect(history).toHaveLength(3);
    expect(history.every((h) => h.changedBy === manager.id)).toBe(true);
  });

  test("a customer cannot drive updateStatus on their own application", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "submitted",
    });

    expect(
      await codeOf(() =>
        as(t, customer.clerkId).mutation(api.applications.updateStatus, {
          applicationId,
          status: "approved",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a support agent cannot change an application's status", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const support = await makeUser(t, { role: "support_agent" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "submitted",
    });

    expect(
      await codeOf(() =>
        as(t, support.clerkId).mutation(api.applications.updateStatus, {
          applicationId,
          status: "cancelled",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a bulk cancel skips what it may not move instead of forcing it", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const manager = await makeUser(t, { role: "manager" });
    const cat = await makeCatalogue(t);

    const movable = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "submitted",
    });
    const finished = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "completed",
    });

    const result = await as(t, manager.clerkId).mutation(
      api.applications.bulkUpdateStatus,
      { applicationIds: [movable, finished], status: "cancelled" },
    );

    expect(result.updated).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(finished)))?.status).toBe("completed");
  });

  test("bulk update refuses an oversized selection", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const manager = await makeUser(t, { role: "manager" });
    const cat = await makeCatalogue(t);
    const one = await makeApplication(t, { owner: customer, catalogue: cat });

    expect(
      await codeOf(() =>
        as(t, manager.clerkId).mutation(api.applications.bulkUpdateStatus, {
          applicationIds: [],
          status: "cancelled",
        }),
      ),
    ).toBe("INVALID_SELECTION");

    expect(
      await codeOf(() =>
        as(t, manager.clerkId).mutation(api.applications.bulkUpdateStatus, {
          applicationIds: Array.from({ length: 201 }, () => one),
          status: "cancelled",
        }),
      ),
    ).toBe("INVALID_SELECTION");
  });
});
