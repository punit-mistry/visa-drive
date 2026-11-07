"use client";

import { useState } from "react";
import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import { ArrowRight, Handshake, PlusCircle, Search, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import {
  ApplicationStatusBadge,
  PaymentStatusBadge,
} from "@/components/shared/status-badge";
import { EmptyState, ListSkeleton } from "@/components/shared/states";
import { CursorPagination } from "@/components/tables/data-table";
import { useDebounce } from "@/hooks/use-debounce";
import { formatDate } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";
import {
  APPLICATION_STATUS_CONFIG,
  type ApplicationStatus,
  type PaymentStatusValue,
} from "@/lib/constants/statuses";

/**
 * The filters a partner actually works by.
 *
 * Narrower than the CRM's full status list on purpose: an agent thinks in
 * "waiting on me" / "waiting on VisaDrive" / "done", not in fourteen internal
 * states. Each entry still maps to a real status the backend indexes.
 */
const FILTERS: { value: ApplicationStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "submitted", label: "Submitted" },
  { value: "documents_pending", label: "Documents pending" },
  { value: "additional_documents_requested", label: "Action needed" },
  { value: "under_review", label: "Under review" },
  { value: "visa_processing", label: "Processing" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
];

export default function PartnerBookingsPage() {
  const [status, setStatus] = useState<ApplicationStatus | "">("");
  const [search, setSearch] = useState("");
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const debouncedSearch = useDebounce(search);

  const { results, status: pageStatus, loadMore } = usePaginatedQuery(
    api.partnerBookings.listMine,
    {
      status: status || undefined,
      search: debouncedSearch.trim() || undefined,
      includeDrafts,
    },
    { initialNumItems: 20 },
  );

  const hasFilters = !!status || !!search || includeDrafts;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookings"
        description="Every application you have placed for your customers."
        actions={
          <Button asChild>
            <Link href="/partner/bookings/new">
              <PlusCircle className="size-4" aria-hidden />
              New booking
            </Link>
          </Button>
        }
      />

      <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((filter) => (
          <button
            key={filter.value || "all"}
            type="button"
            onClick={() => setStatus(filter.value)}
            aria-pressed={status === filter.value}
            className={
              status === filter.value
                ? "shrink-0 whitespace-nowrap rounded-full border border-brand/25 bg-brand-tint px-3 py-1.5 text-sm font-medium text-brand-deep focus-brand"
                : "shrink-0 whitespace-nowrap rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-brand"
            }
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer, reference or destination"
            className="pl-9"
            aria-label="Search your bookings"
          />
        </div>

        <Button
          variant={includeDrafts ? "default" : "outline"}
          size="sm"
          onClick={() => setIncludeDrafts((v) => !v)}
        >
          {includeDrafts ? "Hiding nothing" : "Include drafts"}
        </Button>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatus("");
              setSearch("");
              setIncludeDrafts(false);
            }}
          >
            <X className="size-3.5" aria-hidden />
            Clear
          </Button>
        )}
      </div>

      {pageStatus === "LoadingFirstPage" ? (
        <ListSkeleton rows={6} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title={hasFilters ? "No bookings match" : "No bookings yet"}
          description={
            hasFilters
              ? "Try a different filter, or clear them to see everything."
              : "Create a visa application on behalf of a customer and it will appear here."
          }
          action={
            hasFilters ? (
              <Button
                variant="outline"
                onClick={() => {
                  setStatus("");
                  setSearch("");
                  setIncludeDrafts(false);
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button asChild>
                <Link href="/partner/bookings/new">
                  <PlusCircle className="size-4" aria-hidden />
                  New booking
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {results.map((booking) => (
              <Card key={booking._id} className="transition-shadow hover:elev-sm">
                <CardContent className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {booking.referenceId}
                      </span>
                      {booking.isDraft ? (
                        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Draft
                        </span>
                      ) : (
                        <ApplicationStatusBadge
                          status={booking.status as ApplicationStatus}
                          size="sm"
                        />
                      )}
                      {!booking.isDraft && (
                        <PaymentStatusBadge
                          status={booking.paymentStatus as PaymentStatusValue}
                          size="sm"
                        />
                      )}
                    </div>

                    <p className="mt-1.5 truncate text-sm font-medium">
                      {booking.customerName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {booking.visaProductName} · {booking.destinationName} ·{" "}
                      {booking.travellerCount} traveller
                      {booking.travellerCount === 1 ? "" : "s"}
                    </p>

                    {!booking.isDraft &&
                      booking.documentsRequiredCount > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                          Documents {booking.documentsApprovedCount} /{" "}
                          {booking.documentsRequiredCount} approved
                        </p>
                      )}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatMoney(booking.total, booking.currency)}
                    </p>
                    {booking.margin > 0 && (
                      <p className="text-xs tabular-nums text-success">
                        +{formatMoney(booking.margin, booking.currency)} margin
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDate(booking.submittedAt ?? booking.createdAt)}
                    </p>
                  </div>

                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <Link
                      href={
                        booking.isDraft
                          ? `/partner/bookings/new?draft=${booking._id}`
                          : `/partner/bookings/${booking._id}`
                      }
                    >
                      {booking.isDraft ? "Continue" : "View"}
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4">
            <CursorPagination
              loadedCount={results.length}
              status={pageStatus}
              onLoadMore={loadMore}
              label="bookings"
            />
          </div>

          {status && (
            <p className="text-xs text-muted-foreground">
              Showing {APPLICATION_STATUS_CONFIG[status].label.toLowerCase()}{" "}
              bookings only.
            </p>
          )}
        </>
      )}
    </div>
  );
}
