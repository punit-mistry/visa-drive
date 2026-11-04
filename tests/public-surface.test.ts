/**
 * The unauthenticated surface.
 *
 * Everything reachable without a session: the catalogue the marketing site
 * reads, the public settings block, and `enquiries.submit` — the one mutation
 * in the whole backend that runs with no identity at all.
 */
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { as, codeOf, makeCatalogue, makeUser, newTest } from "./harness";

describe("the public catalogue", () => {
  test("an unpublished destination is not served to visitors", async () => {
    const t = newTest();
    const cat = await makeCatalogue(t, { slug: "hidden" });
    await t.run((ctx) => ctx.db.patch(cat.destinationId, { isPublished: false }));

    const published = await t.query(api.destinations.listPublished, {});
    expect(published.map((d) => d._id)).not.toContain(cat.destinationId);
    expect(
      await t.query(api.destinations.getBySlug, { slug: "dest-hidden" }),
    ).toBeNull();
  });

  test("an unpublished product is not discoverable", async () => {
    const t = newTest();
    const cat = await makeCatalogue(t, { published: false, slug: "secret" });

    const listed = await t.query(api.visaProducts.listByDestinationSlug, {
      destinationSlug: "dest-secret",
    });
    expect(listed.map((p) => p._id)).not.toContain(cat.productId);
  });

  test("the admin catalogue views stay shut to visitors", async () => {
    const t = newTest();
    expect(await codeOf(() => t.query(api.destinations.listAll, {}))).toBe(
      "UNAUTHENTICATED",
    );
    expect(await codeOf(() => t.query(api.visaProducts.listAll, {}))).toBe(
      "UNAUTHENTICATED",
    );
  });
});

describe("public settings", () => {
  test("a private setting is never published, even if it is flagged public", async () => {
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });

    // Write a row directly with `isPublic: true` on a key the defaults say is
    // private — a bad migration, or a row edited by hand. The read path has to
    // refuse it on its own rather than trusting the stored flag.
    await t.run((ctx) =>
      ctx.db.insert("appSettings", {
        key: "integrations.whatsappCloudEnabled",
        category: "integrations",
        value: "leaked-internal-flag",
        label: "Leaked",
        isPublic: true,
        updatedAt: Date.now(),
        updatedBy: admin.id,
      }),
    );

    const published = await t.query(api.appSettings.getPublic, {});
    const keys = published.map((row) => row.key);
    expect(keys).not.toContain("integrations.whatsappCloudEnabled");
    expect(JSON.stringify(published)).not.toContain("leaked-internal-flag");
  });

  test("the admin settings editor cannot publish a known-private key", async () => {
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });

    await as(t, admin.clerkId).mutation(api.appSettings.set, {
      key: "integrations.whatsappCloudEnabled",
      value: true,
      isPublic: true,
    });

    const row = await t.run((ctx) =>
      ctx.db
        .query("appSettings")
        .withIndex("by_key", (q) => q.eq("key", "integrations.whatsappCloudEnabled"))
        .unique(),
    );
    expect(row?.isPublic).toBe(false);
  });

  test("the full settings table needs a permission", async () => {
    const t = newTest();
    expect(await codeOf(() => t.query(api.appSettings.getAll, {}))).toBe(
      "UNAUTHENTICATED",
    );
  });
});

describe("the public enquiry form", () => {
  const valid = {
    fullName: "Asha Mehta",
    email: "asha@example.test",
    phone: "+91 98200 00000",
    message: "I need a Schengen tourist visa for March.",
  };

  test("a visitor can submit an enquiry", async () => {
    const t = newTest();
    const { enquiryId, referenceId } = await t.mutation(api.enquiries.submit, valid);

    expect(referenceId).toBeTruthy();
    const row = await t.run((ctx) => ctx.db.get(enquiryId));
    expect(row?.leadStatus).toBe("new");
    expect(row?.email).toBe("asha@example.test");
  });

  test("junk is refused rather than stored", async () => {
    const t = newTest();
    expect(
      await codeOf(() => t.mutation(api.enquiries.submit, { ...valid, fullName: "A" })),
    ).toBe("VALIDATION");
    expect(
      await codeOf(() => t.mutation(api.enquiries.submit, { ...valid, message: "hi" })),
    ).toBe("VALIDATION");
    expect(await t.run((ctx) => ctx.db.query("enquiries").collect())).toHaveLength(0);
  });

  test("oversized input is clamped, not stored whole", async () => {
    const t = newTest();
    const { enquiryId } = await t.mutation(api.enquiries.submit, {
      ...valid,
      fullName: "A".repeat(5_000),
      message: "M".repeat(50_000),
    });

    const row = await t.run((ctx) => ctx.db.get(enquiryId));
    expect(row!.fullName.length).toBeLessThanOrEqual(120);
    expect(row!.message.length).toBeLessThanOrEqual(4_000);
  });

  test("one email address cannot flood the inbox", async () => {
    const t = newTest();
    for (let i = 0; i < 5; i += 1) {
      await t.mutation(api.enquiries.submit, {
        ...valid,
        message: `Enquiry number ${i}, please call me back.`,
      });
    }

    expect(await codeOf(() => t.mutation(api.enquiries.submit, valid))).toBe(
      "RATE_LIMITED",
    );
    expect(await t.run((ctx) => ctx.db.query("enquiries").collect())).toHaveLength(5);
  });

  test("a visitor cannot read the leads back", async () => {
    const t = newTest();
    await t.mutation(api.enquiries.submit, valid);

    expect(
      await codeOf(() =>
        t.query(api.enquiries.listForAdmin, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
      ),
    ).toBe("UNAUTHENTICATED");
  });

  test("a customer cannot read the leads either", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    await t.mutation(api.enquiries.submit, valid);

    expect(
      await codeOf(() =>
        as(t, customer.clerkId).query(api.enquiries.listForAdmin, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});
