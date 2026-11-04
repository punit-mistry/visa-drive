import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { as, codeOf, makeUser, newTest } from "./harness";

describe("harness", () => {
  test("a signed-out caller has no profile", async () => {
    const t = newTest();
    expect(await t.query(api.users.current, {})).toBeNull();
  });

  test("a seeded customer resolves through the real auth helper", async () => {
    const t = newTest();
    const customer = await makeUser(t, { role: "customer" });
    const me = await as(t, customer.clerkId).query(api.users.current, {});
    expect(me?.role).toBe("customer");
    expect(me?.permissions).toEqual([]);
  });

  test("an unauthenticated caller is rejected, not ignored", async () => {
    const t = newTest();
    expect(await codeOf(() => t.query(api.applications.listMyDrafts, {}))).toBe(
      "UNAUTHENTICATED",
    );
  });
});
