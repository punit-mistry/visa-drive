/**
 * The booking wizard: creating a draft, editing it, and submitting it.
 *
 * "Editing an appointment" in this product means editing the draft booking —
 * travel dates, traveller count, traveller details — before it is submitted,
 * and asking staff afterwards. So these tests push on three things: ownership
 * (only the customer who owns a draft may touch it), the allow-list (no client
 * can reach `status`, `pricing`, `paymentStatus` or `userId` through the
 * autosave), and the lock (an application in processing stops accepting
 * customer edits).
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

describe("starting a booking", () => {
  test("a draft is created with a server-computed price", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t, {
      governmentFee: 500_000,
      serviceFee: 250_000,
      taxPercent: 18,
    });

    const { applicationId, reused } = await as(t, customer.clerkId).mutation(
      api.applications.createDraft,
      { visaProductId: cat.productId },
    );
    expect(reused).toBe(false);

    const row = await t.run((ctx) => ctx.db.get(applicationId));
    expect(row?.status).toBe("draft");
    expect(row?.isDraft).toBe(true);
    expect(row?.userId).toBe(customer.id);
    // 500000 + 250000 = 750000, +18% = 885000 paise. Integers throughout.
    expect(row?.pricing.subtotal).toBe(750_000);
    expect(row?.pricing.total).toBe(885_000);
    expect(Number.isInteger(row!.pricing.total)).toBe(true);
  });

  test("clicking Apply five times yields one draft, not five", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const signedIn = as(t, customer.clerkId);

    const first = await signedIn.mutation(api.applications.createDraft, {
      visaProductId: cat.productId,
    });
    for (let i = 0; i < 4; i += 1) {
      const again = await signedIn.mutation(api.applications.createDraft, {
        visaProductId: cat.productId,
      });
      expect(again.applicationId).toBe(first.applicationId);
      expect(again.reused).toBe(true);
    }

    const drafts = await signedIn.query(api.applications.listMyDrafts, {});
    expect(drafts).toHaveLength(1);
  });

  test("an unpublished product cannot be booked", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t, { published: false });

    expect(
      await codeOf(() =>
        as(t, customer.clerkId).mutation(api.applications.createDraft, {
          visaProductId: cat.productId,
        }),
      ),
    ).toBe("PRODUCT_UNAVAILABLE");
  });

  test("a signed-out visitor cannot start a booking", async () => {
    const t = newTest();
    const cat = await makeCatalogue(t);
    expect(
      await codeOf(() =>
        t.mutation(api.applications.createDraft, { visaProductId: cat.productId }),
      ),
    ).toBe("UNAUTHENTICATED");
  });

  test("traveller count is clamped server-side", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const signedIn = as(t, customer.clerkId);

    const huge = await signedIn.mutation(api.applications.createDraft, {
      visaProductId: cat.productId,
      travellerCount: 9999,
    });
    expect((await t.run((ctx) => ctx.db.get(huge.applicationId)))?.travellerCount).toBe(20);

    const other = await makeCatalogue(t);
    const negative = await signedIn.mutation(api.applications.createDraft, {
      visaProductId: other.productId,
      travellerCount: -5,
    });
    expect(
      (await t.run((ctx) => ctx.db.get(negative.applicationId)))?.travellerCount,
    ).toBe(1);
  });
});

describe("editing a draft", () => {
  test("the owner can autosave travel details", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "draft",
    });

    const arrival = Date.UTC(2026, 11, 1);
    const departure = Date.UTC(2026, 11, 14);
    await as(t, customer.clerkId).mutation(api.applications.saveDraftStep, {
      applicationId,
      step: 3,
      patch: {
        departureCountry: "IN",
        travelPurpose: "Holiday",
        intendedArrivalDate: arrival,
        intendedDepartureDate: departure,
        termsAccepted: true,
      },
    });

    const row = await t.run((ctx) => ctx.db.get(applicationId));
    expect(row?.intendedArrivalDate).toBe(arrival);
    expect(row?.intendedDepartureDate).toBe(departure);
    expect(row?.currentStep).toBe(3);
    expect(row?.termsAcceptedAt).toBeTypeOf("number");
  });

  test("another customer cannot edit someone else's draft", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const stranger = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner,
      catalogue: cat,
      status: "draft",
    });

    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).mutation(api.applications.saveDraftStep, {
          applicationId,
          patch: { travelPurpose: "Hijacked" },
        }),
      ),
    ).toBe("FORBIDDEN");

    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).query(api.applications.getDraft, { applicationId }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("even an admin cannot type into a customer's half-finished wizard", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const admin = await makeUser(t, { role: "admin" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner,
      catalogue: cat,
      status: "draft",
    });

    expect(
      await codeOf(() =>
        as(t, admin.clerkId).mutation(api.applications.saveDraftStep, {
          applicationId,
          patch: { travelPurpose: "Edited by staff" },
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("the autosave patch cannot reach status, pricing, paymentStatus or userId", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const attacker = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "draft",
    });
    const signedIn = as(t, customer.clerkId);

    for (const patch of [
      { status: "approved" },
      { paymentStatus: "paid" },
      { isDraft: false },
      { userId: attacker.id },
      { pricing: { currency: "INR", governmentFee: 0, serviceFee: 0, additionalCharges: 0, taxPercent: 0, taxAmount: 0, discountAmount: 0, travellerCount: 1, subtotal: 0, total: 0 } },
      { referenceId: "VD-FAKE-0001" },
    ]) {
      await expect(
        signedIn.mutation(api.applications.saveDraftStep, {
          applicationId,
          // @ts-expect-error — each of these must be rejected by the validator.
          patch,
        }),
      ).rejects.toThrow();
    }

    const row = await t.run((ctx) => ctx.db.get(applicationId));
    expect(row?.status).toBe("draft");
    expect(row?.paymentStatus).toBe("unpaid");
    expect(row?.userId).toBe(customer.id);
    expect(row?.pricing.total).toBeGreaterThan(0);
  });

  test("changing the traveller count re-prices from the catalogue, not the client", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t, {
      governmentFee: 500_000,
      serviceFee: 250_000,
      taxPercent: 18,
    });
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "draft",
    });

    await as(t, customer.clerkId).mutation(api.applications.saveDraftStep, {
      applicationId,
      patch: { travellerCount: 3 },
    });

    const row = await t.run((ctx) => ctx.db.get(applicationId));
    expect(row?.travellerCount).toBe(3);
    expect(row?.pricing.subtotal).toBe(2_250_000);
    expect(row?.pricing.total).toBe(2_655_000);
  });

  test("a catalogue price cut while the draft is open is picked up, not frozen early", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t, { governmentFee: 500_000, serviceFee: 250_000 });
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "draft",
    });

    await t.run((ctx) => ctx.db.patch(cat.productId, { serviceFee: 100_000 }));
    await as(t, customer.clerkId).mutation(api.applications.saveDraftStep, {
      applicationId,
      patch: { travellerCount: 2 },
    });

    const row = await t.run((ctx) => ctx.db.get(applicationId));
    expect(row?.pricing.subtotal).toBe(1_200_000);
  });

  test("a submitted application is no longer autosaveable", async () => {
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
        as(t, customer.clerkId).mutation(api.applications.saveDraftStep, {
          applicationId,
          patch: { travelPurpose: "Too late" },
        }),
      ),
    ).toBe("NOT_A_DRAFT");
  });
});

describe("editing travellers on a booking", () => {
  test("a traveller added by the owner is stamped with the application's owner", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "draft",
    });

    const { applicantId } = await as(t, customer.clerkId).mutation(
      api.applicants.upsert,
      {
        applicationId,
        data: { firstName: "Asha", lastName: "Mehta", isPrimary: true },
      },
    );

    const applicant = await t.run((ctx) => ctx.db.get(applicantId));
    expect(applicant?.userId).toBe(customer.id);
    expect(applicant?.isPrimary).toBe(true);
  });

  test("a stranger cannot add or read travellers on someone else's booking", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const stranger = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner, catalogue: cat });

    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).mutation(api.applicants.upsert, {
          applicationId,
          data: { firstName: "Mal", lastName: "Icious" },
        }),
      ),
    ).toBe("FORBIDDEN");

    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).query(api.applicants.listByApplication, {
          applicationId,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a traveller cannot be moved onto another application by id", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const stranger = await makeUser(t);
    const cat = await makeCatalogue(t);

    const ownersApp = await makeApplication(t, { owner, catalogue: cat, status: "draft" });
    const strangersApp = await makeApplication(t, {
      owner: stranger,
      catalogue: cat,
      status: "draft",
    });

    const { applicantId } = await as(t, owner.clerkId).mutation(api.applicants.upsert, {
      applicationId: ownersApp,
      data: { firstName: "Asha", lastName: "Mehta" },
    });

    // The stranger owns `strangersApp`, so the access check passes — the
    // traveller id belonging to a different application must be what stops it.
    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).mutation(api.applicants.upsert, {
          applicationId: strangersApp,
          applicantId,
          data: { firstName: "Stolen", lastName: "Identity" },
        }),
      ),
    ).toBe("NOT_FOUND");

    const applicant = await t.run((ctx) => ctx.db.get(applicantId));
    expect(applicant?.firstName).toBe("Asha");
    expect(applicant?.applicationId).toBe(ownersApp);
  });

  test("a customer cannot edit travellers once the application is in processing", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "visa_processing",
    });

    expect(
      await codeOf(() =>
        as(t, customer.clerkId).mutation(api.applicants.upsert, {
          applicationId,
          data: { firstName: "Late", lastName: "Change" },
        }),
      ),
    ).toBe("APPLICATION_LOCKED");
  });

  test("staff may still correct a traveller on a locked application", async () => {
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
      data: { firstName: "Corrected", lastName: "Spelling" },
    });

    // Ownership is copied from the application, never from the staff caller.
    expect((await t.run((ctx) => ctx.db.get(applicantId)))?.userId).toBe(customer.id);
  });
});

describe("submitting", () => {
  test("an empty draft is refused with a structured list of problems", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      status: "draft",
    });

    expect(
      await codeOf(() =>
        as(t, customer.clerkId).mutation(api.applications.submit, { applicationId }),
      ),
    ).toBe("INCOMPLETE_APPLICATION");

    expect((await t.run((ctx) => ctx.db.get(applicationId)))?.status).toBe("draft");
  });

  test("a complete draft submits, freezes its price and counts once", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t, {
      governmentFee: 500_000,
      serviceFee: 250_000,
      taxPercent: 18,
    });
    const signedIn = as(t, customer.clerkId);

    const { applicationId } = await signedIn.mutation(api.applications.createDraft, {
      visaProductId: cat.productId,
    });
    await signedIn.mutation(api.applicants.upsert, {
      applicationId,
      data: { firstName: "Asha", lastName: "Mehta", isPrimary: true },
    });

    const result = await signedIn.mutation(api.applications.submit, {
      applicationId,
      acceptTerms: true,
    });

    expect(result.status).toBe("submitted");
    expect(result.paymentStatus).toBe("unpaid");
    expect(result.requiresPayment).toBe(true);
    expect(result.total).toBe(885_000);

    const row = await t.run((ctx) => ctx.db.get(applicationId));
    expect(row?.isDraft).toBe(false);
    expect(row?.submittedAt).toBeTypeOf("number");
    expect((await t.run((ctx) => ctx.db.get(customer.id)))?.applicationCount).toBe(1);
  });

  test("a double-clicked submit does not book twice", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const signedIn = as(t, customer.clerkId);

    const { applicationId } = await signedIn.mutation(api.applications.createDraft, {
      visaProductId: cat.productId,
    });
    await signedIn.mutation(api.applicants.upsert, {
      applicationId,
      data: { firstName: "Asha", lastName: "Mehta", isPrimary: true },
    });

    await signedIn.mutation(api.applications.submit, { applicationId, acceptTerms: true });
    await signedIn.mutation(api.applications.submit, { applicationId, acceptTerms: true });

    const history = await t.run((ctx) =>
      ctx.db
        .query("statusHistory")
        .withIndex("by_applicationId", (q) => q.eq("applicationId", applicationId))
        .collect(),
    );
    expect(history.filter((h) => h.toStatus === "submitted")).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(customer.id)))?.applicationCount).toBe(1);
  });

  test("a free consultation submits owing nothing", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t, { paymentMode: "free_consultation" });
    const signedIn = as(t, customer.clerkId);

    const { applicationId } = await signedIn.mutation(api.applications.createDraft, {
      visaProductId: cat.productId,
    });
    await signedIn.mutation(api.applicants.upsert, {
      applicationId,
      data: { firstName: "Asha", lastName: "Mehta", isPrimary: true },
    });

    const result = await signedIn.mutation(api.applications.submit, {
      applicationId,
      acceptTerms: true,
    });
    expect(result.paymentStatus).toBe("not_required");
    expect(result.requiresPayment).toBe(false);
  });

  test("a stranger cannot submit someone else's draft", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const stranger = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner,
      catalogue: cat,
      status: "draft",
    });

    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).mutation(api.applications.submit, { applicationId }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("the traveller count on the booking must match the travellers added", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const signedIn = as(t, customer.clerkId);

    const { applicationId } = await signedIn.mutation(api.applications.createDraft, {
      visaProductId: cat.productId,
      travellerCount: 3,
    });
    await signedIn.mutation(api.applicants.upsert, {
      applicationId,
      data: { firstName: "Asha", lastName: "Mehta", isPrimary: true },
    });

    expect(
      await codeOf(() =>
        signedIn.mutation(api.applications.submit, { applicationId, acceptTerms: true }),
      ),
    ).toBe("INCOMPLETE_APPLICATION");
  });
});

describe("reading a booking back", () => {
  test("the owner can read their own by id and by reference", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner: customer,
      catalogue: cat,
      reference: "VD-2026-OWNED1",
    });
    const signedIn = as(t, customer.clerkId);

    expect((await signedIn.query(api.applications.getMine, { applicationId }))).toBeTruthy();
    expect(
      await signedIn.query(api.applications.getByReference, {
        referenceId: "VD-2026-OWNED1",
      }),
    ).toBeTruthy();
  });

  test("a guessed reference number leaks nothing to another customer", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const stranger = await makeUser(t);
    const cat = await makeCatalogue(t);
    await makeApplication(t, {
      owner,
      catalogue: cat,
      reference: "VD-2026-GUESS1",
    });

    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).query(api.applications.getByReference, {
          referenceId: "VD-2026-GUESS1",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("listMine only ever returns the caller's own bookings", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const stranger = await makeUser(t);
    const cat = await makeCatalogue(t);
    await makeApplication(t, { owner, catalogue: cat });
    await makeApplication(t, { owner: stranger, catalogue: cat });

    const page = await as(t, owner.clerkId).query(api.applications.listMine, {
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(page.page).toHaveLength(1);
    expect(page.page[0].userId).toBe(owner.id);
  });
});
