import type { FunctionReturnType } from "convex/server";

import { api } from "@/convex/_generated/api";

/**
 * Shapes the WhatsApp backend returns, derived from the functions themselves so
 * the UI can never drift from the contract. If a field is renamed on the
 * server, TypeScript says so here instead of the inbox quietly rendering a
 * blank.
 */

/** Connection state, bot state and the headline counts. */
export type WhatsAppStatus = NonNullable<
  FunctionReturnType<typeof api.whatsappAdmin.getStatus>
>;

/** One row of the inbox list: a conversation plus the WhatsApp contact on it. */
export type InboxConversation = FunctionReturnType<
  typeof api.whatsappAdmin.listConversations
>["page"][number];

/** The open thread: conversation, contact, messages and the linked enquiry. */
export type ThreadDetail = NonNullable<
  FunctionReturnType<typeof api.whatsappAdmin.getConversation>
>;

/** A staff member, for the assignment picker. */
export type StaffMember = NonNullable<
  FunctionReturnType<typeof api.users.listStaff>
>[number];
