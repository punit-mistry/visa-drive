import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requirePermission } from "./lib/auth";
import { PERMISSIONS } from "../lib/constants/roles";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_CONFIG,
  LEAD_STATUSES,
  type ApplicationStatus,
  type LeadStatusValue,
} from "../lib/constants/statuses";
import { SITE } from "../lib/constants/site";

/* ============================================================================
 * Analytics.
 *
 * HARD RULE for this module: every number returned here is derived from rows
 * that were actually read out of the database in this request. There is not a
 * single literal figure anywhere below — if the database is empty every KPI
 * comes back as 0, which is the honest answer.
 *
 * Performance notes
 *  - Everything goes through an index. Time-bounded reads use
 *    `by_createdAt` / `by_status_createdAt`; "how many are in state X right
 *    now" reads use `by_status` / `by_leadStatus` / `by_status_role`.
 *  - Reads are capped at SCAN_LIMIT rows. When a cap is hit the figure is
 *    returned with `isApproximate: true` rather than being silently wrong.
 *
 * // SCALING: the cumulative counters (total applications / total enquiries /
 * // lifetime revenue) are O(rows-in-that-state). They are correct and cheap
 * // at the volumes this business runs at today (thousands), but they are the
 * // first thing to move to a rollup table: a `metricRollups` table keyed by
 * // (metric, dayStamp) maintained incrementally by the mutations that create
 * // applications / payments / enquiries, with these queries summing N day
 * // rows instead of N entity rows. The windowed series below are already
 * // time-bounded and do not need that treatment until a single day's volume
 * // is large.
 * ========================================================================== */

/** Hard ceiling on rows read by any single aggregate. */
const SCAN_LIMIT = 20_000;

/** Default comparison window when the caller does not pass one. */
const DEFAULT_RANGE_DAYS = 30;

/** Guard rail so a silly `from`/`to` cannot ask for a million buckets. */
const MAX_BUCKETS = 400;

const DAY_MS = 24 * 60 * 60 * 1000;

/** VisaDrive operates out of Mumbai; every calendar boundary is IST. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/*                                 time helpers                               */
/* -------------------------------------------------------------------------- */

/** Start of the IST calendar day containing `ts`, as a UTC epoch ms. */
export function istDayStart(ts: number): number {
  const shifted = ts + IST_OFFSET_MS;
  return Math.floor(shifted / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

export type BucketSize = "day" | "week" | "month";

/** Start of the bucket (IST calendar) containing `ts`. */
export function bucketStart(ts: number, bucket: BucketSize): number {
  if (bucket === "day") return istDayStart(ts);

  if (bucket === "week") {
    const dayStart = istDayStart(ts);
    // getUTCDay on the IST-shifted instant gives the IST weekday.
    const istWeekday = new Date(dayStart + IST_OFFSET_MS).getUTCDay(); // 0 = Sun
    const daysSinceMonday = (istWeekday + 6) % 7;
    return dayStart - daysSinceMonday * DAY_MS;
  }

  const d = new Date(ts + IST_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - IST_OFFSET_MS;
}

/** Start of the bucket immediately after the one starting at `start`. */
export function nextBucketStart(start: number, bucket: BucketSize): number {
  if (bucket === "day") return start + DAY_MS;
  if (bucket === "week") return start + 7 * DAY_MS;
  const d = new Date(start + IST_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - IST_OFFSET_MS;
}

/** `YYYY-MM-DD` (day/week) or `YYYY-MM` (month), always in IST. */
export function bucketLabel(start: number, bucket: BucketSize): string {
  const iso = new Date(start + IST_OFFSET_MS).toISOString();
  return bucket === "month" ? iso.slice(0, 7) : iso.slice(0, 10);
}

/** Every bucket start in `[from, to)`, so the series has no holes. */
export function denseBucketStarts(
  from: number,
  to: number,
  bucket: BucketSize,
): number[] {
  const starts: number[] = [];
  let cursor = bucketStart(from, bucket);
  while (cursor < to && starts.length < MAX_BUCKETS) {
    starts.push(cursor);
    cursor = nextBucketStart(cursor, bucket);
  }
  return starts;
}

/* -------------------------------------------------------------------------- */
/*                               reading helpers                              */
/* -------------------------------------------------------------------------- */

interface Takeable<T> {
  take(n: number): Promise<T[]>;
}

/**
 * Read at most SCAN_LIMIT rows. Returns `capped: true` when there were more,
 * so the caller can label the figure as approximate instead of pretending.
 */
async function boundedRead<T>(
  q: Takeable<T>,
  limit: number = SCAN_LIMIT,
): Promise<{ rows: T[]; capped: boolean }> {
  const rows = await q.take(limit + 1);
  if (rows.length > limit) return { rows: rows.slice(0, limit), capped: true };
  return { rows, capped: false };
}

export interface Kpi {
  value: number;
  previous: number;
  change: number;
  /** Null when the previous period was zero — a % change off zero is a lie. */
  changePercent: number | null;
  isApproximate: boolean;
}

export const kpiValidator = v.object({
  value: v.number(),
  previous: v.number(),
  change: v.number(),
  changePercent: v.union(v.number(), v.null()),
  isApproximate: v.boolean(),
});

function kpi(value: number, previous: number, approximate = false): Kpi {
  const change = value - previous;
  return {
    value,
    previous,
    change,
    changePercent:
      previous === 0 ? null : Math.round((change / previous) * 1000) / 10,
    isApproximate: approximate,
  };
}

function sum(values: number[]): number {
  return values.reduce((acc, n) => acc + n, 0);
}

/* -------------------------------------------------------------------------- */
/*                              domain groupings                              */
/* -------------------------------------------------------------------------- */

/** Statuses that mean "a human is actively moving this forward". */
export const IN_PROGRESS_STATUSES = APPLICATION_STATUSES.filter(
  (s) =>
    s !== "draft" &&
    s !== "completed" &&
    s !== "rejected" &&
    s !== "cancelled" &&
    s !== "approved",
) as ApplicationStatus[];

/** Payment rows that still represent money we expect to collect. */
const PENDING_PAYMENT_STATUSES = ["created", "pending"] as const;

/**
 * Net revenue convention.
 *
 * A fully refunded payment carries status `refunded` and is therefore not
 * counted at all (amount − refundedAmount would be 0 anyway). A `paid` row has
 * `refundedAmount === 0`, and a `partially_refunded` row nets out its refund.
 * Counting `refunded` rows in the gross AND subtracting their refund would
 * double-count, which is why the set below is exactly these two statuses.
 */
const REVENUE_PAYMENT_STATUSES = ["paid", "partially_refunded"] as const;

function netOf(payment: Doc<"payments">): number {
  return Math.max(0, payment.amount - (payment.refundedAmount ?? 0));
}

/* -------------------------------------------------------------------------- */
/*                            raw read primitives                             */
/* -------------------------------------------------------------------------- */

async function applicationsCreatedBetween(
  ctx: QueryCtx,
  from: number,
  to: number,
) {
  return boundedRead(
    ctx.db
      .query("applications")
      .withIndex("by_createdAt", (q) =>
        q.gte("createdAt", from).lt("createdAt", to),
      ),
  );
}

async function enquiriesCreatedBetween(ctx: QueryCtx, from: number, to: number) {
  return boundedRead(
    ctx.db
      .query("enquiries")
      .withIndex("by_createdAt", (q) =>
        q.gte("createdAt", from).lt("createdAt", to),
      ),
  );
}

async function usersCreatedBetween(ctx: QueryCtx, from: number, to: number) {
  return boundedRead(
    ctx.db
      .query("users")
      .withIndex("by_createdAt", (q) =>
        q.gte("createdAt", from).lt("createdAt", to),
      ),
  );
}

/** Payment rows in the revenue statuses, created inside the window. */
async function revenuePaymentsBetween(ctx: QueryCtx, from: number, to: number) {
  const parts = await Promise.all(
    REVENUE_PAYMENT_STATUSES.map((status) =>
      boundedRead(
        ctx.db
          .query("payments")
          .withIndex("by_status_createdAt", (q) =>
            q.eq("status", status).gte("createdAt", from).lt("createdAt", to),
          ),
      ),
    ),
  );
  return {
    rows: parts.flatMap((p) => p.rows),
    capped: parts.some((p) => p.capped),
  };
}

/** How many applications sit in `status` right now (all time). */
async function countApplicationsByStatus(
  ctx: QueryCtx,
  status: ApplicationStatus,
): Promise<{ count: number; capped: boolean }> {
  // SCALING: replace with a rollup counter row when a single status holds
  // more than SCAN_LIMIT applications.
  const { rows, capped } = await boundedRead(
    ctx.db.query("applications").withIndex("by_status", (q) => q.eq("status", status)),
  );
  return { count: rows.length, capped };
}

/* ============================================================================
 * overviewKpis
 * ========================================================================== */

export interface OverviewKpis {
  rangeDays: number;
  from: number;
  to: number;
  previousFrom: number;
  previousTo: number;
  currency: string;
  totalCustomers: Kpi;
  newCustomers: Kpi;
  totalEnquiries: Kpi;
  totalApplications: Kpi;
  newApplicationsToday: Kpi;
  inProgressApplications: Kpi;
  documentsPendingReview: Kpi;
  completedApplications: Kpi;
  rejectedApplications: Kpi;
  pendingPaymentsCount: Kpi;
  pendingPaymentsAmount: Kpi;
  totalRevenue: Kpi;
  revenueInRange: Kpi;
  conversionRate: Kpi;
}

export async function computeOverviewKpis(
  ctx: QueryCtx,
  rangeDays: number,
  now: number,
): Promise<OverviewKpis> {
  const days = Math.min(Math.max(Math.floor(rangeDays), 1), 365);
  const windowMs = days * DAY_MS;
  const curFrom = now - windowMs;
  const prevFrom = curFrom - windowMs;

  const todayStart = istDayStart(now);
  const yesterdayStart = todayStart - DAY_MS;

  const [
    appsCur,
    enqCur,
    enqPrev,
    usersCur,
    usersPrev,
    payCur,
    payPrev,
    appsToday,
    appsYesterday,
  ] = await Promise.all([
    applicationsCreatedBetween(ctx, curFrom, now),
    enquiriesCreatedBetween(ctx, curFrom, now),
    enquiriesCreatedBetween(ctx, prevFrom, curFrom),
    usersCreatedBetween(ctx, curFrom, now),
    usersCreatedBetween(ctx, prevFrom, curFrom),
    revenuePaymentsBetween(ctx, curFrom, now),
    revenuePaymentsBetween(ctx, prevFrom, curFrom),
    applicationsCreatedBetween(ctx, todayStart, now),
    applicationsCreatedBetween(ctx, yesterdayStart, todayStart),
  ]);

  /* ----------------------------- live totals ----------------------------- */

  const activeCustomers = await boundedRead(
    ctx.db
      .query("users")
      .withIndex("by_status_role", (q) =>
        q.eq("status", "active").eq("role", "customer"),
      ),
  );

  // SCALING: these two are the lifetime totals and are the only genuinely
  // O(all-rows) reads in this module. Move them to a rollup counter row
  // (incremented by applications.submit / enquiries.submit) before either
  // table passes SCAN_LIMIT; until then they are exact, and past the cap they
  // report `isApproximate: true` rather than a wrong number.
  const allApplications = await boundedRead(
    ctx.db.query("applications").withIndex("by_createdAt", (q) => q.lte("createdAt", now)),
  );

  const allEnquiries = await boundedRead(
    ctx.db.query("enquiries").withIndex("by_createdAt", (q) => q.lte("createdAt", now)),
  );

  const inProgressCounts = await Promise.all(
    IN_PROGRESS_STATUSES.map((s) => countApplicationsByStatus(ctx, s)),
  );
  const completed = await countApplicationsByStatus(ctx, "completed");
  const rejected = await countApplicationsByStatus(ctx, "rejected");

  const docsPending = await boundedRead(
    ctx.db.query("documents").withIndex("by_status", (q) => q.eq("status", "pending_review")),
  );

  const pendingPaymentParts = await Promise.all(
    PENDING_PAYMENT_STATUSES.map((status) =>
      boundedRead(
        ctx.db.query("payments").withIndex("by_status", (q) => q.eq("status", status)),
      ),
    ),
  );
  const pendingPaymentRows = pendingPaymentParts.flatMap((p) => p.rows);

  const lifetimeRevenueParts = await Promise.all(
    REVENUE_PAYMENT_STATUSES.map((status) =>
      boundedRead(
        ctx.db.query("payments").withIndex("by_status", (q) => q.eq("status", status)),
      ),
    ),
  );
  const lifetimeRevenueRows = lifetimeRevenueParts.flatMap((p) => p.rows);

  /* ------------------------------ derivations ---------------------------- */

  const newCustomersCur = usersCur.rows.filter((u) => u.role === "customer").length;
  const newCustomersPrev = usersPrev.rows.filter((u) => u.role === "customer").length;

  // A cumulative total "as of the end of the previous period" is the current
  // total minus whatever was created during this period. No second scan.
  const totalCustomersNow = activeCustomers.rows.length;
  const totalApplicationsNow = allApplications.rows.length;
  const totalEnquiriesNow = allEnquiries.rows.length;

  const revenueNow = sum(lifetimeRevenueRows.map(netOf));
  const revenueCur = sum(payCur.rows.map(netOf));
  const revenuePrev = sum(payPrev.rows.map(netOf));

  // Cohort conversion: of the enquiries raised inside the window, how many
  // have since converted. Comparing two cohorts is honest in a way that
  // comparing "converted this month ÷ raised this month" is not.
  const convertedCur = enqCur.rows.filter((e) => e.leadStatus === "converted").length;
  const convertedPrev = enqPrev.rows.filter((e) => e.leadStatus === "converted").length;
  const rate = (converted: number, total: number) =>
    total === 0 ? 0 : Math.round((converted / total) * 1000) / 10;

  // Currency is read off the money rows themselves rather than assumed; the
  // SITE default is only used when there is no money in the system yet.
  const currency =
    lifetimeRevenueRows[0]?.currency ??
    pendingPaymentRows[0]?.currency ??
    SITE.defaultCurrency;

  const inProgressTotal = sum(inProgressCounts.map((c) => c.count));
  const inProgressCapped = inProgressCounts.some((c) => c.capped);

  // Previous-period equivalents for the "right now" gauges: subtract the rows
  // in that state that were created during the current window.
  const inProgressSet = new Set<string>(IN_PROGRESS_STATUSES);
  const inProgressCreatedThisWindow = appsCur.rows.filter((a) =>
    inProgressSet.has(a.status),
  ).length;
  const completedCreatedThisWindow = appsCur.rows.filter(
    (a) => a.status === "completed",
  ).length;
  const rejectedCreatedThisWindow = appsCur.rows.filter(
    (a) => a.status === "rejected",
  ).length;

  return {
    rangeDays: days,
    from: curFrom,
    to: now,
    previousFrom: prevFrom,
    previousTo: curFrom,
    currency,

    totalCustomers: kpi(
      totalCustomersNow,
      totalCustomersNow - newCustomersCur,
      activeCustomers.capped,
    ),
    newCustomers: kpi(newCustomersCur, newCustomersPrev, usersCur.capped),

    totalEnquiries: kpi(
      totalEnquiriesNow,
      totalEnquiriesNow - enqCur.rows.length,
      allEnquiries.capped,
    ),

    totalApplications: kpi(
      totalApplicationsNow,
      totalApplicationsNow - appsCur.rows.length,
      allApplications.capped,
    ),

    newApplicationsToday: kpi(
      appsToday.rows.length,
      appsYesterday.rows.length,
      appsToday.capped,
    ),

    inProgressApplications: kpi(
      inProgressTotal,
      inProgressTotal - inProgressCreatedThisWindow,
      inProgressCapped,
    ),

    // Queue depths have no history to compare against — nothing records how
    // many documents were pending a month ago. The comparison below is the
    // honest proxy we can compute from live rows: how much of today's queue
    // was already waiting before this period began. It is a backlog figure,
    // not a reconstruction of the past.
    documentsPendingReview: kpi(
      docsPending.rows.length,
      docsPending.rows.filter((d) => d.createdAt < curFrom).length,
      docsPending.capped,
    ),

    completedApplications: kpi(
      completed.count,
      completed.count - completedCreatedThisWindow,
      completed.capped,
    ),

    rejectedApplications: kpi(
      rejected.count,
      rejected.count - rejectedCreatedThisWindow,
      rejected.capped,
    ),

    pendingPaymentsCount: kpi(
      pendingPaymentRows.length,
      pendingPaymentRows.filter((p) => p.createdAt < curFrom).length,
      pendingPaymentParts.some((p) => p.capped),
    ),

    pendingPaymentsAmount: kpi(
      sum(pendingPaymentRows.map((p) => p.amount)),
      sum(
        pendingPaymentRows.filter((p) => p.createdAt < curFrom).map((p) => p.amount),
      ),
      pendingPaymentParts.some((p) => p.capped),
    ),

    totalRevenue: kpi(
      revenueNow,
      revenueNow - revenueCur,
      lifetimeRevenueParts.some((p) => p.capped),
    ),

    revenueInRange: kpi(revenueCur, revenuePrev, payCur.capped),

    conversionRate: kpi(
      rate(convertedCur, enqCur.rows.length),
      rate(convertedPrev, enqPrev.rows.length),
      enqCur.capped,
    ),
  };
}

export const overviewKpis = query({
  args: { rangeDays: v.optional(v.number()) },
  returns: v.object({
    rangeDays: v.number(),
    from: v.number(),
    to: v.number(),
    previousFrom: v.number(),
    previousTo: v.number(),
    currency: v.string(),
    totalCustomers: kpiValidator,
    newCustomers: kpiValidator,
    totalEnquiries: kpiValidator,
    totalApplications: kpiValidator,
    newApplicationsToday: kpiValidator,
    inProgressApplications: kpiValidator,
    documentsPendingReview: kpiValidator,
    completedApplications: kpiValidator,
    rejectedApplications: kpiValidator,
    pendingPaymentsCount: kpiValidator,
    pendingPaymentsAmount: kpiValidator,
    totalRevenue: kpiValidator,
    revenueInRange: kpiValidator,
    conversionRate: kpiValidator,
  }),
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);
    return computeOverviewKpis(ctx, args.rangeDays ?? DEFAULT_RANGE_DAYS, Date.now());
  },
});

/* ============================================================================
 * applicationsOverTime
 * ========================================================================== */

export interface SeriesPoint {
  start: number;
  end: number;
  label: string;
  created: number;
  submitted: number;
  completed: number;
  rejected: number;
}

export async function computeApplicationsOverTime(
  ctx: QueryCtx,
  opts: { from: number; to: number; bucket: BucketSize },
): Promise<{
  bucket: BucketSize;
  from: number;
  to: number;
  isApproximate: boolean;
  totals: { created: number; submitted: number; completed: number; rejected: number };
  points: SeriesPoint[];
}> {
  const { rows, capped } = await applicationsCreatedBetween(ctx, opts.from, opts.to);

  const starts = denseBucketStarts(opts.from, opts.to, opts.bucket);
  const index = new Map<number, SeriesPoint>();
  for (const start of starts) {
    index.set(start, {
      start,
      end: nextBucketStart(start, opts.bucket),
      label: bucketLabel(start, opts.bucket),
      created: 0,
      submitted: 0,
      completed: 0,
      rejected: 0,
    });
  }

  for (const app of rows) {
    const point = index.get(bucketStart(app.createdAt, opts.bucket));
    if (!point) continue; // outside the dense window (only possible at the cap)
    point.created += 1;
    if (!app.isDraft) point.submitted += 1;
    if (app.status === "completed") point.completed += 1;
    if (app.status === "rejected") point.rejected += 1;
  }

  const points = starts.map((s) => index.get(s)!);

  return {
    bucket: opts.bucket,
    from: opts.from,
    to: opts.to,
    isApproximate: capped,
    totals: {
      created: sum(points.map((p) => p.created)),
      submitted: sum(points.map((p) => p.submitted)),
      completed: sum(points.map((p) => p.completed)),
      rejected: sum(points.map((p) => p.rejected)),
    },
    points,
  };
}

const bucketArg = v.optional(
  v.union(v.literal("day"), v.literal("week"), v.literal("month")),
);

function resolveRange(args: { from?: number; to?: number }, now: number) {
  const to = args.to ?? now;
  const from = args.from ?? to - 30 * DAY_MS;
  return { from: Math.min(from, to), to };
}

export const applicationsOverTime = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()), bucket: bucketArg },
  returns: v.object({
    bucket: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
    from: v.number(),
    to: v.number(),
    isApproximate: v.boolean(),
    totals: v.object({
      created: v.number(),
      submitted: v.number(),
      completed: v.number(),
      rejected: v.number(),
    }),
    points: v.array(
      v.object({
        start: v.number(),
        end: v.number(),
        label: v.string(),
        created: v.number(),
        submitted: v.number(),
        completed: v.number(),
        rejected: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);
    const { from, to } = resolveRange(args, Date.now());
    return computeApplicationsOverTime(ctx, { from, to, bucket: args.bucket ?? "day" });
  },
});

/* ============================================================================
 * revenueOverTime
 * ========================================================================== */

export interface RevenuePoint {
  start: number;
  end: number;
  label: string;
  gross: number;
  refunds: number;
  net: number;
  paymentCount: number;
}

export async function computeRevenueOverTime(
  ctx: QueryCtx,
  opts: { from: number; to: number; bucket: BucketSize },
): Promise<{
  bucket: BucketSize;
  from: number;
  to: number;
  currency: string;
  isApproximate: boolean;
  totals: { gross: number; refunds: number; net: number; paymentCount: number };
  points: RevenuePoint[];
}> {
  const { rows, capped } = await revenuePaymentsBetween(ctx, opts.from, opts.to);

  const starts = denseBucketStarts(opts.from, opts.to, opts.bucket);
  const index = new Map<number, RevenuePoint>();
  for (const start of starts) {
    index.set(start, {
      start,
      end: nextBucketStart(start, opts.bucket),
      label: bucketLabel(start, opts.bucket),
      gross: 0,
      refunds: 0,
      net: 0,
      paymentCount: 0,
    });
  }

  for (const payment of rows) {
    // Bucketed on `createdAt` because that is the indexed field; `paidAt` is
    // normally the same minute for Razorpay and within the same day for the
    // offline modes, so the shape of the chart is unaffected.
    const point = index.get(bucketStart(payment.createdAt, opts.bucket));
    if (!point) continue;
    point.gross += payment.amount;
    point.refunds += payment.refundedAmount ?? 0;
    point.net += netOf(payment);
    point.paymentCount += 1;
  }

  const points = starts.map((s) => index.get(s)!);

  return {
    bucket: opts.bucket,
    from: opts.from,
    to: opts.to,
    currency: rows[0]?.currency ?? SITE.defaultCurrency,
    isApproximate: capped,
    totals: {
      gross: sum(points.map((p) => p.gross)),
      refunds: sum(points.map((p) => p.refunds)),
      net: sum(points.map((p) => p.net)),
      paymentCount: sum(points.map((p) => p.paymentCount)),
    },
    points,
  };
}

export const revenueOverTime = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()), bucket: bucketArg },
  returns: v.object({
    bucket: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
    from: v.number(),
    to: v.number(),
    currency: v.string(),
    isApproximate: v.boolean(),
    totals: v.object({
      gross: v.number(),
      refunds: v.number(),
      net: v.number(),
      paymentCount: v.number(),
    }),
    points: v.array(
      v.object({
        start: v.number(),
        end: v.number(),
        label: v.string(),
        gross: v.number(),
        refunds: v.number(),
        net: v.number(),
        paymentCount: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);
    const { from, to } = resolveRange(args, Date.now());
    return computeRevenueOverTime(ctx, { from, to, bucket: args.bucket ?? "day" });
  },
});

/* ============================================================================
 * destinationBreakdown
 * ========================================================================== */

export interface BreakdownRow {
  key: string;
  label: string;
  count: number;
  /** Percentage of the total, one decimal place. */
  share: number;
}

const breakdownValidator = v.object({
  key: v.string(),
  label: v.string(),
  count: v.number(),
  share: v.number(),
});

function toBreakdown(
  counts: Map<string, { label: string; count: number }>,
): BreakdownRow[] {
  const total = sum([...counts.values()].map((c) => c.count));
  return [...counts.entries()]
    .map(([key, { label, count }]) => ({
      key,
      label,
      count,
      share: total === 0 ? 0 : Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export async function computeDestinationBreakdown(
  ctx: QueryCtx,
  opts: { from: number; to: number },
): Promise<{ from: number; to: number; total: number; isApproximate: boolean; rows: BreakdownRow[] }> {
  const { rows, capped } = await applicationsCreatedBetween(ctx, opts.from, opts.to);

  const counts = new Map<string, { label: string; count: number }>();
  for (const app of rows) {
    const key = app.destinationId as string;
    const entry = counts.get(key) ?? { label: app.destinationName, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }

  return {
    from: opts.from,
    to: opts.to,
    total: rows.length,
    isApproximate: capped,
    rows: toBreakdown(counts),
  };
}

export const destinationBreakdown = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  returns: v.object({
    from: v.number(),
    to: v.number(),
    total: v.number(),
    isApproximate: v.boolean(),
    rows: v.array(breakdownValidator),
  }),
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);
    const now = Date.now();
    const to = args.to ?? now;
    const from = args.from ?? to - 90 * DAY_MS;
    return computeDestinationBreakdown(ctx, { from, to });
  },
});

/* ============================================================================
 * categoryBreakdown
 * ========================================================================== */

export async function computeCategoryBreakdown(
  ctx: QueryCtx,
  opts: { from: number; to: number },
): Promise<{ from: number; to: number; total: number; isApproximate: boolean; rows: BreakdownRow[] }> {
  const { rows, capped } = await applicationsCreatedBetween(ctx, opts.from, opts.to);

  // The application row denormalises the product *name* but not its category,
  // so we resolve the distinct product ids — a handful of catalogue rows, not
  // one lookup per application.
  const productIds = [...new Set(rows.map((a) => a.visaProductId as string))];
  const products = await Promise.all(
    productIds.map((id) => ctx.db.get(id as Id<"visaProducts">)),
  );
  const categoryByProduct = new Map<string, string>();
  for (const product of products) {
    if (product) categoryByProduct.set(product._id as string, product.category);
  }

  const counts = new Map<string, { label: string; count: number }>();
  for (const app of rows) {
    // An application whose product was deleted is grouped under "unknown"
    // rather than being dropped, so the totals still add up.
    const category = categoryByProduct.get(app.visaProductId as string) ?? "unknown";
    const entry = counts.get(category) ?? { label: humanise(category), count: 0 };
    entry.count += 1;
    counts.set(category, entry);
  }

  return {
    from: opts.from,
    to: opts.to,
    total: rows.length,
    isApproximate: capped,
    rows: toBreakdown(counts),
  };
}

function humanise(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const categoryBreakdown = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  returns: v.object({
    from: v.number(),
    to: v.number(),
    total: v.number(),
    isApproximate: v.boolean(),
    rows: v.array(breakdownValidator),
  }),
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);
    const now = Date.now();
    const to = args.to ?? now;
    const from = args.from ?? to - 90 * DAY_MS;
    return computeCategoryBreakdown(ctx, { from, to });
  },
});

/* ============================================================================
 * statusDistribution
 * ========================================================================== */

export interface StatusDistributionRow extends BreakdownRow {
  tone: string;
  isTerminal: boolean;
}

export async function computeStatusDistribution(
  ctx: QueryCtx,
  opts: { from?: number; to?: number },
): Promise<{
  scope: "range" | "live";
  from: number | null;
  to: number | null;
  total: number;
  isApproximate: boolean;
  rows: StatusDistributionRow[];
}> {
  if (opts.from !== undefined && opts.to !== undefined) {
    // Bounded by time: one index scan, grouped in memory.
    const { rows, capped } = await applicationsCreatedBetween(ctx, opts.from, opts.to);
    const counts = new Map<string, number>();
    for (const app of rows) counts.set(app.status, (counts.get(app.status) ?? 0) + 1);
    return {
      scope: "range",
      from: opts.from,
      to: opts.to,
      total: rows.length,
      isApproximate: capped,
      rows: decorateStatuses(counts, rows.length),
    };
  }

  // Live snapshot: one indexed read per status, so nothing scans the table.
  const perStatus = await Promise.all(
    APPLICATION_STATUSES.map(async (status) => ({
      status,
      ...(await countApplicationsByStatus(ctx, status)),
    })),
  );
  const counts = new Map<string, number>();
  for (const entry of perStatus) counts.set(entry.status, entry.count);
  const total = sum(perStatus.map((e) => e.count));

  return {
    scope: "live",
    from: null,
    to: null,
    total,
    isApproximate: perStatus.some((e) => e.capped),
    rows: decorateStatuses(counts, total),
  };
}

function decorateStatuses(
  counts: Map<string, number>,
  total: number,
): StatusDistributionRow[] {
  return APPLICATION_STATUSES.map((status) => {
    const config = APPLICATION_STATUS_CONFIG[status];
    const count = counts.get(status) ?? 0;
    return {
      key: status,
      label: config.label,
      count,
      share: total === 0 ? 0 : Math.round((count / total) * 1000) / 10,
      tone: config.tone,
      isTerminal: config.isTerminal,
    };
  })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export const statusDistribution = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  returns: v.object({
    scope: v.union(v.literal("range"), v.literal("live")),
    from: v.union(v.number(), v.null()),
    to: v.union(v.number(), v.null()),
    total: v.number(),
    isApproximate: v.boolean(),
    rows: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        count: v.number(),
        share: v.number(),
        tone: v.string(),
        isTerminal: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);
    return computeStatusDistribution(ctx, args);
  },
});

/* ============================================================================
 * recentBookings / recentEnquiries
 * ========================================================================== */

const recentBookingValidator = v.object({
  _id: v.id("applications"),
  referenceId: v.string(),
  customerName: v.string(),
  customerEmail: v.string(),
  destinationName: v.string(),
  visaProductName: v.string(),
  status: v.string(),
  statusLabel: v.string(),
  paymentStatus: v.string(),
  total: v.number(),
  currency: v.string(),
  travellerCount: v.number(),
  assignedAgentId: v.union(v.id("users"), v.null()),
  createdAt: v.number(),
});

export async function computeRecentBookings(ctx: QueryCtx, limit: number) {
  // `by_draft_createdAt` with isDraft=false gives submitted bookings newest
  // first without reading any drafts at all.
  const rows = await ctx.db
    .query("applications")
    .withIndex("by_draft_createdAt", (q) => q.eq("isDraft", false))
    .order("desc")
    .take(limit);

  return rows.map((app) => ({
    _id: app._id,
    referenceId: app.referenceId,
    customerName: app.customerName,
    customerEmail: app.customerEmail,
    destinationName: app.destinationName,
    visaProductName: app.visaProductName,
    status: app.status,
    statusLabel: APPLICATION_STATUS_CONFIG[app.status].label,
    paymentStatus: app.paymentStatus,
    total: app.pricing.total,
    currency: app.pricing.currency,
    travellerCount: app.travellerCount,
    assignedAgentId: app.assignedAgentId ?? null,
    createdAt: app.createdAt,
  }));
}

export const recentBookings = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(recentBookingValidator),
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);
    return computeRecentBookings(ctx, clampLimit(args.limit, 10));
  },
});

const recentEnquiryValidator = v.object({
  _id: v.id("enquiries"),
  referenceId: v.string(),
  fullName: v.string(),
  email: v.string(),
  phone: v.string(),
  subject: v.string(),
  interestedCountry: v.union(v.string(), v.null()),
  leadStatus: v.string(),
  source: v.string(),
  assignedTo: v.union(v.id("users"), v.null()),
  followUpAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
});

export async function computeRecentEnquiries(ctx: QueryCtx, limit: number) {
  const rows = await ctx.db
    .query("enquiries")
    .withIndex("by_createdAt")
    .order("desc")
    .take(limit);

  return rows.map((e) => ({
    _id: e._id,
    referenceId: e.referenceId,
    fullName: e.fullName,
    email: e.email,
    phone: e.phone,
    subject: e.subject,
    interestedCountry: e.interestedCountry ?? null,
    leadStatus: e.leadStatus,
    source: e.source,
    assignedTo: e.assignedTo ?? null,
    followUpAt: e.followUpAt ?? null,
    createdAt: e.createdAt,
  }));
}

export const recentEnquiries = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(recentEnquiryValidator),
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);
    return computeRecentEnquiries(ctx, clampLimit(args.limit, 10));
  },
});

function clampLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return Math.min(Math.max(Math.floor(value), 1), 100);
}

/* ============================================================================
 * pendingTasks
 * ========================================================================== */

export interface PendingTasks {
  documentsAwaitingReview: number;
  openDocumentRequests: number;
  unassignedApplications: number;
  applicationsAwaitingDocuments: number;
  conversationsAwaitingStaff: number;
  leadsDueForFollowUp: number;
  unassignedLeads: number;
  paymentsPending: number;
  isApproximate: boolean;
  total: number;
}

const QUEUE_READ_LIMIT = 1_000;

export async function computePendingTasks(
  ctx: QueryCtx,
  now: number,
): Promise<PendingTasks> {
  const [
    docsPending,
    docRequests,
    unassigned,
    awaitingDocs,
    openConversations,
    pendingConversations,
    dueLeads,
    paymentsPendingParts,
  ] = await Promise.all([
    boundedRead(
      ctx.db.query("documents").withIndex("by_status", (q) => q.eq("status", "pending_review")),
      QUEUE_READ_LIMIT,
    ),
    boundedRead(
      ctx.db.query("documentRequests").withIndex("by_status", (q) => q.eq("status", "open")),
      QUEUE_READ_LIMIT,
    ),
    // `by_assignedAgentId` indexes the undefined value too, so "nobody owns
    // this yet" is an indexed lookup rather than a table filter.
    boundedRead(
      ctx.db
        .query("applications")
        .withIndex("by_assignedAgentId", (q) => q.eq("assignedAgentId", undefined)),
      QUEUE_READ_LIMIT,
    ),
    boundedRead(
      ctx.db
        .query("applications")
        .withIndex("by_status", (q) => q.eq("status", "documents_pending")),
      QUEUE_READ_LIMIT,
    ),
    boundedRead(
      ctx.db.query("conversations").withIndex("by_status", (q) => q.eq("status", "open")),
      QUEUE_READ_LIMIT,
    ),
    boundedRead(
      ctx.db.query("conversations").withIndex("by_status", (q) => q.eq("status", "pending")),
      QUEUE_READ_LIMIT,
    ),
    // `gt(0)` matters: an optional field sorts *before* every number in a
    // Convex index, so without a lower bound this range would be filled with
    // the (many) leads that have no follow-up date at all.
    boundedRead(
      ctx.db
        .query("enquiries")
        .withIndex("by_followUpAt", (q) =>
          q.gt("followUpAt", 0).lte("followUpAt", now),
        ),
      QUEUE_READ_LIMIT,
    ),
    Promise.all(
      PENDING_PAYMENT_STATUSES.map((status) =>
        boundedRead(
          ctx.db.query("payments").withIndex("by_status", (q) => q.eq("status", status)),
          QUEUE_READ_LIMIT,
        ),
      ),
    ),
  ]);

  // Drafts have no agent by design — they are not staff work yet.
  const unassignedLive = unassigned.rows.filter(
    (a) => !a.isDraft && !APPLICATION_STATUS_CONFIG[a.status].isTerminal,
  );

  const awaitingStaff = [...openConversations.rows, ...pendingConversations.rows].filter(
    (c) => c.unreadForStaff > 0,
  );

  const liveLeads = dueLeads.rows.filter(
    (e) =>
      e.followUpAt !== undefined &&
      e.leadStatus !== "converted" &&
      e.leadStatus !== "lost",
  );

  const paymentsPending = paymentsPendingParts.flatMap((p) => p.rows).length;

  const result: Omit<PendingTasks, "total"> = {
    documentsAwaitingReview: docsPending.rows.length,
    openDocumentRequests: docRequests.rows.length,
    unassignedApplications: unassignedLive.length,
    applicationsAwaitingDocuments: awaitingDocs.rows.length,
    conversationsAwaitingStaff: awaitingStaff.length,
    leadsDueForFollowUp: liveLeads.length,
    unassignedLeads: liveLeads.filter((e) => e.assignedTo === undefined).length,
    paymentsPending,
    isApproximate:
      docsPending.capped ||
      docRequests.capped ||
      unassigned.capped ||
      awaitingDocs.capped ||
      openConversations.capped ||
      pendingConversations.capped ||
      dueLeads.capped ||
      paymentsPendingParts.some((p) => p.capped),
  };

  return {
    ...result,
    // `total` deliberately excludes `unassignedLeads` and
    // `applicationsAwaitingDocuments`: the first is a subset of
    // `leadsDueForFollowUp`, the second is work the *customer* owes us.
    total:
      result.documentsAwaitingReview +
      result.openDocumentRequests +
      result.unassignedApplications +
      result.conversationsAwaitingStaff +
      result.leadsDueForFollowUp +
      result.paymentsPending,
  };
}

export const pendingTasks = query({
  args: {},
  returns: v.object({
    documentsAwaitingReview: v.number(),
    openDocumentRequests: v.number(),
    unassignedApplications: v.number(),
    applicationsAwaitingDocuments: v.number(),
    conversationsAwaitingStaff: v.number(),
    leadsDueForFollowUp: v.number(),
    unassignedLeads: v.number(),
    paymentsPending: v.number(),
    isApproximate: v.boolean(),
    total: v.number(),
  }),
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);
    return computePendingTasks(ctx, Date.now());
  },
});

/* ============================================================================
 * followUpReminders
 * ========================================================================== */

const followUpValidator = v.object({
  _id: v.id("enquiries"),
  referenceId: v.string(),
  fullName: v.string(),
  email: v.string(),
  phone: v.string(),
  subject: v.string(),
  leadStatus: v.string(),
  followUpAt: v.number(),
  contactAttempts: v.number(),
  lastContactedAt: v.union(v.number(), v.null()),
  assignedTo: v.union(v.id("users"), v.null()),
  assignedToName: v.union(v.string(), v.null()),
  isOverdue: v.boolean(),
  daysOverdue: v.number(),
});

export async function computeFollowUpReminders(
  ctx: QueryCtx,
  opts: { now: number; horizonDays: number; limit: number; assignedTo?: Id<"users"> },
) {
  const horizon = opts.now + opts.horizonDays * DAY_MS;

  // Indexed on followUpAt, so this reads only the leads that are actually due.
  // The `gt(0)` lower bound excludes leads with no follow-up date, which would
  // otherwise sort first in the index and fill the batch.
  const { rows } = await boundedRead(
    ctx.db
      .query("enquiries")
      .withIndex("by_followUpAt", (q) =>
        q.gt("followUpAt", 0).lte("followUpAt", horizon),
      ),
    QUEUE_READ_LIMIT,
  );

  const due = rows
    .filter((e) => e.followUpAt !== undefined)
    .filter((e) => e.leadStatus !== "converted" && e.leadStatus !== "lost")
    .filter((e) => (opts.assignedTo ? e.assignedTo === opts.assignedTo : true))
    .sort((a, b) => (a.followUpAt ?? 0) - (b.followUpAt ?? 0))
    .slice(0, opts.limit);

  // One lookup per distinct assignee, not per lead.
  const agentIds = [
    ...new Set(due.map((e) => e.assignedTo).filter(Boolean) as Id<"users">[]),
  ];
  const agents = await Promise.all(agentIds.map((id) => ctx.db.get(id)));
  const agentNames = new Map<string, string>();
  for (const agent of agents) {
    if (agent) agentNames.set(agent._id as string, agent.fullName);
  }

  return due.map((e) => {
    const followUpAt = e.followUpAt!;
    const overdueMs = opts.now - followUpAt;
    return {
      _id: e._id,
      referenceId: e.referenceId,
      fullName: e.fullName,
      email: e.email,
      phone: e.phone,
      subject: e.subject,
      leadStatus: e.leadStatus,
      followUpAt,
      contactAttempts: e.contactAttempts,
      lastContactedAt: e.lastContactedAt ?? null,
      assignedTo: e.assignedTo ?? null,
      assignedToName: e.assignedTo
        ? (agentNames.get(e.assignedTo as string) ?? null)
        : null,
      isOverdue: overdueMs > 0,
      daysOverdue: overdueMs > 0 ? Math.floor(overdueMs / DAY_MS) : 0,
    };
  });
}

export const followUpReminders = query({
  args: {
    horizonDays: v.optional(v.number()),
    limit: v.optional(v.number()),
    mineOnly: v.optional(v.boolean()),
  },
  returns: v.array(followUpValidator),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);
    return computeFollowUpReminders(ctx, {
      now: Date.now(),
      horizonDays: Math.min(Math.max(args.horizonDays ?? 0, 0), 90),
      limit: clampLimit(args.limit, 25),
      assignedTo: args.mineOnly ? staff.user._id : undefined,
    });
  },
});

/* ============================================================================
 * conversionFunnel
 * ========================================================================== */

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** Share of the first stage, one decimal. */
  shareOfTop: number;
  /** Share of the immediately preceding stage, one decimal. */
  shareOfPrevious: number;
}

export async function computeConversionFunnel(
  ctx: QueryCtx,
  opts: { from: number; to: number },
): Promise<{
  from: number;
  to: number;
  isApproximate: boolean;
  stages: FunnelStage[];
  leadStatusCounts: BreakdownRow[];
}> {
  const [enq, apps] = await Promise.all([
    enquiriesCreatedBetween(ctx, opts.from, opts.to),
    applicationsCreatedBetween(ctx, opts.from, opts.to),
  ]);

  const processingStatuses = new Set<ApplicationStatus>([
    "ready_for_processing",
    "appointment_scheduled",
    "visa_processing",
    "approved",
    "completed",
  ]);
  const decidedStatuses = new Set<ApplicationStatus>(["approved", "completed"]);

  const raw: Array<{ key: string; label: string; count: number }> = [
    { key: "enquiries", label: "Enquiries received", count: enq.rows.length },
    {
      key: "qualified",
      label: "Qualified or converted",
      count: enq.rows.filter(
        (e) => e.leadStatus === "qualified" || e.leadStatus === "converted",
      ).length,
    },
    { key: "applications", label: "Applications started", count: apps.rows.length },
    {
      key: "submitted",
      label: "Applications submitted",
      count: apps.rows.filter((a) => !a.isDraft).length,
    },
    {
      key: "paid",
      label: "Payment settled",
      count: apps.rows.filter((a) => a.paymentStatus === "paid").length,
    },
    {
      key: "processing",
      label: "Reached processing",
      count: apps.rows.filter((a) => processingStatuses.has(a.status)).length,
    },
    {
      key: "approved",
      label: "Approved or completed",
      count: apps.rows.filter((a) => decidedStatuses.has(a.status)).length,
    },
  ];

  const top = raw[0].count;
  const stages: FunnelStage[] = raw.map((stage, i) => {
    const previous = i === 0 ? stage.count : raw[i - 1].count;
    return {
      ...stage,
      shareOfTop: top === 0 ? 0 : Math.round((stage.count / top) * 1000) / 10,
      shareOfPrevious:
        previous === 0 ? 0 : Math.round((stage.count / previous) * 1000) / 10,
    };
  });

  const leadCounts = new Map<string, { label: string; count: number }>();
  for (const status of LEAD_STATUSES as readonly LeadStatusValue[]) {
    leadCounts.set(status, { label: humanise(status), count: 0 });
  }
  for (const e of enq.rows) {
    const entry = leadCounts.get(e.leadStatus);
    if (entry) entry.count += 1;
  }

  return {
    from: opts.from,
    to: opts.to,
    isApproximate: enq.capped || apps.capped,
    stages,
    leadStatusCounts: toBreakdown(leadCounts).filter((r) => r.count > 0),
  };
}

export const conversionFunnel = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  returns: v.object({
    from: v.number(),
    to: v.number(),
    isApproximate: v.boolean(),
    stages: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        count: v.number(),
        shareOfTop: v.number(),
        shareOfPrevious: v.number(),
      }),
    ),
    leadStatusCounts: v.array(breakdownValidator),
  }),
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);
    const now = Date.now();
    const to = args.to ?? now;
    const from = args.from ?? to - 90 * DAY_MS;
    return computeConversionFunnel(ctx, { from, to });
  },
});
