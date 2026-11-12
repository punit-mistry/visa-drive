"use client";

import { Inbox, MessageCircle, ShieldCheck, UserX, X } from "lucide-react";

import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConversationStatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/states";
import { CursorPagination } from "@/components/tables/data-table";
import {
  CONVERSATION_STATUSES,
  CONVERSATION_STATUS_CONFIG,
  type ConversationStatusValue,
} from "@/lib/constants/statuses";
import { formatRelative } from "@/lib/helpers/format";
import { cn } from "@/lib/utils";

import type { InboxConversation } from "./types";

const selectClass =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

/**
 * The left-hand pane of the inbox.
 *
 * A list of threads, not a table: what matters at a glance is who wrote last,
 * when, and whether anybody has picked the conversation up. Everything else
 * lives in the thread itself.
 */
export function ConversationList({
  items,
  isLoading,
  selectedId,
  onSelect,
  statusFilter,
  onStatusFilterChange,
  assignedToMe,
  onAssignedToMeChange,
  pageStatus,
  onLoadMore,
  className,
}: {
  items: InboxConversation[];
  isLoading: boolean;
  selectedId: Id<"conversations"> | null;
  onSelect: (id: Id<"conversations">) => void;
  statusFilter: ConversationStatusValue | "";
  onStatusFilterChange: (value: ConversationStatusValue | "") => void;
  assignedToMe: boolean;
  onAssignedToMeChange: (value: boolean) => void;
  pageStatus: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  onLoadMore: (count: number) => void;
  className?: string;
}) {
  const hasFilters = !!statusFilter || assignedToMe;

  function clearFilters() {
    onStatusFilterChange("");
    onAssignedToMeChange(false);
  }

  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <CardHeader className="border-b border-border px-4 py-3">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          Inbox
          <span className="text-xs font-normal text-muted-foreground">
            {isLoading ? "Loading…" : `${items.length} loaded`}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(event) =>
              onStatusFilterChange(
                event.target.value as ConversationStatusValue | "",
              )
            }
            className={cn(selectClass, "h-8 text-xs")}
            aria-label="Filter conversations by status"
          >
            <option value="">All statuses</option>
            {CONVERSATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {CONVERSATION_STATUS_CONFIG[value].label}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={assignedToMe}
              onChange={(event) => onAssignedToMeChange(event.target.checked)}
              className="size-3.5 rounded border-input"
            />
            Assigned to me
          </label>

          {hasFilters && (
            <Button
              variant="ghost"
              size="xs"
              onClick={clearFilters}
              className="text-muted-foreground"
            >
              <X className="size-3" aria-hidden />
              Clear
            </Button>
          )}
        </div>

        <div className="max-h-[68vh] min-h-[16rem] overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="space-y-2" aria-busy aria-label="Loading conversations">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-lg border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="h-3.5 w-2/5 rounded bg-accent" />
                    <div className="h-3 w-16 rounded bg-accent" />
                  </div>
                  <div className="h-3 w-3/5 rounded bg-accent" />
                  <div className="h-3 w-4/5 rounded bg-accent" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              compact
              icon={Inbox}
              title={hasFilters ? "No conversations match" : "No WhatsApp conversations yet"}
              description={
                hasFilters
                  ? "Try clearing a filter to see the rest of the inbox."
                  : "Threads appear here as soon as a customer messages the bot."
              }
              action={
                hasFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-1">
              {items.map((item) => (
                <ConversationRow
                  key={item._id}
                  item={item}
                  selected={item._id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          )}
        </div>

        {!isLoading && items.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <CursorPagination
              loadedCount={items.length}
              status={pageStatus}
              onLoadMore={onLoadMore}
              label="conversations"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConversationRow({
  item,
  selected,
  onSelect,
}: {
  item: InboxConversation;
  selected: boolean;
  onSelect: (id: Id<"conversations">) => void;
}) {
  const unread = item.unreadForStaff;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item._id)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "w-full rounded-lg border px-3 py-2.5 text-left transition-colors focus-brand",
          selected
            ? "border-brand/30 bg-brand-tint"
            : "border-transparent hover:border-border hover:bg-surface",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {item.customerName || "Unknown contact"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{item.subject}</p>
          </div>
          <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">
            {formatRelative(item.lastMessageAt)}
          </span>
        </div>

        <p className="mt-1.5 truncate text-xs text-muted-foreground">
          {item.lastMessagePreview || "No messages yet"}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ConversationStatusBadge status={item.status} size="sm" />

          <span
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            title="WhatsApp channel"
          >
            <MessageCircle className="size-2.5" aria-hidden />
            WhatsApp
          </span>

          {item.contact?.humanHandoff && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-info/20 bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info"
              title="A staff member has taken this thread over from the bot"
            >
              <ShieldCheck className="size-2.5" aria-hidden />
              Staff
            </span>
          )}

          {item.contact?.optedOut && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning"
              title="This contact has opted out of WhatsApp messages"
            >
              <UserX className="size-2.5" aria-hidden />
              Opted out
            </span>
          )}

          {unread > 0 && (
            <span
              className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground tabular-nums"
              aria-label={`${unread} unread`}
            >
              {unread}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}
