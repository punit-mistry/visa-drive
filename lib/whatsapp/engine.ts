import { z } from "zod";
import { buttonsMessage, listMessage, textMessage } from "./builders";
import { COPY, type Copy } from "./copy";
import type {
  BotData,
  Catalogue,
  DestinationStepId,
  Effect,
  EnquiryData,
  InboundMessage,
  ListRow,
  OutboundMessage,
  StepId,
  StepInput,
  StepResult,
} from "./types";

/* ============================================================================
 * WhatsApp enquiry bot — pure conversation engine.
 *
 * No I/O, no Convex imports, no clock: `step` maps (state, message) to
 * (new state, replies, effects). The Convex layer persists the state and
 * executes the effects. Nothing here reads or stores media.
 * ========================================================================== */

const DESTINATIONS_PER_PAGE = 9;
const MAX_HISTORY = 30;
const MAX_LIST_ROWS = 10;
const IST_OFFSET_MS = 330 * 60 * 1000; // Asia/Kolkata has no DST
const DAY_MS = 24 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Date parsing                                                               */
/* -------------------------------------------------------------------------- */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

export type DateParseResult =
  | { ok: true; value: number }
  | { ok: false; reason: "format" | "past" | "too_far" };

/** Midnight IST (as epoch ms) of the IST calendar day containing `ms`. */
function istMidnight(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

/** Midnight IST for a calendar date, or null if the date doesn't exist. */
function istDate(year: number, month: number, day: number): number | null {
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return utc - IST_OFFSET_MS;
}

/**
 * Parse DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY or "15 Jan 2027" (Asia/Kolkata).
 * The date must be after today and no more than two years ahead.
 */
export function parseTravelDate(input: string, now: number): DateParseResult {
  const text = input.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  let parsed: number | null = null;

  const numeric = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(text);
  const named = /^(\d{1,2})(?:st|nd|rd|th)?[ \-/]([a-z]+)[ \-/](\d{4})$/.exec(text);
  if (numeric) {
    parsed = istDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  } else if (named) {
    const month = MONTHS[named[2]];
    if (month) parsed = istDate(Number(named[3]), month, Number(named[1]));
  }
  if (parsed === null) return { ok: false, reason: "format" };

  const today = istMidnight(now);
  if (parsed <= today) return { ok: false, reason: "past" };

  const ist = new Date(today + IST_OFFSET_MS);
  const limit = Date.UTC(ist.getUTCFullYear() + 2, ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
  if (parsed > limit) return { ok: false, reason: "too_far" };
  return { ok: true, value: parsed };
}

function formatDate(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(ms));
}

/* -------------------------------------------------------------------------- */
/* Validators                                                                 */
/* -------------------------------------------------------------------------- */

const emailSchema = z.email().max(254);
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const REFERENCE_PATTERN = /\bVD-\d{4}-\d{4,5}\b/i;

export function parseTravellers(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 20 ? n : null;
}

export function parseName(text: string): string | null {
  const name = text.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return null;
  return NAME_PATTERN.test(name) ? name : null;
}

export function parseEmail(text: string): string | null {
  const parsed = emailSchema.safeParse(text.trim());
  return parsed.success ? parsed.data.toLowerCase() : null;
}

/* -------------------------------------------------------------------------- */
/* Session (mutable working copy for one step call)                           */
/* -------------------------------------------------------------------------- */

interface Session {
  state: StepId;
  data: BotData;
  history: StepId[];
  replies: OutboundMessage[];
  effects: Effect[];
  readonly catalogue: Catalogue;
  readonly copy: Copy;
  readonly now: number;
  readonly siteUrl: string;
}

interface Option {
  id: string;
  title: string;
  description?: string;
}

function go(s: Session, to: StepId): void {
  s.history = [...s.history, s.state].slice(-MAX_HISTORY);
  s.state = to;
}

function resetToMenu(s: Session): void {
  s.state = "menu";
  s.history = [];
  s.data = {};
}

/**
 * Move on after a field is collected. When the user came here from the
 * "edit" list, return to the summary instead of replaying the whole flow.
 * Edit history looks like [..., confirm, edit_choice].
 */
function advance(s: Session, normalNext: StepId): void {
  if (s.history[s.history.length - 1] === "edit_choice") {
    s.history = s.history.slice(0, -2);
    s.state = "confirm";
    return;
  }
  go(s, normalNext);
}

/* -------------------------------------------------------------------------- */
/* Destination paging                                                         */
/* -------------------------------------------------------------------------- */

type Purpose = "enquiry" | "requirements";

function destinationStep(purpose: Purpose, page: number): DestinationStepId {
  return purpose === "enquiry" ? `destination_p${page}` : `req_destination_p${page}`;
}

function parseDestinationStep(state: StepId): { purpose: Purpose; page: number } | null {
  const m = /^(req_)?destination_p(\d+)$/.exec(state);
  if (!m) return null;
  return { purpose: m[1] ? "requirements" : "enquiry", page: Math.max(1, Number(m[2])) };
}

function destinationOptions(c: Catalogue, copy: Copy, requestedPage: number): Option[] {
  const all = c.destinations;
  if (all.length <= DESTINATIONS_PER_PAGE) {
    return all.map((d) => ({ id: `dest:${d.slug}`, title: d.name }));
  }
  const pages = Math.ceil(all.length / DESTINATIONS_PER_PAGE);
  const page = Math.min(requestedPage, pages);
  const slice = all.slice((page - 1) * DESTINATIONS_PER_PAGE, page * DESTINATIONS_PER_PAGE);
  const rows: Option[] = slice.map((d) => ({ id: `dest:${d.slug}`, title: d.name }));
  if (page < pages) rows.push({ id: "dest:more", title: copy.moreDestinations });
  return rows;
}

/* -------------------------------------------------------------------------- */
/* Options + prompts                                                          */
/* -------------------------------------------------------------------------- */

type EditField = "destination" | "category" | "duration" | "date" | "travellers" | "name" | "email";

const EDIT_FIELDS: EditField[] = ["destination", "category", "duration", "date", "travellers", "name", "email"];

function menuOptions(copy: Copy): Option[] {
  return (["apply", "requirements", "status", "support"] as const).map((k) => ({
    id: `menu:${k}`,
    title: copy.menuRows[k],
    description: copy.menuDescriptions[k],
  }));
}

function confirmOptions(copy: Copy): Option[] {
  return [
    { id: "confirm:yes", title: copy.confirmButtons.confirm },
    { id: "confirm:edit", title: copy.confirmButtons.edit },
    { id: "confirm:cancel", title: copy.confirmButtons.cancel },
  ];
}

function requirementsFollowupOptions(copy: Copy): Option[] {
  return [
    { id: "req:enquiry", title: copy.requirementsButtons.enquiry },
    { id: "req:menu", title: copy.requirementsButtons.menu },
  ];
}

function catalogueOptions(prefix: string, items: { id: string; label: string }[]): Option[] {
  return items.slice(0, MAX_LIST_ROWS).map((i) => ({ id: `${prefix}:${i.id}`, title: i.label }));
}

/** The options a user can pick from at `state` — also what "1", "2" refer to. */
function optionsFor(s: Session, state: StepId): Option[] | null {
  const dest = parseDestinationStep(state);
  if (dest) return destinationOptions(s.catalogue, s.copy, dest.page);
  switch (state) {
    case "menu":
      return menuOptions(s.copy);
    case "category":
      return catalogueOptions("cat", s.catalogue.categories);
    case "duration":
      return catalogueOptions("dur", s.catalogue.durations);
    case "confirm":
      return confirmOptions(s.copy);
    case "req_followup":
      return requirementsFollowupOptions(s.copy);
    case "edit_choice":
      return EDIT_FIELDS.map((f) => ({ id: `edit:${f}`, title: s.copy.editRows[f] }));
    default:
      return null;
  }
}

function missingField(d: BotData): StepId | null {
  if (!d.destinationSlug || !d.destinationName) return "destination_p1";
  if (!d.category) return "category";
  if (!d.duration) return "duration";
  if (d.travelDate === undefined) return "travel_date";
  if (d.travellers === undefined) return "travellers";
  if (!d.fullName) return "full_name";
  if (!d.email) return "email";
  return null;
}

function toEnquiryData(d: BotData): EnquiryData | null {
  if (
    !d.destinationSlug || !d.destinationName || !d.category || !d.duration ||
    d.travelDate === undefined || d.travellers === undefined || !d.fullName || !d.email
  ) {
    return null;
  }
  return {
    destinationSlug: d.destinationSlug,
    destinationName: d.destinationName,
    category: d.category,
    duration: d.duration,
    travelDate: d.travelDate,
    travellers: d.travellers,
    fullName: d.fullName,
    email: d.email,
  };
}

function toRows(options: Option[]): ListRow[] {
  return options.map((o) => (o.description ? { id: o.id, title: o.title, description: o.description } : { id: o.id, title: o.title }));
}

/** The message(s) that ask the question for `state`. */
function promptFor(s: Session, state: StepId): OutboundMessage[] {
  const copy = s.copy;
  const dest = parseDestinationStep(state);
  if (dest) {
    const options = destinationOptions(s.catalogue, copy, dest.page);
    if (options.length === 0) return [textMessage(copy.noOptions)];
    const body = dest.purpose === "enquiry" ? copy.destinationPrompt : copy.requirementsDestinationPrompt;
    return [listMessage(body, copy.destinationButton, toRows(options))];
  }
  switch (state) {
    case "welcome":
    case "menu":
      return [listMessage(copy.welcome, copy.menuButton, toRows(menuOptions(copy)))];
    case "category": {
      const options = catalogueOptions("cat", s.catalogue.categories);
      return options.length === 0
        ? [textMessage(copy.noOptions)]
        : [listMessage(copy.categoryPrompt, copy.categoryButton, toRows(options))];
    }
    case "duration": {
      const options = catalogueOptions("dur", s.catalogue.durations);
      return options.length === 0
        ? [textMessage(copy.noOptions)]
        : [listMessage(copy.durationPrompt, copy.durationButton, toRows(options))];
    }
    case "travel_date":
      return [textMessage(copy.datePrompt)];
    case "travellers":
      return [textMessage(copy.travellersPrompt)];
    case "full_name":
      return [textMessage(copy.namePrompt)];
    case "email":
      return [textMessage(copy.emailPrompt)];
    case "confirm": {
      const data = toEnquiryData(s.data);
      if (!data) return [textMessage(copy.noOptions)];
      return [
        buttonsMessage(copy.summary(data, formatDate(data.travelDate)), confirmOptions(copy)),
      ];
    }
    case "edit_choice":
      return [
        listMessage(
          copy.editPrompt,
          copy.editButton,
          EDIT_FIELDS.map((f) => ({ id: `edit:${f}`, title: copy.editRows[f] })),
        ),
      ];
    case "req_followup": {
      const name = s.data.destinationName ?? "";
      return [
        buttonsMessage(
          copy.requirementsPointer(name, destinationUrl(s.siteUrl, s.data.destinationSlug ?? "")),
          requirementsFollowupOptions(copy),
        ),
      ];
    }
    case "status_reference":
      return [textMessage(copy.statusPrompt)];
    case "handoff":
      return [textMessage(copy.handoff)];
    default:
      // Unreachable: destination steps are handled above; kept for the type checker.
      return [textMessage(copy.noOptions)];
  }
}

function destinationUrl(siteUrl: string, slug: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/destinations/${encodeURIComponent(slug)}`;
}

/** Re-ask the current question after an invalid answer, state unchanged. */
function reprompt(s: Session, invalid: string): void {
  s.replies.push(textMessage(invalid), ...promptFor(s, s.state));
}

function showPrompt(s: Session): void {
  s.replies.push(...promptFor(s, s.state));
}

/* -------------------------------------------------------------------------- */
/* Option resolution                                                          */
/* -------------------------------------------------------------------------- */

function norm(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resolve a message to one of `options`: by id, by 1-based number, or by title. */
function pickOption(message: InboundMessage, options: Option[]): Option | undefined {
  if (message.type === "interactive") return options.find((o) => o.id === message.id);
  if (message.type !== "text") return undefined;
  const t = norm(message.text);
  if (/^\d{1,2}$/.test(t)) return options[Number(t) - 1];
  return options.find((o) => norm(o.title) === t);
}

/** Free-text destination search across the whole catalogue. */
function findDestination(c: Catalogue, message: InboundMessage): { slug: string; name: string } | undefined {
  if (message.type === "interactive") {
    if (!message.id.startsWith("dest:")) return undefined;
    const slug = message.id.slice("dest:".length);
    return c.destinations.find((d) => d.slug === slug);
  }
  if (message.type !== "text") return undefined;
  const t = norm(message.text);
  if (t.length < 2) return undefined;
  const exact = c.destinations.find((d) => norm(d.name) === t || d.slug.toLowerCase() === t);
  if (exact) return exact;
  const partial = c.destinations.filter((d) => norm(d.name).includes(t));
  return partial.length === 1 ? partial[0] : undefined;
}

/* -------------------------------------------------------------------------- */
/* Step handlers                                                              */
/* -------------------------------------------------------------------------- */

function startHandoff(s: Session): void {
  s.state = "handoff";
  s.history = [];
  s.effects.push({ type: "handoff" });
  s.replies.push(textMessage(s.copy.handoff));
}

function showMenu(s: Session): void {
  resetToMenu(s);
  showPrompt(s);
}

function handleMenu(s: Session, message: InboundMessage): void {
  const pick = pickOption(message, menuOptions(s.copy));
  switch (pick?.id) {
    case "menu:apply":
      go(s, destinationStep("enquiry", 1));
      return showPrompt(s);
    case "menu:requirements":
      go(s, destinationStep("requirements", 1));
      return showPrompt(s);
    case "menu:status":
      go(s, "status_reference");
      return showPrompt(s);
    case "menu:support":
      return startHandoff(s);
    default:
      return reprompt(s, s.copy.pickFromMenu);
  }
}

function handleDestination(s: Session, message: InboundMessage, dest: { purpose: Purpose; page: number }): void {
  const options = destinationOptions(s.catalogue, s.copy, dest.page);
  if (options.length === 0) return showPrompt(s);

  const pick = pickOption(message, options);
  if (pick?.id === "dest:more") {
    // Paging replaces the current step; it is not a place to "go back" to.
    s.state = destinationStep(dest.purpose, dest.page + 1);
    return showPrompt(s);
  }
  const chosen = findDestination(s.catalogue, pick ? { type: "interactive", id: pick.id } : message);
  if (!chosen) return reprompt(s, s.copy.invalidDestination);

  s.data = { ...s.data, destinationSlug: chosen.slug, destinationName: chosen.name };
  if (dest.purpose === "enquiry") {
    advance(s, "category");
  } else {
    go(s, "req_followup");
  }
  showPrompt(s);
}

function handleRequirementsFollowup(s: Session, message: InboundMessage): void {
  const pick = pickOption(message, requirementsFollowupOptions(s.copy));
  if (pick?.id === "req:enquiry") {
    go(s, "category");
    return showPrompt(s);
  }
  if (pick?.id === "req:menu") return showMenu(s);
  reprompt(s, s.copy.invalidRequirementsFollowup);
}

function handleCategory(s: Session, message: InboundMessage): void {
  const pick = pickOption(message, catalogueOptions("cat", s.catalogue.categories));
  if (!pick) return reprompt(s, s.copy.invalidCategory);
  s.data = { ...s.data, category: pick.title };
  advance(s, "duration");
  showPrompt(s);
}

function handleDuration(s: Session, message: InboundMessage): void {
  const pick = pickOption(message, catalogueOptions("dur", s.catalogue.durations));
  if (!pick) return reprompt(s, s.copy.invalidDuration);
  s.data = { ...s.data, duration: pick.title };
  advance(s, "travel_date");
  showPrompt(s);
}

function handleTravelDate(s: Session, message: InboundMessage): void {
  const result = message.type === "text" ? parseTravelDate(message.text, s.now) : null;
  if (!result || !result.ok) {
    const reason = result && !result.ok ? result.reason : "format";
    const text =
      reason === "past" ? s.copy.dateInPast : reason === "too_far" ? s.copy.dateTooFar : s.copy.dateInvalidFormat;
    return reprompt(s, text);
  }
  s.data = { ...s.data, travelDate: result.value };
  advance(s, "travellers");
  showPrompt(s);
}

function handleTravellers(s: Session, message: InboundMessage): void {
  const n = message.type === "text" ? parseTravellers(message.text) : null;
  if (n === null) return reprompt(s, s.copy.travellersInvalid);
  s.data = { ...s.data, travellers: n };
  advance(s, "full_name");
  showPrompt(s);
}

function handleFullName(s: Session, message: InboundMessage): void {
  const name = message.type === "text" ? parseName(message.text) : null;
  if (name === null) return reprompt(s, s.copy.nameInvalid);
  s.data = { ...s.data, fullName: name };
  advance(s, "email");
  showPrompt(s);
}

function handleEmail(s: Session, message: InboundMessage): void {
  const email = message.type === "text" ? parseEmail(message.text) : null;
  if (email === null) return reprompt(s, s.copy.emailInvalid);
  s.data = { ...s.data, email };
  advance(s, "confirm");
  showPrompt(s);
}

function handleConfirm(s: Session, message: InboundMessage): void {
  const pick = pickOption(message, confirmOptions(s.copy));
  switch (pick?.id) {
    case "confirm:yes": {
      const data = toEnquiryData(s.data);
      if (!data) {
        // Defensive: should be unreachable. Resume at the first missing field.
        s.state = missingField(s.data) ?? "destination_p1";
        return showPrompt(s);
      }
      s.effects.push({ type: "create_enquiry", data });
      resetToMenu(s);
      s.replies.push(textMessage(s.copy.enquiryCreated));
      return showPrompt(s);
    }
    case "confirm:edit":
      go(s, "edit_choice");
      return showPrompt(s);
    case "confirm:cancel":
      resetToMenu(s);
      s.replies.push(textMessage(s.copy.cancelled));
      return showPrompt(s);
    default:
      return reprompt(s, s.copy.invalidConfirm);
  }
}

const EDIT_TARGET: Record<EditField, StepId> = {
  destination: "destination_p1",
  category: "category",
  duration: "duration",
  date: "travel_date",
  travellers: "travellers",
  name: "full_name",
  email: "email",
};

function handleEditChoice(s: Session, message: InboundMessage): void {
  const pick = pickOption(message, EDIT_FIELDS.map((f) => ({ id: `edit:${f}`, title: s.copy.editRows[f] })));
  const field = EDIT_FIELDS.find((f) => `edit:${f}` === pick?.id);
  if (!field) return reprompt(s, s.copy.invalidEdit);
  go(s, EDIT_TARGET[field]);
  showPrompt(s);
}

function handleStatusReference(s: Session, message: InboundMessage): void {
  const match = message.type === "text" ? REFERENCE_PATTERN.exec(message.text) : null;
  if (!match) return reprompt(s, s.copy.statusInvalid);
  s.effects.push({ type: "lookup_status", reference: match[0].toUpperCase() });
  resetToMenu(s);
  s.replies.push(textMessage(s.copy.statusChecking));
}

function handleStep(s: Session, message: InboundMessage): void {
  const dest = parseDestinationStep(s.state);
  if (dest) return handleDestination(s, message, dest);
  switch (s.state) {
    case "welcome":
      return showMenu(s);
    case "menu":
      return handleMenu(s, message);
    case "req_followup":
      return handleRequirementsFollowup(s, message);
    case "category":
      return handleCategory(s, message);
    case "duration":
      return handleDuration(s, message);
    case "travel_date":
      return handleTravelDate(s, message);
    case "travellers":
      return handleTravellers(s, message);
    case "full_name":
      return handleFullName(s, message);
    case "email":
      return handleEmail(s, message);
    case "confirm":
      return handleConfirm(s, message);
    case "edit_choice":
      return handleEditChoice(s, message);
    case "status_reference":
      return handleStatusReference(s, message);
    case "handoff":
      // A human owns the thread; the bot stays quiet until a global command.
      return;
  }
}

/* -------------------------------------------------------------------------- */
/* Global commands + entry point                                              */
/* -------------------------------------------------------------------------- */

const RESET_WORDS = new Set(["menu", "hi", "hello", "hey", "start", "restart"]);
const HANDOFF_WORDS = new Set(["agent", "human", "support"]);
const OPT_OUT_WORDS = new Set(["stop", "unsubscribe"]);
const OPT_IN_WORDS = new Set(["start", "subscribe"]);

/** True for STOP / UNSUBSCRIBE. Shared with the ingest path, which must honour them even when the bot is off. */
export function isOptOutText(text: string): boolean {
  return OPT_OUT_WORDS.has(norm(text));
}

/** True for START / SUBSCRIBE. */
export function isOptInText(text: string): boolean {
  return OPT_IN_WORDS.has(norm(text));
}

function handleBack(s: Session): void {
  const previous = s.history[s.history.length - 1];
  if (previous === undefined) {
    return showMenu(s);
  }
  s.history = s.history.slice(0, -1);
  s.state = previous;
  showPrompt(s);
}

/** Returns true when the message was a global command and has been handled. */
function handleGlobal(s: Session, text: string, optedOut: boolean): boolean {
  const t = norm(text);
  if (OPT_OUT_WORDS.has(t)) {
    s.effects.push({ type: "opt_out" });
    s.replies.push(textMessage(s.copy.optedOut));
    return true;
  }
  if (t === "subscribe" && !optedOut) {
    s.replies.push(textMessage(s.copy.alreadySubscribed));
    return true;
  }
  if (RESET_WORDS.has(t)) {
    showMenu(s);
    return true;
  }
  if (t === "back") {
    handleBack(s);
    return true;
  }
  if (HANDOFF_WORDS.has(t)) {
    startHandoff(s);
    return true;
  }
  return false;
}

export function step(input: StepInput): StepResult {
  const s: Session = {
    state: input.state,
    data: { ...input.data },
    history: [...input.history],
    replies: [],
    effects: [],
    catalogue: input.catalogue,
    copy: COPY[input.language ?? "en"],
    now: input.now,
    siteUrl: input.siteUrl,
  };
  const { message } = input;
  const optedOut = input.optedOut ?? false;

  if (optedOut) {
    // Respect the opt-out: only an explicit resubscribe gets any reply.
    if (message.type === "text" && OPT_IN_WORDS.has(norm(message.text))) {
      s.effects.push({ type: "opt_in" });
      s.replies.push(textMessage(s.copy.optedIn));
      // Resubscribing does not end a human handoff.
      if (s.state !== "handoff") {
        resetToMenu(s);
        showPrompt(s);
      }
    }
    return finish(s);
  }

  if (s.state === "handoff") {
    // A human owns the thread, so the bot says nothing at all (media included).
    // Only "menu" (hand back) and STOP act; greetings, "back" and a bare
    // "start" (nothing to resubscribe) are ignored.
    const t = message.type === "text" ? norm(message.text) : "";
    if (OPT_OUT_WORDS.has(t)) {
      s.effects.push({ type: "opt_out" });
      s.replies.push(textMessage(s.copy.optedOut));
    } else if (t === "menu" || t === "restart") {
      showMenu(s);
    }
    return finish(s);
  }

  if (message.type === "unsupported") {
    s.replies.push(textMessage(s.copy.mediaNotSupported));
    return finish(s);
  }

  if (message.type === "text" && handleGlobal(s, message.text, optedOut)) {
    return finish(s);
  }

  handleStep(s, message);
  return finish(s);
}

function finish(s: Session): StepResult {
  return { state: s.state, data: s.data, history: s.history, replies: s.replies, effects: s.effects };
}
