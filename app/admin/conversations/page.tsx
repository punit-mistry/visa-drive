"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import type { ColumnDef } from "@tanstack/react-table";
import { MessageSquare, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { ConversationStatusBadge, ToneBadge } from "@/components/shared/status-badge";
import { DataTable, CursorPagination } from "@/components/tables/data-table";
import { formatRelative } from "@/lib/helpers/format";
import {
  CONVERSATION_STATUSES,
  CONVERSATION_STATUS_CONFIG,
  type ConversationStatusValue,
  type StatusTone,
} from "@/lib/constants/statuses";

type ConversationRow = Doc<"conversations">;

const PRIORITY_TONE: Record<ConversationRow["priority"], StatusTone> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  urgent: "danger",
};

const selectClass =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

export default function AdminConversationsPage() {
  const [status, setStatus] = useState<ConversationStatusValue | "">("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  const { results, status: pageStatus, loadMore } = usePaginatedQuery(
    api.conversations.listForAdmin,
    {
      status: status || undefined,
      unassignedOnly: unassignedOnly || undefined,
    },
    { initialNumItems: 25 },
  );

  const columns = useMemo<ColumnDef<ConversationRow>[]>(
    () => [
      {
        accessorKey: "subject",
        header: "Conversation",
        cell: ({ row }) => (
          <div className="min-w-0 max-w-sm">
            <p className="truncate font-medium">{row.original.subject}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.lastMessagePreview || "No messages yet"}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "customerName",
        header: "Customer",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">{row.original.customerName}</p>
            <a
              href={`mailto:${row.original.customerEmail}`}
              className="truncate text-xs text-muted-foreground underline-offset-2 hover:underline focus-brand"
              onClick={(event) => event.stopPropagation()}
            >
              {row.original.customerEmail}
            </a>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <ConversationStatusBadge
            status={row.original.status as ConversationStatusValue}
            size="sm"
          />
        ),
      },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => (
          <ToneBadge
            label={row.original.priority}
            tone={PRIORITY_TONE[row.original.priority]}
            size="sm"
          />
        ),
      },
      {
        accessorKey: "channel",
        header: "Channel",
        cell: ({ row }) => (
          <span className="capitalize text-muted-foreground">
            {row.original.channel}
          </span>
        ),
      },
      {
        id: "assignment",
        header: "Owner",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.assignedTo ? "Assigned" : "Unassigned"}
          </span>
        ),
      },
      {
        id: "unread",
        header: "Unread",
        cell: ({ row }) => (
          <span
            className={
              row.original.unreadForStaff > 0
                ? "font-medium tabular-nums text-foreground"
                : "tabular-nums text-muted-foreground"
            }
          >
            {row.original.unreadForStaff}
          </span>
        ),
      },
      {
        id: "application",
        header: "Application",
        cell: ({ row }) =>
          row.original.applicationId ? (
            <Link
              href={`/admin/applications/${row.original.applicationId}`}
              className="rounded-sm text-sm underline-offset-2 hover:underline focus-brand"
              onClick={(event) => event.stopPropagation()}
            >
              Open
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "lastMessageAt",
        header: "Last message",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatRelative(row.original.lastMessageAt)}
          </span>
        ),
      },
    ],
    [],
  );

  const hasFilters = !!status || unassignedOnly;

  function resetFilters() {
    setStatus("");
    setUnassignedOnly(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conversations"
        description="Customer threads from the portal, email and WhatsApp. Replies are sent from the conversation workspace."
      />

      <Card>
        <CardContent className="p-4">
          <DataTable
            columns={columns}
            data={results}
            isLoading={pageStatus === "LoadingFirstPage"}
            getRowId={(row) => row._id}
            emptyIcon={MessageSquare}
            emptyTitle={hasFilters ? "No conversations match" : "No conversations yet"}
            emptyDescription={
              hasFilters
                ? "Try clearing one or more filters to see more results."
                : "Customer messages will appear here as they come in."
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
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as ConversationStatusValue | "")
                  }
                  className={selectClass}
                  aria-label="Filter conversations by status"
                >
                  <option value="">All statuses</option>
                  {CONVERSATION_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {CONVERSATION_STATUS_CONFIG[value].label}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={unassignedOnly}
                    onChange={(event) => setUnassignedOnly(event.target.checked)}
                    className="size-4 rounded border-input"
                  />
                  Unassigned only
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
                label="conversations"
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
