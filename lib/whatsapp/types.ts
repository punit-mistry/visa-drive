/* ============================================================================
 * WhatsApp enquiry bot — shared types.
 *
 * Pure types only. The engine in `engine.ts` has zero I/O; the Convex layer
 * (added in a later slice) persists state and executes `Effect`s.
 * ========================================================================== */

export type Language = "en";

/** A destination step is paged: page 1 is `destination_p1`, and so on. */
export type DestinationStepId = `destination_p${number}` | `req_destination_p${number}`;

export type StepId =
  | "welcome"
  | "menu"
  | DestinationStepId
  | "req_followup"
  | "category"
  | "duration"
  | "travel_date"
  | "travellers"
  | "full_name"
  | "email"
  | "confirm"
  | "edit_choice"
  | "status_reference"
  | "handoff";

/** Fields collected by the bot. Mirrors `whatsappContacts.botData`. */
export interface BotData {
  destinationSlug?: string;
  destinationName?: string;
  category?: string;
  duration?: string;
  /** Epoch ms of midnight IST on the travel date. */
  travelDate?: number;
  travellers?: number;
  fullName?: string;
  email?: string;
}

/** BotData with every field present — what an enquiry is created from. */
export interface EnquiryData {
  destinationSlug: string;
  destinationName: string;
  category: string;
  duration: string;
  travelDate: number;
  travellers: number;
  fullName: string;
  email: string;
}

export type InboundMessage =
  | { type: "text"; text: string }
  /** Reply to a button or list message. Only the id is used. */
  | { type: "interactive"; id: string }
  /** Image, document, audio, ... — only the type is known; never read or stored. */
  | { type: "unsupported"; mediaType: string };

export interface ButtonOption {
  id: string;
  title: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export type OutboundMessage =
  | { type: "text"; body: string }
  | { type: "buttons"; body: string; buttons: ButtonOption[] }
  | { type: "list"; body: string; buttonLabel: string; rows: ListRow[] };

export type Effect =
  | { type: "create_enquiry"; data: EnquiryData }
  | { type: "handoff" }
  | { type: "opt_out" }
  | { type: "opt_in" }
  | { type: "lookup_status"; reference: string };

export interface CatalogueOption {
  id: string;
  label: string;
}

export interface Catalogue {
  destinations: { slug: string; name: string }[];
  categories: CatalogueOption[];
  durations: CatalogueOption[];
}

export interface StepInput {
  state: StepId;
  data: BotData;
  history: StepId[];
  message: InboundMessage;
  catalogue: Catalogue;
  /** Epoch ms. */
  now: number;
  /** Public website origin, e.g. "https://visadrive.in". */
  siteUrl: string;
  /** Whether the contact is currently opted out. Defaults to false. */
  optedOut?: boolean;
  language?: Language;
}

export interface StepResult {
  state: StepId;
  data: BotData;
  history: StepId[];
  replies: OutboundMessage[];
  effects: Effect[];
}
