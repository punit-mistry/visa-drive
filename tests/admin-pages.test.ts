/**
 * Every staff role can open every CRM page it is offered.
 *
 * `useQuery` has no error channel: a refused query throws during render and
 * takes the route down. So a page that issues a query the signed-in role does
 * not hold is not a missing feature, it is a crash — which is exactly what a
 * support agent used to get on the `/admin` landing page, because the KPI
 * block asked for analytics data their role has never had.
 *
 * These tests call the queries each page issues *without* a permission guard.
 * If a page starts issuing one unguarded that some staff role cannot make,
 * this suite fails before a colleague finds it.
 */
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { STAFF_ROLES } from "../lib/constants/roles";
import { as, codeOf, makeCatalogue, makeUser, newTest, type T } from "./harness";

/** The unguarded query behind each CRM route. */
const PAGE_QUERIES: Record<string, (t: T, clerkId: string) => Promise<unknown>> = {
  "/admin": (t, clerkId) =>
    as(t, clerkId).query(api.admin.pendingWorkQueue, { limit: 6 }),
  "/admin (global search)": (t, clerkId) =>
    as(t, clerkId).query(api.admin.globalSearch, { query: "VD" }),
  "/admin/applications": (t, clerkId) =>
    as(t, clerkId).query(api.applications.listForAdmin, {
      paginationOpts: { numItems: 25, cursor: null },
    }),
  "/admin/customers": (t, clerkId) =>
    as(t, clerkId).query(api.users.listCustomers, {
      paginationOpts: { numItems: 25, cursor: null },
    }),
  "/admin/conversations": (t, clerkId) =>
    as(t, clerkId).query(api.conversations.listForAdmin, {
      paginationOpts: { numItems: 25, cursor: null },
    }),
  "/admin/enquiries": (t, clerkId) =>
    as(t, clerkId).query(api.enquiries.listForAdmin, {
      paginationOpts: { numItems: 25, cursor: null },
    }),
  "/admin/catalogue (destinations)": (t, clerkId) =>
    as(t, clerkId).query(api.destinations.listAll, {}),
  "/admin/catalogue (products)": (t, clerkId) =>
    as(t, clerkId).query(api.visaProducts.listAll, {}),
};

describe.each(STAFF_ROLES)("a %s opening the CRM", (role) => {
  test.each(Object.entries(PAGE_QUERIES))(
    "%s loads without a refusal",
    async (page, run) => {
      const t = newTest();
      await makeCatalogue(t);
      const actor = await makeUser(t, { role });

      expect({ page, code: await codeOf(() => run(t, actor.clerkId)) }).toEqual({
        page,
        code: null,
      });
    },
  );
});

describe("the pages that are genuinely role-limited", () => {
  // These four ARE refused for some roles, which is correct — and is why the
  // pages behind them skip the query and render a "no access" panel instead of
  // issuing it. The refusal is asserted here so the panels stay justified.
  test("a support agent is refused analytics, payments, settings and the audit log", async () => {
    const t = newTest();
    const support = await makeUser(t, { role: "support_agent" });
    const signedIn = as(t, support.clerkId);

    expect(
      await codeOf(() => signedIn.query(api.admin.dashboardSummary, { rangeDays: 30 })),
    ).toBe("FORBIDDEN");
    expect(await codeOf(() => signedIn.query(api.analytics.overviewKpis, {}))).toBe(
      "FORBIDDEN",
    );
    expect(await codeOf(() => signedIn.query(api.payments.financeSummary, {}))).toBe(
      "FORBIDDEN",
    );
    expect(await codeOf(() => signedIn.query(api.appSettings.getAll, {}))).toBe(
      "FORBIDDEN",
    );
    expect(
      await codeOf(() =>
        signedIn.query(api.auditLogs.listForAdmin, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("a manager is refused only the audit log", async () => {
    const t = newTest();
    const manager = await makeUser(t, { role: "manager" });
    const signedIn = as(t, manager.clerkId);

    expect(
      await codeOf(() => signedIn.query(api.admin.dashboardSummary, { rangeDays: 30 })),
    ).toBeNull();
    expect(await codeOf(() => signedIn.query(api.payments.financeSummary, {}))).toBeNull();
    expect(await codeOf(() => signedIn.query(api.appSettings.getAll, {}))).toBeNull();
    expect(
      await codeOf(() =>
        signedIn.query(api.auditLogs.listForAdmin, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  test("an admin can open every CRM page", async () => {
    const t = newTest();
    await makeCatalogue(t);
    const admin = await makeUser(t, { role: "admin" });
    const signedIn = as(t, admin.clerkId);

    for (const run of Object.values(PAGE_QUERIES)) {
      expect(await codeOf(() => run(t, admin.clerkId))).toBeNull();
    }
    expect(
      await codeOf(() => signedIn.query(api.admin.dashboardSummary, { rangeDays: 30 })),
    ).toBeNull();
    expect(await codeOf(() => signedIn.query(api.users.listStaff, {}))).toBeNull();
    expect(
      await codeOf(() =>
        signedIn.query(api.auditLogs.listForAdmin, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
      ),
    ).toBeNull();
  });

  test("a customer gets nowhere near any of it", async () => {
    const t = newTest();
    const customer = await makeUser(t);

    for (const [page, run] of Object.entries(PAGE_QUERIES)) {
      expect({ page, code: await codeOf(() => run(t, customer.clerkId)) }).toEqual({
        page,
        code: "FORBIDDEN",
      });
    }
  });
});
