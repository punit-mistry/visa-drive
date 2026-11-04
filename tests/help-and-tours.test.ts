/**
 * The guided tour's persistence and the help assistant's handover.
 *
 * The tour writes to the user row, so it is worth proving it can only ever
 * write to *your own* row, that it cannot be used to grow an unbounded array
 * on a hot document, and that the assistant's "send this to a human" path
 * files a real, attributable enquiry rather than quietly dropping the
 * question.
 *
 * The answer matcher is pure, so it is tested directly: the behaviour that
 * matters is that it returns nothing rather than something wrong.
 */
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { searchHelp, suggestedQuestions, HELP_ENTRIES } from "../lib/constants/help";
import { CUSTOMER_TOUR, STAFF_TOUR, tourKey } from "../lib/constants/tours";
import { as, codeOf, makeUser, newTest } from "./harness";

describe("tour progress", () => {
  test("a signed-in user can record and replay a tour", async () => {
    const t = newTest();
    const user = await makeUser(t);
    const signedIn = as(t, user.clerkId);

    await signedIn.mutation(api.users.markTourSeen, { tourId: "customer-portal@1" });
    expect((await signedIn.query(api.users.current))?.dismissedTours).toEqual([
      "customer-portal@1",
    ]);

    // Marking the same tour twice must not duplicate it.
    await signedIn.mutation(api.users.markTourSeen, { tourId: "customer-portal@1" });
    expect((await signedIn.query(api.users.current))?.dismissedTours).toEqual([
      "customer-portal@1",
    ]);

    await signedIn.mutation(api.users.resetTour, { tourId: "customer-portal@1" });
    expect((await signedIn.query(api.users.current))?.dismissedTours).toEqual([]);
  });

  test("it only ever writes to the caller's own row", async () => {
    const t = newTest();
    const mine = await makeUser(t);
    const theirs = await makeUser(t);

    await as(t, mine.clerkId).mutation(api.users.markTourSeen, { tourId: "staff-crm@1" });

    const other = await as(t, theirs.clerkId).query(api.users.current);
    expect(other?.dismissedTours ?? []).toEqual([]);
  });

  test("a signed-out caller is refused", async () => {
    const t = newTest();
    expect(
      await codeOf(() => t.mutation(api.users.markTourSeen, { tourId: "staff-crm@1" })),
    ).toBe("UNAUTHENTICATED");
  });

  test("the stored list cannot grow without bound", async () => {
    const t = newTest();
    const user = await makeUser(t);
    const signedIn = as(t, user.clerkId);

    for (let i = 0; i < 30; i += 1) {
      await signedIn.mutation(api.users.markTourSeen, { tourId: `tour-${i}` });
    }

    const seen = (await signedIn.query(api.users.current))?.dismissedTours ?? [];
    expect(seen.length).toBe(20);
    // Newest kept, oldest evicted.
    expect(seen.at(-1)).toBe("tour-29");
    expect(seen).not.toContain("tour-0");
  });

  test("an overlong id is truncated rather than rejected", async () => {
    const t = newTest();
    const user = await makeUser(t);
    const signedIn = as(t, user.clerkId);

    await signedIn.mutation(api.users.markTourSeen, { tourId: "x".repeat(200) });
    const seen = (await signedIn.query(api.users.current))?.dismissedTours ?? [];
    expect(seen[0]?.length).toBe(40);
  });

  test("a blank id is ignored", async () => {
    const t = newTest();
    const user = await makeUser(t);
    const signedIn = as(t, user.clerkId);

    await signedIn.mutation(api.users.markTourSeen, { tourId: "   " });
    expect((await signedIn.query(api.users.current))?.dismissedTours ?? []).toEqual([]);
  });
});

describe("the tours themselves", () => {
  test("every tour has a stable, versioned key and at least one anchorless step", () => {
    for (const tour of [CUSTOMER_TOUR, STAFF_TOUR]) {
      expect(tourKey(tour)).toBe(`${tour.id}@${tour.version}`);
      expect(tour.steps.length).toBeGreaterThan(2);
      // The opening step must not depend on an anchor, or a tour could resolve
      // to zero visible steps for a role and silently never run.
      expect(tour.steps[0]?.anchor).toBeUndefined();
    }
  });

  test("the two tours do not share an id", () => {
    expect(CUSTOMER_TOUR.id).not.toBe(STAFF_TOUR.id);
  });
});

describe("the help matcher", () => {
  test("it finds the right answer for a plainly worded question", () => {
    const [best] = searchHelp("how do I cancel my application", "customer");
    expect(best?.question).toBe("Can I cancel my application?");
  });

  test("it answers a staff question from the staff set", () => {
    const [best] = searchHelp("why is the payments page missing for me", "staff");
    expect(best?.question).toBe("Why is a page or button missing for me?");
  });

  test("it returns nothing rather than a wrong answer", () => {
    // Nonsense, and a real question the knowledge base deliberately does not
    // answer: visa fees are per-consulate facts only the catalogue may state.
    expect(searchHelp("qwertyuiop zxcvbnm", "customer")).toEqual([]);
    expect(searchHelp("asdfgh", "staff")).toEqual([]);
  });

  test("a customer never sees a staff-only answer, and the reverse", () => {
    const staffOnly = HELP_ENTRIES.filter((e) => e.audience === "staff");
    for (const entry of staffOnly) {
      const results = searchHelp(entry.question, "customer");
      expect(results.map((r) => r.question)).not.toContain(entry.question);
    }

    const customerOnly = HELP_ENTRIES.filter((e) => e.audience === "customer");
    for (const entry of customerOnly) {
      const results = searchHelp(entry.question, "staff");
      expect(results.map((r) => r.question)).not.toContain(entry.question);
    }
  });

  test("an administrator's FAQ can answer, and is labelled as theirs", () => {
    const faqs = [
      {
        question: "How long does a Schengen visa take to process?",
        answer: "Fifteen calendar days from the appointment, as published by the consulate.",
      },
    ];
    const [best] = searchHelp("how long does schengen processing take", "customer", faqs);
    expect(best?.question).toBe(faqs[0]!.question);
    expect(best?.source).toBe("faq");
  });

  test("every suggested question actually resolves to an answer", () => {
    for (const audience of ["customer", "staff"] as const) {
      for (const question of suggestedQuestions(audience)) {
        const results = searchHelp(question, audience);
        expect({ audience, question, found: results.length > 0 }).toEqual({
          audience,
          question,
          found: true,
        });
      }
    }
  });

  test("no knowledge-base answer quotes a visa fee", () => {
    // CLAUDE.md: fees belong to the admin-configured catalogue, never to a
    // hardcoded string. This is exactly the invented fact the rule prevents.
    const money = /(₹|\brs\.?\s*\d|\binr\s*\d|\$\s*\d)/i;
    for (const entry of HELP_ENTRIES) {
      expect({ id: entry.id, quotesMoney: money.test(entry.answer) }).toEqual({
        id: entry.id,
        quotesMoney: false,
      });
    }
  });

  test("no knowledge-base answer states a visa processing time", () => {
    // A bare duration is fine — "drafts are kept for 30 days" is our own rule,
    // enforced by a cron. A duration in a sentence *about the consulate* is
    // not: that figure is per-country and only the catalogue may state it.
    const duration = /\b\d+\s*(working\s+|business\s+)?(day|days|week|weeks|month|months)\b/i;
    const visaClaim = /\b(visa|consulate|embassy|process|processing|approval|appointment)\b/i;

    for (const entry of HELP_ENTRIES) {
      const offending = entry.answer
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => duration.test(sentence) && visaClaim.test(sentence));

      expect({ id: entry.id, offending }).toEqual({ id: entry.id, offending: [] });
    }
  });
});

describe("the handover to a human", () => {
  test("an unanswered question becomes an attributable enquiry", async () => {
    const t = newTest();
    const customer = await makeUser(t, { fullName: "Asha Menon" });

    const result = await as(t, customer.clerkId).mutation(api.enquiries.submit, {
      fullName: "Asha Menon",
      email: customer.email,
      phone: "+91 98200 11223",
      subject: "Question from the help assistant",
      message: "Can you expedite my appointment for next week?",
      source: "help_assistant",
    });

    // Enquiries carry the ENQ series, not the VD series applications use.
    expect(result.referenceId).toMatch(/^ENQ-\d{4}-\d+$/);

    const row = await t.run((ctx) => ctx.db.get(result.enquiryId));
    expect(row?.source).toBe("help_assistant");
    expect(row?.email).toBe(customer.email);
    expect(row?.leadStatus).toBe("new");
    expect(row?.message).toContain("expedite");
  });

  test("it lands in the CRM enquiry list staff already work from", async () => {
    const t = newTest();
    const customer = await makeUser(t);
    const agent = await makeUser(t, { role: "support_agent" });

    await as(t, customer.clerkId).mutation(api.enquiries.submit, {
      fullName: "Ravi Shah",
      email: customer.email,
      phone: "+91 98200 11223",
      message: "My document was rejected and I do not understand why.",
      source: "help_assistant",
    });

    const page = await as(t, agent.clerkId).query(api.enquiries.listForAdmin, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(page.page.some((row) => row.source === "help_assistant")).toBe(true);
  });
});
