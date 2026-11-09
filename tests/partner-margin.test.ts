/**
 * The agent's margin is the agent's business.
 *
 * On a B2B booking `applications.userId` is the end traveller, so every read
 * that serves "the owner" must drop `partnerMargin`. Only the partner who
 * placed the booking (and staff with the right permission) may see it.
 */
import { afterEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  as,
  drainScheduled,
  makeApplication,
  makeCatalogue,
  makeUser,
  newTest,
  type CatalogueFixture,
  type T,
  type UserFixture,
} from "./harness";

afterEach(async () => {
  await drainScheduled();
});

async function setup(t: T, opts: { draft?: boolean } = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const login = await makeUser(t, { role: "partner" });
  const now = Date.now();
  const partnerId = await t.run((ctx) =>
    ctx.db.insert("partners", {
      partnerCode: `VDP-${suffix.toUpperCase()}`,
      userId: login.id,
      agencyName: `Agency ${suffix}`,
      businessType: "travel_agency",
      addressLine1: "Unit 4",
      city: "Mumbai",
      country: "India",
      contactPersonName: "Priya Shah",
      contactEmail: login.email,
      contactPhone: "9876543210",
      status: "approved",
      defaultMarkupPercent: 0,
      bookingCount: 0,
      customerCount: 0,
      grossVolume: 0,
      grossMargin: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    }),
  );

  const catalogue: CatalogueFixture = await makeCatalogue(t);
  const traveller: UserFixture = await makeUser(t);
  const applicationId: Id<"applications"> = await makeApplication(t, {
    owner: traveller,
    catalogue,
    status: opts.draft ? "draft" : "submitted",
  });
  const referenceId = await t.run(async (ctx) => {
    await ctx.db.patch(applicationId, {
      partnerId,
      createdByPartnerUserId: login.id,
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
    return (await ctx.db.get(applicationId))!.referenceId;
  });

  return { login, traveller, applicationId, referenceId };
}

describe("partnerMargin never reaches the end traveller", () => {
  test("getMine, getByReference, listMine drop it for the traveller", async () => {
    const t = newTest();
    const { traveller, applicationId, referenceId } = await setup(t);
    const asTraveller = as(t, traveller.clerkId);

    const mine = await asTraveller.query(api.applications.getMine, { applicationId });
    expect(mine.application._id).toBe(applicationId);
    expect(mine.application).not.toHaveProperty("partnerMargin");

    const byRef = await asTraveller.query(api.applications.getByReference, {
      referenceId,
    });
    expect(byRef?.application._id).toBe(applicationId);
    expect(byRef?.application).not.toHaveProperty("partnerMargin");

    const page = await asTraveller.query(api.applications.listMine, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(page.page).toHaveLength(1);
    expect(page.page[0]).not.toHaveProperty("partnerMargin");
  });

  test("getDraft and listMyDrafts drop it for the traveller", async () => {
    const t = newTest();
    const { traveller, applicationId } = await setup(t, { draft: true });
    const asTraveller = as(t, traveller.clerkId);

    const draft = await asTraveller.query(api.applications.getDraft, { applicationId });
    expect(draft.application._id).toBe(applicationId);
    expect(draft.application).not.toHaveProperty("partnerMargin");

    const drafts = await asTraveller.query(api.applications.listMyDrafts, {});
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).not.toHaveProperty("partnerMargin");
  });

  test("the partner who placed the booking still sees it", async () => {
    const t = newTest();
    const { login, applicationId } = await setup(t);

    const detail = await as(t, login.clerkId).query(api.partnerBookings.getMine, {
      applicationId,
    });
    expect(detail?.margin?.marginAmount).toBe(100_000);

    const shared = await as(t, login.clerkId).query(api.applications.getMine, {
      applicationId,
    });
    expect(shared.application.partnerMargin?.basePrice).toBe(885_000);
  });

  test("the placing partner still gets it on getDraft", async () => {
    const t = newTest();
    const { login, applicationId } = await setup(t, { draft: true });

    const draft = await as(t, login.clerkId).query(api.applications.getDraft, {
      applicationId,
    });
    expect(draft.application.partnerMargin?.marginAmount).toBe(100_000);
  });

  test("listForAdmin rows never carry it, even for a pricing-capable admin", async () => {
    const t = newTest();
    await setup(t);
    const manager = await makeUser(t, { role: "manager" });
    const admin = await makeUser(t, { role: "admin" });

    for (const who of [manager, admin]) {
      const page = await as(t, who.clerkId).query(api.applications.listForAdmin, {
        paginationOpts: { numItems: 20, cursor: null },
      });
      expect(page.page.length).toBeGreaterThan(0);
      for (const row of page.page) {
        expect(row).not.toHaveProperty("partnerMargin");
      }
    }
  });

  test("getForAdmin hides margin from a manager without partner:pricing", async () => {
    const t = newTest();
    const { applicationId } = await setup(t);
    const manager = await makeUser(t, { role: "manager" });
    const admin = await makeUser(t, { role: "admin" });

    const asManager = await as(t, manager.clerkId).query(api.applications.getForAdmin, {
      applicationId,
    });
    expect(asManager.commercials).toBeNull();
    expect(asManager.application).not.toHaveProperty("partnerMargin");

    const asAdmin = await as(t, admin.clerkId).query(api.applications.getForAdmin, {
      applicationId,
    });
    expect(asAdmin.commercials?.partnerMargin?.marginAmount).toBe(100_000);
  });
});
