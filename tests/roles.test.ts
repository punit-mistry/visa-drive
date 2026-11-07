/**
 * The role matrix.
 *
 * Every staff role is signed in for real and pointed at one representative
 * endpoint per permission. The expectation is derived from `ROLE_PERMISSIONS`,
 * so this suite does not re-assert the permission table — it asserts that each
 * endpoint is wired to the permission the table says it needs. An endpoint
 * that checks the wrong permission, or forgets to check one, fails here.
 *
 * A separate block at the bottom pins the table itself, so a permission that
 * quietly widens a role's reach has to be a deliberate edit to this file.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  USER_ROLES,
  hasPermission,
  isStaffRole,
  type Permission,
  type UserRole,
} from "../lib/constants/roles";
import {
  as,
  errorCode,
  makeApplication,
  makeCatalogue,
  makeUser,
  newTest,
  type CatalogueFixture,
  type T,
  type UserFixture,
} from "./harness";

/** A world with one of everything a probe might need to touch. */
interface World {
  t: T;
  customer: UserFixture;
  otherStaff: UserFixture;
  catalogue: CatalogueFixture;
  applicationId: Id<"applications">;
  documentId: Id<"documents">;
  paymentId: Id<"payments">;
  conversationId: Id<"conversations">;
  enquiryId: Id<"enquiries">;
}

async function buildWorld(): Promise<World> {
  const t = newTest();
  const customer = await makeUser(t, { role: "customer" });
  const otherStaff = await makeUser(t, { role: "visa_agent" });
  const catalogue = await makeCatalogue(t);
  const applicationId = await makeApplication(t, {
    owner: customer,
    catalogue,
    status: "submitted",
  });

  const now = Date.now();
  const { documentId, paymentId, conversationId, enquiryId } = await t.run(
    async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["pdf"]));
      const documentId = await ctx.db.insert("documents", {
        applicationId,
        userId: customer.id,
        storageId,
        documentKey: "passport_front",
        label: "Passport",
        fileName: "passport.pdf",
        mimeType: "application/pdf",
        size: 3,
        status: "pending_review",
        version: 1,
        isCurrent: true,
        createdAt: now,
      });

      const paymentId = await ctx.db.insert("payments", {
        applicationId,
        userId: customer.id,
        receiptNumber: "VD-R-TEST01",
        amount: 100_000,
        currency: "INR",
        mode: "cash",
        status: "paid",
        paidAt: now,
        refundedAmount: 0,
        createdAt: now,
        updatedAt: now,
      });

      const conversationId = await ctx.db.insert("conversations", {
        userId: customer.id,
        applicationId,
        subject: "Question about my visa",
        customerName: "Test Customer",
        customerEmail: customer.email,
        status: "open",
        priority: "normal",
        channel: "portal",
        unreadForStaff: 1,
        unreadForCustomer: 0,
        messageCount: 0,
        lastMessageAt: now,
        createdAt: now,
      });

      const enquiryId = await ctx.db.insert("enquiries", {
        referenceId: "VD-E-TEST01",
        fullName: "Walk-in Lead",
        email: "lead@example.test",
        phone: "+919820000000",
        subject: "Visa enquiry",
        source: "website_form",
        message: "Please call me",
        leadStatus: "new",
        contactAttempts: 0,
        createdAt: now,
        updatedAt: now,
      });

      return { documentId, paymentId, conversationId, enquiryId };
    },
  );

  return {
    t,
    customer,
    otherStaff,
    catalogue,
    applicationId,
    documentId,
    paymentId,
    conversationId,
    enquiryId,
  };
}

type Probe = {
  permission: Permission | "staff";
  run: (world: World, caller: ReturnType<typeof as>) => Promise<unknown>;
};

/**
 * One call per permission. Each is a *valid* request, so the only reason it
 * can come back FORBIDDEN is authorisation.
 */
const PROBES: Record<string, Probe> = {
  "applications.listForAdmin": {
    permission: PERMISSIONS.APPLICATION_VIEW_ALL,
    run: (_w, caller) =>
      caller.query(api.applications.listForAdmin, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
  },
  "applications.updateStatus": {
    permission: PERMISSIONS.APPLICATION_UPDATE_STATUS,
    run: (w, caller) =>
      caller.mutation(api.applications.updateStatus, {
        applicationId: w.applicationId,
        status: "under_review",
      }),
  },
  "applications.assignAgent": {
    permission: PERMISSIONS.APPLICATION_ASSIGN,
    run: (w, caller) =>
      caller.mutation(api.applications.assignAgent, {
        applicationId: w.applicationId,
        agentId: w.otherStaff.id,
      }),
  },
  "applications.bulkUpdateStatus": {
    permission: PERMISSIONS.APPLICATION_BULK_UPDATE,
    run: (w, caller) =>
      caller.mutation(api.applications.bulkUpdateStatus, {
        applicationIds: [w.applicationId],
        status: "under_review",
      }),
  },
  "applications.uploadFinalDocument": {
    permission: PERMISSIONS.APPLICATION_UPLOAD_FINAL,
    run: async (w, caller) => {
      const storageId = await w.t.run((ctx) => ctx.storage.store(new Blob(["visa"])));
      return caller.mutation(api.applications.uploadFinalDocument, {
        applicationId: w.applicationId,
        storageId,
        fileName: "visa.pdf",
      });
    },
  },
  "documents.listForAdmin": {
    permission: PERMISSIONS.DOCUMENT_VIEW,
    run: (_w, caller) =>
      caller.query(api.documents.listForAdmin, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
  },
  "documents.review": {
    permission: PERMISSIONS.DOCUMENT_REVIEW,
    run: (w, caller) =>
      caller.mutation(api.documents.review, {
        documentId: w.documentId,
        status: "approved",
      }),
  },
  "documentRequests.create": {
    permission: PERMISSIONS.DOCUMENT_REQUEST,
    run: (w, caller) =>
      caller.mutation(api.documentRequests.create, {
        applicationId: w.applicationId,
        documentKey: "bank_statement",
        label: "Bank statement",
        reason: "We need six months of statements.",
      }),
  },
  "users.listCustomers": {
    permission: PERMISSIONS.CUSTOMER_VIEW,
    run: (_w, caller) =>
      caller.query(api.users.listCustomers, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
  },
  "users.suspendCustomer": {
    permission: PERMISSIONS.CUSTOMER_SUSPEND,
    run: (w, caller) =>
      caller.mutation(api.users.suspendCustomer, {
        userId: w.customer.id,
        reason: "probe",
      }),
  },
  "users.listStaff": {
    permission: PERMISSIONS.STAFF_VIEW,
    run: (_w, caller) => caller.query(api.users.listStaff, {}),
  },
  "users.inviteStaff": {
    permission: PERMISSIONS.STAFF_MANAGE,
    run: (_w, caller) =>
      caller.mutation(api.users.inviteStaff, {
        email: `probe.${Math.random().toString(36).slice(2, 8)}@example.test`,
        fullName: "Probe Invitee",
        role: "support_agent",
      }),
  },
  "users.setRole": {
    permission: PERMISSIONS.ROLE_ASSIGN,
    run: (w, caller) =>
      caller.mutation(api.users.setRole, {
        userId: w.customer.id,
        role: "support_agent",
      }),
  },
  "payments.listForAdmin": {
    permission: PERMISSIONS.PAYMENT_VIEW,
    run: (_w, caller) =>
      caller.query(api.payments.listForAdmin, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
  },
  "payments.recordManualPayment": {
    permission: PERMISSIONS.PAYMENT_RECORD,
    run: (w, caller) =>
      caller.mutation(api.payments.recordManualPayment, {
        applicationId: w.applicationId,
        amount: 50_000,
        mode: "cash",
      }),
  },
  "payments.recordRefund": {
    permission: PERMISSIONS.PAYMENT_REFUND,
    run: (w, caller) =>
      caller.mutation(api.payments.recordRefund, {
        paymentId: w.paymentId,
        amount: 10_000,
      }),
  },
  "enquiries.listForAdmin": {
    permission: PERMISSIONS.ENQUIRY_VIEW,
    run: (_w, caller) =>
      caller.query(api.enquiries.listForAdmin, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
  },
  "enquiries.updateLeadStatus": {
    permission: PERMISSIONS.ENQUIRY_MANAGE,
    run: (w, caller) =>
      caller.mutation(api.enquiries.updateLeadStatus, {
        enquiryId: w.enquiryId,
        leadStatus: "contacted",
      }),
  },
  "enquiries.assign": {
    permission: PERMISSIONS.ENQUIRY_ASSIGN,
    run: (w, caller) =>
      caller.mutation(api.enquiries.assign, {
        enquiryId: w.enquiryId,
        assignedTo: w.otherStaff.id,
      }),
  },
  "destinations.listAll": {
    permission: PERMISSIONS.CATALOGUE_VIEW,
    run: (_w, caller) => caller.query(api.destinations.listAll, {}),
  },
  "visaProducts.create": {
    permission: PERMISSIONS.CATALOGUE_EDIT,
    run: (w, caller) =>
      caller.mutation(api.visaProducts.create, {
        destinationId: w.catalogue.destinationId,
        name: `Probe product ${Math.random().toString(36).slice(2, 7)}`,
        category: "tourist",
        visaType: "e-Visa",
        shortDescription: "Probe",
        governmentFee: 1_000,
        serviceFee: 1_000,
      }),
  },
  "visaProducts.setPublished": {
    permission: PERMISSIONS.CATALOGUE_PUBLISH,
    run: (w, caller) =>
      caller.mutation(api.visaProducts.setPublished, {
        visaProductId: w.catalogue.productId,
        isPublished: false,
      }),
  },
  "destinations.remove": {
    permission: PERMISSIONS.CATALOGUE_DELETE,
    run: (w, caller) =>
      caller.mutation(api.destinations.remove, {
        destinationId: w.catalogue.destinationId,
      }),
  },
  "conversations.listForAdmin": {
    permission: PERMISSIONS.CONVERSATION_VIEW_ALL,
    run: (_w, caller) =>
      caller.query(api.conversations.listForAdmin, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
  },
  "messages.sendInternalNote": {
    permission: PERMISSIONS.CONVERSATION_INTERNAL_NOTE,
    run: (w, caller) =>
      caller.mutation(api.messages.sendInternalNote, {
        conversationId: w.conversationId,
        body: "Internal probe",
      }),
  },
  "conversations.assign": {
    permission: PERMISSIONS.CONVERSATION_ASSIGN,
    run: (w, caller) =>
      caller.mutation(api.conversations.assign, {
        conversationId: w.conversationId,
        assignedTo: w.otherStaff.id,
      }),
  },
  "appSettings.getAll": {
    permission: PERMISSIONS.SETTINGS_VIEW,
    run: (_w, caller) => caller.query(api.appSettings.getAll, {}),
  },
  "appSettings.set": {
    permission: PERMISSIONS.SETTINGS_EDIT,
    run: (_w, caller) =>
      caller.mutation(api.appSettings.set, {
        key: "company.name",
        value: "VisaDrive",
      }),
  },
  "auditLogs.listForAdmin": {
    permission: PERMISSIONS.AUDIT_LOG_VIEW,
    run: (_w, caller) =>
      caller.query(api.auditLogs.listForAdmin, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
  },
  "analytics.overviewKpis": {
    permission: PERMISSIONS.ANALYTICS_VIEW,
    run: (_w, caller) => caller.query(api.analytics.overviewKpis, {}),
  },
  "seed.status": {
    permission: PERMISSIONS.SEED_RUN,
    run: (_w, caller) => caller.query(api.seed.status, {}),
  },
  "internalNotes.listForEntity": {
    permission: "staff",
    run: (w, caller) =>
      caller.query(api.internalNotes.listForEntity, {
        entityType: "application",
        entityId: w.applicationId,
      }),
  },
  "admin.pendingWorkQueue": {
    permission: "staff",
    run: (_w, caller) => caller.query(api.admin.pendingWorkQueue, {}),
  },
};

/** "allowed" unless the call came back with an authorisation refusal. */
async function attempt(
  world: World,
  caller: ReturnType<typeof as>,
  probe: Probe,
): Promise<"allowed" | "FORBIDDEN"> {
  try {
    await probe.run(world, caller);
    return "allowed";
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    // A malformed probe would otherwise read as "allowed" and hide a hole.
    if (/Validator error|ArgumentValidationError|Could not find public function/.test(message)) {
      throw error;
    }
    return errorCode(error) === "FORBIDDEN" ? "FORBIDDEN" : "allowed";
  }
}

function expectedFor(role: UserRole, probe: Probe): "allowed" | "FORBIDDEN" {
  if (probe.permission === "staff") {
    // "Not a customer" used to be the same thing as "staff". It is not any
    // more: a B2B partner is a third kind of principal, authorised against
    // the `partners` table and refused by `requireStaff` exactly as a
    // customer is.
    return isStaffRole(role) ? "allowed" : "FORBIDDEN";
  }
  return hasPermission(role, probe.permission) ? "allowed" : "FORBIDDEN";
}

describe.each(USER_ROLES)("role: %s", (role) => {
  let world: World;

  beforeEach(async () => {
    world = await buildWorld();
  });

  test.each(Object.entries(PROBES))(
    `%s matches the permission table`,
    async (name, probe) => {
      const actor = await makeUser(world.t, { role });
      const caller = as(world.t, actor.clerkId);
      expect({ [name]: await attempt(world, caller, probe) }).toEqual({
        [name]: expectedFor(role, probe),
      });
    },
  );
});

describe("the permission table itself", () => {
  test("a customer holds no staff permissions at all", () => {
    expect(ROLE_PERMISSIONS.customer).toEqual([]);
  });

  test("support agents stay read-only on applications and money", () => {
    const support = new Set<string>(ROLE_PERMISSIONS.support_agent);
    expect(support.has(PERMISSIONS.APPLICATION_UPDATE_STATUS)).toBe(false);
    expect(support.has(PERMISSIONS.APPLICATION_ASSIGN)).toBe(false);
    expect(support.has(PERMISSIONS.PAYMENT_VIEW)).toBe(false);
    expect(support.has(PERMISSIONS.PAYMENT_RECORD)).toBe(false);
    expect(support.has(PERMISSIONS.DOCUMENT_DOWNLOAD)).toBe(false);
    expect(support.has(PERMISSIONS.STAFF_VIEW)).toBe(false);
  });

  test("visa agents cannot assign work, move money or touch the catalogue", () => {
    const agent = new Set<string>(ROLE_PERMISSIONS.visa_agent);
    expect(agent.has(PERMISSIONS.APPLICATION_UPDATE_STATUS)).toBe(true);
    expect(agent.has(PERMISSIONS.DOCUMENT_REVIEW)).toBe(true);
    expect(agent.has(PERMISSIONS.APPLICATION_ASSIGN)).toBe(false);
    expect(agent.has(PERMISSIONS.PAYMENT_RECORD)).toBe(false);
    expect(agent.has(PERMISSIONS.CATALOGUE_EDIT)).toBe(false);
    expect(agent.has(PERMISSIONS.CUSTOMER_EDIT)).toBe(false);
  });

  test("managers cannot delete, refund, manage staff or edit settings", () => {
    const manager = new Set<string>(ROLE_PERMISSIONS.manager);
    expect(manager.has(PERMISSIONS.APPLICATION_DELETE)).toBe(false);
    expect(manager.has(PERMISSIONS.PAYMENT_REFUND)).toBe(false);
    expect(manager.has(PERMISSIONS.STAFF_MANAGE)).toBe(false);
    expect(manager.has(PERMISSIONS.SETTINGS_EDIT)).toBe(false);
    expect(manager.has(PERMISSIONS.AUDIT_LOG_VIEW)).toBe(false);
    expect(manager.has(PERMISSIONS.CUSTOMER_SUSPEND)).toBe(false);
  });

  test("only a super admin may assign roles", () => {
    for (const role of USER_ROLES) {
      expect(hasPermission(role, PERMISSIONS.ROLE_ASSIGN)).toBe(
        role === "super_admin",
      );
    }
  });

  test("each role is a superset of the one below it", () => {
    const ladder: UserRole[] = [
      "support_agent",
      "visa_agent",
      "manager",
      "admin",
      "super_admin",
    ];
    for (let i = 1; i < ladder.length; i += 1) {
      const lower = new Set<string>(ROLE_PERMISSIONS[ladder[i - 1]]);
      const higher = new Set<string>(ROLE_PERMISSIONS[ladder[i]]);
      for (const permission of lower) {
        expect({ role: ladder[i], permission, held: higher.has(permission) }).toEqual({
          role: ladder[i],
          permission,
          held: true,
        });
      }
    }
  });

  test("every declared permission is reachable by somebody", () => {
    const granted = new Set<string>(
      USER_ROLES.flatMap((role) => ROLE_PERMISSIONS[role]),
    );
    for (const permission of Object.values(PERMISSIONS)) {
      expect({ permission, granted: granted.has(permission) }).toEqual({
        permission,
        granted: true,
      });
    }
  });
});
