"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  Bell,
  CreditCard,
  FileText,
  PenLine,
  PlusCircle,
  Wallet,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ApplicationStatusBadge,
  PaymentRecordStatusBadge,
} from "@/components/shared/status-badge";
import { ListSkeleton } from "@/components/shared/states";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatDate } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";
import { cn } from "@/lib/utils";

/**
 * Portal home.
 *
 * Ordered by what the customer can act on, not by what is easy to query: the
 * half-finished draft first, then anything waiting on them, then the record
 * of what is already in motion. Nothing is shown that has no next step.
 */
export default function DashboardPage() {
  const { user } = useCurrentUser();
  const applications = useQuery(api.applications.listMine, {
    paginationOpts: { numItems: 5, cursor: null },
  });
  const drafts = useQuery(api.applications.listMyDrafts, {});
  const payments = useQuery(api.payments.listMine, {});
  const unreadCount = useQuery(api.notifications.unreadCount);

  const activeApps = applications?.page ?? [];
  const recentApps = activeApps.slice(0, 4);
  const recentPayments = (payments ?? []).slice(0, 3);
  const latestDraft = drafts?.[0];

  const awaitingPayment = activeApps.filter(
    (app) => app.paymentStatus === "pending" || app.paymentStatus === "partially_paid",
  );

  const firstName = user?.fullName?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Everything on your visa applications, in one place."
        actions={
          <Button asChild>
            <Link href="/apply">
              <PlusCircle className="size-4" aria-hidden />
              New application
            </Link>
          </Button>
        }
      />

      {/* A saved draft is the single highest-value thing on this page: it is
          work already done that earns nothing until it is finished. */}
      {latestDraft && (
        <Card className="animate-fade-up gap-0 overflow-hidden border-primary/25 py-0">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                <PenLine className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Pick up where you left off</p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {latestDraft.visaProductName} · {latestDraft.destinationName} ·
                  step {Math.min(latestDraft.currentStep ?? 1, 4)} of 4
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {drafts && drafts.length > 1 && (
                <Badge variant="outline" className="hidden font-normal sm:inline-flex">
                  +{drafts.length - 1} more {drafts.length === 2 ? "draft" : "drafts"}
                </Badge>
              )}
              <Button asChild>
                <Link href={`/apply/${latestDraft._id}`}>
                  Continue
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ----------------------------- at a glance ---------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Active applications"
          value={applications === undefined ? "—" : activeApps.length}
          hint="Submitted and in progress"
          icon={FileText}
        />
        <StatCard
          label="Awaiting payment"
          value={applications === undefined ? "—" : awaitingPayment.length}
          hint={
            awaitingPayment.length > 0
              ? "Pay to keep things moving"
              : "Nothing outstanding"
          }
          icon={Wallet}
        />
        <StatCard
          label="Unread updates"
          value={unreadCount === undefined ? "—" : unreadCount}
          hint="Notifications waiting for you"
          icon={Bell}
        />
      </div>

      {/* ---------------------------- needs you ------------------------------- */}
      {(awaitingPayment.length > 0 || (unreadCount ?? 0) > 0) && (
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-tight">Needs your attention</h2>
          <div className="space-y-3">
            {awaitingPayment.map((app) => (
              <ActionRow
                key={app._id}
                icon={CreditCard}
                tone="warning"
                title={`Payment due for ${app.visaProductName}`}
                detail={`${app.referenceId} · ${formatMoney(app.pricing.total, app.pricing.currency)}`}
                actionLabel="Pay now"
                href={`/checkout/${app._id}`}
              />
            ))}
            {(unreadCount ?? 0) > 0 && (
              <ActionRow
                icon={Bell}
                tone="info"
                title={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
                detail="Status changes and document requests from our team."
                actionLabel="Read updates"
                href="/dashboard/notifications"
              />
            )}
          </div>
        </section>
      )}

      {/* ----------------------------- the record ----------------------------- */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Your applications</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/applications">
                View all
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {applications === undefined ? (
              <ListSkeleton rows={3} />
            ) : recentApps.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center">
                <FileText className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium">No applications yet</p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                  Choose a visa service and we will guide you through the rest.
                </p>
                <Button asChild size="sm" className="mt-5">
                  <Link href="/apply">Start your first application</Link>
                </Button>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {recentApps.map((app) => (
                  <li key={app._id}>
                    <Link
                      href={`/dashboard/applications/${app._id}`}
                      className="group flex items-center justify-between gap-3 rounded-xl border border-border p-3.5 transition-all hover:border-border-strong hover:bg-surface focus-brand"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {app.visaProductName}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {app.referenceId} · {app.destinationName}
                        </p>
                      </div>
                      <ApplicationStatusBadge status={app.status} audience="customer" />
                      <ArrowRight
                        className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent payments</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/payments">
                View all
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {payments === undefined ? (
              <ListSkeleton rows={3} />
            ) : recentPayments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center">
                <CreditCard className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium">No payments yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Receipts appear here once a payment clears.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {recentPayments.map((payment) => (
                  <li
                    key={payment._id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium tabular-nums">
                        {formatMoney(payment.amount, payment.currency)}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {payment.receiptNumber} · {formatDate(payment.createdAt)}
                      </p>
                    </div>
                    <PaymentRecordStatusBadge status={payment.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  tone,
  title,
  detail,
  actionLabel,
  href,
}: {
  icon: typeof Bell;
  tone: "warning" | "info";
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
        tone === "warning"
          ? "border-warning/30 bg-warning-soft"
          : "border-brand/20 bg-brand-tint",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg bg-background",
            tone === "warning" ? "text-warning" : "text-brand",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0 bg-background">
        <Link href={href}>
          {actionLabel}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
