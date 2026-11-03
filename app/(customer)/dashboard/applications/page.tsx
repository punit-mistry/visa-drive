"use client";

import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import { FileText } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { ApplicationStatusBadge, PaymentStatusBadge } from "@/components/shared/status-badge";
import { EmptyState, ListSkeleton } from "@/components/shared/states";
import { CursorPagination } from "@/components/tables/data-table";
import { formatDate } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";

export default function ApplicationsPage() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.applications.listMine,
    { includeDrafts: true },
    { initialNumItems: 20 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="Every draft and submitted visa application on your account."
      />

      {status === "LoadingFirstPage" ? (
        <ListSkeleton rows={6} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No applications yet"
          description="Start a visa application and it will appear here. You can save a draft and come back at any time."
          action={
            <Button asChild>
              <Link href="/apply">Browse visa services</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {results.map((app) => (
            <Card key={app._id}>
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={
                        app.isDraft
                          ? `/apply/${app._id}`
                          : `/dashboard/applications/${app._id}`
                      }
                      className="text-base font-semibold hover:underline focus-brand"
                    >
                      {app.visaProductName}
                    </Link>
                    <ApplicationStatusBadge status={app.status} audience="customer" />
                    {app.isDraft && (
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Draft
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {app.referenceId} · {app.destinationName} ·{" "}
                    {app.travellerCount}{" "}
                    {app.travellerCount === 1 ? "traveller" : "travellers"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Updated {formatDate(app.updatedAt)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                  <p className="text-base font-semibold tabular-nums">
                    {formatMoney(app.pricing.total, app.pricing.currency)}
                  </p>
                  <PaymentStatusBadge status={app.paymentStatus} />
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={
                        app.isDraft
                          ? `/apply/${app._id}`
                          : `/dashboard/applications/${app._id}`
                      }
                    >
                      {app.isDraft ? "Continue draft" : "View details"}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex items-center justify-between gap-4">
            <CursorPagination
              loadedCount={results.length}
              status={status}
              onLoadMore={loadMore}
              label="applications"
            />
          </div>
        </div>
      )}
    </div>
  );
}
