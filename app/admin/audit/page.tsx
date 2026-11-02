"use client";

import { useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { ColumnDef } from "@tanstack/react-table";
import { History, Search, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge } from "@/components/shared/status-badge";
import { DataTable, CursorPagination } from "@/components/tables/data-table";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatDateTime, titleCase } from "@/lib/helpers/format";
import { PERMISSIONS } from "@/lib/constants/roles";

type AuditRow = Doc<"auditLogs">;

const ENTITY_TYPES = [
  "application",
  "user",
  "enquiry",
  "conversation",
  "document",
  "payment",
  "visa_product",
  "destination",
  "setting",
  "staff",
] as const;

type EntityType = (typeof ENTITY_TYPES)[number];

const selectClass =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

export default function AdminAuditPage() {
  const { can } = useCurrentUser();
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState<EntityType | "">("");
  const [actorUserId, setActorUserId] = useState<string>("");

  const staff = useQuery(
    api.users.listStaff,
    can(PERMISSIONS.AUDIT_LOG_VIEW) ? {} : "skip",
  );

  const { results, status: pageStatus, loadMore } = usePaginatedQuery(
    api.auditLogs.listForAdmin,
    can(PERMISSIONS.AUDIT_LOG_VIEW)
      ? {
          action: action.trim() || undefined,
          entityType: entityType || undefined,
          actorUserId: (actorUserId || undefined) as Id<"users"> | undefined,
        }
      : "skip",
    { initialNumItems: 30 },
  );

  const columns = useMemo<ColumnDef<AuditRow>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "When",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.action}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.summary}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "actorName",
        header: "Actor",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">{row.original.actorName}</p>
            <p className="truncate text-xs capitalize text-muted-foreground">
              {row.original.actorRole.replace("_", " ")}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "entityType",
        header: "Entity",
        cell: ({ row }) => (
          <ToneBadge label={titleCase(row.original.entityType)} tone="info" size="sm" />
        ),
      },
      {
        accessorKey: "entityId",
        header: "Entity ID",
        cell: ({ row }) => (
          <span className="max-w-[180px] truncate font-mono text-xs text-muted-foreground">
            {row.original.entityId}
          </span>
        ),
      },
      {
        id: "details",
        header: "Diff",
        cell: ({ row }) => {
          const hasDiff =
            (row.original.before !== undefined && row.original.before !== null) ||
            (row.original.after !== undefined && row.original.after !== null);

          if (!hasDiff) {
            return <span className="text-muted-foreground">—</span>;
          }

          return (
            <span className="text-xs text-muted-foreground">
              {(row.original.before ? Object.keys(row.original.before).length : 0) +
                " → " +
                (row.original.after ? Object.keys(row.original.after).length : 0)}{" "}
              fields
            </span>
          );
        },
      },
    ],
    [],
  );

  if (!can(PERMISSIONS.AUDIT_LOG_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Audit log"
          description="A trace of sensitive actions across the CRM."
        />
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            You do not have permission to view the audit log.
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasFilters = !!action.trim() || !!entityType || !!actorUserId;

  function resetFilters() {
    setAction("");
    setEntityType("");
    setActorUserId("");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Immutable history of status changes, assignments, payments, catalogue edits and more."
      />

      <Card>
        <CardContent className="p-4">
          <DataTable
            columns={columns}
            data={results}
            isLoading={pageStatus === "LoadingFirstPage"}
            getRowId={(row) => row._id}
            emptyIcon={History}
            emptyTitle={hasFilters ? "No audit entries match" : "No audit entries yet"}
            emptyDescription={
              hasFilters
                ? "Try clearing one or more filters to see more results."
                : "Sensitive actions will appear here as they occur."
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
                  <input
                    value={action}
                    onChange={(event) => setAction(event.target.value)}
                    placeholder="Filter by action key"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-xs focus-brand"
                    aria-label="Filter audit by action"
                  />
                </div>

                <select
                  value={entityType}
                  onChange={(event) => setEntityType(event.target.value as EntityType | "")}
                  className={selectClass}
                  aria-label="Filter audit by entity type"
                >
                  <option value="">All entities</option>
                  {ENTITY_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {titleCase(value)}
                    </option>
                  ))}
                </select>

                <select
                  value={actorUserId}
                  onChange={(event) => setActorUserId(event.target.value)}
                  className={selectClass}
                  aria-label="Filter audit by actor"
                >
                  <option value="">All actors</option>
                  {(staff ?? []).map((person) => (
                    <option key={person._id} value={person._id}>
                      {person.fullName}
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
                label="audit entries"
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
