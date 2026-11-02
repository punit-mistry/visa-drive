"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  Bell,
  CreditCard,
  FileText,
  PlusCircle,
  User,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ApplicationStatusBadge,
  PaymentRecordStatusBadge,
} from "@/components/shared/status-badge";
import { ListSkeleton } from "@/components/shared/states";
import { formatDate } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";

export default function DashboardPage() {
  const applications = useQuery(api.applications.listMine, { paginationOpts: { numItems: 5, cursor: null } });
  const payments = useQuery(api.payments.listMine, {});
  const unreadCount = useQuery(api.notifications.unreadCount);

  const activeApps = applications?.page?.filter((app) => !app.isDraft) ?? [];
  const recentApps = activeApps.slice(0, 3);
  const recentPayments = (payments ?? []).slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track your visa applications, payments, and updates
          </p>
        </div>
        <Button asChild>
          <Link href="/apply">
            <PlusCircle className="size-4" aria-hidden />
            New application
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Applications</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {applications === undefined ? "—" : activeApps.length}
            </div>
            <p className="text-xs text-muted-foreground">Active applications</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payments</CardTitle>
            <CreditCard className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {payments === undefined ? "—" : payments.length}
            </div>
            <p className="text-xs text-muted-foreground">Payment history</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Notifications</CardTitle>
            <Bell className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {unreadCount === undefined ? "—" : unreadCount}
            </div>
            <p className="text-xs text-muted-foreground">Unread notifications</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profile</CardTitle>
            <User className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Button asChild variant="link" className="h-auto p-0">
              <Link href="/dashboard/profile">
                Manage profile <ArrowRight className="size-3" />
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">Update your details</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Applications</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/applications">
                View all <ArrowRight className="size-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {applications === undefined ? (
              <ListSkeleton rows={3} />
            ) : recentApps.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="size-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No applications yet</p>
                <Button asChild size="sm" className="mt-3">
                  <Link href="/apply">Start your first application</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentApps.map((app) => {
                  return (
                    <Link
                      key={app._id}
                      href={`/dashboard/applications/${app._id}`}
                      className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-surface transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {app.visaProductName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {app.referenceId} • {app.destinationName}
                        </p>
                      </div>
                      <ApplicationStatusBadge status={app.status} audience="customer" />
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Payments</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/payments">
                View all <ArrowRight className="size-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {payments === undefined ? (
              <ListSkeleton rows={3} />
            ) : recentPayments.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="size-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No payments yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentPayments.map((payment) => (
                  <div
                    key={payment._id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">
                        {formatMoney(payment.amount, payment.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {payment.receiptNumber} • {formatDate(payment.createdAt)}
                      </p>
                    </div>
                    <PaymentRecordStatusBadge status={payment.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
