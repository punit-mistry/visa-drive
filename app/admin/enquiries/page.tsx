"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePaginatedQuery } from "convex/react";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, Search, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { LeadStatusBadge } from "@/components/shared/status-badge";
import { DataTable, CursorPagination } from "@/components/tables/data-table";
import { useDebounce } from "@/hooks/use-debounce";
import { formatDate, formatPhone, titleCase } from "@/lib/helpers/format";
import {
  LEAD_STATUSES,
  LEAD_STATUS_CONFIG,
  type LeadStatusValue,
} from "@/lib/constants/statuses";

type EnquiryRow = Doc<"enquiries">;

const selectClass =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

export default function AdminEnquiriesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [leadStatus, setLeadStatus] = useState<LeadStatusValue | "">("");
  const debouncedSearch = useDebounce(search);

  const { results, status: pageStatus, loadMore } = usePaginatedQuery(
    api.enquiries.listForAdmin,
    {
      search: debouncedSearch.trim() || undefined,
      leadStatus: leadStatus || undefined,
    },
    { initialNumItems: 25 },
  );

  const columns = useMemo<ColumnDef<EnquiryRow>[]>(
    () => [
      {
        accessorKey: "referenceId",
        header: "Reference",
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">{row.original.referenceId}</span>
        ),
      },
      {
        accessorKey: "fullName",
        header: "Lead",
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
        accessorKey: "subject",
        header: "Subject",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">{row.original.subject}</p>
            <p className="truncate text-xs text-muted-foreground">
              {titleCase(row.original.source)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "leadStatus",
        header: "Status",
        cell: ({ row }) => (
          <LeadStatusBadge
            status={row.original.leadStatus as LeadStatusValue}
            size="sm"
          />
        ),
      },
      {
        id: "followUpAt",
        header: "Follow-up",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.followUpAt ? formatDate(row.original.followUpAt) : "—"}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Received",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>
        ),
      },
    ],
    [],
  );

  const hasFilters = !!search || !!leadStatus;

  function resetFilters() {
    setSearch("");
    setLeadStatus("");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enquiries"
        description="Leads from the website, WhatsApp and the phone, before they become applications."
      />

      <Card>
        <CardContent className="p-4">
          <DataTable
            columns={columns}
            data={results}
            isLoading={pageStatus === "LoadingFirstPage"}
            onRowClick={(row) => router.push(`/admin/enquiries/${row._id}`)}
            getRowId={(row) => row._id}
            emptyIcon={ClipboardList}
            emptyTitle={hasFilters ? "No enquiries match" : "No enquiries yet"}
            emptyDescription={
              hasFilters
                ? "Try clearing one or more filters to see more results."
                : "New enquiries from the website form will appear here."
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
                    aria-label="Search enquiries"
                  />
                </div>

                <select
                  value={leadStatus}
                  onChange={(event) =>
                    setLeadStatus(event.target.value as LeadStatusValue | "")
                  }
                  className={selectClass}
                  aria-label="Filter by lead status"
                >
                  <option value="">All lead statuses</option>
                  {LEAD_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {LEAD_STATUS_CONFIG[value].label}
                    </option>
                  ))}
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
                label="enquiries"
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
