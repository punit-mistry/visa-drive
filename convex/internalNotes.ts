import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireStaff } from "./lib/auth";
import { roleAtLeast } from "../lib/constants/roles";

/* ============================================================================
 * Internal notes.
 *
 * Staff-only annotations on any entity — an application, a lead, a customer.
 * There is no customer-facing read path in this file at all, which is the
 * point: nothing here needs an "is this person staff?" branch, because
 * `requireStaff` gates every single export.
 *
 * (Internal notes *inside a conversation thread* are a different thing and
 * live in `convex/messages.ts` as `isInternal` messages.)
 * ========================================================================== */

const entityTypeValidator = v.union(
  v.literal("application"),
  v.literal("user"),
  v.literal("enquiry"),
  v.literal("conversation"),
  v.literal("document"),
  v.literal("payment"),
  v.literal("visa_product"),
  v.literal("destination"),
  v.literal("setting"),
  v.literal("staff"),
);

const BODY_LIMIT = 4000;
const MAX_NOTES = 100;
const MAX_MENTIONS = 10;

function clean(value: string): string {
  return (
    String(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim()
      .slice(0, BODY_LIMIT)
  );
}

/* -------------------------------------------------------------------------- */

/** Notes on one entity, pinned first, then newest first. */
export const listForEntity = query({
  args: {
    entityType: entityTypeValidator,
    entityId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    const limit = Math.min(Math.max(args.limit ?? 50, 1), MAX_NOTES);

    const notes = await ctx.db
      .query("internalNotes")
      .withIndex("by_entity_created", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId),
      )
      .order("desc")
      .take(limit);

    // Pinned notes float to the top; within each group the index order
    // (newest first) is preserved.
    return [
      ...notes.filter((n) => n.isPinned),
      ...notes.filter((n) => !n.isPinned),
    ];
  },
});

export const add = mutation({
  args: {
    entityType: entityTypeValidator,
    entityId: v.string(),
    body: v.string(),
    mentionedUserIds: v.optional(v.array(v.id("users"))),
    isPinned: v.optional(v.boolean()),
  },
  returns: v.object({ noteId: v.id("internalNotes") }),
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);

    const body = clean(args.body);
    if (body.length === 0) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "A note cannot be empty.",
      });
    }

    // Only mention people who actually exist and are still active — a stale id
    // from the client would otherwise produce a notification to nobody.
    const mentioned: Id<"users">[] = [];
    for (const id of (args.mentionedUserIds ?? []).slice(0, MAX_MENTIONS)) {
      const target = await ctx.db.get(id);
      if (target && target.status === "active" && target._id !== staff.user._id) {
        mentioned.push(target._id);
      }
    }

    const noteId = await ctx.db.insert("internalNotes", {
      entityType: args.entityType,
      entityId: args.entityId,
      authorId: staff.user._id,
      authorName: staff.user.fullName,
      body,
      mentionedUserIds: mentioned,
      isPinned: args.isPinned ?? false,
      createdAt: Date.now(),
    });

    // Mentions are not in `NOTIFICATION_DEFINITIONS`; `dispatch` falls back to
    // in-app only for an unrecognised type, which is exactly right here — an
    // @mention should ping the bell, not send email to a colleague.
    for (const userId of mentioned) {
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        userId,
        type: "internal_note.mention",
        title: `${staff.user.fullName} mentioned you in a note`,
        body: body.slice(0, 160),
        link: `/admin/${args.entityType}s/${args.entityId}`,
        dedupeKey: `note:${noteId}:mention:${userId}`,
      });
    }

    return { noteId };
  },
});

export const remove = mutation({
  args: { noteId: v.id("internalNotes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);

    const note = await ctx.db.get(args.noteId);
    if (!note) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Note not found." });
    }

    // Your own note, or an admin cleaning up after someone who has left.
    const isAuthor = note.authorId === staff.user._id;
    if (!isAuthor && !roleAtLeast(staff.role, "admin")) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only delete your own notes.",
      });
    }

    await ctx.db.delete(note._id);
    return null;
  },
});

export const togglePin = mutation({
  args: { noteId: v.id("internalNotes") },
  returns: v.object({ isPinned: v.boolean() }),
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    const note = await ctx.db.get(args.noteId);
    if (!note) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Note not found." });
    }

    const isPinned = !note.isPinned;
    await ctx.db.patch(note._id, { isPinned });

    return { isPinned };
  },
});
