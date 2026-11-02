"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  CreditCard,
  Download,
  Inbox,
  RotateCcw,
  Search,
  Wallet,
  X,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatCardSkeleton } from "@/components/shared/states";
import { ToneBadge } from "@/components/shared/status-badge";
import { DataTable, CursorPagination } from "@/components/tables/data-table";
import { useDebounce } from "@/hooks/use-debounce";
import { formatDate, titleCase } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";
import type { StatusTone } from "@/lib/constants/statuses";

type PaymentRow = Doc<"payments"> & {
  applicationReference: string | null;
  customerName: string | null;
  destinationName: string | null;
  netAmount: number;
};

const PAYMENT_ROW_STATUSES = [
  "created",
  "pending",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
  "cancelled",
] as const;

type PaymentRowStatus = (typeof PAYMENT_ROW_STATUSES)[number];

const PAYMENT_ROW_STATUS_CONFIG: Record<
  PaymentRowStatus,
  { label: string; tone: StatusTone }
> = {
  created: { label: "Created", tone: "neutral" },
  pending: { label: "Pending", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  refunded: { label: "Refunded", tone: "neutral" },
  partially_refunded: { label: "Partially refunded", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const PAYMENT_MODES = [
  "razorpay",
  "manual_bank_transfer",
  "cash",
  "upi_offline",
  "cheque",
  "other",
] as const;

const selectClass =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

function dateStart(value: string): number | undefined {
  return value ? new Date(`${value}T00:00:00`).getTime() : undefined;
}

function dateEnd(value: string): number | undefined {
  return value ? new Date(`${value}T23:59:59.999`).getTime() : undefined;
}

export default function AdminPaymentsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PaymentRowStatus | "">("");
  const [mode, setMode] = useState<(typeof PAYMENT_MODES)[number] | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const debouncedSearch = useDebounce(search);

  const summary = useQuery(api.payments.financeSummary, {});

  const { results, status: pageStatus, loadMore } = usePaginatedQuery(
    api.payments.listForAdmin,
    {
      search: debouncedSearch.trim() || undefined,
      status: status || undefined,
      mode: mode || undefined,
      dateFrom: dateStart(dateFrom),
      dateTo: dateEnd(dateTo),
    },
    { initialNumItems: 25 },
  );

  const columns = useMemo<ColumnDef<PaymentRow>[]>(
    () => [
      {
        accessorKey: "receiptNumber",
        header: "Receipt",
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">{row.original.receiptNumber}</span>
        ),
      },
      {
        id: "application",
        header: "Application",
        cell: ({ row }) =>
          row.original.applicationId ? (
            <Link
              href={`/admin/applications/${row.original.applicationId}`}
              className="block min-w-0 rounded-sm focus-brand"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="truncate font-medium">
                {row.original.applicationReference ?? "Application"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {row.original.customerName ?? "Unknown customer"}
              </p>
            </Link>
          ) : (
            <span className="text-muted-foreground">Not linked</span>
          ),
      },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => (
          <div className="tabular-nums">
            <p>{formatMoney(row.original.amount, row.original.currency)}</p>
            {row.original.refundedAmount > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatMoney(row.original.refundedAmount, row.original.currency)} refunded
              </p>
            )}
          </div>
        ),
      },
      {
        id: "net",
        header: "Net",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatMoney(row.original.netAmount, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: "mode",
        header: "Mode",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{titleCase(row.original.mode)}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const config =
            PAYMENT_ROW_STATUS_CONFIG[row.original.status as PaymentRowStatus];
          return (
            <ToneBadge
              label={config?.label ?? titleCase(row.original.status)}
              tone={config?.tone ?? "neutral"}
              size="sm"
            />
          );
        },
      },
      {
        id: "paidAt",
        header: "Paid",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.paidAt ? formatDate(row.original.paidAt) : "—"}
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

  const hasFilters = !!search || !!status || !!mode || !!dateFrom || !!dateTo;

  function resetFilters() {
    setSearch("");
    setStatus("");
    setMode("");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Every payment attempt and settlement, with the finance totals computed from the same rows."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/analytics">
              <Download className="size-4" aria-hidden />
              Revenue analytics
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
              label="Collected (gross)"
              value={formatMoney(summary.collections.gross, summary.currency)}
              icon={Wallet}
              hint={`${summary.collections.count} settled payment${
                summary.collections.count === 1 ? "" : "s"
              }`}
            />
            <StatCard
              label="Net after refunds"
              value={formatMoney(summary.collections.net, summary.currency)}
              icon={CreditCard}
              hint={`${formatMoney(summary.refunds.amount, summary.currency)} refunded`}
            />
            <StatCard
              label="Outstanding"
              value={formatMoney(summary.pending.amount, summary.currency)}
              icon={Inbox}
              hint={`${summary.pending.count} invoiced application${
                summary.pending.count === 1 ? "" : "s"
              }`}
            />
            <StatCard
              label="In flight / failed"
              value={formatMoney(
                summary.inFlight.amount + summary.failed.amount,
                summary.currency,
              )}
              icon={AlertTriangle}
              hint={`${summary.inFlight.count} in flight · ${summary.failed.count} failed`}
            />
          </StatGrid>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Collections by mode</CardTitle>
              <span className="text-xs text-muted-foreground">
                Last 90 days
              </span>
            </CardHeader>
            <CardContent>
              {Object.keys(summary.byMode).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No settled payments in this range.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(summary.byMode).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{titleCase(key)}</p>
                        <p className="text-xs text-muted-foreground">
                          {value.count} payment{value.count === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span className="tabular-nums">
                        {formatMoney(value.amount, summary.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {summary.truncated && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-warning">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  The scan limit was reached, so these totals may under-report.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardContent className="p-4">
          <DataTable
            columns={columns}
            data={results as PaymentRow[]}
            isLoading={pageStatus === "LoadingFirstPage"}
            getRowId={(row) => row._id}
            emptyIcon={CreditCard}
            emptyTitle={hasFilters ? "No payments match" : "No payments yet"}
            emptyDescription={
              hasFilters
                ? "Try clearing one or more filters to see more results."
                : "Payments appear here as customers check out."
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
                    placeholder="Receipt or Razorpay order"
                    className="pl-9"
                    aria-label="Search payments by receipt or order"
                  />
                </div>

                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as PaymentRowStatus | "")
                  }
                  className={selectClass}
                  aria-label="Filter payments by status"
                >
                  <option value="">All statuses</option>
                  {PAYMENT_ROW_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {PAYMENT_ROW_STATUS_CONFIG[value].label}
                    </option>
                  ))}
                </select>

                <select
                  value={mode}
                  onChange={(event) =>
                    setMode(event.target.value as (typeof PAYMENT_MODES)[number] | "")
                  }
                  className={selectClass}
                  aria-label="Filter payments by mode"
                >
                  <option value="">All modes</option>
                  {PAYMENT_MODES.map((value) => (
                    <option key={value} value={value}>
                      {titleCase(value)}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className={selectClass}
                    aria-label="Payments created from"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    className={selectClass}
                    aria-label="Payments created until"
                  />
                </div>

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
                label="payments"
              />
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <RotateCcw className="size-3.5" aria-hidden />
            Refunds: {formatMoney(summary?.refunds.amount ?? 0, summary?.currency)}
          </span>
          <span>
            Refunded payments: {summary?.refunds.count ?? 0}
          </span>
          <span>
            Failed attempts: {summary?.failed.count ?? 0}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
