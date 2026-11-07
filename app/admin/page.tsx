"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  MessageSquare,
  TrendingUp,
  Users,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/lib/constants/roles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { EmptyState, ListSkeleton, StatCardSkeleton } from "@/components/shared/states";
import {
  ApplicationStatusBadge,
  LeadStatusBadge,
} from "@/components/shared/status-badge";
import {
  formatDate,
  formatPercent,
  formatRelative,
} from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";
import type {
  ApplicationStatus,
  LeadStatusValue,
} from "@/lib/constants/statuses";

export default function AdminDashboardPage() {
  // Every staff role lands here, but the KPI block is analytics data and a
  // support agent does not hold `analytics:view`. Asking for it anyway threw
  // a FORBIDDEN out of `useQuery`, which takes the whole page down — so the
  // query is skipped and the work queue, which only needs a staff session,
  // renders on its own.
  const { can } = useCurrentUser();
  const canSeeAnalytics = can(PERMISSIONS.ANALYTICS_VIEW);

  const summary = useQuery(
    api.admin.dashboardSummary,
    canSeeAnalytics ? { rangeDays: 30 } : "skip",
  );
  const queue = useQuery(api.admin.pendingWorkQueue, { limit: 6 });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Operations dashboard"
        description="Everything needing attention across applications, documents, payments and leads."
        actions={
          canSeeAnalytics ? (
            <Button asChild variant="outline">
              <Link href="/admin/analytics">
                <BarChart3 className="size-4" aria-hidden />
                Full analytics
              </Link>
            </Button>
          ) : undefined
        }
      />

      {!canSeeAnalytics ? null : summary === undefined ? (
        <StatCardSkeleton count={8} />
      ) : (
        <>
          <StatGrid columns={4}>
            <StatCard
              label="Applications"
              value={summary.kpis.totalApplications.value}
              delta={summary.kpis.totalApplications.changePercent}
              icon={FileText}
              href="/admin/applications"
              hint={`${summary.kpis.inProgressApplications.value} in progress`}
            />
            <StatCard
              label="In progress"
              value={summary.kpis.inProgressApplications.value}
              delta={summary.kpis.inProgressApplications.changePercent}
              icon={Clock}
              href="/admin/applications"
              hint={`${summary.kpis.completedApplications.value} completed`}
            />
            <StatCard
              label="Documents to review"
              value={summary.kpis.documentsPendingReview.value}
              delta={summary.kpis.documentsPendingReview.changePercent}
              icon={ClipboardList}
              invertDelta
              hint="Awaiting a staff decision"
            />
            <StatCard
              label="Revenue in range"
              value={formatMoney(
                summary.kpis.revenueInRange.value,
                summary.revenueOverTime.currency,
              )}
              delta={summary.kpis.revenueInRange.changePercent}
              icon={CreditCard}
              href="/admin/payments"
              hint={`${summary.kpis.pendingPaymentsCount.value} payments pending`}
            />
            <StatCard
              label="Customers"
              value={summary.kpis.totalCustomers.value}
              delta={summary.kpis.totalCustomers.changePercent}
              icon={Users}
              href="/admin/customers"
              hint={`${summary.kpis.newCustomers.value} new in range`}
            />
            <StatCard
              label="Enquiries"
              value={summary.kpis.totalEnquiries.value}
              delta={summary.kpis.totalEnquiries.changePercent}
              icon={MessageSquare}
              href="/admin/enquiries"
              hint={`${summary.kpis.conversionRate.value.toFixed(1)}% conversion`}
            />
            <StatCard
              label="Conversion rate"
              value={formatPercent(summary.kpis.conversionRate.value)}
              delta={summary.kpis.conversionRate.changePercent}
              icon={TrendingUp}
              href="/admin/analytics"
            />
            <StatCard
              label="Pending payments"
              value={formatMoney(
                summary.kpis.pendingPaymentsAmount.value,
                summary.revenueOverTime.currency,
              )}
              icon={CreditCard}
              href="/admin/payments"
              hint={`${summary.kpis.pendingPaymentsCount.value} invoices outstanding`}
            />
          </StatGrid>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Applications in range</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/analytics">
                    Details <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="max-h-72 overflow-y-auto scrollbar-thin">
                {summary.applicationsOverTime.points.length === 0 ? (
                  <EmptyState
                    compact
                    title="No activity in this range"
                    description="Application volume will appear here as customers apply."
                  />
                ) : (
                  <div className="space-y-2">
                    {summary.applicationsOverTime.points.slice(-8).map((point) => (
                      <div
                        key={point.start}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="text-muted-foreground">{point.label}</span>
                        <span className="tabular-nums">
                          {point.created} created · {point.submitted} submitted
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Status distribution</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {summary.statusDistribution.total} applications
                </span>
              </CardHeader>
              <CardContent className="max-h-72 overflow-y-auto scrollbar-thin">
                {summary.statusDistribution.rows.length === 0 ? (
                  <EmptyState compact title="No applications yet" />
                ) : (
                  <div className="space-y-2">
                    {summary.statusDistribution.rows.map((row) => (
                      <div
                        key={row.key}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <ApplicationStatusBadge
                          status={row.key as ApplicationStatus}
                          size="sm"
                        />
                        <span className="tabular-nums text-muted-foreground">
                          {row.count} · {row.share.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <SectionHeader
              title="Recent bookings"
              description="The latest submitted applications."
              actions={
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/applications">All applications</Link>
                </Button>
              }
            />
            <Card>
              <CardContent className="max-h-96 divide-y divide-border overflow-y-auto p-0 scrollbar-thin">
                {summary.recentBookings.length === 0 ? (
                  <EmptyState compact title="No bookings yet" />
                ) : (
                  summary.recentBookings.map((booking) => (
                    <Link
                      key={booking._id}
                      href={`/admin/applications/${booking._id}`}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface focus-brand"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {booking.customerName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {booking.referenceId} · {booking.visaProductName} ·{" "}
                          {booking.destinationName}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm tabular-nums">
                          {formatMoney(booking.total, booking.currency)}
                        </span>
                        <ApplicationStatusBadge
                          status={booking.status as ApplicationStatus}
                          size="sm"
                        />
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <div>
        <SectionHeader
          title="Work queue"
          description="Oldest items first — these are the things that need a human."
        />
        {queue === undefined ? (
          <ListSkeleton rows={4} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Documents awaiting review</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {queue.counts.documentsAwaitingReview}
                </span>
              </CardHeader>
              <CardContent className="max-h-80 space-y-2 overflow-y-auto scrollbar-thin">
                {queue.documentsAwaitingReview.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing waiting. All documents have been reviewed.
                  </p>
                ) : (
                  queue.documentsAwaitingReview.map((doc) => (
                    <Link
                      key={doc._id}
                      href={`/admin/applications/${doc.applicationId}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-surface focus-brand"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{doc.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.referenceId ?? "Application"} ·{" "}
                          {doc.customerName ?? "Customer"} ·{" "}
                          {formatRelative(doc.createdAt)}
                        </p>
                      </div>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Unassigned applications</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {queue.counts.unassignedApplications}
                </span>
              </CardHeader>
              <CardContent className="max-h-80 space-y-2 overflow-y-auto scrollbar-thin">
                {queue.unassignedApplications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Every open application has an owner.
                  </p>
                ) : (
                  queue.unassignedApplications.map((app) => (
                    <Link
                      key={app._id}
                      href={`/admin/applications/${app._id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-surface focus-brand"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {app.referenceId} · {app.customerName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {app.visaProductName} · waiting{" "}
                          {formatRelative(app.createdAt)}
                        </p>
                      </div>
                      <ApplicationStatusBadge
                        status={app.status as ApplicationStatus}
                        size="sm"
                      />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Leads due for follow-up</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {queue.counts.leadsDueForFollowUp}
                </span>
              </CardHeader>
              <CardContent className="max-h-80 space-y-2 overflow-y-auto scrollbar-thin">
                {queue.leadsDueForFollowUp.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No follow-ups are due right now.
                  </p>
                ) : (
                  queue.leadsDueForFollowUp.map((lead) => (
                    <Link
                      key={lead._id}
                      href={`/admin/enquiries/${lead._id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-surface focus-brand"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{lead.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          Due {formatDate(lead.followUpAt)}
                          {lead.isOverdue ? ` · ${lead.daysOverdue}d overdue` : ""}
                        </p>
                      </div>
                      <LeadStatusBadge
                        status={lead.leadStatus as LeadStatusValue}
                        size="sm"
                      />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Conversations waiting</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {queue.counts.unansweredConversations}
                </span>
              </CardHeader>
              <CardContent className="max-h-80 space-y-2 overflow-y-auto scrollbar-thin">
                {queue.unansweredConversations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No customer messages waiting for a reply.
                  </p>
                ) : (
                  queue.unansweredConversations.map((conversation) => (
                    <Link
                      key={conversation._id}
                      href="/admin/conversations"
                      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-surface focus-brand"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{conversation.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {conversation.customerName} ·{" "}
                          {formatRelative(conversation.lastMessageAt)} ·{" "}
                          {conversation.unreadForStaff} unread
                        </p>
                      </div>
                      <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
