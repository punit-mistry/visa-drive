"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileEdit,
  Handshake,
  PlusCircle,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { ApplicationStatusBadge } from "@/components/shared/status-badge";
import {
  EmptyState,
  ListSkeleton,
  StatCardSkeleton,
} from "@/components/shared/states";
import { formatDate, formatRelative } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";
import type { ApplicationStatus } from "@/lib/constants/statuses";

export default function PartnerDashboardPage() {
  const data = useQuery(api.partnerBookings.listMyDrafts, {});
  const summary = useQuery(api.partners.myDashboard, { rangeDays: 30 });

  return (
    <div className="space-y-8">
      <PageHeader
        title={summary ? summary.partner.agencyName : "Dashboard"}
        description="Your bookings, your customers and the margin you have earned."
        actions={
          <Button asChild>
            <Link href="/partner/bookings/new">
              <PlusCircle className="size-4" aria-hidden />
              New booking
            </Link>
          </Button>
        }
      />

      {summary === undefined ? (
        <StatCardSkeleton count={4} />
      ) : (
        <>
          <StatGrid columns={4}>
            <StatCard
              label="Total bookings"
              value={summary.kpis.totalBookings}
              icon={Handshake}
              href="/partner/bookings"
              hint={`${summary.kpis.bookingsInRange} in the last ${summary.rangeDays} days`}
            />
            <StatCard
              label="In progress"
              value={summary.kpis.pendingApplications}
              icon={Clock}
              href="/partner/bookings"
              hint="Being processed by VisaDrive"
            />
            <StatCard
              label="Completed"
              value={summary.kpis.completedApplications}
              icon={CheckCircle2}
              href="/partner/bookings"
              hint={
                summary.kpis.rejectedApplications > 0
                  ? `${summary.kpis.rejectedApplications} not approved`
                  : undefined
              }
            />
            <StatCard
              label="Business volume"
              value={formatMoney(summary.kpis.totalVolume, summary.kpis.currency)}
              icon={Wallet}
              hint={`${formatMoney(
                summary.kpis.totalMargin,
                summary.kpis.currency,
              )} earned margin`}
            />
          </StatGrid>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">
                  <span className="inline-flex items-center gap-2">
                    <TrendingUp className="size-4 text-muted-foreground" aria-hidden />
                    Bookings over the last {summary.rangeDays} days
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BookingTrend
                  trend={summary.trend}
                  currency={summary.kpis.currency}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your margin</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Earned to date</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                    {formatMoney(summary.kpis.totalMargin, summary.kpis.currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed text-muted-foreground">
                  Margin is the difference between your partner price and
                  VisaDrive&apos;s base price on each booking, including tax on
                  the uplift. Your rates are on the{" "}
                  <Link
                    href="/partner/pricing"
                    className="rounded-sm font-medium text-brand transition-colors hover:text-brand-deep focus-brand"
                  >
                    pricing page
                  </Link>
                  .
                </div>
              </CardContent>
            </Card>
          </div>

          {data && data.length > 0 && (
            <section>
              <SectionHeader
                title="Unfinished bookings"
                description="Drafts you started but have not submitted yet."
              />
              <Card>
                <CardContent className="p-0">
                  <ul className="divide-y divide-border">
                    {data.map((draft) => (
                      <li
                        key={draft._id}
                        className="flex flex-wrap items-center gap-4 px-4 py-3"
                      >
                        <FileEdit
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {draft.customerName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {draft.visaProductName} · {draft.destinationName} ·
                            last edited {formatRelative(draft.updatedAt)}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm tabular-nums">
                          {formatMoney(draft.total, draft.currency)}
                        </p>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/partner/bookings/new?draft=${draft._id}`}>
                            Continue
                            <ArrowRight className="size-3.5" aria-hidden />
                          </Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          )}

          <section>
            <SectionHeader
              title="Recent bookings"
              description="The latest applications you have placed."
              actions={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/partner/bookings">
                    View all
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </Button>
              }
            />
            <Card>
              <CardContent className={summary.recentBookings.length ? "p-0" : undefined}>
                {summary.recentBookings.length === 0 ? (
                  <EmptyState
                    icon={Handshake}
                    title="No bookings yet"
                    description="Create your first visa application on behalf of a customer and it will appear here."
                    action={
                      <Button asChild>
                        <Link href="/partner/bookings/new">
                          <PlusCircle className="size-4" aria-hidden />
                          New booking
                        </Link>
                      </Button>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {summary.recentBookings.map((booking) => (
                      <li
                        key={booking._id}
                        className="flex flex-wrap items-center gap-4 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/partner/bookings/${booking._id}`}
                            className="rounded-sm font-mono text-xs text-muted-foreground transition-colors hover:text-brand focus-brand"
                          >
                            {booking.referenceId}
                          </Link>
                          <p className="truncate text-sm font-medium">
                            {booking.customerName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {booking.visaProductName} · {booking.destinationName}
                          </p>
                        </div>

                        <ApplicationStatusBadge
                          status={booking.status as ApplicationStatus}
                          size="sm"
                        />

                        <div className="shrink-0 text-right">
                          <p className="text-sm font-medium tabular-nums">
                            {formatMoney(booking.total, booking.currency)}
                          </p>
                          {booking.margin > 0 && (
                            <p className="text-xs tabular-nums text-success">
                              +{formatMoney(booking.margin, booking.currency)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {formatDate(booking.submittedAt ?? booking.createdAt)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>

          {summary.truncated && (
            <p className="text-xs text-muted-foreground">
              These figures are computed from your 1,000 most recent bookings.
            </p>
          )}
        </>
      )}

      {summary === undefined && <ListSkeleton rows={4} />}
    </div>
  );
}

/**
 * A compact column chart drawn in plain SVG.
 *
 * Deliberately not a chart library import for one sparkline: the shape of the
 * data is "how many bookings a day", which a bar per day says perfectly well,
 * and the axis labels would be unreadable at this width anyway. Hover gives
 * the exact figure.
 */
function BookingTrend({
  trend,
  currency,
}: {
  trend: { day: string; bookings: number; volume: number }[];
  currency: string;
}) {
  const max = Math.max(1, ...trend.map((t) => t.bookings));
  const total = trend.reduce((sum, t) => sum + t.bookings, 0);

  if (total === 0) {
    return (
      <EmptyState
        compact
        icon={TrendingUp}
        title="No bookings in this period"
        description="Your booking activity will chart here once you place one."
      />
    );
  }

  return (
    <div>
      <div className="flex h-32 items-end gap-[3px]" role="img" aria-label="Daily bookings">
        {trend.map((point) => (
          <div
            key={point.day}
            className="group relative flex-1 rounded-t-sm bg-brand/15 transition-colors hover:bg-brand/35"
            style={{
              height: `${Math.max(4, (point.bookings / max) * 100)}%`,
            }}
            title={`${point.day}: ${point.bookings} booking${
              point.bookings === 1 ? "" : "s"
            }${point.volume > 0 ? ` · ${formatMoney(point.volume, currency)}` : ""}`}
          >
            {point.bookings > 0 && (
              <span
                className="absolute inset-x-0 bottom-0 rounded-t-sm bg-brand"
                style={{ height: "100%" }}
                aria-hidden
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{trend[0]?.day}</span>
        <span className="tabular-nums">
          {total} booking{total === 1 ? "" : "s"}
        </span>
        <span>{trend[trend.length - 1]?.day}</span>
      </div>
    </div>
  );
}
