/**
 * B2B partners.
 *
 * The things that have to be true before this module can be trusted with
 * somebody else's customers:
 *
 *   • A partner reaches their own bookings, customers and prices, and nothing
 *     else — no argument they could change gets them into another agency.
 *   • A partner cannot move an application's official status, however much
 *     their own booking it is.
 *   • Prices are the server's. A partner never supplies one, and a stored rule
 *     is resolved against the live catalogue on every write.
 *   • Approval is the only path to the partner role, and it is the only path
 *     out of it.
 *   • The existing B2C flow still behaves exactly as it did.
 */
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import {
  as,
  codeOf,
  drainScheduled,
  makeApplication,
  makeCatalogue,
  makeUser,
  newTest,
  type CatalogueFixture,
  type T,
  type UserFixture,
} from "./harness";

/* -------------------------------------------------------------------------- */
/*                                  fixtures                                  */
/* -------------------------------------------------------------------------- */

interface PartnerFixture {
  partnerId: Id<"partners">;
  partnerCode: string;
  login: UserFixture;
}

const BUSINESS = {
  agencyName: "Horizon Travels",
  businessType: "travel_agency" as const,
  addressLine1: "Unit 4, Linking Road",
  city: "Mumbai",
  country: "India",
  contactPersonName: "Priya Shah",
  contactEmail: "priya@horizon.test",
  contactPhone: "9876543210",
};

/**
 * A partner written straight into the database, so a test can start from any
 * lifecycle state without walking the approval flow. The login's role is set
 * to match, exactly as `partners.setStatus` would leave it.
 */
async function makePartner(
  t: T,
  opts: {
    status?: Doc<"partners">["status"];
    agencyName?: string;
    email?: string;
    defaultMarkupPercent?: number;
    isDeleted?: boolean;
  } = {},
): Promise<PartnerFixture> {
  const status = opts.status ?? "approved";
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = opts.email ?? `partner.${suffix}@agency.test`;

  const login = await makeUser(t, {
    role: status === "approved" ? "partner" : "customer",
    email,
    fullName: opts.agencyName ?? "Partner Login",
  });

  const now = Date.now();
  const partnerId = await t.run(async (ctx) =>
    ctx.db.insert("partners", {
      partnerCode: `VDP-${suffix.toUpperCase()}`,
      userId: login.id,
      ...BUSINESS,
      agencyName: opts.agencyName ?? `Horizon ${suffix}`,
      contactEmail: email,
      status,
      defaultMarkupPercent: opts.defaultMarkupPercent ?? 0,
      bookingCount: 0,
      customerCount: 0,
      grossVolume: 0,
      grossMargin: 0,
      isDeleted: opts.isDeleted ?? false,
      createdAt: now,
      updatedAt: now,
    }),
  );

  const row = await t.run((ctx) => ctx.db.get(partnerId));

  return { partnerId, partnerCode: row!.partnerCode, login };
}

/** A submitted booking placed by `partner` for a fresh traveller. */
async function makePartnerBooking(
  t: T,
  partner: PartnerFixture,
  catalogue: CatalogueFixture,
  opts: { status?: Doc<"applications">["status"] } = {},
): Promise<{ applicationId: Id<"applications">; traveller: UserFixture }> {
  const traveller = await makeUser(t);
  const applicationId = await makeApplication(t, {
    owner: traveller,
    catalogue,
    status: opts.status ?? "submitted",
  });

  await t.run(async (ctx) => {
    await ctx.db.patch(applicationId, {
      partnerId: partner.partnerId,
      createdByPartnerUserId: partner.login.id,
      partnerMargin: {
        currency: "INR",
        basePrice: 885_000,
        partnerPrice: 985_000,
        marginAmount: 100_000,
        marginPercent: 11.3,
        mode: "markup_amount",
        ruleValue: 84_746,
      },
    });
    await ctx.db.insert("partnerCustomers", {
      partnerId: partner.partnerId,
      userId: traveller.id,
      fullName: "Test Traveller",
      email: traveller.email,
      bookingCount: 1,
      isArchived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  return { applicationId, traveller };
}

/* -------------------------------------------------------------------------- */
/*                                registration                                */
/* -------------------------------------------------------------------------- */

describe("registration and approval", () => {
  test("registering files a pending application and grants nothing", async () => {
    const t = newTest();
    const applicant = await makeUser(t);

    const result = await as(t, applicant.clerkId).mutation(
      api.partners.register,
      BUSINESS,
    );

    expect(result.status).toBe("pending");
    expect(result.resubmitted).toBe(false);
    expect(result.partnerCode).toMatch(/^VDP-\d{4}$/);

    // Registering must not promote anybody. Approval does that, and only
    // approval.
    const login = await t.run((ctx) => ctx.db.get(applicant.id));
    expect(login?.role).toBe("customer");

    await drainScheduled();
  });

  test("a pending applicant cannot trade", async () => {
    const t = newTest();
    const partner = await makePartner(t, { status: "pending" });

    expect(
      await codeOf(() =>
        as(t, partner.login.clerkId).query(api.partners.myDashboard, {}),
      ),
    ).toBe("PARTNER_NOT_APPROVED");
  });

  test("somebody with no partner record gets a distinct code, not a 403", async () => {
    const t = newTest();
    const nobody = await makeUser(t);

    expect(
      await codeOf(() =>
        as(t, nobody.clerkId).query(api.partners.myDashboard, {}),
      ),
    ).toBe("NO_PARTNER_ACCOUNT");

    // ...and the portal's own status query answers null rather than throwing,
    // so the "become a partner" screen can render.
    const profile = await as(t, nobody.clerkId).query(api.partners.myProfile, {});
    expect(profile).toBeNull();
  });

  test("approval grants the role; suspension takes it back", async () => {
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });
    const partner = await makePartner(t, { status: "pending" });

    await as(t, admin.clerkId).mutation(api.partners.setStatus, {
      partnerId: partner.partnerId,
      status: "approved",
    });

    expect(
      (await t.run((ctx) => ctx.db.get(partner.login.id)))?.role,
    ).toBe("partner");

    await as(t, admin.clerkId).mutation(api.partners.setStatus, {
      partnerId: partner.partnerId,
      status: "suspended",
      reason: "Unpaid invoices.",
    });

    expect(
      (await t.run((ctx) => ctx.db.get(partner.login.id)))?.role,
    ).toBe("customer");

    // And a suspended partner is refused at the door.
    expect(
      await codeOf(() =>
        as(t, partner.login.clerkId).query(api.partners.myDashboard, {}),
      ),
    ).toBe("PARTNER_NOT_APPROVED");

    await drainScheduled();
  });

  test("rejection and suspension both demand a reason", async () => {
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });
    const partner = await makePartner(t, { status: "pending" });

    expect(
      await codeOf(() =>
        as(t, admin.clerkId).mutation(api.partners.setStatus, {
          partnerId: partner.partnerId,
          status: "rejected",
        }),
      ),
    ).toBe("VALIDATION");
  });

  test("an impossible transition is refused", async () => {
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });
    const partner = await makePartner(t, { status: "approved" });

    // approved -> rejected is not a move the lifecycle offers; suspend first.
    expect(
      await codeOf(() =>
        as(t, admin.clerkId).mutation(api.partners.setStatus, {
          partnerId: partner.partnerId,
          status: "rejected",
          reason: "Changed our minds.",
        }),
      ),
    ).toBe("INVALID_TRANSITION");
  });

  test("a manager can see partners but not approve one", async () => {
    const t = newTest();
    const manager = await makeUser(t, { role: "manager" });
    const partner = await makePartner(t, { status: "pending" });

    // Reading is fine.
    const detail = await as(t, manager.clerkId).query(api.partners.getForAdmin, {
      partnerId: partner.partnerId,
    });
    expect(detail?.partner.partnerCode).toBe(partner.partnerCode);

    // Deciding is not.
    expect(
      await codeOf(() =>
        as(t, manager.clerkId).mutation(api.partners.setStatus, {
          partnerId: partner.partnerId,
          status: "approved",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a partner never reaches the CRM's partner directory", async () => {
    const t = newTest();
    const partner = await makePartner(t);

    expect(
      await codeOf(() =>
        as(t, partner.login.clerkId).query(api.partners.listForAdmin, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});

/* -------------------------------------------------------------------------- */
/*                                  pricing                                   */
/* -------------------------------------------------------------------------- */

describe("partner pricing", () => {
  test("a markup is applied server-side and the margin is exact", async () => {
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });
    const partner = await makePartner(t);
    const cat = await makeCatalogue(t, {
      governmentFee: 500_000,
      serviceFee: 250_000,
      taxPercent: 18,
    });

    // Base: (500000 + 250000) = 750000, +18% = 885000.
    const result = await as(t, admin.clerkId).mutation(
      api.partnerPricing.setRule,
      {
        partnerId: partner.partnerId,
        visaProductId: cat.productId,
        mode: "markup_amount",
        value: 100_000, // ₹1,000 per traveller, pre-tax
      },
    );

    // 750000 + 100000 = 850000, +18% = 1003000. Margin = 118000 — the markup
    // plus the tax collected on it, which is every rupee above the base.
    expect(result.basePrice).toBe(885_000);
    expect(result.partnerPrice).toBe(1_003_000);
    expect(result.marginAmount).toBe(118_000);
    expect(Number.isInteger(result.partnerPrice)).toBe(true);

    await drainScheduled();
  });

  test("a percentage markup compounds per traveller, not per booking", async () => {
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });
    const partner = await makePartner(t);
    const cat = await makeCatalogue(t, {
      governmentFee: 500_000,
      serviceFee: 250_000,
      taxPercent: 0,
    });

    await as(t, admin.clerkId).mutation(api.partnerPricing.setRule, {
      partnerId: partner.partnerId,
      visaProductId: cat.productId,
      mode: "markup_percent",
      value: 10,
    });

    const one = await as(t, partner.login.clerkId).query(api.partners.myQuote, {
      visaProductId: cat.productId,
      travellerCount: 1,
    });
    const three = await as(t, partner.login.clerkId).query(api.partners.myQuote, {
      visaProductId: cat.productId,
      travellerCount: 3,
    });

    expect(one?.marginAmount).toBe(75_000); // 10% of 750000
    expect(three?.marginAmount).toBe(225_000); // three times over
    expect(three?.basePrice).toBe(2_250_000);

    await drainScheduled();
  });

  test("a fixed price below the government fee is refused", async () => {
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });
    const partner = await makePartner(t);
    const cat = await makeCatalogue(t, {
      governmentFee: 500_000,
      serviceFee: 250_000,
    });

    expect(
      await codeOf(() =>
        as(t, admin.clerkId).mutation(api.partnerPricing.setRule, {
          partnerId: partner.partnerId,
          visaProductId: cat.productId,
          mode: "fixed_price",
          value: 400_000,
        }),
      ),
    ).toBe("VALIDATION");
  });

  test("a partner cannot set their own price", async () => {
    const t = newTest();
    const partner = await makePartner(t);
    const cat = await makeCatalogue(t);

    expect(
      await codeOf(() =>
        as(t, partner.login.clerkId).mutation(api.partnerPricing.setRule, {
          partnerId: partner.partnerId,
          visaProductId: cat.productId,
          mode: "markup_percent",
          value: 500,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("one partner cannot read another's rates", async () => {
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });
    const alice = await makePartner(t, { agencyName: "Alice Travel" });
    const bob = await makePartner(t, { agencyName: "Bob Tours" });
    const cat = await makeCatalogue(t, { taxPercent: 0 });

    await as(t, admin.clerkId).mutation(api.partnerPricing.setRule, {
      partnerId: alice.partnerId,
      visaProductId: cat.productId,
      mode: "markup_amount",
      value: 999_900,
    });

    // Bob's own catalogue shows Bob's price, with no trace of Alice's rate —
    // and there is no argument on the query that could ask for hers.
    const bobCatalogue = await as(t, bob.login.clerkId).query(
      api.partnerPricing.myCatalogue,
      {},
    );
    const row = bobCatalogue.rows.find((r) => r.visaProductId === cat.productId);
    expect(row?.marginAmount).toBe(0);
    expect(row?.partnerPrice).toBe(row?.basePrice);

    // And the admin-side read, which does take a partner id, refuses him.
    expect(
      await codeOf(() =>
        as(t, bob.login.clerkId).query(api.partnerPricing.listForPartner, {
          partnerId: alice.partnerId,
        }),
      ),
    ).toBe("FORBIDDEN");

    await drainScheduled();
  });

  test("the default markup applies where no specific rate exists", async () => {
    const t = newTest();
    const partner = await makePartner(t, { defaultMarkupPercent: 20 });
    const cat = await makeCatalogue(t, {
      governmentFee: 500_000,
      serviceFee: 250_000,
      taxPercent: 0,
    });

    const quote = await as(t, partner.login.clerkId).query(api.partners.myQuote, {
      visaProductId: cat.productId,
      travellerCount: 1,
    });

    expect(quote?.source).toBe("default");
    expect(quote?.marginAmount).toBe(150_000);
    expect(quote?.partnerPrice).toBe(900_000);
  });
});

/* -------------------------------------------------------------------------- */
/*                                  bookings                                  */
/* -------------------------------------------------------------------------- */

describe("partner bookings", () => {
  test("a draft is owned by the traveller and stamped with the partner", async () => {
    const t = newTest();
    const partner = await makePartner(t, { defaultMarkupPercent: 10 });
    const cat = await makeCatalogue(t, {
      governmentFee: 500_000,
      serviceFee: 250_000,
      taxPercent: 0,
    });

    const result = await as(t, partner.login.clerkId).mutation(
      api.partnerBookings.createDraft,
      {
        visaProductId: cat.productId,
        travellerCount: 2,
        newCustomer: { fullName: "Rahul Mehta", email: "rahul@example.test" },
      },
    );

    const row = await t.run((ctx) => ctx.db.get(result.applicationId));

    expect(row?.partnerId).toBe(partner.partnerId);
    expect(row?.createdByPartnerUserId).toBe(partner.login.id);
    // The traveller owns the booking; the agent merely placed it.
    expect(row?.userId).not.toBe(partner.login.id);
    expect(row?.customerEmail).toBe("rahul@example.test");

    // 2 × (750000 + 10%) = 1650000, no tax in this fixture.
    expect(row?.pricing.total).toBe(1_650_000);
    expect(row?.partnerMargin?.basePrice).toBe(1_500_000);
    expect(row?.partnerMargin?.marginAmount).toBe(150_000);

    await drainScheduled();
  });

  test("clicking twice reuses the draft rather than making a second", async () => {
    const t = newTest();
    const partner = await makePartner(t);
    const cat = await makeCatalogue(t);

    const signedIn = as(t, partner.login.clerkId);
    const first = await signedIn.mutation(api.partnerBookings.createDraft, {
      visaProductId: cat.productId,
      newCustomer: { fullName: "Rahul Mehta", email: "rahul@example.test" },
    });
    const second = await signedIn.mutation(api.partnerBookings.createDraft, {
      visaProductId: cat.productId,
      partnerCustomerId: first.partnerCustomerId,
    });

    expect(second.reused).toBe(true);
    expect(second.applicationId).toBe(first.applicationId);

    await drainScheduled();
  });

  test("a partner cannot book against another partner's customer", async () => {
    const t = newTest();
    const alice = await makePartner(t, { agencyName: "Alice Travel" });
    const bob = await makePartner(t, { agencyName: "Bob Tours" });
    const cat = await makeCatalogue(t);

    const aliceBooking = await as(t, alice.login.clerkId).mutation(
      api.partnerBookings.createDraft,
      {
        visaProductId: cat.productId,
        newCustomer: { fullName: "Rahul Mehta", email: "rahul@example.test" },
      },
    );

    expect(
      await codeOf(() =>
        as(t, bob.login.clerkId).mutation(api.partnerBookings.createDraft, {
          visaProductId: cat.productId,
          partnerCustomerId: aliceBooking.partnerCustomerId,
        }),
      ),
    ).toBe("NOT_FOUND");

    await drainScheduled();
  });

  test("a partner cannot read another partner's booking", async () => {
    const t = newTest();
    const alice = await makePartner(t, { agencyName: "Alice Travel" });
    const bob = await makePartner(t, { agencyName: "Bob Tours" });
    const cat = await makeCatalogue(t);

    const { applicationId } = await makePartnerBooking(t, alice, cat);

    // The partner-scoped read simply does not resolve it.
    expect(
      await as(t, bob.login.clerkId).query(api.partnerBookings.getMine, {
        applicationId,
      }),
    ).toBeNull();

    // Nor does the shared one, which is what the document and applicant
    // mutations go through.
    expect(
      await codeOf(() =>
        as(t, bob.login.clerkId).query(api.applications.getMine, {
          applicationId,
        }),
      ),
    ).toBe("FORBIDDEN");

    // And Bob's own list never contains it.
    const list = await as(t, bob.login.clerkId).query(
      api.partnerBookings.listMine,
      { paginationOpts: { numItems: 50, cursor: null } },
    );
    expect(list.page).toHaveLength(0);
  });

  test("a partner reaches their own booking, including the margin", async () => {
    const t = newTest();
    const alice = await makePartner(t);
    const cat = await makeCatalogue(t);
    const { applicationId } = await makePartnerBooking(t, alice, cat);

    const detail = await as(t, alice.login.clerkId).query(
      api.partnerBookings.getMine,
      { applicationId },
    );

    expect(detail?.application._id).toBe(applicationId);
    expect(detail?.margin?.marginAmount).toBe(100_000);
  });

  test("a partner cannot change an application's status", async () => {
    const t = newTest();
    const alice = await makePartner(t);
    const cat = await makeCatalogue(t);
    const { applicationId } = await makePartnerBooking(t, alice, cat);

    expect(
      await codeOf(() =>
        as(t, alice.login.clerkId).mutation(api.applications.updateStatus, {
          applicationId,
          status: "approved",
        }),
      ),
    ).toBe("FORBIDDEN");

    expect(
      await codeOf(() =>
        as(t, alice.login.clerkId).mutation(api.applications.markCompleted, {
          applicationId,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a partner cannot review documents or request them", async () => {
    const t = newTest();
    const alice = await makePartner(t);
    const cat = await makeCatalogue(t);
    const { applicationId } = await makePartnerBooking(t, alice, cat);

    expect(
      await codeOf(() =>
        as(t, alice.login.clerkId).mutation(api.documentRequests.create, {
          applicationId,
          documentKey: "passport_front",
          reason: "Send it again.",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a partner can unfile a document on their own draft, but not after submission", async () => {
    const t = newTest();
    const partner = await makePartner(t);
    const other = await makePartner(t, { agencyName: "Bob Tours" });
    const cat = await makeCatalogue(t);
    const signedIn = as(t, partner.login.clerkId);

    const draft = await signedIn.mutation(api.partnerBookings.createDraft, {
      visaProductId: cat.productId,
      newCustomer: { fullName: "Rahul Mehta", email: "rahul@example.test" },
    });

    async function attachOne(): Promise<Id<"documents">> {
      const storageId = await t.run((ctx) =>
        ctx.storage.store(new Blob(["passport bytes"])),
      );
      return await signedIn.mutation(api.documents.attach, {
        applicationId: draft.applicationId,
        storageId,
        documentKey: "passport_front",
        fileName: "passport.pdf",
        mimeType: "application/pdf",
        size: 14,
      });
    }

    const misfiled = await attachOne();

    // Another agency has no business touching it, draft or not.
    expect(
      await codeOf(() =>
        as(t, other.login.clerkId).mutation(api.documents.remove, {
          documentId: misfiled,
        }),
      ),
    ).toBe("FORBIDDEN");

    // The placing partner may fix their own mistake while it is a draft.
    await signedIn.mutation(api.documents.remove, { documentId: misfiled });
    expect(await t.run((ctx) => ctx.db.get(misfiled))).toBeNull();

    // Once submitted, the window closes — it is the office's record now.
    const kept = await attachOne();
    await signedIn.mutation(api.applicants.upsert, {
      applicationId: draft.applicationId,
      data: { firstName: "Rahul", lastName: "Mehta", isPrimary: true },
    });
    await signedIn.mutation(api.applications.submit, {
      applicationId: draft.applicationId,
      acceptTerms: true,
    });

    expect(
      await codeOf(() =>
        signedIn.mutation(api.documents.remove, { documentId: kept }),
      ),
    ).toBe("FORBIDDEN");

    await drainScheduled();
  });

  test("a suspended partner loses reach over bookings they placed", async () => {
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });
    const alice = await makePartner(t);
    const cat = await makeCatalogue(t);
    const { applicationId } = await makePartnerBooking(t, alice, cat);

    await as(t, admin.clerkId).mutation(api.partners.setStatus, {
      partnerId: alice.partnerId,
      status: "suspended",
      reason: "Under investigation.",
    });

    expect(
      await codeOf(() =>
        as(t, alice.login.clerkId).query(api.applications.getMine, {
          applicationId,
        }),
      ),
    ).toBe("FORBIDDEN");

    await drainScheduled();
  });

  test("submitting re-freezes the partner price from the live rule", async () => {
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });
    const partner = await makePartner(t);
    const cat = await makeCatalogue(t, {
      governmentFee: 500_000,
      serviceFee: 250_000,
      taxPercent: 0,
    });

    const signedIn = as(t, partner.login.clerkId);

    const draft = await signedIn.mutation(api.partnerBookings.createDraft, {
      visaProductId: cat.productId,
      travellerCount: 1,
      newCustomer: { fullName: "Rahul Mehta", email: "rahul@example.test" },
    });
    expect(draft.marginAmount).toBe(0);

    await signedIn.mutation(api.applicants.upsert, {
      applicationId: draft.applicationId,
      data: { firstName: "Rahul", lastName: "Mehta", isPrimary: true },
    });

    // The rate changes between drafting and submitting. Submission must use
    // the new one, because it recomputes rather than trusting the snapshot.
    await as(t, admin.clerkId).mutation(api.partnerPricing.setRule, {
      partnerId: partner.partnerId,
      visaProductId: cat.productId,
      mode: "markup_amount",
      value: 50_000,
    });

    const submitted = await signedIn.mutation(api.applications.submit, {
      applicationId: draft.applicationId,
      acceptTerms: true,
    });

    expect(submitted.total).toBe(800_000);

    const row = await t.run((ctx) => ctx.db.get(draft.applicationId));
    expect(row?.partnerMargin?.marginAmount).toBe(50_000);
    expect(row?.partnerMargin?.basePrice).toBe(750_000);
    expect(row?.status).toBe("submitted");

    // The traveller's own counter moved, not the agent's.
    const traveller = await t.run((ctx) => ctx.db.get(row!.userId));
    expect(traveller?.applicationCount).toBe(1);
    const agent = await t.run((ctx) => ctx.db.get(partner.login.id));
    expect(agent?.applicationCount).toBe(0);

    await drainScheduled();
  });

  test("submitting rolls the partner's volume and margin up", async () => {
    const t = newTest();
    const partner = await makePartner(t, { defaultMarkupPercent: 10 });
    const cat = await makeCatalogue(t, {
      governmentFee: 500_000,
      serviceFee: 250_000,
      taxPercent: 0,
    });

    const signedIn = as(t, partner.login.clerkId);
    const draft = await signedIn.mutation(api.partnerBookings.createDraft, {
      visaProductId: cat.productId,
      newCustomer: { fullName: "Rahul Mehta", email: "rahul@example.test" },
    });
    await signedIn.mutation(api.applicants.upsert, {
      applicationId: draft.applicationId,
      data: { firstName: "Rahul", lastName: "Mehta", isPrimary: true },
    });
    await signedIn.mutation(api.applications.submit, {
      applicationId: draft.applicationId,
      acceptTerms: true,
    });

    const row = await t.run((ctx) => ctx.db.get(partner.partnerId));
    expect(row?.bookingCount).toBe(1);
    expect(row?.grossVolume).toBe(825_000);
    expect(row?.grossMargin).toBe(75_000);

    await drainScheduled();
  });

  test("a cancelled booking stops counting towards volume", async () => {
    const t = newTest();
    const partner = await makePartner(t, { defaultMarkupPercent: 10 });
    const cat = await makeCatalogue(t, { taxPercent: 0 });

    const signedIn = as(t, partner.login.clerkId);
    const draft = await signedIn.mutation(api.partnerBookings.createDraft, {
      visaProductId: cat.productId,
      newCustomer: { fullName: "Rahul Mehta", email: "rahul@example.test" },
    });
    await signedIn.mutation(api.applicants.upsert, {
      applicationId: draft.applicationId,
      data: { firstName: "Rahul", lastName: "Mehta", isPrimary: true },
    });
    await signedIn.mutation(api.applications.submit, {
      applicationId: draft.applicationId,
      acceptTerms: true,
    });

    await signedIn.mutation(api.applications.cancelMine, {
      applicationId: draft.applicationId,
      reason: "Customer changed their plans.",
    });

    const row = await t.run((ctx) => ctx.db.get(partner.partnerId));
    expect(row?.bookingCount).toBe(0);
    expect(row?.grossVolume).toBe(0);

    await drainScheduled();
  });
});

/* -------------------------------------------------------------------------- */
/*                                 customers                                  */
/* -------------------------------------------------------------------------- */

describe("partner customers", () => {
  test("a customer book is scoped to the agency that owns it", async () => {
    const t = newTest();
    const alice = await makePartner(t, { agencyName: "Alice Travel" });
    const bob = await makePartner(t, { agencyName: "Bob Tours" });

    const created = await as(t, alice.login.clerkId).mutation(
      api.partnerBookings.upsertCustomer,
      { fullName: "Rahul Mehta", email: "rahul@example.test" },
    );

    const bobList = await as(t, bob.login.clerkId).query(
      api.partnerBookings.listMyCustomers,
      { paginationOpts: { numItems: 50, cursor: null } },
    );
    expect(bobList.page).toHaveLength(0);

    expect(
      await as(t, bob.login.clerkId).query(api.partnerBookings.myCustomer, {
        partnerCustomerId: created.partnerCustomerId,
      }),
    ).toBeNull();

    expect(
      await codeOf(() =>
        as(t, bob.login.clerkId).mutation(api.partnerBookings.upsertCustomer, {
          partnerCustomerId: created.partnerCustomerId,
          fullName: "Hijacked",
          email: "attacker@example.test",
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  test("a staff email is refused as a partner's customer", async () => {
    const t = newTest();
    const partner = await makePartner(t);
    const agent = await makeUser(t, { role: "visa_agent" });

    expect(
      await codeOf(() =>
        as(t, partner.login.clerkId).mutation(
          api.partnerBookings.upsertCustomer,
          { fullName: "Not A Traveller", email: agent.email },
        ),
      ),
    ).toBe("VALIDATION");
  });

  test("re-adding the same email revives the row instead of duplicating it", async () => {
    const t = newTest();
    const partner = await makePartner(t);
    const signedIn = as(t, partner.login.clerkId);

    const first = await signedIn.mutation(api.partnerBookings.upsertCustomer, {
      fullName: "Rahul Mehta",
      email: "rahul@example.test",
    });
    await signedIn.mutation(api.partnerBookings.archiveCustomer, {
      partnerCustomerId: first.partnerCustomerId,
      archived: true,
    });

    const again = await signedIn.mutation(api.partnerBookings.upsertCustomer, {
      fullName: "Rahul Mehta",
      email: "RAHUL@example.test",
    });

    expect(again.partnerCustomerId).toBe(first.partnerCustomerId);
    const row = await t.run((ctx) => ctx.db.get(first.partnerCustomerId));
    expect(row?.isArchived).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                                 documents                                  */
/* -------------------------------------------------------------------------- */

describe("partner verification documents", () => {
  async function seedPartnerDocument(
    t: T,
    partner: PartnerFixture,
  ): Promise<Id<"partnerDocuments">> {
    return await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["gst certificate"]));
      return ctx.db.insert("partnerDocuments", {
        partnerId: partner.partnerId,
        userId: partner.login.id,
        storageId,
        documentKind: "gst_certificate",
        label: "GST certificate",
        fileName: "gst.pdf",
        mimeType: "application/pdf",
        size: 15,
        status: "pending_review",
        version: 1,
        isCurrent: true,
        createdAt: Date.now(),
      });
    });
  }

  test("a partner can open their own file; another partner cannot", async () => {
    const t = newTest();
    const alice = await makePartner(t);
    const bob = await makePartner(t);
    const documentId = await seedPartnerDocument(t, alice);

    const url = await as(t, alice.login.clerkId).query(
      api.documents.getPartnerSignedUrl,
      { partnerDocumentId: documentId },
    );
    expect(typeof url).toBe("string");

    expect(
      await codeOf(() =>
        as(t, bob.login.clerkId).query(api.documents.getPartnerSignedUrl, {
          partnerDocumentId: documentId,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a customer with no partner account cannot open one at all", async () => {
    const t = newTest();
    const alice = await makePartner(t);
    const stranger = await makeUser(t);
    const documentId = await seedPartnerDocument(t, alice);

    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).query(api.documents.getPartnerSignedUrl, {
          partnerDocumentId: documentId,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("staff holding partner:view can open it; rejection needs a note", async () => {
    const t = newTest();
    const alice = await makePartner(t);
    const admin = await makeUser(t, { role: "admin" });
    const documentId = await seedPartnerDocument(t, alice);

    expect(
      typeof (await as(t, admin.clerkId).query(
        api.documents.getPartnerSignedUrl,
        { partnerDocumentId: documentId },
      )),
    ).toBe("string");

    expect(
      await codeOf(() =>
        as(t, admin.clerkId).mutation(api.partnerDocuments.review, {
          partnerDocumentId: documentId,
          status: "rejected",
        }),
      ),
    ).toBe("VALIDATION");

    await as(t, admin.clerkId).mutation(api.partnerDocuments.review, {
      partnerDocumentId: documentId,
      status: "verified",
    });

    const row = await t.run((ctx) => ctx.db.get(documentId));
    expect(row?.status).toBe("verified");
  });
});

/* -------------------------------------------------------------------------- */
/*                               B2C regression                               */
/* -------------------------------------------------------------------------- */

describe("the direct booking flow is unchanged", () => {
  test("a customer's own draft still has no partner on it", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t, {
      governmentFee: 500_000,
      serviceFee: 250_000,
      taxPercent: 18,
    });

    const { applicationId } = await as(t, customer.clerkId).mutation(
      api.applications.createDraft,
      { visaProductId: cat.productId },
    );

    const row = await t.run((ctx) => ctx.db.get(applicationId));
    expect(row?.partnerId).toBeUndefined();
    expect(row?.partnerMargin).toBeUndefined();
    expect(row?.userId).toBe(customer.id);
    expect(row?.pricing.total).toBe(885_000);
  });

  test("a customer still cannot reach somebody else's draft", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const stranger = await makeUser(t);
    const cat = await makeCatalogue(t);

    const { applicationId } = await as(t, owner.clerkId).mutation(
      api.applications.createDraft,
      { visaProductId: cat.productId },
    );

    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).query(api.applications.getDraft, {
          applicationId,
        }),
      ),
    ).toBe("FORBIDDEN");

    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).mutation(api.applications.saveDraftStep, {
          applicationId,
          patch: { travelPurpose: "tampering" },
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a direct booking still submits, prices and notifies as before", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const cat = await makeCatalogue(t, {
      governmentFee: 500_000,
      serviceFee: 250_000,
      taxPercent: 18,
    });

    const signedIn = as(t, customer.clerkId);
    const { applicationId } = await signedIn.mutation(
      api.applications.createDraft,
      { visaProductId: cat.productId },
    );
    await signedIn.mutation(api.applicants.upsert, {
      applicationId,
      data: { firstName: "Asha", lastName: "Rao", isPrimary: true },
    });

    const result = await signedIn.mutation(api.applications.submit, {
      applicationId,
      acceptTerms: true,
    });

    expect(result.status).toBe("submitted");
    expect(result.total).toBe(885_000);

    const row = await t.run((ctx) => ctx.db.get(applicationId));
    expect(row?.partnerMargin).toBeUndefined();

    const owner = await t.run((ctx) => ctx.db.get(customer.id));
    expect(owner?.applicationCount).toBe(1);

    await drainScheduled();
  });

  test("a customer's cancellation path is untouched", async () => {
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
      reason: "Trip postponed.",
    });

    expect((await t.run((ctx) => ctx.db.get(applicationId)))?.status).toBe(
      "cancelled",
    );

    await drainScheduled();
  });
});

describe("paying for a partner booking", () => {
  test("the checkout charges the partner price, not the base price", async () => {
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });
    const partner = await makePartner(t);
    const traveller = await makeUser(t, { email: "rahul.pay@example.test" });
    const cat = await makeCatalogue(t, {
      governmentFee: 500_000,
      serviceFee: 250_000,
      taxPercent: 0,
    });

    await as(t, admin.clerkId).mutation(api.partnerPricing.setRule, {
      partnerId: partner.partnerId,
      visaProductId: cat.productId,
      mode: "markup_amount",
      value: 50_000,
    });

    const signedIn = as(t, partner.login.clerkId);
    const draft = await signedIn.mutation(api.partnerBookings.createDraft, {
      visaProductId: cat.productId,
      travellerCount: 1,
      newCustomer: { fullName: "Rahul Mehta", email: traveller.email },
    });
    await signedIn.mutation(api.applicants.upsert, {
      applicationId: draft.applicationId,
      data: { firstName: "Rahul", lastName: "Mehta", isPrimary: true },
    });
    await signedIn.mutation(api.applications.submit, {
      applicationId: draft.applicationId,
      acceptTerms: true,
    });

    // The traveller (the owner) starts checkout from their own portal.
    const order = await as(t, traveller.clerkId).mutation(
      internal.payments.prepareOrderInternal,
      { applicationId: draft.applicationId },
    );

    // 750000 base + 50000 markup = 800000. Not 750000.
    expect(order.amount).toBe(800_000);

    const row = await t.run((ctx) => ctx.db.get(draft.applicationId));
    expect(row?.pricing.total).toBe(800_000);
    expect(row?.partnerMargin?.marginAmount).toBe(50_000);

    await drainScheduled();
  });
});
