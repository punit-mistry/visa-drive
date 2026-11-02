"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  BarChart3,
  Clock,
  CreditCard,
  FileText,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { EmptyState, StatCardSkeleton } from "@/components/shared/states";
import { ApplicationStatusBadge } from "@/components/shared/status-badge";
import { formatDateRange, formatPercent } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";
import type { ApplicationStatus } from "@/lib/constants/statuses";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
] as const;

const BUCKETS = ["day", "week", "month"] as const;
type Bucket = (typeof BUCKETS)[number];

const selectClass =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

export default function AdminAnalyticsPage() {
  const [rangeDays, setRangeDays] = useState(30);
  const [bucket, setBucket] = useState<Bucket>("day");

  const kpis = useQuery(api.analytics.overviewKpis, { rangeDays });
  const range = kpis ? { from: kpis.from, to: kpis.to } : null;

  const applications = useQuery(
    api.analytics.applicationsOverTime,
    range ? { ...range, bucket } : "skip",
  );
  const revenue = useQuery(
    api.analytics.revenueOverTime,
    range ? { ...range, bucket } : "skip",
  );
  const statuses = useQuery(
    api.analytics.statusDistribution,
    range ? { from: range.from, to: range.to } : "skip",
  );

  const maxApplications = useMemo(
    () =>
      Math.max(
        1,
        ...(applications?.points.map((point) =>
          Math.max(point.created, point.submitted),
        ) ?? [1]),
      ),
    [applications],
  );

  const maxRevenue = useMemo(
    () => Math.max(1, ...(revenue?.points.map((point) => point.gross) ?? [1])),
    [revenue],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        description="Live figures computed from application, enquiry and payment rows — nothing here is estimated."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={rangeDays}
              onChange={(event) => setRangeDays(Number(event.target.value))}
              className={selectClass}
              aria-label="Analytics range"
            >
              {RANGES.map((range) => (
                <option key={range.days} value={range.days}>
                  Last {range.label}
                </option>
              ))}
            </select>
            <select
              value={bucket}
              onChange={(event) => setBucket(event.target.value as Bucket)}
              className={selectClass}
              aria-label="Chart grouping"
            >
              {BUCKETS.map((value) => (
                <option key={value} value={value}>
                  By {value}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {kpis && (
        <p className="-mt-4 text-xs text-muted-foreground">
          {formatDateRange(kpis.from, kpis.to)}
        </p>
      )}

      {kpis === undefined ? (
        <StatCardSkeleton count={8} />
      ) : (
        <StatGrid columns={4}>
          <StatCard
            label="Applications"
            value={kpis.totalApplications.value}
            delta={kpis.totalApplications.changePercent}
            icon={FileText}
            href="/admin/applications"
            hint={`${kpis.inProgressApplications.value} in progress`}
          />
          <StatCard
            label="Completed"
            value={kpis.completedApplications.value}
            delta={kpis.completedApplications.changePercent}
            icon={TrendingUp}
            hint={`${kpis.rejectedApplications.value} rejected`}
          />
          <StatCard
            label="Revenue in range"
            value={formatMoney(kpis.revenueInRange.value, kpis.currency)}
            delta={kpis.revenueInRange.changePercent}
            icon={Wallet}
            href="/admin/payments"
          />
          <StatCard
            label="Total revenue"
            value={formatMoney(kpis.totalRevenue.value, kpis.currency)}
            delta={kpis.totalRevenue.changePercent}
            icon={CreditCard}
            hint="All time"
          />
          <StatCard
            label="Conversions"
            value={formatPercent(kpis.conversionRate.value)}
            delta={kpis.conversionRate.changePercent}
            icon={TrendingUp}
            hint={`${kpis.totalEnquiries.value} enquiries`}
          />
          <StatCard
            label="Customers"
            value={kpis.totalCustomers.value}
            delta={kpis.totalCustomers.changePercent}
            icon={Users}
            href="/admin/customers"
            hint={`${kpis.newCustomers.value} new in range`}
          />
          <StatCard
            label="Docs to review"
            value={kpis.documentsPendingReview.value}
            delta={kpis.documentsPendingReview.changePercent}
            icon={Clock}
            invertDelta
            hint="Awaiting a decision"
          />
          <StatCard
            label="Payments pending"
            value={formatMoney(kpis.pendingPaymentsAmount.value, kpis.currency)}
            icon={CreditCard}
            href="/admin/payments"
            hint={`${kpis.pendingPaymentsCount.value} outstanding`}
          />
        </StatGrid>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              Applications over time
              {applications && (
                <span className="text-xs font-normal text-muted-foreground">
                  {applications.totals.created} created · {applications.totals.submitted}{" "}
                  submitted
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {applications === undefined ? (
              <p className="text-sm text-muted-foreground">Loading series…</p>
            ) : applications.points.length === 0 ? (
              <EmptyState
                compact
                icon={BarChart3}
                title="No application activity"
                description="Try a wider date range."
              />
            ) : (
              <div className="space-y-3">
                {applications.points.map((point) => (
                  <div key={point.start} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">{point.label}</span>
                      <span className="tabular-nums">
                        {point.created} created · {point.submitted} submitted
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <div className="h-2 flex-1 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-brand"
                          style={{
                            width: `${Math.max(
                              (point.created / maxApplications) * 100,
                              point.created > 0 ? 4 : 0,
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="h-2 flex-1 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-navy"
                          style={{
                            width: `${Math.max(
                              (point.submitted / maxApplications) * 100,
                              point.submitted > 0 ? 4 : 0,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {applications.isApproximate && (
                  <p className="text-xs text-muted-foreground">
                    Large dataset — figures are approximate.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              Revenue over time
              {revenue && (
                <span className="text-xs font-normal text-muted-foreground">
                  Net {formatMoney(revenue.totals.net, revenue.currency)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenue === undefined ? (
              <p className="text-sm text-muted-foreground">Loading series…</p>
            ) : revenue.points.length === 0 ? (
              <EmptyState
                compact
                icon={Wallet}
                title="No settled payments"
                description="Revenue appears once payments are collected."
              />
            ) : (
              <div className="space-y-3">
                {revenue.points.map((point) => (
                  <div key={point.start} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">{point.label}</span>
                      <span className="tabular-nums">
                        {formatMoney(point.net, revenue.currency)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-success"
                        style={{
                          width: `${Math.max(
                            (point.gross / maxRevenue) * 100,
                            point.gross > 0 ? 4 : 0,
                          )}%`,
                        }}
                      />
                    </div>
                    {point.refunds > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {formatMoney(point.refunds, revenue.currency)} refunded
                      </p>
                    )}
                  </div>
                ))}
                {revenue.isApproximate && (
                  <p className="text-xs text-muted-foreground">
                    Large dataset — figures are approximate.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            Status distribution
            {statuses && (
              <span className="text-xs font-normal text-muted-foreground">
                {statuses.total} applications · {statuses.scope}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statuses === undefined ? (
            <p className="text-sm text-muted-foreground">Loading statuses…</p>
          ) : statuses.rows.length === 0 ? (
            <EmptyState compact title="No applications in this range" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {statuses.rows.map((row) => (
                <div key={row.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <ApplicationStatusBadge
                      status={row.key as ApplicationStatus}
                      size="sm"
                    />
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {row.count} · {row.share.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-navy"
                      style={{ width: `${Math.min(row.share, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Need the underlying rows?{" "}
        <Link href="/admin/applications" className="underline-offset-2 hover:underline">
          Browse applications
        </Link>{" "}
        or{" "}
        <Link href="/admin/payments" className="underline-offset-2 hover:underline">
          review payments
        </Link>
        .
      </p>
    </div>
  );
}
