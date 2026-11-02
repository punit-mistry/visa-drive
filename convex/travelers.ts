import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { authError, requireUser } from "./lib/auth";
import { recountApplicationDocuments } from "./documents";
import { APPLICATION_STATUS_CONFIG } from "../lib/constants/statuses";
import type { ApplicationStatus } from "../lib/constants/statuses";

/* ============================================================================
 * Saved traveller profiles.
 *
 * Purely a convenience store owned by one customer — never staff-readable and
 * never reachable by id alone. Every handler here re-checks `userId` against
 * the signed-in user, because a traveller row holds passport data.
 * ========================================================================== */

const addressValidator = v.object({
  line1: v.string(),
  line2: v.optional(v.string()),
  city: v.string(),
  state: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  country: v.string(),
});

const travelerDataValidator = v.object({
  label: v.string(),
  firstName: v.string(),
  middleName: v.optional(v.string()),
  lastName: v.string(),
  dateOfBirth: v.optional(v.number()),
  gender: v.optional(v.string()),
  nationality: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  address: v.optional(addressValidator),
  passportNumber: v.optional(v.string()),
  passportIssueDate: v.optional(v.number()),
  passportExpiryDate: v.optional(v.number()),
  passportIssuingCountry: v.optional(v.string()),
  isSelf: v.optional(v.boolean()),
});

const GENDERS = ["male", "female", "other", "prefer_not_to_say"] as const;

/** `travelers.gender` is free text; `applicants.gender` is a closed union. */
function narrowGender(
  gender: string | undefined,
): (typeof GENDERS)[number] | undefined {
  if (!gender) return undefined;
  const normalised = gender.trim().toLowerCase().replace(/\s+/g, "_");
  return (GENDERS as readonly string[]).includes(normalised)
    ? (normalised as (typeof GENDERS)[number])
    : undefined;
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await ctx.db
      .query("travelers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
  },
});

export const upsert = mutation({
  args: {
    travelerId: v.optional(v.id("travelers")),
    data: travelerDataValidator,
  },
  returns: v.object({ travelerId: v.id("travelers") }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const { isSelf, ...fields } = args.data;

    if (fields.firstName.trim() === "" || fields.lastName.trim() === "") {
      throw new ConvexError({
        code: "INVALID_TRAVELLER",
        message: "A saved traveller needs a first and last name.",
      });
    }

    const existing = await ctx.db
      .query("travelers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    if (args.travelerId) {
      const traveler = await ctx.db.get(args.travelerId);
      if (!traveler || traveler.userId !== user._id) {
        authError("NOT_FOUND", "Saved traveller not found.");
      }

      await ctx.db.patch(traveler._id, {
        ...fields,
        isSelf: isSelf ?? traveler.isSelf,
        updatedAt: now,
      });

      if (isSelf === true) await clearOtherSelf(ctx, existing, traveler._id);
      return { travelerId: traveler._id };
    }

    if (existing.length >= 50) {
      throw new ConvexError({
        code: "TOO_MANY_TRAVELLERS",
        message: "You can save up to 50 traveller profiles.",
      });
    }

    const travelerId = await ctx.db.insert("travelers", {
      userId: user._id,
      ...fields,
      isSelf: isSelf === true,
      createdAt: now,
      updatedAt: now,
    });

    if (isSelf === true) await clearOtherSelf(ctx, existing, travelerId);

    return { travelerId };
  },
});

async function clearOtherSelf(
  ctx: MutationCtx,
  siblings: Doc<"travelers">[],
  keepId: Id<"travelers">,
): Promise<void> {
  for (const sibling of siblings) {
    if (sibling._id !== keepId && sibling.isSelf) {
      await ctx.db.patch(sibling._id, { isSelf: false });
    }
  }
}

export const remove = mutation({
  args: { travelerId: v.id("travelers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const traveler = await ctx.db.get(args.travelerId);
    if (!traveler || traveler.userId !== user._id) {
      authError("NOT_FOUND", "Saved traveller not found.");
    }

    // Applicants already copied from this profile keep their data — they are
    // snapshots, not references, so deleting the profile is non-destructive.
    await ctx.db.delete(args.travelerId);
    return null;
  },
});

/**
 * Copy a saved profile onto an application as an applicant (or refresh an
 * existing applicant from it). Owner only — staff never touch a customer's
 * private traveller book.
 */
export const applyToApplication = mutation({
  args: {
    travelerId: v.id("travelers"),
    applicationId: v.id("applications"),
    applicantId: v.optional(v.id("applicants")),
    isPrimary: v.optional(v.boolean()),
  },
  returns: v.object({ applicantId: v.id("applicants") }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const traveler = await ctx.db.get(args.travelerId);
    if (!traveler || traveler.userId !== user._id) {
      authError("NOT_FOUND", "Saved traveller not found.");
    }

    const application = await ctx.db.get(args.applicationId);
    if (!application) authError("NOT_FOUND", "Application not found.");
    if (application.userId !== user._id) {
      authError("FORBIDDEN", "You do not have access to this application.");
    }

    const config =
      APPLICATION_STATUS_CONFIG[application.status as ApplicationStatus];
    if (!config?.customerCanUpload) {
      throw new ConvexError({
        code: "APPLICATION_LOCKED",
        message: "This application can no longer be edited.",
      });
    }

    const now = Date.now();
    const fields = {
      travelerId: traveler._id,
      firstName: traveler.firstName,
      middleName: traveler.middleName,
      lastName: traveler.lastName,
      dateOfBirth: traveler.dateOfBirth,
      gender: narrowGender(traveler.gender),
      nationality: traveler.nationality,
      email: traveler.email,
      phone: traveler.phone,
      address: traveler.address,
      passportNumber: traveler.passportNumber,
      passportIssueDate: traveler.passportIssueDate,
      passportExpiryDate: traveler.passportExpiryDate,
      passportIssuingCountry: traveler.passportIssuingCountry,
      updatedAt: now,
    };

    if (args.applicantId) {
      const applicant = await ctx.db.get(args.applicantId);
      if (!applicant || applicant.applicationId !== args.applicationId) {
        authError("NOT_FOUND", "That traveller is not on this application.");
      }
      await ctx.db.patch(applicant._id, fields);
      return { applicantId: applicant._id };
    }

    const siblings = await ctx.db
      .query("applicants")
      .withIndex("by_application_order", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();

    // Re-applying the same saved profile should update, not duplicate.
    const alreadyThere = siblings.find((s) => s.travelerId === traveler._id);
    if (alreadyThere) {
      await ctx.db.patch(alreadyThere._id, fields);
      return { applicantId: alreadyThere._id };
    }

    if (siblings.length >= 20) {
      throw new ConvexError({
        code: "TOO_MANY_TRAVELLERS",
        message: "An application can hold at most 20 travellers.",
      });
    }

    const applicantId = await ctx.db.insert("applicants", {
      applicationId: args.applicationId,
      userId: application.userId,
      isPrimary: args.isPrimary === true || siblings.length === 0,
      orderIndex:
        siblings.reduce((max, s) => Math.max(max, s.orderIndex), -1) + 1,
      ...fields,
      createdAt: now,
    });

    if (args.isPrimary === true) {
      for (const sibling of siblings) {
        if (sibling.isPrimary) await ctx.db.patch(sibling._id, { isPrimary: false });
      }
    }

    await ctx.db.patch(args.applicationId, { updatedAt: now });
    await recountApplicationDocuments(ctx, args.applicationId);

    return { applicantId };
  },
});
