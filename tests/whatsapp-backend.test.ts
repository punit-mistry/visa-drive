/**
 * WhatsApp backend: webhook, ingest, bot orchestration, send path, staff
 * surface. Meta is never contacted: `fetch` is a stub and every secret is a
 * fake value set for the test only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { hmacSha256Hex } from "../convex/lib/crypto";
import { APPLICATION_STATUS_CONFIG } from "../lib/constants/statuses";
import {
  as,
  codeOf,
  drainScheduled,
  makeApplication,
  makeCatalogue,
  makeUser,
  newTest,
  type T,
} from "./harness";

// Failure injection for the bot step / outbound queue. Off unless a test flips it.
const chaos = vi.hoisted(() => ({ failStep: false, failQueue: false }));
vi.mock("../lib/whatsapp/engine", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/whatsapp/engine")>();
  return {
    ...real,
    step: (input: Parameters<typeof real.step>[0]) => {
      if (chaos.failStep) throw new Error("boom with a secret customer message");
      return real.step(input);
    },
  };
});
vi.mock("../convex/lib/whatsappOutbound", async (importOriginal) => {
  const real = await importOriginal<typeof import("../convex/lib/whatsappOutbound")>();
  return {
    ...real,
    queueOutbound: (...args: Parameters<typeof real.queueOutbound>) => {
      if (chaos.failQueue) throw new Error("queue exploded");
      return real.queueOutbound(...args);
    },
  };
});

const APP_SECRET = "test-app-secret";
const TOKEN = "SECRET_TOKEN_123";
const USER_WA = "919876543210";

const ENV_KEYS = [
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_BOT_ENABLED",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_DEMO_MODE",
  "WHATSAPP_TEST_RECIPIENTS",
];
let savedEnv: Record<string, string | undefined> = {};

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [k, val] of Object.entries(overrides)) {
    if (val === undefined) delete process.env[k];
    else process.env[k] = val;
  }
}

let sendCounter = 0;
const fetchMock = vi.fn();

function okSend() {
  sendCounter += 1;
  return new Response(JSON.stringify({ messages: [{ id: `wamid.OUT${sendCounter}` }] }), { status: 200 });
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  setEnv({
    WHATSAPP_APP_SECRET: APP_SECRET,
    WHATSAPP_VERIFY_TOKEN: "verify-me",
    WHATSAPP_BOT_ENABLED: "true",
    WHATSAPP_ACCESS_TOKEN: TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: "1234567890",
    WHATSAPP_DEMO_MODE: undefined,
    WHATSAPP_TEST_RECIPIENTS: undefined,
  });
  sendCounter = 0;
  chaos.failStep = false;
  chaos.failQueue = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => okSend());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  // Let scheduled work finish while the stubs are still in place.
  await drainScheduled();
  vi.unstubAllGlobals();
  setEnv(savedEnv);
});

/* ------------------------------- helpers --------------------------------- */

async function settle(t: T) {
  for (let i = 0; i < 12; i += 1) {
    await new Promise((r) => setTimeout(r, 5));
    await t.finishInProgressScheduledFunctions();
  }
}

function messagesPayload(
  messages: { id: string; from?: string; type?: string; text?: string; button?: string }[],
) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ profile: { name: "Asha" }, wa_id: messages[0]?.from ?? USER_WA }],
              messages: messages.map((m) => {
                const base = { from: m.from ?? USER_WA, id: m.id, timestamp: "1" };
                if (m.button) {
                  return {
                    ...base,
                    type: "interactive",
                    interactive: { type: "list_reply", list_reply: { id: m.button, title: "picked" } },
                  };
                }
                if (m.type && m.type !== "text") return { ...base, type: m.type, image: { id: "MEDIA_ID" } };
                return { ...base, type: "text", text: { body: m.text ?? "" } };
              }),
            },
          },
        ],
      },
    ],
  };
}

function statusPayload(wamid: string, status: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { statuses: [{ id: wamid, status, recipient_id: USER_WA }] } }] }],
  };
}

async function post(t: T, payload: unknown, opts: { secret?: string; signature?: string | null } = {}) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.signature !== null) {
    headers["x-hub-signature-256"] =
      opts.signature ?? `sha256=${await hmacSha256Hex(opts.secret ?? APP_SECRET, body)}`;
  }
  return await t.fetch("/whatsapp-webhook", { method: "POST", headers, body });
}

let wamidCounter = 0;
function nextId() {
  wamidCounter += 1;
  return `wamid.IN${wamidCounter}`;
}

async function say(t: T, text: string, from = USER_WA, id = nextId()) {
  const res = await post(t, messagesPayload([{ id, from, text }]));
  expect(res.status).toBe(200);
  await settle(t);
}

async function pick(t: T, button: string, from = USER_WA) {
  const res = await post(t, messagesPayload([{ id: nextId(), from, button }]));
  expect(res.status).toBe(200);
  await settle(t);
}

async function enableBot(t: T) {
  await t.run(async (ctx) => {
    await ctx.db.insert("appSettings", {
      key: "integrations.whatsappBotEnabled",
      category: "integrations",
      value: true,
      isPublic: false,
      updatedAt: Date.now(),
    });
  });
}

function dateIn(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

async function snapshot(t: T) {
  return await t.run(async (ctx) => ({
    contacts: await ctx.db.query("whatsappContacts").collect(),
    conversations: await ctx.db.query("conversations").collect(),
    messages: await ctx.db.query("messages").collect(),
    events: await ctx.db.query("whatsappWebhookEvents").collect(),
    enquiries: await ctx.db.query("enquiries").collect(),
    applications: await ctx.db.query("applications").collect(),
  }));
}

async function readyBot() {
  const t = newTest();
  await enableBot(t);
  const cat = await makeCatalogue(t);
  return { t, cat };
}

/** Walk the bot through the whole enquiry flow up to (not including) confirm. */
async function walkToConfirm(t: T, destSlug: string, email = "asha@example.test") {
  await say(t, "Hi");
  await pick(t, "menu:apply");
  await pick(t, `dest:${destSlug}`);
  await pick(t, "cat:tourist");
  await pick(t, "dur:up_to_30");
  await say(t, dateIn(60));
  await say(t, "2");
  await say(t, "Asha Rao");
  await say(t, email);
}

async function destSlug(t: T): Promise<string> {
  return await t.run(async (ctx) => (await ctx.db.query("destinations").first())!.slug);
}

/* -------------------------------------------------------------------------- */
/*                                  webhook                                   */
/* -------------------------------------------------------------------------- */

describe("webhook verification (GET)", () => {
  const url = (token: string) =>
    `/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=chal123`;

  it("echoes the challenge for the right token", async () => {
    const t = newTest();
    const res = await t.fetch(url("verify-me"), { method: "GET" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("chal123");
    expect(res.headers.get("content-type")).toContain("text/plain");
  });

  it("refuses a wrong token with 403", async () => {
    const t = newTest();
    const res = await t.fetch(url("nope"), { method: "GET" });
    expect(res.status).toBe(403);
  });

  it("returns 503 when the verify token is not configured", async () => {
    setEnv({ WHATSAPP_VERIFY_TOKEN: undefined });
    const t = newTest();
    const res = await t.fetch(url("verify-me"), { method: "GET" });
    expect(res.status).toBe(503);
  });
});

describe("webhook signature (POST)", () => {
  it("rejects a bad signature with 401 and records nothing", async () => {
    const t = newTest();
    const res = await post(t, messagesPayload([{ id: "wamid.X", text: "hi" }]), { secret: "wrong" });
    expect(res.status).toBe(401);
    expect((await snapshot(t)).events).toHaveLength(0);
  });

  it("rejects a missing signature with 401", async () => {
    const t = newTest();
    const res = await post(t, messagesPayload([{ id: "wamid.X", text: "hi" }]), { signature: null });
    expect(res.status).toBe(401);
  });

  it("returns 503 when the app secret is not configured", async () => {
    setEnv({ WHATSAPP_APP_SECRET: undefined });
    const t = newTest();
    const res = await post(t, messagesPayload([{ id: "wamid.X", text: "hi" }]));
    expect(res.status).toBe(503);
  });

  it("returns 400 for a signed body that is not a WhatsApp payload", async () => {
    const t = newTest();
    expect((await post(t, { hello: "world" })).status).toBe(400);
  });

  it("accepts a valid signature and stores an event row without the body", async () => {
    const t = newTest();
    const res = await post(t, messagesPayload([{ id: "wamid.SIGNED", text: "my secret words" }]));
    expect(res.status).toBe(200);
    const { events } = await snapshot(t);
    expect(events).toHaveLength(1);
    expect(events[0].dedupeKey).toBe("msg:wamid.SIGNED");
    expect(JSON.stringify(events)).not.toContain("my secret words");
    await settle(t);
  });
});

/* -------------------------------------------------------------------------- */
/*                                ingest + bot                                */
/* -------------------------------------------------------------------------- */

describe("inbound messages", () => {
  it("creates contact, conversation, inbound message and the welcome reply", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    const s = await snapshot(t);
    expect(s.contacts).toHaveLength(1);
    expect(s.contacts[0].waId).toBe(USER_WA);
    expect(s.conversations).toHaveLength(1);
    expect(s.conversations[0]).toMatchObject({
      channel: "whatsapp",
      customerEmail: "",
      whatsappContactId: s.contacts[0]._id,
    });
    const inbound = s.messages.filter((m) => m.direction === "inbound");
    const outbound = s.messages.filter((m) => m.direction === "outbound");
    expect(inbound).toHaveLength(1);
    expect(inbound[0]).toMatchObject({ authorRole: "customer", body: "Hi", messageType: "text" });
    expect(outbound).toHaveLength(1);
    expect(outbound[0]).toMatchObject({ authorRole: "system", deliveryStatus: "sent" });
    expect(outbound[0].externalId).toMatch(/^wamid\.OUT/);
    expect(s.conversations[0].unreadForStaff).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/messages");
    expect(JSON.parse(init.body).type).toBe("interactive");
  });

  it("processes a duplicate POST of the same wamid once", async () => {
    const { t } = await readyBot();
    const payload = messagesPayload([{ id: "wamid.DUP", text: "Hi" }]);
    expect((await post(t, payload)).status).toBe(200);
    expect((await post(t, payload)).status).toBe(200);
    await settle(t);
    const s = await snapshot(t);
    expect(s.messages.filter((m) => m.direction === "inbound")).toHaveLength(1);
    expect(s.events).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("processes every message in a batch", async () => {
    const { t } = await readyBot();
    const res = await post(
      t,
      messagesPayload([
        { id: "wamid.B1", text: "Hi" },
        { id: "wamid.B2", text: "menu" },
      ]),
    );
    expect(res.status).toBe(200);
    await settle(t);
    const s = await snapshot(t);
    expect(s.messages.filter((m) => m.direction === "inbound")).toHaveLength(2);
    expect(s.events.filter((e) => e.processingState === "done")).toHaveLength(2);
  });

  it("records unsupported media by type only", async () => {
    const { t } = await readyBot();
    const res = await post(t, messagesPayload([{ id: "wamid.IMG", type: "image" }]));
    expect(res.status).toBe(200);
    await settle(t);
    const s = await snapshot(t);
    const inbound = s.messages.find((m) => m.direction === "inbound")!;
    expect(inbound.body).toBe("[image]");
    expect(JSON.stringify(s)).not.toContain("MEDIA_ID");
  });

  it("records the message but stays silent when the env kill switch is off", async () => {
    setEnv({ WHATSAPP_BOT_ENABLED: "false" });
    const { t } = await readyBot();
    await say(t, "Hi");
    const s = await snapshot(t);
    expect(s.messages.filter((m) => m.direction === "inbound")).toHaveLength(1);
    expect(s.messages.filter((m) => m.direction === "outbound")).toHaveLength(0);
    expect(s.conversations[0].unreadForStaff).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays silent when the admin setting is off", async () => {
    const t = newTest();
    await say(t, "Hi");
    expect((await snapshot(t)).messages.filter((m) => m.direction === "outbound")).toHaveLength(0);
  });

  it("does not run the bot for a contact flooding the thread", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    const convId = (await snapshot(t)).conversations[0]._id;
    await t.run(async (ctx) => {
      for (let i = 0; i < 30; i += 1) {
        await ctx.db.insert("messages", {
          conversationId: convId,
          authorName: "x",
          authorRole: "customer",
          body: "spam",
          attachments: [],
          isInternal: false,
          direction: "inbound",
          createdAt: Date.now(),
        });
      }
    });
    const before = fetchMock.mock.calls.length;
    await say(t, "menu");
    expect(fetchMock.mock.calls.length).toBe(before);
    const s = await snapshot(t);
    expect(s.messages.some((m) => m.body === "menu")).toBe(true);
  });
});

describe("delivery receipts", () => {
  it("only ever moves delivery status forward", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    const wamid = (await snapshot(t)).messages.find((m) => m.direction === "outbound")!.externalId!;
    const status = async () =>
      (await snapshot(t)).messages.find((m) => m.externalId === wamid)!.deliveryStatus;

    await post(t, statusPayload(wamid, "delivered"));
    await settle(t);
    expect(await status()).toBe("delivered");
    await post(t, statusPayload(wamid, "read"));
    await settle(t);
    expect(await status()).toBe("read");
    await post(t, statusPayload(wamid, "sent")); // late, out of order
    await settle(t);
    expect(await status()).toBe("read");
    await post(t, statusPayload(wamid, "failed"));
    await settle(t);
    expect(await status()).toBe("failed");
  });

  const statusArgs = (eventId: Id<"whatsappWebhookEvents">, wamid: string) => ({
    eventId,
    wamid,
    status: "delivered" as const,
  });

  it("leaves an unknown wamid pending once, then marks it done on the second miss", async () => {
    const t = newTest();
    expect((await post(t, statusPayload("wamid.NOPE", "delivered"))).status).toBe(200);
    await settle(t);
    let { events } = await snapshot(t);
    expect(events[0]).toMatchObject({ processingState: "pending", attempts: 1 });

    // The rescheduled job (30s later in production), run now.
    await t.mutation(internal.whatsapp.processStatus, statusArgs(events[0]._id, "wamid.NOPE"));
    events = (await snapshot(t)).events;
    expect(events[0].processingState).toBe("done");
  });

  it("applies a receipt that arrived before the send result was recorded", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    const conversationId = (await snapshot(t)).conversations[0]._id;
    const rowId = await t.run(async (ctx) =>
      ctx.db.insert("messages", {
        conversationId,
        authorName: "Bot",
        authorRole: "system",
        body: "late bookkeeping",
        attachments: [],
        isInternal: false,
        direction: "outbound",
        createdAt: Date.now(),
      }),
    );

    // Receipt first: the row has no externalId yet.
    await post(t, statusPayload("wamid.LATE", "delivered"));
    await settle(t);
    const event = (await snapshot(t)).events.find((e) => e.waMessageId === "wamid.LATE")!;
    expect(event.processingState).toBe("pending");

    // Then recordSendResult lands, and the retry finds the row.
    await t.mutation(internal.whatsappSend.recordSendResult, {
      messageRowId: rowId,
      outcome: { kind: "sent", wamid: "wamid.LATE" },
    });
    await t.mutation(internal.whatsapp.processStatus, statusArgs(event._id, "wamid.LATE"));
    const s = await snapshot(t);
    expect(s.messages.find((m) => m._id === rowId)?.deliveryStatus).toBe("delivered");
    expect(s.events.find((e) => e._id === event._id)?.processingState).toBe("done");
  });
});

/* -------------------------------------------------------------------------- */
/*                               enquiry creation                             */
/* -------------------------------------------------------------------------- */

describe("enquiry flow", () => {
  it("creates exactly one WhatsApp enquiry and never an application", async () => {
    const { t } = await readyBot();
    const slug = await destSlug(t);
    await walkToConfirm(t, slug);
    const finalId = "wamid.FINAL";
    const payload = messagesPayload([{ id: finalId, button: "confirm:yes" }]);
    expect((await post(t, payload)).status).toBe(200);
    await settle(t);

    let s = await snapshot(t);
    expect(s.enquiries).toHaveLength(1);
    const enquiry = s.enquiries[0];
    expect(enquiry.source).toBe("whatsapp");
    expect(enquiry.referenceId).toMatch(/^ENQ-\d{4}-\d{5}$/);
    expect(enquiry.leadStatus).toBe("new");
    expect(enquiry.phone).toBe(`+${USER_WA}`);
    expect(enquiry.whatsappContactId).toBe(s.contacts[0]._id);
    expect(enquiry.isDemo).toBe(false);
    expect(enquiry.convertedUserId).toBeUndefined();
    expect(s.conversations[0].enquiryId).toBe(enquiry._id);
    expect(s.applications).toHaveLength(0);
    const replies = s.messages.filter((m) => m.direction === "outbound").map((m) => m.body);
    expect(replies.some((b) => b.includes(enquiry.referenceId))).toBe(true);

    // Replaying the final message (Meta retry) must not create a second one.
    expect((await post(t, payload)).status).toBe(200);
    await settle(t);
    s = await snapshot(t);
    expect(s.enquiries).toHaveLength(1);
    expect(s.applications).toHaveLength(0);
  });

  it("does not link a typed email to an existing customer", async () => {
    const { t } = await readyBot();
    const customer = await makeUser(t, { email: "known@example.test" });
    const slug = await destSlug(t);
    await walkToConfirm(t, slug, "known@example.test");
    await pick(t, "confirm:yes");

    const s = await snapshot(t);
    expect(s.enquiries).toHaveLength(1);
    expect(s.enquiries[0].convertedUserId).toBeUndefined();
    expect(s.contacts[0].linkedUserId).toBeUndefined();
    expect(s.conversations[0].userId).toBeUndefined();
    expect(s.messages.some((m) => m.isInternal && m.body.includes("unverified"))).toBe(true);
    // The customer's account is untouched.
    const user = await t.run(async (ctx) => ctx.db.get(customer.id));
    expect(user?.whatsappOptIn).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*                         handoff, opt-out, status lookup                    */
/* -------------------------------------------------------------------------- */

describe("handoff", () => {
  it("sets flags, silences the bot, and menu hands back", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    await say(t, "agent");
    let s = await snapshot(t);
    expect(s.contacts[0].humanHandoff).toBe(true);
    expect(s.conversations[0].priority).toBe("high");
    expect(s.conversations[0].status).toBe("open");

    const calls = fetchMock.mock.calls.length;
    await say(t, "I would like to talk about my trip");
    expect(fetchMock.mock.calls.length).toBe(calls);

    await say(t, "menu");
    s = await snapshot(t);
    expect(s.contacts[0].humanHandoff).toBe(false);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
  });
});

describe("opt-out", () => {
  it("blocks later sends and clears the linked user's opt-in", async () => {
    const { t } = await readyBot();
    const user = await makeUser(t);
    await t.run(async (ctx) => ctx.db.patch(user.id, { whatsappOptIn: true }));
    await say(t, "Hi");
    const contactId = (await snapshot(t)).contacts[0]._id;
    await t.run(async (ctx) => ctx.db.patch(contactId, { linkedUserId: user.id }));

    await say(t, "STOP");
    let s = await snapshot(t);
    expect(s.contacts[0].optedOut).toBe(true);
    expect((await t.run(async (ctx) => ctx.db.get(user.id)))?.whatsappOptIn).toBe(false);
    const afterStop = fetchMock.mock.calls.length; // welcome + the STOP confirmation

    await say(t, "Hi");
    expect(fetchMock.mock.calls.length).toBe(afterStop);

    // Staff cannot message an opted-out contact either.
    const support = await makeUser(t, { role: "support_agent" });
    s = await snapshot(t);
    const code = await codeOf(() =>
      as(t, support.clerkId).mutation(api.whatsappAdmin.sendReply, {
        conversationId: s.conversations[0]._id,
        body: "hello",
      }),
    );
    expect(code).toBe("OPTED_OUT");

    // START resubscribes and restores the user's opt-in.
    await say(t, "START");
    s = await snapshot(t);
    expect(s.contacts[0].optedOut).toBe(false);
    expect((await t.run(async (ctx) => ctx.db.get(user.id)))?.whatsappOptIn).toBe(true);
  });
});

describe("booking status lookup", () => {
  async function lookup(t: T, ref: string, from: string) {
    await say(t, "Hi", from);
    await pick(t, "menu:status", from);
    await say(t, ref, from);
    const s = await snapshot(t);
    const bodies = s.messages
      .filter((m) => m.direction === "outbound")
      .map((m) => m.body);
    return bodies[bodies.length - 1];
  }

  it("answers only for the number on the booking, with the status label only", async () => {
    const { t, cat } = await readyBot();
    const owner = await makeUser(t);
    const appId = await makeApplication(t, {
      owner,
      catalogue: cat,
      reference: "VD-2026-00042",
    });
    await t.run(async (ctx) => ctx.db.patch(appId, { customerPhone: "+91 98765 43210" }));

    const ok = await lookup(t, "VD-2026-00042", USER_WA);
    expect(ok).toContain(APPLICATION_STATUS_CONFIG.submitted.customerLabel);
    expect(ok).not.toContain("Test Customer");

    const mismatch = await lookup(t, "VD-2026-00042", "919000011111");
    const missing = await lookup(t, "VD-2026-99999", "919000022222");
    expect(mismatch).not.toContain(APPLICATION_STATUS_CONFIG.submitted.customerLabel);
    expect(mismatch).toBe(missing); // identical: references cannot be enumerated
    expect(mismatch).toContain("couldn't find a matching booking");
  });
});

/* -------------------------------------------------------------------------- */
/*                                  send path                                 */
/* -------------------------------------------------------------------------- */

describe("send path", () => {
  it("retries a 5xx with backoff and stores no token in errors", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { code: 1, message: `boom ${TOKEN}` } }), { status: 500 }),
    );
    const { t } = await readyBot();
    await say(t, "Hi");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const s = await snapshot(t);
    const out = s.messages.find((m) => m.direction === "outbound")!;
    expect(out.deliveryStatus).not.toBe("failed");
    expect(out.deliveryError).toContain("retry 1");

    const pending = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (j) => j.state.kind === "pending" && j.name.includes("sendOutbound"),
      ),
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].scheduledTime).toBeGreaterThan(Date.now() + 30_000);
    expect(JSON.stringify(s)).not.toContain(TOKEN);
  });

  it("fails a 4xx at once without retrying, and redacts the token", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { code: 131009, message: `bad ${TOKEN}` } }), {
          status: 400,
        }),
    );
    const { t } = await readyBot();
    await say(t, "Hi");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const s = await snapshot(t);
    const out = s.messages.find((m) => m.direction === "outbound")!;
    expect(out.deliveryStatus).toBe("failed");
    expect(out.deliveryError).toContain("400/131009");
    expect(JSON.stringify(s)).not.toContain(TOKEN);
    const pending = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (j) => j.state.kind === "pending" && j.name.includes("sendOutbound"),
      ),
    );
    expect(pending).toHaveLength(0);
  });

  it("fails after the fourth attempt and schedules no further retry", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 500 }));
    const { t } = await readyBot();
    await say(t, "Hi");
    const s = await snapshot(t);
    const out = s.messages.find((m) => m.direction === "outbound")!;
    await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query("_scheduled_functions").collect();
      for (const j of jobs) if (j.state.kind === "pending") await ctx.scheduler.cancel(j._id);
    });
    await t.action(internal.whatsappSend.sendOutbound, {
      contactId: s.contacts[0]._id,
      attempt: 4,
      items: [{ messageRowId: out._id, payload: { type: "text", body: "x" } }],
    });
    const row = await t.run(async (ctx) => ctx.db.get(out._id));
    expect(row?.deliveryStatus).toBe("failed");
    const pending = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (j) => j.state.kind === "pending" && j.name.includes("sendOutbound"),
      ),
    );
    expect(pending).toHaveLength(0);
  });

  it("refuses free-form text once the 24h window has closed", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    const s = await snapshot(t);
    await t.run(async (ctx) =>
      ctx.db.patch(s.contacts[0]._id, { lastInboundAt: Date.now() - 25 * 60 * 60 * 1000 }),
    );
    const support = await makeUser(t, { role: "support_agent" });
    const before = fetchMock.mock.calls.length;
    const code = await codeOf(() =>
      as(t, support.clerkId).mutation(api.whatsappAdmin.sendReply, {
        conversationId: s.conversations[0]._id,
        body: "Are you there?",
      }),
    );
    expect(code).toBe("WINDOW_CLOSED");
    await settle(t);
    expect(fetchMock.mock.calls.length).toBe(before);
    // Nothing was inserted for the refused reply.
    expect((await snapshot(t)).messages.some((m) => m.body === "Are you there?")).toBe(false);
  });

  it("the send action itself refuses when the window is closed", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    const s = await snapshot(t);
    const out = s.messages.find((m) => m.direction === "outbound")!;
    await t.run(async (ctx) =>
      ctx.db.patch(s.contacts[0]._id, { lastInboundAt: Date.now() - 25 * 60 * 60 * 1000 }),
    );
    const before = fetchMock.mock.calls.length;
    await t.action(internal.whatsappSend.sendOutbound, {
      contactId: s.contacts[0]._id,
      attempt: 1,
      items: [{ messageRowId: out._id, payload: { type: "text", body: "late" } }],
    });
    expect(fetchMock.mock.calls.length).toBe(before);
    const row = await t.run(async (ctx) => ctx.db.get(out._id));
    expect(row?.deliveryStatus).toBe("failed");
    expect(row?.deliveryError).toContain("WINDOW_CLOSED");
  });

  it("demo mode refuses recipients outside the allow-list and allows listed ones", async () => {
    setEnv({ WHATSAPP_DEMO_MODE: "true", WHATSAPP_TEST_RECIPIENTS: "919111122222" });
    const { t } = await readyBot();
    await say(t, "Hi", "919333344444");
    expect(fetchMock).not.toHaveBeenCalled();
    let s = await snapshot(t);
    const blocked = s.messages.find((m) => m.direction === "outbound")!;
    expect(blocked.deliveryStatus).toBe("failed");
    expect(blocked.deliveryError).toContain("DEMO_RECIPIENT_BLOCKED");
    expect(s.contacts[0].isDemo).toBe(false); // not on the list, so not demo data

    await say(t, "Hi", "919111122222");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    s = await snapshot(t);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).to).toBe("919111122222");
  });

  it("sends nothing and fails cleanly when credentials are missing", async () => {
    setEnv({ WHATSAPP_ACCESS_TOKEN: undefined });
    const { t } = await readyBot();
    await say(t, "Hi");
    expect(fetchMock).not.toHaveBeenCalled();
    const out = (await snapshot(t)).messages.find((m) => m.direction === "outbound")!;
    expect(out.deliveryError).toContain("NOT_CONFIGURED");
  });
});

/* -------------------------------------------------------------------------- */
/*                               staff functions                              */
/* -------------------------------------------------------------------------- */

describe("whatsappAdmin permissions", () => {
  it("denies a customer on every function", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    const conversationId = (await snapshot(t)).conversations[0]._id;
    const customer = await makeUser(t);
    const c = as(t, customer.clerkId);
    const paginationOpts = { numItems: 10, cursor: null };
    const calls: [string, () => Promise<unknown>][] = [
      ["listConversations", () => c.query(api.whatsappAdmin.listConversations, { paginationOpts })],
      ["getConversation", () => c.query(api.whatsappAdmin.getConversation, { conversationId })],
      ["getStatus", () => c.query(api.whatsappAdmin.getStatus, {})],
      ["sendReply", () => c.mutation(api.whatsappAdmin.sendReply, { conversationId, body: "hi" })],
      ["assign", () => c.mutation(api.whatsappAdmin.assign, { conversationId, staffId: null })],
      ["setHandoff", () => c.mutation(api.whatsappAdmin.setHandoff, { conversationId })],
      ["resumeBot", () => c.mutation(api.whatsappAdmin.resumeBot, { conversationId })],
      ["setBotEnabled", () => c.mutation(api.whatsappAdmin.setBotEnabled, { enabled: true })],
      ["resetDemo", () => c.mutation(api.whatsappAdmin.resetDemo, {})],
    ];
    for (const [name, fn] of calls) {
      expect({ name, code: await codeOf(fn) }).toEqual({ name, code: "FORBIDDEN" });
    }
  });

  it("denies anonymous callers", async () => {
    const t = newTest();
    expect(await codeOf(() => t.query(api.whatsappAdmin.getStatus, {}))).not.toBeNull();
  });

  it("lets support read and reply but not assign, switch the bot or reset", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    const conversationId = (await snapshot(t)).conversations[0]._id;
    const support = await makeUser(t, { role: "support_agent" });
    const s = as(t, support.clerkId);

    const list = await s.query(api.whatsappAdmin.listConversations, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(list.page).toHaveLength(1);
    expect(list.page[0].contact?.waId).toBe(USER_WA);
    const detail = await s.query(api.whatsappAdmin.getConversation, { conversationId });
    expect(detail.messages.length).toBeGreaterThan(0);

    const reply = await s.mutation(api.whatsappAdmin.sendReply, { conversationId, body: "Hello from staff" });
    expect(reply.messageId).toBeTruthy();
    await settle(t);
    const row = (await snapshot(t)).messages.find((m) => m.body === "Hello from staff")!;
    expect(row).toMatchObject({ authorRole: "staff", direction: "outbound", deliveryStatus: "sent" });

    expect(await codeOf(() => s.mutation(api.whatsappAdmin.assign, { conversationId, staffId: support.id }))).toBe("FORBIDDEN");
    expect(await codeOf(() => s.mutation(api.whatsappAdmin.setBotEnabled, { enabled: false }))).toBe("FORBIDDEN");
    expect(await codeOf(() => s.mutation(api.whatsappAdmin.resetDemo, {}))).toBe("FORBIDDEN");
  });

  it("validates reply length", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    const conversationId = (await snapshot(t)).conversations[0]._id;
    const support = await makeUser(t, { role: "support_agent" });
    const s = as(t, support.clerkId);
    expect(await codeOf(() => s.mutation(api.whatsappAdmin.sendReply, { conversationId, body: "   " }))).toBe("VALIDATION");
    expect(
      await codeOf(() => s.mutation(api.whatsappAdmin.sendReply, { conversationId, body: "x".repeat(4097) })),
    ).toBe("VALIDATION");
  });

  it("manager can assign, switch the bot (audited) and read status without secrets", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    const conversationId = (await snapshot(t)).conversations[0]._id;
    const manager = await makeUser(t, { role: "manager" });
    const m = as(t, manager.clerkId);

    await m.mutation(api.whatsappAdmin.assign, { conversationId, staffId: manager.id });
    expect((await snapshot(t)).conversations[0].assignedTo).toBe(manager.id);
    const mine = await m.query(api.whatsappAdmin.listConversations, {
      assignedToMe: true,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(mine.page).toHaveLength(1);

    await m.mutation(api.whatsappAdmin.setBotEnabled, { enabled: false });
    const status = await m.query(api.whatsappAdmin.getStatus, {});
    expect(status.botEnabledSetting).toBe(false);
    expect(status.botEnabledEnv).toBe(true);
    expect(status.connected).toBe(true);
    expect(JSON.stringify(status)).not.toContain(TOKEN);
    expect(JSON.stringify(status)).not.toContain(APP_SECRET);

    const audits = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    expect(audits.some((a) => a.action === "settings.updated")).toBe(true);
    expect(audits.some((a) => a.action === "conversation.assigned")).toBe(true);
  });

  it("the portal messages.send refuses WhatsApp threads", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    const conversationId = (await snapshot(t)).conversations[0]._id;
    const support = await makeUser(t, { role: "support_agent" });
    expect(
      await codeOf(() => as(t, support.clerkId).mutation(api.messages.send, { conversationId, body: "hi" })),
    ).toBe("WHATSAPP_THREAD");
  });

  it("setHandoff / resumeBot toggle the contact flags", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    const conversationId = (await snapshot(t)).conversations[0]._id;
    const support = await makeUser(t, { role: "support_agent" });
    const s = as(t, support.clerkId);
    await s.mutation(api.whatsappAdmin.setHandoff, { conversationId });
    expect((await snapshot(t)).contacts[0]).toMatchObject({ humanHandoff: true, botState: "handoff" });
    await s.mutation(api.whatsappAdmin.resumeBot, { conversationId });
    expect((await snapshot(t)).contacts[0]).toMatchObject({ humanHandoff: false, botState: "menu" });
  });
});

describe("resetDemo", () => {
  async function seedContact(t: T, waId: string, isDemo: boolean) {
    if (isDemo) allowDemo(waId);
    return await t.run(async (ctx) => {
      const now = Date.now();
      const contactId = await ctx.db.insert("whatsappContacts", {
        waId,
        optedOut: false,
        botState: "welcome",
        botData: {},
        stateHistory: [],
        humanHandoff: false,
        isDemo,
        language: "en",
        createdAt: now,
        updatedAt: now,
      });
      const conversationId = await ctx.db.insert("conversations", {
        subject: "WhatsApp chat",
        customerName: waId,
        customerEmail: "",
        whatsappContactId: contactId,
        status: "open",
        priority: "normal",
        channel: "whatsapp",
        lastMessageAt: now,
        unreadForCustomer: 0,
        unreadForStaff: 0,
        messageCount: 1,
        createdAt: now,
      });
      await ctx.db.insert("messages", {
        conversationId,
        authorName: waId,
        authorRole: "customer",
        body: "hi",
        attachments: [],
        isInternal: false,
        externalId: `wamid.SEED${waId}`,
        direction: "inbound",
        createdAt: now,
      });
      await ctx.db.insert("whatsappWebhookEvents", {
        dedupeKey: `msg:wamid.SEED${waId}`,
        kind: "message",
        waMessageId: `wamid.SEED${waId}`,
        receivedAt: now,
        processingState: "done",
        attempts: 0,
      });
      await ctx.db.insert("enquiries", {
        referenceId: `ENQ-TEST-${waId}`,
        fullName: "Seed",
        email: "seed@example.test",
        phone: `+${waId}`,
        subject: "seed",
        message: "seed",
        source: "whatsapp",
        leadStatus: "new",
        contactAttempts: 0,
        whatsappContactId: contactId,
        isDemo,
        createdAt: now,
        updatedAt: now,
      });
      return contactId;
    });
  }

  it("refuses unless demo mode is on", async () => {
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });
    expect(await codeOf(() => as(t, admin.clerkId).mutation(api.whatsappAdmin.resetDemo, {}))).toBe(
      "DEMO_MODE_OFF",
    );
  });

  it("deletes demo rows only", async () => {
    setEnv({ WHATSAPP_DEMO_MODE: "true" });
    const t = newTest();
    const demo = await seedContact(t, "919000000001", true);
    const real = await seedContact(t, "919000000002", false);
    const admin = await makeUser(t, { role: "admin" });

    const result = await as(t, admin.clerkId).mutation(api.whatsappAdmin.resetDemo, {});
    expect(result).toMatchObject({ contacts: 1, conversations: 1, messages: 1, enquiries: 1, webhookEvents: 1 });

    const s = await snapshot(t);
    expect(s.contacts.map((c) => c._id)).toEqual([real]);
    expect(s.conversations.map((c) => c.whatsappContactId)).toEqual([real]);
    expect(s.messages).toHaveLength(1);
    expect(s.enquiries.map((e) => e.whatsappContactId)).toEqual([real]);
    expect(s.events.map((e) => e.dedupeKey)).toEqual(["msg:wamid.SEED919000000002"]);
    expect(demo).not.toEqual(real);
    const audits = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    expect(audits.some((a) => a.action === "whatsapp.demo_reset")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*                         security-review regression tests                    */
/* -------------------------------------------------------------------------- */

/** Demo contacts only count as demo when their number is on the allow-list. */
function allowDemo(waId: string) {
  process.env.WHATSAPP_TEST_RECIPIENTS = [process.env.WHATSAPP_TEST_RECIPIENTS, waId].filter(Boolean).join(",");
}

async function insertContact(
  t: T,
  waId: string,
  over: Partial<{ optedOut: boolean; isDemo: boolean; lastInboundAt: number }> = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("whatsappContacts", {
      waId,
      optedOut: over.optedOut ?? false,
      botState: "welcome",
      botData: {},
      stateHistory: [],
      humanHandoff: false,
      isDemo: over.isDemo ?? false,
      language: "en",
      lastInboundAt: over.lastInboundAt ?? now,
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("notification WhatsApp sends obey STOP, demo allow-list and window", () => {
  const send = (t: T, to = "+919876543210") =>
    t.action(internal.notifications.sendWhatsApp, {
      to,
      notificationType: "generic",
      title: "Title",
      body: "Body",
    });

  it("refuses an opted-out contact", async () => {
    const t = newTest();
    await insertContact(t, USER_WA, { optedOut: true });
    const r = await send(t);
    expect(r.delivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses once the 24h window has closed", async () => {
    const t = newTest();
    await insertContact(t, USER_WA, { lastInboundAt: Date.now() - 25 * 3_600_000 });
    expect((await send(t)).delivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends to a subscribed contact inside the window", async () => {
    const t = newTest();
    await insertContact(t, USER_WA);
    expect((await send(t)).delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a number with no contact row because its window is closed", async () => {
    const t = newTest();
    const r = await send(t, "+919111122222");
    expect(r.delivered).toBe(false);
    expect(r.reason).toMatch(/24-hour/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("applies the demo allow-list", async () => {
    setEnv({ WHATSAPP_DEMO_MODE: "true" });
    const t = newTest();
    // A contact row keeps the 24h window open so the demo gate is what refuses.
    await insertContact(t, USER_WA);
    expect((await send(t)).delivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    setEnv({ WHATSAPP_TEST_RECIPIENTS: USER_WA });
    expect((await send(t)).delivered).toBe(true);
  });

  it("never logs a full recipient number", async () => {
    setEnv({ WHATSAPP_ACCESS_TOKEN: undefined });
    const t = newTest();
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    await send(t);
    const logged = spies.flatMap((s) => s.mock.calls.map((c) => c.join(" "))).join("\n");
    spies.forEach((s) => s.mockRestore());
    expect(logged).toContain("whatsapp");
    expect(logged).not.toContain("9876543210");
    expect(logged).toContain("3210");
  });
});

describe("STOP / START are honoured whatever the bot is doing", () => {
  async function contactOf(t: T) {
    return (await snapshot(t)).contacts[0];
  }

  it("STOP works when the env kill switch is off", async () => {
    setEnv({ WHATSAPP_BOT_ENABLED: "false" });
    const { t } = await readyBot();
    await say(t, "STOP");
    expect((await contactOf(t)).optedOut).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await snapshot(t)).events[0].processingState).toBe("done");
  });

  it("STOP works when the admin setting is off", async () => {
    const t = newTest();
    await say(t, "Stop");
    expect((await contactOf(t)).optedOut).toBe(true);
  });

  it("STOP works for a rate-limited contact", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    const convId = (await snapshot(t)).conversations[0]._id;
    await t.run(async (ctx) => {
      for (let i = 0; i < 30; i += 1) {
        await ctx.db.insert("messages", {
          conversationId: convId,
          authorName: "x",
          authorRole: "customer",
          body: "spam",
          attachments: [],
          isInternal: false,
          direction: "inbound",
          createdAt: Date.now(),
        });
      }
    });
    await say(t, "unsubscribe");
    expect((await contactOf(t)).optedOut).toBe(true);
  });

  it("a normal STOP still gets its confirmation reply", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    const before = fetchMock.mock.calls.length;
    await say(t, "STOP");
    expect(fetchMock.mock.calls.length).toBe(before + 1);
  });

  it("START resubscribes while the bot is disabled", async () => {
    setEnv({ WHATSAPP_BOT_ENABLED: "false" });
    const { t } = await readyBot();
    await say(t, "STOP");
    expect((await contactOf(t)).optedOut).toBe(true);
    await say(t, "START");
    expect((await contactOf(t)).optedOut).toBe(false);
  });
});

describe("handoff is only left by menu or STOP", () => {
  it.each(["hi", "hello", "back", "start"])("%s keeps the bot quiet", async (word) => {
    const { t } = await readyBot();
    await say(t, "Hi");
    await say(t, "agent");
    const calls = fetchMock.mock.calls.length;
    await say(t, word);
    const s = await snapshot(t);
    expect(s.contacts[0]).toMatchObject({ humanHandoff: true, botState: "handoff" });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("STOP from a handoff opts out", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    await say(t, "agent");
    await say(t, "STOP");
    expect((await snapshot(t)).contacts[0].optedOut).toBe(true);
  });
});

describe("demo flag is allow-list based and can only be cleared", () => {
  it("flags only allow-listed numbers, and clears the flag when demo mode ends", async () => {
    setEnv({ WHATSAPP_DEMO_MODE: "true", WHATSAPP_TEST_RECIPIENTS: USER_WA });
    const { t } = await readyBot();
    await say(t, "Hi");
    await say(t, "Hi", "919333344444"); // real customer, not on the list
    const s = await snapshot(t);
    expect(s.contacts.find((c) => c.waId === USER_WA)?.isDemo).toBe(true);
    expect(s.contacts.find((c) => c.waId === "919333344444")?.isDemo).toBe(false);

    setEnv({ WHATSAPP_DEMO_MODE: undefined });
    await say(t, "menu");
    expect((await snapshot(t)).contacts.find((c) => c.waId === USER_WA)?.isDemo).toBe(false);
    // Turning demo back on never re-flags an existing contact.
    setEnv({ WHATSAPP_DEMO_MODE: "true" });
    await say(t, "menu");
    expect((await snapshot(t)).contacts.find((c) => c.waId === USER_WA)?.isDemo).toBe(false);
  });

  it("an enquiry takes its flag from the contact current allow-list based flag", async () => {
    setEnv({ WHATSAPP_DEMO_MODE: "true", WHATSAPP_TEST_RECIPIENTS: USER_WA });
    const { t } = await readyBot();
    const slug = await destSlug(t);
    await walkToConfirm(t, slug);
    await pick(t, "confirm:yes");
    expect((await snapshot(t)).enquiries[0].isDemo).toBe(true);
  });

  it("a real number in demo mode gets a non-demo enquiry", async () => {
    setEnv({ WHATSAPP_DEMO_MODE: "true", WHATSAPP_TEST_RECIPIENTS: "919111122222" });
    const { t } = await readyBot();
    const slug = await destSlug(t);
    await walkToConfirm(t, slug);
    await pick(t, "confirm:yes");
    expect((await snapshot(t)).enquiries[0].isDemo).toBe(false);
  });

  it("a demo-era contact whose demo mode ended makes a non-demo enquiry", async () => {
    setEnv({ WHATSAPP_DEMO_MODE: "true", WHATSAPP_TEST_RECIPIENTS: USER_WA });
    const { t } = await readyBot();
    const slug = await destSlug(t);
    await walkToConfirm(t, slug);
    setEnv({ WHATSAPP_DEMO_MODE: undefined });
    await pick(t, "confirm:yes");
    expect((await snapshot(t)).enquiries[0].isDemo).toBe(false);
  });
});

describe("resetDemo makes progress and never touches real data", () => {
  interface SeedOpts {
    isDemo: boolean;
    conversations?: number;
    messagesPerConversation?: number;
    demoEnquiries?: number;
    realEnquiries?: number;
  }

  async function seed(t: T, waId: string, o: SeedOpts) {
    if (o.isDemo) allowDemo(waId);
    return await t.run(async (ctx) => {
      const now = Date.now();
      const contactId = await ctx.db.insert("whatsappContacts", {
        waId,
        optedOut: false,
        botState: "welcome",
        botData: {},
        stateHistory: [],
        humanHandoff: false,
        isDemo: o.isDemo,
        language: "en",
        createdAt: now,
        updatedAt: now,
      });
      for (let c = 0; c < (o.conversations ?? 1); c += 1) {
        const conversationId = await ctx.db.insert("conversations", {
          subject: "WhatsApp chat",
          customerName: waId,
          customerEmail: "",
          whatsappContactId: contactId,
          status: "open",
          priority: "normal",
          channel: "whatsapp",
          lastMessageAt: now,
          unreadForCustomer: 0,
          unreadForStaff: 0,
          messageCount: 0,
          createdAt: now,
        });
        for (let m = 0; m < (o.messagesPerConversation ?? 1); m += 1) {
          await ctx.db.insert("messages", {
            conversationId,
            authorName: waId,
            authorRole: "customer",
            body: "hi",
            attachments: [],
            isInternal: false,
            direction: "inbound",
            createdAt: now,
          });
        }
      }
      const enquiry = (isDemo: boolean, i: number) =>
        ctx.db.insert("enquiries", {
          referenceId: `ENQ-${waId}-${isDemo ? "d" : "r"}${i}`,
          fullName: "Seed",
          email: "seed@example.test",
          phone: `+${waId}`,
          subject: "seed",
          message: "seed",
          source: "whatsapp",
          leadStatus: "new",
          contactAttempts: 0,
          whatsappContactId: contactId,
          isDemo,
          createdAt: now,
          updatedAt: now,
        });
      for (let i = 0; i < (o.demoEnquiries ?? 0); i += 1) await enquiry(true, i);
      for (let i = 0; i < (o.realEnquiries ?? 0); i += 1) await enquiry(false, i);
      return contactId;
    });
  }

  async function resetUntilDone(t: T, clerkId: string): Promise<number> {
    for (let calls = 1; calls <= 80; calls += 1) {
      const r = await as(t, clerkId).mutation(api.whatsappAdmin.resetDemo, {});
      if (!r.hasMore) return calls;
    }
    throw new Error("resetDemo never reported hasMore=false");
  }

  async function setup() {
    setEnv({ WHATSAPP_DEMO_MODE: "true" });
    const t = newTest();
    const admin = await makeUser(t, { role: "admin" });
    return { t, admin };
  }

  it("clears more than 25 demo contacts and leaves the real one", async () => {
    const { t, admin } = await setup();
    for (let i = 0; i < 30; i += 1) await seed(t, `9190000${String(i).padStart(5, "0")}`, { isDemo: true });
    const real = await seed(t, "919888800000", { isDemo: false, realEnquiries: 1 });
    const calls = await resetUntilDone(t, admin.clerkId);
    expect(calls).toBeGreaterThan(1);
    const s = await snapshot(t);
    expect(s.contacts.map((c) => c._id)).toEqual([real]);
    expect(s.conversations).toHaveLength(1);
    expect(s.messages).toHaveLength(1);
    expect(s.enquiries).toHaveLength(1);
  });

  it("clears a contact with more than 5 conversations", async () => {
    const { t, admin } = await setup();
    await seed(t, "919000000001", { isDemo: true, conversations: 8, messagesPerConversation: 2 });
    const real = await seed(t, "919000000002", { isDemo: false });
    await resetUntilDone(t, admin.clerkId);
    const s = await snapshot(t);
    expect(s.contacts.map((c) => c._id)).toEqual([real]);
    expect(s.conversations).toHaveLength(1);
    expect(s.messages).toHaveLength(1);
  });

  it("clears a contact with more than 20 enquiries", async () => {
    const { t, admin } = await setup();
    await seed(t, "919000000001", { isDemo: true, demoEnquiries: 45 });
    const real = await seed(t, "919000000002", { isDemo: false, realEnquiries: 3 });
    await resetUntilDone(t, admin.clerkId);
    const s = await snapshot(t);
    expect(s.contacts.map((c) => c._id)).toEqual([real]);
    expect(s.enquiries).toHaveLength(3);
    expect(s.enquiries.every((e) => e.isDemo === false)).toBe(true);
  });

  it("spreads a very long thread over several calls", async () => {
    const { t, admin } = await setup();
    await seed(t, "919000000001", { isDemo: true, messagesPerConversation: 400 });
    const calls = await resetUntilDone(t, admin.clerkId);
    expect(calls).toBeGreaterThan(1);
    const s = await snapshot(t);
    expect(s.messages).toHaveLength(0);
    expect(s.contacts).toHaveLength(0);
  });

  it("keeps a contact, its thread and its real enquiry when any enquiry is not demo", async () => {
    const { t, admin } = await setup();
    const mixed = await seed(t, "919000000001", {
      isDemo: true,
      demoEnquiries: 2,
      realEnquiries: 1,
      messagesPerConversation: 2,
    });
    await resetUntilDone(t, admin.clerkId);
    const s = await snapshot(t);
    expect(s.contacts.map((c) => c._id)).toEqual([mixed]);
    expect(s.contacts[0].isDemo).toBe(false);
    expect(s.conversations).toHaveLength(1);
    expect(s.messages).toHaveLength(2);
    expect(s.enquiries).toHaveLength(1);
    expect(s.enquiries[0].isDemo).toBe(false);
  });
  it("a real number messaging in demo mode is not flagged and survives a reset", async () => {
    const { t, admin } = await setup();
    setEnv({ WHATSAPP_TEST_RECIPIENTS: "919111122222" });
    await enableBot(t);
    await say(t, "Hi", "919333344444");
    await resetUntilDone(t, admin.clerkId);
    const s = await snapshot(t);
    expect(s.contacts.map((c) => c.waId)).toEqual(["919333344444"]);
    expect(s.messages.length).toBeGreaterThan(0);
  });

  it("an opted-out demo contact keeps its row and opt-out, with bot fields reset", async () => {
    const { t, admin } = await setup();
    const id = await seed(t, "919000000001", { isDemo: true, messagesPerConversation: 3 });
    await t.run(async (ctx) =>
      ctx.db.patch(id, { optedOut: true, botState: "menu", humanHandoff: true }),
    );
    await resetUntilDone(t, admin.clerkId);
    const s = await snapshot(t);
    expect(s.contacts).toHaveLength(1);
    expect(s.contacts[0]).toMatchObject({ optedOut: true, botState: "welcome", humanHandoff: false });
    expect(s.conversations).toHaveLength(0);
    expect(s.messages).toHaveLength(0);
    // ...so a later notification is still refused.
    const sent = await t.action(internal.notifications.sendWhatsApp, {
      to: "+919000000001",
      notificationType: "generic",
      title: "T",
      body: "B",
    });
    expect(sent.delivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not trust the stored flag: a flagged number off the allow-list is kept and un-flagged", async () => {
    const { t, admin } = await setup();
    const id = await seed(t, "919000000001", { isDemo: true, messagesPerConversation: 2 });
    setEnv({ WHATSAPP_TEST_RECIPIENTS: "919111122222" }); // no longer on the list
    await resetUntilDone(t, admin.clerkId);
    const s = await snapshot(t);
    expect(s.contacts.map((c) => c._id)).toEqual([id]);
    expect(s.contacts[0].isDemo).toBe(false);
    expect(s.messages).toHaveLength(2);
  });

  it("clears a kept thread's enquiryId when that enquiry was deleted", async () => {
    const { t, admin } = await setup();
    const id = await seed(t, "919000000001", { isDemo: true, demoEnquiries: 1, realEnquiries: 1 });
    await t.run(async (ctx) => {
      const demo = (
        await ctx.db
          .query("enquiries")
          .withIndex("by_whatsappContactId", (q) => q.eq("whatsappContactId", id))
          .collect()
      ).find((e) => e.isDemo === true)!;
      const conv = (await ctx.db.query("conversations").first())!;
      await ctx.db.patch(conv._id, { enquiryId: demo._id });
    });
    await resetUntilDone(t, admin.clerkId);
    const s = await snapshot(t);
    expect(s.enquiries).toHaveLength(1);
    expect(s.conversations[0].enquiryId).toBeUndefined();
  });

  it("never deletes a converted enquiry, nor its contact", async () => {
    const { t, admin } = await setup();
    const id = await seed(t, "919000000001", { isDemo: true, demoEnquiries: 2 });
    const user = await makeUser(t);
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("enquiries")
        .withIndex("by_whatsappContactId", (q) => q.eq("whatsappContactId", id))
        .collect();
      await ctx.db.patch(rows[0]._id, { convertedUserId: user.id });
    });
    await resetUntilDone(t, admin.clerkId);
    const s = await snapshot(t);
    expect(s.contacts.map((c) => c._id)).toEqual([id]);
    expect(s.enquiries).toHaveLength(1);
    expect(s.enquiries[0].convertedUserId).toBe(user.id);
  });

});

describe("booking status needs the exact normalised number", () => {
  it("refuses the same last ten digits under another country code", async () => {
    const { t, cat } = await readyBot();
    const owner = await makeUser(t);
    const appId = await makeApplication(t, { owner, catalogue: cat, reference: "VD-2026-00077" });
    await t.run(async (ctx) => ctx.db.patch(appId, { customerPhone: "+91 98765 43210" }));
    const other = "449876543210"; // same last 10 digits, UK country code
    await say(t, "Hi", other);
    await pick(t, "menu:status", other);
    await say(t, "VD-2026-00077", other);
    const bodies = (await snapshot(t)).messages.filter((m) => m.direction === "outbound").map((m) => m.body);
    const last = bodies[bodies.length - 1];
    expect(last).toContain("couldn't find a matching booking");
    expect(last).not.toContain(APPLICATION_STATUS_CONFIG.submitted.customerLabel);
  });
});

describe("a bot failure never loses the inbound message or double-replies", () => {
  async function makeStale(t: T) {
    await t.run(async (ctx) => {
      for (const e of await ctx.db.query("whatsappWebhookEvents").collect()) {
        await ctx.db.patch(e._id, { receivedAt: Date.now() - 10 * 60 * 1000 });
      }
    });
  }

  it("keeps the message, marks the event failed with a short name, then retries silently (handed off)", async () => {
    const { t } = await readyBot();
    chaos.failStep = true;
    const payload = messagesPayload([{ id: "wamid.BOOM", text: "my secret words" }]);
    expect((await post(t, payload)).status).toBe(200);
    await settle(t);

    let s = await snapshot(t);
    expect(s.messages.filter((m) => m.direction === "inbound")).toHaveLength(1);
    expect(s.messages.filter((m) => m.direction === "outbound")).toHaveLength(0);
    expect(s.events[0].processingState).toBe("failed");
    expect(s.events[0].lastError).toBe("bot_step_failed:Error");
    expect(JSON.stringify(s.events)).not.toContain("secret");
    expect(fetchMock).not.toHaveBeenCalled();

    // Escalation put the thread in handoff, like setHandoff does.
    expect(s.contacts[0]).toMatchObject({ humanHandoff: true, botState: "handoff" });

    // Meta retries after the pending window: the contact is now with a person,
    // so the bot stays silent, and the event is finished.
    chaos.failStep = false;
    await makeStale(t);
    expect((await post(t, payload)).status).toBe(200);
    await settle(t);
    s = await snapshot(t);
    expect(s.messages.filter((m) => m.direction === "inbound")).toHaveLength(1);
    expect(s.messages.filter((m) => m.direction === "outbound")).toHaveLength(0);
    expect(s.events[0].processingState).toBe("done");

    // A further replay is a duplicate: still nothing sent.
    expect((await post(t, payload)).status).toBe(200);
    await settle(t);
    expect((await snapshot(t)).messages.filter((m) => m.direction === "outbound")).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rolls back a half-applied step: no replies queued, thread handed to staff, retry silent", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    await pick(t, "menu:status");
    const outboundBefore = (await snapshot(t)).messages.filter((m) => m.direction === "outbound").length;
    const calls = fetchMock.mock.calls.length;

    chaos.failQueue = true;
    const payload = messagesPayload([{ id: "wamid.REF", text: "VD-2026-00001" }]);
    expect((await post(t, payload)).status).toBe(200);
    await settle(t);
    let s = await snapshot(t);
    // The step itself rolled back (no replies); only the escalation persisted.
    expect(s.contacts[0]).toMatchObject({ botState: "handoff", humanHandoff: true });
    expect(s.messages.some((m) => m.externalId === "wamid.REF")).toBe(true);
    expect(s.messages.filter((m) => m.direction === "outbound")).toHaveLength(outboundBefore);
    expect(s.events.find((e) => e.waMessageId === "wamid.REF")?.processingState).toBe("failed");
    expect(fetchMock.mock.calls.length).toBe(calls);

    chaos.failQueue = false;
    await makeStale(t);
    await post(t, payload);
    await settle(t);
    await post(t, payload); // duplicate after success
    await settle(t);
    s = await snapshot(t);
    expect(s.contacts[0].botState).toBe("handoff");
    expect(s.messages.filter((m) => m.direction === "outbound")).toHaveLength(outboundBefore);
    expect(s.events.find((e) => e.waMessageId === "wamid.REF")?.processingState).toBe("done");
  });
  it("escalates a failed bot step to staff once: high priority, handoff flag, one notification", async () => {
    const { t } = await readyBot();
    await makeUser(t, { role: "support_agent" });
    chaos.failStep = true;
    const payload = messagesPayload([{ id: "wamid.ESC", text: "Hi" }]);
    await post(t, payload);
    await settle(t);
    const count = async () =>
      (await t.run(async (ctx) => ctx.db.query("notifications").collect())).filter(
        (n) => n.type === "conversation.customer_replied",
      ).length;
    let s = await snapshot(t);
    expect(s.conversations[0].priority).toBe("high");
    expect(s.contacts[0].humanHandoff).toBe(true);
    expect(await count()).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled(); // no fallback reply to the customer

    // Fails again on retry: not notified a second time.
    await makeStale(t);
    await post(t, payload);
    await settle(t);
    expect(await count()).toBe(1);
    s = await snapshot(t);
    expect(s.events[0].processingState).toBe("failed");
  });

  it("a follow-up after escalation does not run the bot, clear the handoff or alert staff again", async () => {
    const { t } = await readyBot();
    await makeUser(t, { role: "support_agent" });
    chaos.failStep = true;
    await say(t, "Hi");
    chaos.failStep = false;
    const count = async () =>
      (await t.run(async (ctx) => ctx.db.query("notifications").collect())).filter(
        (n) => n.type === "conversation.customer_replied",
      ).length;
    expect(await count()).toBe(1);
    await say(t, "hello again");
    await say(t, "hi");
    const s = await snapshot(t);
    expect(s.contacts[0]).toMatchObject({ humanHandoff: true, botState: "handoff" });
    expect(s.messages.filter((m) => m.direction === "outbound")).toHaveLength(0);
    expect(s.events.every((e) => e.processingState === "done" || e.processingState === "failed")).toBe(true);
    expect(await count()).toBe(1);
  });

  it("escalation never downgrades an urgent thread", async () => {
    const { t } = await readyBot();
    await say(t, "Hi");
    const s0 = await snapshot(t);
    await t.run(async (ctx) => ctx.db.patch(s0.conversations[0]._id, { priority: "urgent" }));
    chaos.failStep = true;
    await say(t, "menu");
    expect((await snapshot(t)).conversations[0].priority).toBe("urgent");
  });

  it("the sweep still finds a stuck event behind more than 100 newer finished ones", async () => {
    const t = newTest();
    const old = await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < 120; i += 1) {
        await ctx.db.insert("whatsappWebhookEvents", {
          dedupeKey: `msg:done${i}`,
          kind: "message",
          receivedAt: now - 11 * 60 * 1000 - i,
          processingState: "done",
          attempts: 0,
        });
      }
      return await ctx.db.insert("whatsappWebhookEvents", {
        dedupeKey: "msg:stuck",
        kind: "message",
        receivedAt: now - 20 * 60 * 1000,
        processingState: "pending",
        attempts: 0,
      });
    });
    const r = await t.mutation(internal.whatsapp.sweepStuckEvents, {});
    expect(r.failed).toBe(1);
    expect((await t.run(async (ctx) => ctx.db.get(old)))?.processingState).toBe("failed");
  });

  it("the cron fails an event stuck pending for over 10 minutes and alerts staff once", async () => {
    const { t } = await readyBot();
    await makeUser(t, { role: "support_agent" });
    await say(t, "Hi");
    const s0 = await snapshot(t);
    // Simulate a lost bot job: inbound recorded, event never finished.
    await t.run(async (ctx) =>
      ctx.db.patch(s0.events[0]._id, {
        processingState: "pending",
        receivedAt: Date.now() - 15 * 60 * 1000,
      }),
    );
    const r1 = await t.mutation(internal.whatsapp.sweepStuckEvents, {});
    const r2 = await t.mutation(internal.whatsapp.sweepStuckEvents, {});
    await settle(t);
    expect(r1.failed).toBe(1);
    expect(r2.failed).toBe(0);
    const s = await snapshot(t);
    expect(s.events[0]).toMatchObject({ processingState: "failed", lastError: "stuck_pending" });
    expect(s.conversations[0].priority).toBe("high");
    const n = (await t.run(async (ctx) => ctx.db.query("notifications").collect())).filter(
      (x) => x.type === "conversation.customer_replied",
    );
    expect(n).toHaveLength(1);
  });

  it("a stale retry does not rewrite contact state", async () => {
    const { t } = await readyBot();
    chaos.failStep = true;
    const payload = messagesPayload([{ id: "wamid.RETRY", text: "Hi" }]);
    await post(t, payload);
    await settle(t);
    const before = (await snapshot(t)).contacts[0];
    chaos.failStep = false;
    await makeStale(t);
    await post(t, payload);
    await settle(t);
    const after = (await snapshot(t)).contacts[0];
    expect(after.lastInboundAt).toBe(before.lastInboundAt);
  });

});

describe("enquiries from WhatsApp", () => {
  async function botEnquiry(t: T) {
    const slug = await destSlug(t);
    await walkToConfirm(t, slug, "typed@example.test");
    await pick(t, "confirm:yes");
    return (await snapshot(t)).enquiries[0];
  }

  it("convert needs an explicit userId and never matches by typed email", async () => {
    const { t } = await readyBot();
    const customer = await makeUser(t, { email: "typed@example.test" });
    const enquiry = await botEnquiry(t);
    const admin = await makeUser(t, { role: "admin" });

    const code = await codeOf(() =>
      as(t, admin.clerkId).mutation(api.enquiries.convertToApplication, { enquiryId: enquiry._id }),
    );
    expect(code).toBe("USER_REQUIRED");
    const users = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(users.some((u) => u.clerkId.startsWith("pending:"))).toBe(false);

    const ok = await as(t, admin.clerkId).mutation(api.enquiries.convertToApplication, {
      enquiryId: enquiry._id,
      userId: customer.id,
    });
    expect(ok.userId).toBe(customer.id);
  });

  it("convert still matches by email for other sources", async () => {
    const t = newTest();
    const customer = await makeUser(t, { email: "web@example.test" });
    const admin = await makeUser(t, { role: "admin" });
    const { enquiryId } = await t.mutation(api.enquiries.submit, {
      fullName: "Web Person",
      email: "web@example.test",
      phone: "+91 98765 43210",
      message: "I would like some help",
    });
    const r = await as(t, admin.clerkId).mutation(api.enquiries.convertToApplication, { enquiryId });
    expect(r.userId).toBe(customer.id);
  });

  it("the public submit cannot claim the whatsapp source", async () => {
    const t = newTest();
    const { enquiryId } = await t.mutation(api.enquiries.submit, {
      fullName: "Web Person",
      email: "web2@example.test",
      phone: "+91 98765 43210",
      message: "I would like some help",
      source: "whatsapp",
    });
    const row = await t.run(async (ctx) => ctx.db.get(enquiryId));
    expect(row?.source).toBe("website_form");
  });
});

describe("webhook body handling", () => {
  it("verifies the signature over the raw bytes (a BOM-prefixed body is not re-decoded first)", async () => {
    const { t } = await readyBot();
    const json = JSON.stringify(messagesPayload([{ id: "wamid.BOM", text: "Hi" }]));
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(json)]);
    const signature = `sha256=${await hmacSha256Hex(APP_SECRET, bytes.buffer as ArrayBuffer)}`;
    const res = await t.fetch("/whatsapp-webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": signature },
      body: bytes,
    });
    expect(res.status).toBe(200);
    await settle(t);
    expect((await snapshot(t)).events).toHaveLength(1);
  });

  it("returns 500 when every item is for another phone number id", async () => {
    const { t } = await readyBot();
    const payload = messagesPayload([{ id: "wamid.FOREIGN", text: "Hi" }]);
    (payload.entry[0].changes[0].value as Record<string, unknown>).metadata = { phone_number_id: "WRONG" };
    expect((await post(t, payload)).status).toBe(500);
    expect((await snapshot(t)).events).toHaveLength(0);
  });

  it("a mixed request is accepted and only our items are processed", async () => {
    const { t } = await readyBot();
    const payload = messagesPayload([{ id: "wamid.OURS", text: "Hi" }]);
    (payload.entry[0].changes[0].value as Record<string, unknown>).metadata = { phone_number_id: "1234567890" };
    const other = messagesPayload([{ id: "wamid.THEIRS", text: "Hi", from: "919333344444" }]);
    (other.entry[0].changes[0].value as Record<string, unknown>).metadata = { phone_number_id: "WRONG" };
    payload.entry[0].changes.push(other.entry[0].changes[0]);
    expect((await post(t, payload)).status).toBe(200);
    await settle(t);
    expect((await snapshot(t)).events.map((e) => e.waMessageId)).toEqual(["wamid.OURS"]);
  });

  it("one malformed message does not fail the batch", async () => {
    const { t } = await readyBot();
    const payload = messagesPayload([{ id: "wamid.GOOD", text: "Hi" }]);
    (payload.entry[0].changes[0].value.messages as unknown[]).push({ id: "wamid.BAD" /* no from/type */ });
    expect((await post(t, payload)).status).toBe(200);
    await settle(t);
    const s = await snapshot(t);
    expect(s.events.map((e) => e.waMessageId)).toEqual(["wamid.GOOD"]);
    expect(s.messages.filter((m) => m.direction === "inbound")).toHaveLength(1);
  });
});
