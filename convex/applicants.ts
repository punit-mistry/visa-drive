import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  authError,
  requireApplicationAccess,
  type ApplicationAccess,
} from "./lib/auth";
import { PERMISSIONS } from "../lib/constants/roles";
import { recountApplicationDocuments } from "./documents";
import { APPLICATION_STATUS_CONFIG } from "../lib/constants/statuses";
import type { ApplicationStatus } from "../lib/constants/statuses";

/* ============================================================================
 * Applicants — the travellers on one application.
 *
 * Ownership is never taken from an argument: it is resolved through the parent
 * application with `requireApplicationAccess`, and the `userId` written onto
 * the row is copied from the application, not from the caller.
 * ========================================================================== */

export const addressValidator = v.object({
  line1: v.string(),
  line2: v.optional(v.string()),
  city: v.string(),
  state: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  country: v.string(),
});

const genderValidator = v.union(
  v.literal("male"),
  v.literal("female"),
  v.literal("other"),
  v.literal("prefer_not_to_say"),
);

const applicantDataValidator = v.object({
  firstName: v.string(),
  middleName: v.optional(v.string()),
  lastName: v.string(),
  dateOfBirth: v.optional(v.number()),
  gender: v.optional(genderValidator),
  nationality: v.optional(v.string()),
  maritalStatus: v.optional(v.string()),
  occupation: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  address: v.optional(addressValidator),
  passportNumber: v.optional(v.string()),
  passportIssueDate: v.optional(v.number()),
  passportExpiryDate: v.optional(v.number()),
  passportIssuingCountry: v.optional(v.string()),
  passportIssuingAuthority: v.optional(v.string()),
  isPrimary: v.optional(v.boolean()),
  travelerId: v.optional(v.id("travelers")),
});

/**
 * Who may rewrite a traveller row, and when.
 *
 * Two separate gates, because these fields are passport numbers and dates of
 * birth rather than a note:
 *
 *  • Staff need `application:update_status` — the grant that marks someone as
 *    able to change a booking. Being able to *see* every application (a
 *    support agent does) is not the same as being able to rewrite one.
 *  • Everyone else is the customer, and may only edit while the application is
 *    still taking their input. A colleague editing their own booking lands
 *    here too when they lack the staff grant, which is the right answer.
 */
function assertEditable(
  application: Doc<"applications">,
  access: ApplicationAccess,
): void {
  const staffMayEdit =
    access.viaStaff &&
    access.staff?.permissions.has(PERMISSIONS.APPLICATION_UPDATE_STATUS) === true;

  if (staffMayEdit) return;

  if (access.actingAsStaff) {
    authError(
      "FORBIDDEN",
      "You do not have permission to edit the travellers on this application.",
    );
  }

  const config = APPLICATION_STATUS_CONFIG[application.status as ApplicationStatus];
  if (!config?.customerCanUpload) {
    throw new ConvexError({
      code: "APPLICATION_LOCKED",
      message:
        "This application is already being processed and can no longer be edited. Message the VisaDrive team if something is wrong.",
    });
  }
}

export const listByApplication = query({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    await requireApplicationAccess(ctx, args.applicationId);
    return await ctx.db
      .query("applicants")
      .withIndex("by_application_order", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
  },
});

export const upsert = mutation({
  args: {
    applicationId: v.id("applications"),
    applicantId: v.optional(v.id("applicants")),
    data: applicantDataValidator,
  },
  returns: v.object({ applicantId: v.id("applicants") }),
  handler: async (ctx, args) => {
    const access = await requireApplicationAccess(ctx, args.applicationId);
    const application = access.application;
    assertEditable(application, access);

    const now = Date.now();
    const { isPrimary, travelerId, ...fields } = args.data;

    if (fields.firstName.trim() === "" || fields.lastName.trim() === "") {
      throw new ConvexError({
        code: "INVALID_APPLICANT",
        message: "A traveller needs a first and last name.",
      });
    }

    const existing = await ctx.db
      .query("applicants")
      .withIndex("by_application_order", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();

    /* ------------------------------- update ------------------------------- */
    if (args.applicantId) {
      const applicant = await ctx.db.get(args.applicantId);
      if (!applicant || applicant.applicationId !== args.applicationId) {
        authError("NOT_FOUND", "That traveller is not on this application.");
      }

      await ctx.db.patch(applicant._id, {
        ...fields,
        travelerId: travelerId ?? applicant.travelerId,
        updatedAt: now,
      });

      if (isPrimary === true && !applicant.isPrimary) {
        await setPrimary(ctx, existing, applicant._id);
      }

      await ctx.db.patch(args.applicationId, { updatedAt: now });
      return { applicantId: applicant._id };
    }

    /* ------------------------------- insert ------------------------------- */
    if (existing.length >= 20) {
      throw new ConvexError({
        code: "TOO_MANY_TRAVELLERS",
        message: "An application can hold at most 20 travellers.",
      });
    }

    const orderIndex =
      existing.reduce((max, a) => Math.max(max, a.orderIndex), -1) + 1;

    const applicantId = await ctx.db.insert("applicants", {
      applicationId: args.applicationId,
      // Copied from the application — a caller-supplied userId is never used.
      userId: application.userId,
      travelerId,
      isPrimary: isPrimary === true || existing.length === 0,
      orderIndex,
      ...fields,
      createdAt: now,
      updatedAt: now,
    });

    if (isPrimary === true) {
      await setPrimary(ctx, existing, applicantId);
    }

    await ctx.db.patch(args.applicationId, { updatedAt: now });
    // The mandatory-document count scales with the number of travellers.
    await recountApplicationDocuments(ctx, args.applicationId);

    return { applicantId };
  },
});

async function setPrimary(
  ctx: MutationCtx,
  siblings: Doc<"applicants">[],
  primaryId: Id<"applicants">,
): Promise<void> {
  for (const sibling of siblings) {
    if (sibling._id !== primaryId && sibling.isPrimary) {
      await ctx.db.patch(sibling._id, { isPrimary: false });
    }
  }
  await ctx.db.patch(primaryId, { isPrimary: true });
}

export const remove = mutation({
  args: {
    applicationId: v.id("applications"),
    applicantId: v.id("applicants"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireApplicationAccess(ctx, args.applicationId);
    assertEditable(access.application, access);

    const applicant = await ctx.db.get(args.applicantId);
    if (!applicant || applicant.applicationId !== args.applicationId) {
      authError("NOT_FOUND", "That traveller is not on this application.");
    }

    const siblings = await ctx.db
      .query("applicants")
      .withIndex("by_application_order", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();

    if (siblings.length <= 1) {
      throw new ConvexError({
        code: "LAST_TRAVELLER",
        message: "An application needs at least one traveller.",
      });
    }

    // Their documents go with them — a passport scan filed against a traveller
    // who is no longer on the booking has nowhere to belong.
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_applicantId", (q) => q.eq("applicantId", args.applicantId))
      .collect();

    for (const document of documents) {
      await ctx.db.delete(document._id);
      await ctx.storage.delete(document.storageId).catch(() => {});
    }

    await ctx.db.delete(args.applicantId);

    if (applicant.isPrimary) {
      const next = siblings.find((s) => s._id !== args.applicantId);
      if (next) await ctx.db.patch(next._id, { isPrimary: true });
    }

    await ctx.db.patch(args.applicationId, { updatedAt: Date.now() });
    await recountApplicationDocuments(ctx, args.applicationId);

    return null;
  },
});

export const reorder = mutation({
  args: {
    applicationId: v.id("applications"),
    orderedIds: v.array(v.id("applicants")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireApplicationAccess(ctx, args.applicationId);
    assertEditable(access.application, access);

    const siblings = await ctx.db
      .query("applicants")
      .withIndex("by_application_order", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();

    const known = new Set(siblings.map((s) => s._id as string));
    for (const id of args.orderedIds) {
      if (!known.has(id)) {
        authError("NOT_FOUND", "That traveller is not on this application.");
      }
    }

    let index = 0;
    for (const id of args.orderedIds) {
      await ctx.db.patch(id, { orderIndex: index, updatedAt: Date.now() });
      index += 1;
    }
    // Anything the client forgot to list keeps a stable position at the end.
    for (const sibling of siblings) {
      if (!args.orderedIds.includes(sibling._id)) {
        await ctx.db.patch(sibling._id, { orderIndex: index });
        index += 1;
      }
    }

    return null;
  },
});
