import { cronJobs, makeFunctionReference } from "convex/server";

/* ============================================================================
 * Scheduled jobs.
 *
 * This file is the timetable only. The work itself lives in `convex/admin.ts`
 * as internal mutations (`sendFollowUpReminders`,
 * `remindStuckDocumentUploads`, `sweepAbandonedDrafts`), which keeps the cron
 * definition readable and lets the same jobs be invoked by hand from the
 * Convex dashboard when something needs re-running.
 *
 * Every job is:
 *
 *  1. **Bounded.** Each scan is an indexed range with an explicit `.take()`
 *     batch cap, so a job can never read an unbounded table. Leftovers are
 *     picked up on the next tick.
 *  2. **Idempotent.** Every notification carries a `dedupeKey` built from
 *     `dedupeKeys` + `dayStamp()`. If the scheduler fires twice, or a deploy
 *     replays a job, `notifications.dispatch` drops the duplicate and nobody
 *     is emailed twice.
 *  3. **Never silently destructive.** The abandoned-draft sweep warns the
 *     owner first and only closes the draft a week later. Nothing is deleted.
 *
 * Convex cron times are UTC. VisaDrive works Mumbai hours (UTC+5:30), so the
 * daily jobs are offset to land at a sensible local time.
 * ========================================================================== */

/**
 * The handlers are referenced by name rather than through `internal.admin.*`
 * because `convex/_generated/api` is only rebuilt by `npx convex dev`; a
 * by-name reference type-checks in a tree where codegen has not run yet and
 * resolves to exactly the same function at runtime.
 */
type NoArgs = Record<string, never>;

const sendFollowUpReminders = makeFunctionReference<"mutation", NoArgs>(
  "admin:sendFollowUpReminders",
);
const remindStuckDocumentUploads = makeFunctionReference<"mutation", NoArgs>(
  "admin:remindStuckDocumentUploads",
);
const sweepAbandonedDrafts = makeFunctionReference<"mutation", NoArgs>(
  "admin:sweepAbandonedDrafts",
);

const crons = cronJobs();

// 09:00 IST — on the agent's desk as the day starts.
crons.daily(
  "lead follow-up reminders",
  { hourUTC: 3, minuteUTC: 30 },
  sendFollowUpReminders,
  {},
);

// 10:30 IST — late enough that a customer uploading over morning coffee is
// not nudged about documents they have just sent.
crons.daily(
  "documents pending nudge",
  { hourUTC: 5, minuteUTC: 0 },
  remindStuckDocumentUploads,
  {},
);

// Hourly, well off the top of the hour so it never collides with the dailies.
crons.hourly(
  "abandoned draft sweep",
  { minuteUTC: 17 },
  sweepAbandonedDrafts,
  {},
);

export default crons;
