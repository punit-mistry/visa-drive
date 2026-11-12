import { describe, expect, it } from "vitest";
import { buttonsMessage, listMessage, META_LIMITS, textMessage } from "../lib/whatsapp/builders";
import { COPY } from "../lib/whatsapp/copy";
import { parseTravelDate, step } from "../lib/whatsapp/engine";
import type {
  BotData,
  Catalogue,
  InboundMessage,
  OutboundMessage,
  StepId,
  StepResult,
} from "../lib/whatsapp/types";

// 2026-11-12 10:00 IST
const NOW = Date.UTC(2026, 10, 12, 4, 30);
const SITE = "https://visadrive.in/";

const SMALL: Catalogue = {
  destinations: [
    { slug: "united-states", name: "United States" },
    { slug: "united-kingdom", name: "United Kingdom" },
    { slug: "canada", name: "Canada" },
  ],
  categories: [
    { id: "tourist", label: "Tourist" },
    { id: "business", label: "Business" },
  ],
  durations: [
    { id: "short", label: "Up to 30 days" },
    { id: "long", label: "Up to 90 days" },
  ],
};

function bigCatalogue(n: number): Catalogue {
  return {
    ...SMALL,
    destinations: Array.from({ length: n }, (_, i) => ({ slug: `c${i + 1}`, name: `Country ${i + 1}` })),
  };
}

interface Session {
  state: StepId;
  data: BotData;
  history: StepId[];
}

function fresh(state: StepId = "welcome"): Session {
  return { state, data: {}, history: [] };
}

function text(t: string): InboundMessage {
  return { type: "text", text: t };
}
function pick(id: string): InboundMessage {
  return { type: "interactive", id };
}

function send(
  s: Session,
  message: InboundMessage,
  opts: { catalogue?: Catalogue; optedOut?: boolean } = {},
): StepResult {
  const r = step({
    state: s.state,
    data: s.data,
    history: s.history,
    message,
    catalogue: opts.catalogue ?? SMALL,
    now: NOW,
    siteUrl: SITE,
    optedOut: opts.optedOut,
  });
  s.state = r.state;
  s.data = r.data;
  s.history = r.history;
  return r;
}

function say(s: Session, t: string, opts?: { catalogue?: Catalogue; optedOut?: boolean }): StepResult {
  return send(s, text(t), opts);
}

function lastReply(r: StepResult): OutboundMessage {
  const m = r.replies[r.replies.length - 1];
  if (!m) throw new Error("no reply");
  return m;
}

function bodyOf(m: OutboundMessage): string {
  return m.body;
}

function rowTitles(m: OutboundMessage): string[] {
  if (m.type !== "list") throw new Error("not a list");
  return m.rows.map((r) => r.title);
}

function allText(r: StepResult): string {
  return r.replies.map(bodyOf).join("\n");
}

/** Walk the happy path up to (and including) the confirm summary. */
function toConfirm(): Session {
  const s = fresh();
  say(s, "Hi");
  say(s, "1");
  say(s, "1"); // United States
  say(s, "1"); // Tourist
  say(s, "2"); // 90 days
  say(s, "15/01/2027");
  say(s, "2");
  say(s, "Asha Rao");
  say(s, "asha@example.com");
  return s;
}

describe("welcome and menu", () => {
  it("answers Hi with the menu as a list of four options", () => {
    const s = fresh();
    const r = say(s, "Hi");
    expect(s.state).toBe("menu");
    const m = lastReply(r);
    expect(m.type).toBe("list");
    expect(rowTitles(m)).toEqual([
      "Apply for New Visa",
      "Visa Requirements",
      "Check Booking Status",
      "Talk to Support",
    ]);
  });

  it("re-shows the menu for unrecognised input", () => {
    const s = fresh("menu");
    const r = say(s, "blah");
    expect(s.state).toBe("menu");
    expect(r.replies).toHaveLength(2);
    expect(lastReply(r).type).toBe("list");
  });

  it("selects menu options by number and by interactive id", () => {
    const a = fresh("menu");
    say(a, "1");
    expect(a.state).toBe("destination_p1");
    const b = fresh("menu");
    send(b, pick("menu:status"));
    expect(b.state).toBe("status_reference");
  });
});

describe("country selection", () => {
  it("selects by number", () => {
    const s = fresh("destination_p1");
    say(s, "2");
    expect(s.data.destinationSlug).toBe("united-kingdom");
    expect(s.state).toBe("category");
  });

  it("selects by exact and partial text", () => {
    const a = fresh("destination_p1");
    say(a, "canada");
    expect(a.data.destinationName).toBe("Canada");
    const b = fresh("destination_p1");
    say(b, "kingdom");
    expect(b.data.destinationSlug).toBe("united-kingdom");
  });

  it("rejects an unknown or ambiguous country without changing state", () => {
    const s = fresh("destination_p1");
    const r = say(s, "narnia");
    expect(s.state).toBe("destination_p1");
    expect(s.data).toEqual({});
    expect(lastReply(r).type).toBe("list");
    const r2 = say(s, "united");
    expect(s.state).toBe("destination_p1");
    expect(r2.replies.length).toBeGreaterThan(0);
    say(s, "99");
    expect(s.state).toBe("destination_p1");
  });

  it("pages through more than 9 destinations with a More row", () => {
    const cat = bigCatalogue(14);
    const s2 = fresh("menu");
    say(s2, "1", { catalogue: cat });
    const first = send(s2, pick("nonsense"), { catalogue: cat }); // invalid id re-shows page 1
    const list = lastReply(first);
    if (list.type !== "list") throw new Error("expected list");
    expect(list.rows).toHaveLength(10);
    expect(list.rows[9]?.id).toBe("dest:more");

    const next = send(s2, pick("dest:more"), { catalogue: cat });
    expect(s2.state).toBe("destination_p2");
    const page2 = lastReply(next);
    expect(rowTitles(page2)).toEqual(["Country 10", "Country 11", "Country 12", "Country 13", "Country 14"]);

    say(s2, "2", { catalogue: cat });
    expect(s2.data.destinationSlug).toBe("c11");
  });

  it("finds a destination on another page by typing its name", () => {
    const cat = bigCatalogue(14);
    const s = fresh("destination_p1");
    say(s, "Country 13", { catalogue: cat });
    expect(s.data.destinationSlug).toBe("c13");
    expect(s.state).toBe("category");
  });

  it("numeric choice picks the Nth row of the last shown page", () => {
    const cat = bigCatalogue(14);
    const s = fresh("destination_p2");
    say(s, "3", { catalogue: cat });
    expect(s.data.destinationSlug).toBe("c12");
  });
});

describe("category and duration", () => {
  it("accepts category by number, text and id, and rejects junk", () => {
    const a = fresh("category");
    say(a, "2");
    expect(a.data.category).toBe("Business");
    expect(a.state).toBe("duration");
    const b = fresh("category");
    say(b, "tourist");
    expect(b.data.category).toBe("Tourist");
    const c = fresh("category");
    send(c, pick("cat:business"));
    expect(c.data.category).toBe("Business");
    const d = fresh("category");
    say(d, "spaceship");
    expect(d.state).toBe("category");
    expect(d.data.category).toBeUndefined();
  });

  it("accepts duration and rejects junk", () => {
    const a = fresh("duration");
    say(a, "1");
    expect(a.data.duration).toBe("Up to 30 days");
    expect(a.state).toBe("travel_date");
    const b = fresh("duration");
    say(b, "7");
    expect(b.state).toBe("duration");
  });
});

describe("travel date", () => {
  it("parses supported formats to midnight IST", () => {
    const expected = Date.UTC(2027, 0, 15) - 330 * 60 * 1000;
    for (const t of ["15/01/2027", "15-01-2027", "15 Jan 2027", "15 January 2027", "15th Jan, 2027", "5/1/2027"]) {
      const r = parseTravelDate(t, NOW);
      expect(r.ok, t).toBe(true);
      if (r.ok && !t.startsWith("5/")) expect(r.value, t).toBe(expected);
    }
  });

  it("rejects garbage and non-existent dates", () => {
    for (const t of ["soon", "2027-01-15", "31/02/2027", "15 Foo 2027", "32/01/2027", ""]) {
      expect(parseTravelDate(t, NOW), t).toEqual({ ok: false, reason: "format" });
    }
  });

  it("rejects today and the past, accepts tomorrow", () => {
    expect(parseTravelDate("12/11/2026", NOW)).toEqual({ ok: false, reason: "past" });
    expect(parseTravelDate("01/01/2020", NOW)).toEqual({ ok: false, reason: "past" });
    expect(parseTravelDate("13/11/2026", NOW).ok).toBe(true);
  });

  it("uses the IST calendar day, not UTC", () => {
    // 2026-11-12 02:00 IST is still 11 Nov in UTC; "today" is the 12th.
    const earlyIst = Date.UTC(2026, 10, 11, 20, 30);
    expect(parseTravelDate("12/11/2026", earlyIst)).toEqual({ ok: false, reason: "past" });
    expect(parseTravelDate("13/11/2026", earlyIst).ok).toBe(true);
  });

  it("allows up to two years ahead and no further", () => {
    expect(parseTravelDate("12/11/2028", NOW).ok).toBe(true);
    expect(parseTravelDate("13/11/2028", NOW)).toEqual({ ok: false, reason: "too_far" });
  });

  it("re-prompts with a specific message and keeps state", () => {
    const s = fresh("travel_date");
    expect(allText(say(s, "nonsense"))).toContain("couldn't read");
    expect(allText(say(s, "01/01/2020"))).toContain("already passed");
    expect(allText(say(s, "01/01/2040"))).toContain("two years");
    expect(s.state).toBe("travel_date");
    expect(s.data.travelDate).toBeUndefined();
    say(s, "15/01/2027");
    expect(s.state).toBe("travellers");
  });
});

describe("travellers, name, email", () => {
  it("enforces 1 to 20 whole numbers", () => {
    for (const bad of ["0", "21", "-1", "2.5", "two", "", "1000"]) {
      const s = fresh("travellers");
      say(s, bad);
      expect(s.state, bad).toBe("travellers");
    }
    for (const good of ["1", "20", " 7 "]) {
      const s = fresh("travellers");
      say(s, good);
      expect(s.state, good).toBe("full_name");
    }
  });

  it("validates names", () => {
    for (const bad of ["A", "R2D2", "x".repeat(81), "Asha <b>", "  "]) {
      const s = fresh("full_name");
      say(s, bad);
      expect(s.state, bad).toBe("full_name");
    }
    for (const good of ["Asha Rao", "Mary-Jane O'Neil", "Dr. Priya  Nair", "José Álvarez", "Li"]) {
      const s = fresh("full_name");
      say(s, good);
      expect(s.state, good).toBe("email");
    }
    const s = fresh("full_name");
    say(s, "  Asha   Rao ");
    expect(s.data.fullName).toBe("Asha Rao");
  });

  it("validates and normalises email", () => {
    for (const bad of ["nope", "a@b", "a b@c.com", "@x.com"]) {
      const s = fresh("email");
      say(s, bad);
      expect(s.state, bad).toBe("email");
    }
    const s = fresh("email");
    s.data = {
      destinationSlug: "canada", destinationName: "Canada", category: "Tourist",
      duration: "Up to 30 days", travelDate: NOW + 86_400_000 * 90, travellers: 1, fullName: "Asha Rao",
    };
    say(s, " Asha@Example.COM ");
    expect(s.data.email).toBe("asha@example.com");
    expect(s.state).toBe("confirm");
  });
});

describe("confirm, edit, cancel", () => {
  it("shows a summary with three buttons", () => {
    const s = toConfirm();
    expect(s.state).toBe("confirm");
    const r = say(s, "garbage");
    const m = lastReply(r);
    expect(m.type).toBe("buttons");
    if (m.type === "buttons") {
      expect(m.buttons.map((b) => b.title)).toEqual(["Confirm", "Edit", "Cancel"]);
      expect(m.body).toContain("United States");
      expect(m.body).toContain("asha@example.com");
    }
    expect(s.state).toBe("confirm");
  });

  it("confirm emits create_enquiry with every field and returns to the menu", () => {
    const s = toConfirm();
    const r = send(s, pick("confirm:yes"));
    expect(r.effects).toEqual([
      {
        type: "create_enquiry",
        data: {
          destinationSlug: "united-states",
          destinationName: "United States",
          category: "Tourist",
          duration: "Up to 90 days",
          travelDate: Date.UTC(2027, 0, 15) - 330 * 60 * 1000,
          travellers: 2,
          fullName: "Asha Rao",
          email: "asha@example.com",
        },
      },
    ]);
    expect(s.state).toBe("menu");
    expect(s.data).toEqual({});
    expect(s.history).toEqual([]);
    const body = allText(r).toLowerCase();
    expect(body).toContain("not a visa application");
    expect(body).not.toContain("approved");
  });

  it("confirm also works by text and number", () => {
    const a = toConfirm();
    expect(say(a, "confirm").effects[0]?.type).toBe("create_enquiry");
    const b = toConfirm();
    expect(say(b, "1").effects[0]?.type).toBe("create_enquiry");
  });

  it("cancel discards everything and emits no effect", () => {
    const s = toConfirm();
    const r = say(s, "cancel");
    expect(r.effects).toEqual([]);
    expect(s.state).toBe("menu");
    expect(s.data).toEqual({});
  });

  it("edit lets the user change one field and returns to the summary", () => {
    const s = toConfirm();
    const r = say(s, "edit");
    expect(s.state).toBe("edit_choice");
    expect(lastReply(r).type).toBe("list");
    send(s, pick("edit:travellers"));
    expect(s.state).toBe("travellers");
    say(s, "4");
    expect(s.state).toBe("confirm");
    expect(s.data.travellers).toBe(4);
    expect(s.data.fullName).toBe("Asha Rao");
    const done = send(s, pick("confirm:yes"));
    const effect = done.effects[0];
    expect(effect?.type === "create_enquiry" && effect.data.travellers).toBe(4);
  });

  it("edit by number works for every field and returns to confirm", () => {
    const inputs: Record<string, string> = {
      "1": "canada", "2": "business", "3": "1", "4": "20/02/2027", "5": "3", "6": "New Name", "7": "n@x.com",
    };
    for (const [n, answer] of Object.entries(inputs)) {
      const s = toConfirm();
      say(s, "edit");
      say(s, n);
      expect(s.state).not.toBe("edit_choice");
      say(s, answer);
      expect(s.state, `field ${n}`).toBe("confirm");
    }
  });

  it("an invalid answer during edit stays on that field", () => {
    const s = toConfirm();
    say(s, "edit");
    say(s, "5");
    say(s, "99");
    expect(s.state).toBe("travellers");
    expect(s.data.travellers).toBe(2);
  });

  it("back from the edit list returns to the summary", () => {
    const s = toConfirm();
    say(s, "edit");
    say(s, "back");
    expect(s.state).toBe("confirm");
  });
});

describe("global commands", () => {
  it.each(["menu", "hi", "Hello", "start", "restart"])("%s resets to the welcome menu mid-flow", (word) => {
    const s = toConfirm();
    const r = say(s, word);
    expect(s.state).toBe("menu");
    expect(s.data).toEqual({});
    expect(s.history).toEqual([]);
    expect(lastReply(r).type).toBe("list");
  });

  it("back steps through the flow one question at a time", () => {
    const s = toConfirm();
    const trail: StepId[] = [];
    for (let i = 0; i < 9; i++) {
      say(s, "back");
      trail.push(s.state);
    }
    expect(trail.slice(0, 8)).toEqual([
      "email", "full_name", "travellers", "travel_date", "duration", "category", "destination_p1", "menu",
    ]);
    expect(s.state).toBe("menu");
  });

  it.each<[StepId, StepId]>([
    ["destination_p1", "menu"],
    ["category", "destination_p1"],
    ["duration", "category"],
    ["travel_date", "duration"],
    ["travellers", "travel_date"],
    ["full_name", "travellers"],
    ["email", "full_name"],
    ["confirm", "email"],
    ["status_reference", "menu"],
  ])("back from %s goes to %s", (from, to) => {
    const s: Session = { state: from, data: {}, history: [to] };
    const r = say(s, "back");
    expect(s.state).toBe(to);
    expect(s.history).toEqual([]);
    expect(r.replies.length).toBeGreaterThan(0);
  });

  it("back with no history shows the menu", () => {
    const s = fresh("menu");
    say(s, "back");
    expect(s.state).toBe("menu");
  });

  it.each(["agent", "human", "Support"])("%s hands off to a person", (word) => {
    const s = toConfirm();
    const r = say(s, word);
    expect(r.effects).toEqual([{ type: "handoff" }]);
    expect(s.state).toBe("handoff");
  });

  it("menu option 4 hands off, and the bot stays quiet until reset", () => {
    const s = fresh("menu");
    expect(say(s, "4").effects).toEqual([{ type: "handoff" }]);
    const quiet = say(s, "any question about my visa");
    expect(quiet.replies).toEqual([]);
    expect(quiet.effects).toEqual([]);
    say(s, "menu");
    expect(s.state).toBe("menu");
  });

  it("stop opts out and an opted-out contact only hears back on START", () => {
    const s = fresh("category");
    expect(say(s, "STOP").effects).toEqual([{ type: "opt_out" }]);
    expect(say(s, "unsubscribe").effects).toEqual([{ type: "opt_out" }]);

    const silent = say(s, "hello", { optedOut: true });
    expect(silent.replies).toEqual([]);
    expect(silent.effects).toEqual([]);
    expect(say(s, "stop", { optedOut: true }).replies).toEqual([]);

    const back = say(s, "start", { optedOut: true });
    expect(back.effects).toEqual([{ type: "opt_in" }]);
    expect(s.state).toBe("menu");
    expect(say(fresh("menu"), "subscribe", { optedOut: true }).effects).toEqual([{ type: "opt_in" }]);
  });

  it.each(["hi", "Hello", "hey", "back", "start", "subscribe", "agent"])(
    "%s does not leave a human handoff",
    (word) => {
      const s = fresh("handoff");
      const r = say(s, word);
      expect(s.state).toBe("handoff");
      expect(r.replies).toEqual([]);
      expect(r.effects).toEqual([]);
    },
  );

  it("menu leaves a handoff, and STOP opts out from it", () => {
    const s = fresh("handoff");
    say(s, "menu");
    expect(s.state).toBe("menu");

    const h = fresh("handoff");
    const r = say(h, "STOP");
    expect(r.effects).toEqual([{ type: "opt_out" }]);
    expect(r.replies).toHaveLength(1);
  });

  it("START in a handoff resubscribes only when opted out, and keeps the handoff", () => {
    const s = fresh("handoff");
    const r = say(s, "start", { optedOut: true });
    expect(r.effects).toEqual([{ type: "opt_in" }]);
    expect(s.state).toBe("handoff");
  });

  it("start and subscribe do not opt in a contact who is not opted out", () => {
    expect(say(fresh("menu"), "start").effects).toEqual([]);
    const r = say(fresh("menu"), "subscribe");
    expect(r.effects).toEqual([]);
    expect(r.replies).toHaveLength(1);
  });
});

describe("unsupported media", () => {
  it("asks for the secure portal and changes nothing", () => {
    const s = toConfirm();
    const before = JSON.stringify(s);
    const r = send(s, { type: "unsupported", mediaType: "image" });
    expect(JSON.stringify(s)).toBe(before);
    expect(r.effects).toEqual([]);
    const body = allText(r).toLowerCase();
    expect(body).toContain("passport");
    expect(body).toContain("secure portal");
  });

  it("stays silent during a human handoff", () => {
    const s = fresh("handoff");
    expect(send(s, { type: "unsupported", mediaType: "document" }).replies).toEqual([]);
    expect(s.state).toBe("handoff");
  });
});

describe("requirements and status", () => {
  it("points to the website page, states no figures, and offers an enquiry", () => {
    const s = fresh("menu");
    say(s, "2");
    expect(s.state).toBe("req_destination_p1");
    const r = say(s, "1");
    expect(s.state).toBe("req_followup");
    const m = lastReply(r);
    expect(m.type).toBe("buttons");
    expect(m.body).toContain("https://visadrive.in/destinations/united-states");
    expect(m.body).not.toMatch(/₹|\$|Rs\.?|\d+\s*(days|hours)/i);
    expect(r.effects).toEqual([]);

    say(s, "1");
    expect(s.state).toBe("category");
    expect(s.data.destinationSlug).toBe("united-states");
  });

  it("requirements follow-up can return to the menu", () => {
    const s = fresh("menu");
    say(s, "2");
    say(s, "canada");
    say(s, "Main menu");
    expect(s.state).toBe("menu");
    expect(s.data).toEqual({});
  });

  it("asks for a reference and emits lookup_status", () => {
    const s = fresh("menu");
    say(s, "3");
    expect(s.state).toBe("status_reference");
    const bad = say(s, "my booking");
    expect(bad.effects).toEqual([]);
    expect(s.state).toBe("status_reference");
    const r = say(s, "it is vd-2026-00042 thanks");
    expect(r.effects).toEqual([{ type: "lookup_status", reference: "VD-2026-00042" }]);
    expect(s.state).toBe("menu");
    expect(allText(r).toLowerCase()).not.toContain("approved");
  });

  it("accepts the four-digit form of the reference", () => {
    const s = fresh("status_reference");
    expect(say(s, "VD-2026-0042").effects).toEqual([{ type: "lookup_status", reference: "VD-2026-0042" }]);
  });
});

describe("Meta limits", () => {
  it("rejects more than 3 buttons and truncates long titles to 20", () => {
    const four = ["a", "b", "c", "d"].map((x) => ({ id: x, title: x }));
    expect(() => buttonsMessage("x", four)).toThrow();
    expect(() => buttonsMessage("x", [])).toThrow();
    const m = buttonsMessage("x", [{ id: "1", title: "A very long button title indeed" }]);
    if (m.type !== "buttons") throw new Error();
    expect(m.buttons[0]?.title.length).toBeLessThanOrEqual(META_LIMITS.buttonTitle);
  });

  it("rejects more than 10 rows and truncates titles to 24 and descriptions to 72", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ id: `${i}`, title: `t${i}` }));
    expect(() => listMessage("x", "Go", eleven)).toThrow();
    expect(() => listMessage("x", "Go", [])).toThrow();
    const m = listMessage("x", "A rather long button label", [
      { id: "1", title: "T".repeat(40), description: "D".repeat(200) },
    ]);
    if (m.type !== "list") throw new Error();
    expect(m.rows[0]?.title.length).toBe(META_LIMITS.listRowTitle);
    expect(m.rows[0]?.description?.length).toBe(META_LIMITS.listRowDescription);
    expect(m.buttonLabel.length).toBeLessThanOrEqual(META_LIMITS.listButtonLabel);
  });

  it("caps text bodies", () => {
    const m = textMessage("x".repeat(5000));
    expect(m.body.length).toBeLessThanOrEqual(META_LIMITS.textBody);
  });

  it("every message the engine emits across the flow is within limits", () => {
    const cat: Catalogue = {
      destinations: Array.from({ length: 25 }, (_, i) => ({ slug: `c${i}`, name: `Some Very Long Country Name ${i}` })),
      categories: Array.from({ length: 14 }, (_, i) => ({ id: `k${i}`, label: `A really long visa category label ${i}` })),
      durations: Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, label: `Duration ${i}` })),
    };
    const states: StepId[] = [
      "welcome", "menu", "destination_p1", "destination_p2", "destination_p3", "req_destination_p1",
      "category", "duration", "travel_date", "travellers", "full_name", "email", "edit_choice", "status_reference",
    ];
    for (const state of states) {
      const r = step({
        state, data: {}, history: [], message: text("???"), catalogue: cat, now: NOW, siteUrl: SITE,
      });
      for (const m of r.replies) {
        if (m.type === "list") {
          expect(m.rows.length).toBeLessThanOrEqual(10);
          for (const row of m.rows) {
            expect(row.title.length).toBeLessThanOrEqual(24);
            expect((row.description ?? "").length).toBeLessThanOrEqual(72);
          }
        } else if (m.type === "buttons") {
          expect(m.buttons.length).toBeLessThanOrEqual(3);
          for (const b of m.buttons) expect(b.title.length).toBeLessThanOrEqual(20);
        }
      }
    }
    const s = toConfirm();
    const m = lastReply(say(s, "x"));
    if (m.type === "buttons") expect(m.body.length).toBeLessThanOrEqual(META_LIMITS.interactiveBody);
  });

  it("copy never quotes fees, timelines or promises approval", () => {
    const copy = JSON.stringify(COPY.en.requirementsPointer("X", "https://x")) + COPY.en.enquiryCreated;
    expect(copy.toLowerCase()).not.toMatch(/guarantee(d)? approval|will be approved|₹/);
  });
});

describe("purity", () => {
  it("does not mutate its input", () => {
    const input = {
      state: "category" as StepId,
      data: { destinationSlug: "canada" } as BotData,
      history: ["menu"] as StepId[],
    };
    const snapshot = JSON.stringify(input);
    step({ ...input, message: text("tourist"), catalogue: SMALL, now: NOW, siteUrl: SITE });
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
