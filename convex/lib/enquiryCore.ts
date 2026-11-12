import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { generateReference } from "./references";
import { NOTIFICATION_TYPES } from "../../lib/constants/notifications";
import { PERMISSIONS } from "../../lib/constants/roles";

/* ============================================================================
 * Shared enquiry creation.
 *
 * Used by the public contact form (`enquiries.submit`) and by the WhatsApp bot.
 * Callers are responsible for validating/cleaning their input and for any
 * rate limiting; this helper only does what both paths must do identically:
 * allocate the ENQ reference, insert the row, and tell the office.
 * ========================================================================== */

export interface CreateEnquiryInput {
  fullName: string;
  email: string;
  phone: string;
  destinationId?: Id<"destinations">;
  interestedCountry?: string;
  visaCategory?: string;
  travelDate?: number;
  subject: string;
  message: string;
  source: Doc<"enquiries">["source"];
  whatsappContactId?: Id<"whatsappContacts">;
  isDemo?: boolean;
  now: number;
}

export async function createEnquiryCore(
  ctx: MutationCtx,
  input: CreateEnquiryInput,
): Promise<{ enquiryId: Id<"enquiries">; referenceId: string }> {
  const referenceId = await generateReference(ctx, "enquiry", input.now);

  const enquiryId = await ctx.db.insert("enquiries", {
    referenceId,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    destinationId: input.destinationId,
    interestedCountry: input.interestedCountry || undefined,
    visaCategory: input.visaCategory || undefined,
    travelDate: input.travelDate,
    subject: input.subject,
    message: input.message,
    source: input.source,
    leadStatus: "new",
    contactAttempts: 0,
    whatsappContactId: input.whatsappContactId,
    isDemo: input.isDemo,
    createdAt: input.now,
    updatedAt: input.now,
  });

  // Fanned out to everyone holding `enquiry:view`, deduped per recipient so
  // a retried request cannot double-notify the whole office.
  await ctx.scheduler.runAfter(0, internal.notifications.dispatchToStaff, {
    permission: PERMISSIONS.ENQUIRY_VIEW,
    type: NOTIFICATION_TYPES.ENQUIRY_RECEIVED,
    title: `New enquiry from ${input.fullName}`,
    body:
      input.message.length > 160 ? `${input.message.slice(0, 159)}…` : input.message,
    link: `/admin/enquiries/${enquiryId}`,
    dedupeKeyPrefix: `enq:${enquiryId}:staff`,
    enquiryId,
    emailTemplate: "enquiry_received",
    emailData: {
      enquiryReference: referenceId,
      enquiryName: input.fullName,
      enquiryEmail: input.email,
      enquiryPhone: input.phone,
      enquirySubject: input.subject,
      enquiryMessage: input.message,
      interestedCountry: input.interestedCountry || undefined,
      link: `/admin/enquiries/${enquiryId}`,
    },
  });

  return { enquiryId, referenceId };
}
