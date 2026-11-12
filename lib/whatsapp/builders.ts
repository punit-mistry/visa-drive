import type { ButtonOption, ListRow, OutboundMessage } from "./types";

/** Meta WhatsApp Cloud API limits for interactive messages. */
export const META_LIMITS = {
  textBody: 4096,
  interactiveBody: 1024,
  buttonCount: 3,
  buttonTitle: 20,
  listRows: 10,
  listRowTitle: 24,
  listRowDescription: 72,
  listButtonLabel: 20,
  rowId: 200,
} as const;

/** Shorten to `max` characters, marking the cut with an ellipsis. */
export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function textMessage(body: string): OutboundMessage {
  return { type: "text", body: truncate(body, META_LIMITS.textBody) };
}

/**
 * Reply buttons. Too many / zero buttons is a programmer error and throws;
 * over-long titles (often catalogue-driven) are truncated.
 */
export function buttonsMessage(body: string, buttons: ButtonOption[]): OutboundMessage {
  if (buttons.length < 1 || buttons.length > META_LIMITS.buttonCount) {
    throw new Error(`WhatsApp buttons message needs 1-${META_LIMITS.buttonCount} buttons, got ${buttons.length}`);
  }
  return {
    type: "buttons",
    body: truncate(body, META_LIMITS.interactiveBody),
    buttons: buttons.map((b) => ({
      id: truncate(b.id, META_LIMITS.rowId),
      title: truncate(b.title, META_LIMITS.buttonTitle),
    })),
  };
}

/** List message with a single section. 1-10 rows, otherwise throws. */
export function listMessage(body: string, buttonLabel: string, rows: ListRow[]): OutboundMessage {
  if (rows.length < 1 || rows.length > META_LIMITS.listRows) {
    throw new Error(`WhatsApp list message needs 1-${META_LIMITS.listRows} rows, got ${rows.length}`);
  }
  return {
    type: "list",
    body: truncate(body, META_LIMITS.interactiveBody),
    buttonLabel: truncate(buttonLabel, META_LIMITS.listButtonLabel),
    rows: rows.map((r) => {
      const row: ListRow = {
        id: truncate(r.id, META_LIMITS.rowId),
        title: truncate(r.title, META_LIMITS.listRowTitle),
      };
      if (r.description) row.description = truncate(r.description, META_LIMITS.listRowDescription);
      return row;
    }),
  };
}
