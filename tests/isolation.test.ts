/**
 * Data isolation: documents, conversations and payments.
 *
 * The rules this exercises are the ones in CLAUDE.md that have a customer's
 * passport scan behind them:
 *   • a storage URL is only ever minted after `requireDocumentAccess`;
 *   • an internal staff note never reaches a customer;
 *   • money only moves through the audited paths, with the server's own total.
 */
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  as,
  codeOf,
  makeApplication,
  makeCatalogue,
  makeUser,
  newTest,
  type T,
  type UserFixture,
} from "./harness";

async function seedDocument(
  t: T,
  owner: UserFixture,
  applicationId: Id<"applications">,
): Promise<Id<"documents">> {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["passport bytes"]));
    return await ctx.db.insert("documents", {
      applicationId,
      userId: owner.id,
      storageId,
      documentKey: "passport_front",
      label: "Passport",
      fileName: "passport.pdf",
      mimeType: "application/pdf",
      size: 14,
      status: "pending_review",
      version: 1,
      isCurrent: true,
      createdAt: Date.now(),
    });
  });
}

describe("documents are private", () => {
  test("the owner can mint a signed URL for their own file", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner, catalogue: cat });
    const documentId = await seedDocument(t, owner, applicationId);

    const url = await as(t, owner.clerkId).query(api.documents.getSignedUrl, {
      documentId,
    });
    expect(typeof url).toBe("string");
  });

  test("another customer gets nothing, not even a URL", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const stranger = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner, catalogue: cat });
    const documentId = await seedDocument(t, owner, applicationId);

    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).query(api.documents.getSignedUrl, { documentId }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a signed-out caller gets nothing", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner, catalogue: cat });
    const documentId = await seedDocument(t, owner, applicationId);

    expect(
      await codeOf(() => t.query(api.documents.getSignedUrl, { documentId })),
    ).toBe("UNAUTHENTICATED");
  });

  test("a deactivated staff member cannot reach a customer's file", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const agent = await makeUser(t, { role: "visa_agent", profileActive: false });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner, catalogue: cat });
    const documentId = await seedDocument(t, owner, applicationId);

    expect(
      await codeOf(() =>
        as(t, agent.clerkId).query(api.documents.getSignedUrl, { documentId }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a staff member without document:view cannot reach a file", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const agent = await makeUser(t, {
      role: "visa_agent",
      revokedPermissions: ["document:view"],
    });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner, catalogue: cat });
    const documentId = await seedDocument(t, owner, applicationId);

    expect(
      await codeOf(() =>
        as(t, agent.clerkId).query(api.documents.getSignedUrl, { documentId }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a customer cannot attach a file to someone else's application", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const stranger = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner,
      catalogue: cat,
      status: "draft",
    });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));

    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).mutation(api.documents.attach, {
          applicationId,
          storageId,
          documentKey: "passport_front",
          fileName: "mine.pdf",
          mimeType: "application/pdf",
          size: 1,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a customer cannot request an upload URL for someone else's application", async () => {
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
        as(t, stranger.clerkId).mutation(api.documents.generateUploadUrl, {
          applicationId,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a customer cannot delete a document once the application is submitted", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner,
      catalogue: cat,
      status: "submitted",
    });
    const documentId = await seedDocument(t, owner, applicationId);

    expect(
      await codeOf(() =>
        as(t, owner.clerkId).mutation(api.documents.remove, { documentId }),
      ),
    ).toBe("FORBIDDEN");
    expect(await t.run((ctx) => ctx.db.get(documentId))).not.toBeNull();
  });

  test("a customer may delete their own document while still drafting", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner,
      catalogue: cat,
      status: "draft",
    });
    const documentId = await seedDocument(t, owner, applicationId);

    await as(t, owner.clerkId).mutation(api.documents.remove, { documentId });
    expect(await t.run((ctx) => ctx.db.get(documentId))).toBeNull();
  });

  test("a stranger cannot delete someone else's draft document", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const stranger = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, {
      owner,
      catalogue: cat,
      status: "draft",
    });
    const documentId = await seedDocument(t, owner, applicationId);

    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).mutation(api.documents.remove, { documentId }),
      ),
    ).toBe("FORBIDDEN");
    expect(await t.run((ctx) => ctx.db.get(documentId))).not.toBeNull();
  });
});

describe("conversations and internal notes", () => {
  async function thread(t: T, owner: UserFixture) {
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner, catalogue: cat });
    const { conversationId } = await as(t, owner.clerkId).mutation(
      api.conversations.createForApplication,
      {
        applicationId,
        subject: "Question about my visa",
        message: "When is my appointment?",
      },
    );
    return { applicationId, conversationId };
  }

  test("an internal note is invisible to the customer but visible to staff", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const agent = await makeUser(t, { role: "support_agent" });
    const { conversationId } = await thread(t, owner);

    await as(t, agent.clerkId).mutation(api.messages.sendInternalNote, {
      conversationId,
      body: "Customer has a prior rejection — handle carefully.",
    });

    const customerView = await as(t, owner.clerkId).query(
      api.messages.listByConversation,
      { conversationId },
    );
    expect(customerView.every((m) => m.isInternal === false)).toBe(true);
    expect(
      customerView.some((m) => m.body.includes("prior rejection")),
    ).toBe(false);

    const staffView = await as(t, agent.clerkId).query(
      api.messages.listByConversation,
      { conversationId },
    );
    expect(staffView.some((m) => m.isInternal === true)).toBe(true);
  });

  test("a customer cannot post an internal note", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const { conversationId } = await thread(t, owner);

    expect(
      await codeOf(() =>
        as(t, owner.clerkId).mutation(api.messages.sendInternalNote, {
          conversationId,
          body: "Let me in",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("another customer cannot read or post in a thread", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const stranger = await makeUser(t);
    const { conversationId } = await thread(t, owner);

    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).query(api.messages.listByConversation, {
          conversationId,
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).mutation(api.messages.send, {
          conversationId,
          body: "Hello?",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("seeing every thread is not the same as being able to reply in one", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const readOnly = await makeUser(t, {
      role: "support_agent",
      revokedPermissions: ["conversation:reply"],
    });
    const { conversationId } = await thread(t, owner);

    // Reading is still fine...
    expect(
      await codeOf(() =>
        as(t, readOnly.clerkId).query(api.messages.listByConversation, {
          conversationId,
        }),
      ),
    ).toBeNull();
    // ...replying is not.
    expect(
      await codeOf(() =>
        as(t, readOnly.clerkId).mutation(api.messages.send, {
          conversationId,
          body: "Hi there",
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});

describe("money never comes from the client", () => {
  test("a customer cannot record a payment against their own application", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner, catalogue: cat });

    expect(
      await codeOf(() =>
        as(t, owner.clerkId).mutation(api.payments.recordManualPayment, {
          applicationId,
          amount: 1,
          mode: "cash",
        }),
      ),
    ).toBe("FORBIDDEN");

    expect((await t.run((ctx) => ctx.db.get(applicationId)))?.paymentStatus).toBe(
      "unpaid",
    );
  });

  test("a Razorpay payment cannot be typed in by hand", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const admin = await makeUser(t, { role: "admin" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner, catalogue: cat });

    expect(
      await codeOf(() =>
        as(t, admin.clerkId).mutation(api.payments.recordManualPayment, {
          applicationId,
          amount: 885_000,
          mode: "razorpay",
        }),
      ),
    ).toBe("INVALID_MODE");
  });

  test("a manual payment must be a positive integer number of paise", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const admin = await makeUser(t, { role: "admin" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner, catalogue: cat });
    const signedIn = as(t, admin.clerkId);

    for (const amount of [0, -100, 12.5]) {
      expect(
        await codeOf(() =>
          signedIn.mutation(api.payments.recordManualPayment, {
            applicationId,
            amount,
            mode: "cash",
          }),
        ),
      ).toBe("INVALID_AMOUNT");
    }
  });

  test("a manual payment rolls the application up to paid and is audited", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const admin = await makeUser(t, { role: "admin" });
    const cat = await makeCatalogue(t, {
      governmentFee: 500_000,
      serviceFee: 250_000,
      taxPercent: 18,
    });
    const applicationId = await makeApplication(t, { owner, catalogue: cat });

    await as(t, admin.clerkId).mutation(api.payments.recordManualPayment, {
      applicationId,
      amount: 885_000,
      mode: "cash",
    });

    expect((await t.run((ctx) => ctx.db.get(applicationId)))?.paymentStatus).toBe(
      "paid",
    );
    const audits = await t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(audits.some((a) => a.action === "payment.recorded")).toBe(true);
  });

  test("a refund cannot exceed what was taken", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const admin = await makeUser(t, { role: "admin" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner, catalogue: cat });
    const signedIn = as(t, admin.clerkId);

    const { paymentId } = await signedIn.mutation(api.payments.recordManualPayment, {
      applicationId,
      amount: 100_000,
      mode: "cash",
    });

    expect(
      await codeOf(() =>
        signedIn.mutation(api.payments.recordRefund, { paymentId, amount: 100_001 }),
      ),
    ).toBe("REFUND_TOO_LARGE");

    await signedIn.mutation(api.payments.recordRefund, { paymentId, amount: 40_000 });
    expect(
      await codeOf(() =>
        signedIn.mutation(api.payments.recordRefund, { paymentId, amount: 60_001 }),
      ),
    ).toBe("REFUND_TOO_LARGE");

    await signedIn.mutation(api.payments.recordRefund, { paymentId, amount: 60_000 });
    const payment = await t.run((ctx) => ctx.db.get(paymentId));
    expect(payment?.refundedAmount).toBe(100_000);
    expect(payment?.status).toBe("refunded");
  });

  test("a customer only ever sees their own payments", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const stranger = await makeUser(t);
    const admin = await makeUser(t, { role: "admin" });
    const cat = await makeCatalogue(t);
    const ownersApp = await makeApplication(t, { owner, catalogue: cat });

    await as(t, admin.clerkId).mutation(api.payments.recordManualPayment, {
      applicationId: ownersApp,
      amount: 10_000,
      mode: "cash",
    });

    expect(await as(t, owner.clerkId).query(api.payments.listMine, {})).toHaveLength(1);
    expect(await as(t, stranger.clerkId).query(api.payments.listMine, {})).toHaveLength(0);
    expect(
      await codeOf(() =>
        as(t, stranger.clerkId).query(api.payments.listMine, {
          applicationId: ownersApp,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("staff cannot start a checkout on a customer's behalf", async () => {
    const t = newTest();
    const owner = await makeUser(t);
    const admin = await makeUser(t, { role: "admin" });
    const cat = await makeCatalogue(t);
    const applicationId = await makeApplication(t, { owner, catalogue: cat });

    expect(
      await codeOf(() =>
        as(t, admin.clerkId).mutation(internal.payments.prepareOrderInternal, {
          applicationId,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("every function that can credit or clear money is internal-only", async () => {
    // A client can only call a function registered as public. These four are
    // the whole set that can move an application to paid or failed, so each
    // one being `internal*` is what stops "mark me paid" from being a single
    // request from the browser.
    const payments = await import("../convex/payments");
    for (const name of [
      "markPaidInternal",
      "markFailedInternal",
      "prepareOrderInternal",
      "attachOrderInternal",
      "handleWebhookEvent",
    ] as const) {
      const fn = payments[name] as unknown as {
        isPublic?: boolean;
        isInternal?: boolean;
      };
      expect({ name, isPublic: fn.isPublic === true }).toEqual({
        name,
        isPublic: false,
      });
      expect({ name, isInternal: fn.isInternal === true }).toEqual({
        name,
        isInternal: true,
      });
    }
  });

  test("the Clerk bridge mutations are internal-only too", async () => {
    const users = await import("../convex/users");
    for (const name of ["upsertFromClerk", "deleteFromClerk"] as const) {
      const fn = users[name] as unknown as { isInternal?: boolean };
      expect({ name, isInternal: fn.isInternal === true }).toEqual({
        name,
        isInternal: true,
      });
    }
  });
});

describe("the seed is not an open door", () => {
  test("a customer cannot seed or reset a populated deployment", async () => {
    const t = newTest();
    const customer = await makeUser(t);

    expect(
      await codeOf(() => as(t, customer.clerkId).mutation(api.seed.run, {})),
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(() => as(t, customer.clerkId).mutation(api.seed.reset, {})),
    ).toBe("FORBIDDEN");
  });

  test("a manager cannot reset the deployment either", async () => {
    const t = newTest();
    const manager = await makeUser(t, { role: "manager" });

    expect(
      await codeOf(() => as(t, manager.clerkId).mutation(api.seed.reset, {})),
    ).toBe("FORBIDDEN");
  });

  test("a signed-out caller cannot wipe a populated deployment", async () => {
    const t = newTest();
    await makeUser(t, { role: "super_admin" });

    expect(await codeOf(() => t.mutation(api.seed.reset, {}))).toBe(
      "UNAUTHENTICATED",
    );
  });
});
