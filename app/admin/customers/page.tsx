"use client";

import { useMemo, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Search, Users, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, CursorPagination } from "@/components/tables/data-table";
import { useDebounce } from "@/hooks/use-debounce";
import { formatDate, formatPhone, formatRelative } from "@/lib/helpers/format";

type CustomerRow = Doc<"users">;

const selectClass =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  deleted: "Deleted",
};

export default function AdminCustomersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "suspended" | "deleted" | "">("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const debouncedSearch = useDebounce(search);

  const { results, status: pageStatus, loadMore } = usePaginatedQuery(
    api.users.listCustomers,
    {
      search: debouncedSearch.trim() || undefined,
      status: status || undefined,
      sort,
    },
    { initialNumItems: 25 },
  );

  const columns = useMemo<ColumnDef<CustomerRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: "Customer",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        ),
      },
      {
        id: "phone",
        header: "Phone",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatPhone(row.original.phone)}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {STATUS_LABELS[row.original.status] ?? row.original.status}
          </span>
        ),
      },
      {
        accessorKey: "applicationCount",
        header: "Applications",
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.applicationCount}</span>
        ),
      },
      {
        id: "lastActiveAt",
        header: "Last active",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.lastActiveAt
              ? formatRelative(row.original.lastActiveAt)
              : "Never"}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Joined",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>
        ),
      },
    ],
    [],
  );

  const hasFilters = !!search || !!status || sort !== "newest";

  function resetFilters() {
    setSearch("");
    setStatus("");
    setSort("newest");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Everyone with a customer account on VisaDrive."
      />

      <Card>
        <CardContent className="p-4">
          <DataTable
            columns={columns}
            data={results}
            isLoading={pageStatus === "LoadingFirstPage"}
            getRowId={(row) => row._id}
            emptyIcon={Users}
            emptyTitle={hasFilters ? "No customers match" : "No customers yet"}
            emptyDescription={
              hasFilters
                ? "Try clearing one or more filters to see more results."
                : "Customers appear here the first time they sign in."
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
                    placeholder="Search by name"
                    className="pl-9"
                    aria-label="Search customers"
                  />
                </div>

                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(
                      event.target.value as "active" | "suspended" | "deleted" | "",
                    )
                  }
                  className={selectClass}
                  aria-label="Filter by account status"
                >
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="deleted">Deleted</option>
                </select>

                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as "newest" | "oldest")}
                  className={selectClass}
                  aria-label="Sort customers"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>

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
                label="customers"
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
