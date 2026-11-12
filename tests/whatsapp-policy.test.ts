import { describe, expect, it } from "vitest";
import { sendGraphMessage, toGraphBody } from "../lib/whatsapp/client";
import {
  checkSendPolicy,
  lastTenDigits,
  parseRecipients,
  readWhatsAppEnv,
  retryDelayMs,
  WINDOW_MS,
} from "../lib/whatsapp/policy";
import { normaliseWebhook, normaliseWebhookDetailed } from "../lib/whatsapp/webhook";

const NOW = 1_800_000_000_000;
const base = {
  waId: "919876543210",
  optedOut: false,
  lastInboundAt: NOW - 1000,
  now: NOW,
  env: { demoMode: false, testRecipients: [] as string[] },
};

describe("send policy", () => {
  it("allows a normal in-window send", () => {
    expect(checkSendPolicy(base)).toEqual({ ok: true });
  });
  it("refuses opted-out contacts except the STOP acknowledgement", () => {
    expect(checkSendPolicy({ ...base, optedOut: true })).toMatchObject({ ok: false, code: "OPTED_OUT" });
    expect(checkSendPolicy({ ...base, optedOut: true, optOutAcknowledgement: true })).toEqual({ ok: true });
  });
  it("applies the demo allow-list", () => {
    const env = { demoMode: true, testRecipients: ["919111111111"] };
    expect(checkSendPolicy({ ...base, env })).toMatchObject({ code: "DEMO_RECIPIENT_BLOCKED" });
    expect(checkSendPolicy({ ...base, env, waId: "919111111111" })).toEqual({ ok: true });
  });
  it("closes the window after 24h and allows a template", () => {
    const old = { ...base, lastInboundAt: NOW - WINDOW_MS - 1 };
    expect(checkSendPolicy(old)).toMatchObject({ code: "WINDOW_CLOSED" });
    expect(checkSendPolicy({ ...old, usingTemplate: true })).toEqual({ ok: true });
    expect(checkSendPolicy({ ...base, lastInboundAt: undefined })).toMatchObject({ code: "WINDOW_CLOSED" });
  });
  it("parses env and backoff", () => {
    expect(parseRecipients("+91 98765 43210, 12")).toEqual(["919876543210"]);
    expect(readWhatsAppEnv({}).graphVersion).toBe("v21.0");
    expect(readWhatsAppEnv({ WHATSAPP_BOT_ENABLED: "false" }).botEnvEnabled).toBe(false);
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([60_000, 300_000, 1_800_000, null]);
    expect(lastTenDigits("+91 98765-43210")).toBe("9876543210");
    expect(lastTenDigits("12345")).toBeNull();
  });
});

describe("graph client", () => {
  it("maps list and button messages to interactive payloads", () => {
    const list = toGraphBody("91", {
      type: "list",
      body: "b",
      buttonLabel: "Go",
      rows: [{ id: "a", title: "A" }],
    }) as { interactive: { type: string } };
    expect(list.interactive.type).toBe("list");
    const buttons = toGraphBody("91", {
      type: "buttons",
      body: "b",
      buttons: [{ id: "a", title: "A" }],
    }) as { interactive: { type: string } };
    expect(buttons.interactive.type).toBe("button");
  });

  it("reduces errors to a short code and title with the token redacted", async () => {
    const fetchStub = async () =>
      new Response(JSON.stringify({ error: { code: 190, message: "bad tok-123 here" } }), { status: 401 });
    const original = globalThis.fetch;
    globalThis.fetch = fetchStub as typeof fetch;
    try {
      const r = await sendGraphMessage({
        token: "tok-123",
        phoneNumberId: "1",
        version: "v21.0",
        to: "91",
        payload: { type: "text", body: "x" },
      });
      expect(r).toEqual({ ok: false, retryable: false, code: "401/190", title: "bad [redacted] here" });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("webhook normaliser", () => {
  it("drops media ids and rejects other objects", () => {
    expect(normaliseWebhook({ object: "page", entry: [] })).toBeNull();
    const items = normaliseWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: "91", id: "w1", type: "image", image: { id: "SECRETMEDIA" } }],
                statuses: [{ id: "w2", status: "deleted" }],
              },
            },
          ],
        },
      ],
    });
    expect(items).toEqual([
      { kind: "message", wamid: "w1", from: "91", profileName: undefined, message: { type: "unsupported", mediaType: "image" } },
    ]);
  });

  const wrap = (value: unknown) => ({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value }] }],
  });
  const msg = (i: number) => ({ from: "919876543210", id: `w${i}`, type: "text", text: { body: "hi" } });

  it("keeps the first 100 items and reports how many were over the cap", () => {
    const r = normaliseWebhookDetailed(wrap({ messages: Array.from({ length: 130 }, (_, i) => msg(i)) }))!;
    expect(r.items).toHaveLength(100);
    expect(r.truncated).toBe(30);
    expect(r.skipped).toBe(0);
  });

  it("skips a malformed item instead of failing the whole batch", () => {
    const r = normaliseWebhookDetailed(
      wrap({
        messages: [msg(1), { id: "bad" /* no from/type */ }, msg(2)],
        statuses: [{ status: "sent" /* no id */ }, { id: "ok", status: "read" }],
      }),
    )!;
    expect(r.items.map((i) => i.wamid)).toEqual(["w1", "w2", "ok"]);
    expect(r.skipped).toBe(2);
    expect(normaliseWebhook(wrap({ messages: [{ nonsense: true }] }))).toEqual([]);
  });

  it("skips and counts items addressed to another phone number id", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            { value: { metadata: { phone_number_id: "OURS" }, messages: [msg(1)] } },
            { value: { metadata: { phone_number_id: "OTHER" }, messages: [msg(2), msg(3)] } },
          ],
        },
      ],
    };
    const r = normaliseWebhookDetailed(payload, "OURS")!;
    expect(r.items.map((x) => x.wamid)).toEqual(["w1"]);
    expect(r.foreign).toBe(2);
    // Without a configured id nothing is filtered.
    expect(normaliseWebhookDetailed(payload)!.items).toHaveLength(3);
  });
});
