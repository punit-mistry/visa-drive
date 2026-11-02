"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePaginatedQuery } from "convex/react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText, Search, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import {
  ApplicationStatusBadge,
  PaymentStatusBadge,
} from "@/components/shared/status-badge";
import { DataTable, CursorPagination } from "@/components/tables/data-table";
import { useDebounce } from "@/hooks/use-debounce";
import { formatDate } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_CONFIG,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_CONFIG,
  type ApplicationStatus,
  type PaymentStatusValue,
} from "@/lib/constants/statuses";

type AdminApplicationRow = Doc<"applications"> & {
  assignedAgentName: string | null;
};

const selectClass =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

export default function AdminApplicationsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "">("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusValue | "">("");
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const debouncedSearch = useDebounce(search);

  const { results, status: pageStatus, loadMore } = usePaginatedQuery(
    api.applications.listForAdmin,
    {
      search: debouncedSearch.trim() || undefined,
      status: status || undefined,
      paymentStatus: paymentStatus || undefined,
      includeDrafts,
      sort: "newest",
    },
    { initialNumItems: 25 },
  );

  const columns = useMemo<ColumnDef<AdminApplicationRow>[]>(
    () => [
      {
        accessorKey: "referenceId",
        header: "Reference",
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">{row.original.referenceId}</span>
        ),
      },
      {
        accessorKey: "customerName",
        header: "Customer",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.customerName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.customerEmail}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "visaProductName",
        header: "Service",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">{row.original.visaProductName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.destinationName}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <ApplicationStatusBadge status={row.original.status as ApplicationStatus} size="sm" />
        ),
      },
      {
        accessorKey: "paymentStatus",
        header: "Payment",
        cell: ({ row }) => (
          <PaymentStatusBadge
            status={row.original.paymentStatus as PaymentStatusValue}
            size="sm"
          />
        ),
      },
      {
        accessorKey: "travellerCount",
        header: "Travellers",
        cell: ({ row }) => <span className="tabular-nums">{row.original.travellerCount}</span>,
      },
      {
        id: "total",
        header: "Total",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatMoney(row.original.pricing.total, row.original.pricing.currency)}
          </span>
        ),
      },
      {
        id: "agent",
        header: "Agent",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.assignedAgentName ?? "Unassigned"}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
    ],
    [],
  );

  const hasFilters = !!search || !!status || !!paymentStatus || includeDrafts;

  function resetFilters() {
    setSearch("");
    setStatus("");
    setPaymentStatus("");
    setIncludeDrafts(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="Every visa application, draft and submitted, across all customers."
      />

      <Card>
        <CardContent className="p-4">
          <DataTable
            columns={columns}
            data={results}
            isLoading={pageStatus === "LoadingFirstPage"}
            onRowClick={(row) => router.push(`/admin/applications/${row._id}`)}
            getRowId={(row) => row._id}
            emptyIcon={FileText}
            emptyTitle={hasFilters ? "No applications match" : "No applications yet"}
            emptyDescription={
              hasFilters
                ? "Try clearing one or more filters to see more results."
                : "Applications will appear here as customers submit them."
            }
            emptyAction={
              hasFilters ? (
                <Button variant="outline" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
            toolbar={
              <>
                <div className="relative w-full max-w-xs">
                  <Search
                    className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search customer or reference"
                    className="pl-9"
                    aria-label="Search applications"
                  />
                </div>

                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as ApplicationStatus | "")}
                  className={selectClass}
                  aria-label="Filter by application status"
                >
                  <option value="">All statuses</option>
                  {APPLICATION_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {APPLICATION_STATUS_CONFIG[value].label}
                    </option>
                  ))}
                </select>

                <select
                  value={paymentStatus}
                  onChange={(event) =>
                    setPaymentStatus(event.target.value as PaymentStatusValue | "")
                  }
                  className={selectClass}
                  aria-label="Filter by payment status"
                >
                  <option value="">All payments</option>
                  {PAYMENT_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {PAYMENT_STATUS_CONFIG[value].label}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={includeDrafts}
                    onChange={(event) => setIncludeDrafts(event.target.checked)}
                    className="size-4 rounded border-input"
                  />
                  Include drafts
                </label>

                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={resetFilters}>
                    <X className="size-3.5" aria-hidden />
                    Clear
                  </Button>
                )}
              </>
            }
            pagination={
              <CursorPagination
                loadedCount={results.length}
                status={pageStatus}
                onLoadMore={loadMore}
                label="applications"
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
