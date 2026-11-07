"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, TableSkeleton } from "@/components/shared/states";
import { titleCase } from "@/lib/helpers/format";
import { cn } from "@/lib/utils";

/**
 * Shared table for every admin list.
 *
 * Sorting is client-side over the currently loaded page by default. Where the
 * dataset is large, the caller passes `manualSorting` and drives the Convex
 * query instead — sorting one page of fifty rows while pretending it sorted
 * ten thousand would be a lie the UI should not tell.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  toolbar,
  pagination,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyIcon,
  emptyAction,
  onRowClick,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  manualSorting = false,
  sorting: controlledSorting,
  onSortingChange,
  showColumnToggle = true,
  stickyHeader = true,
  className,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  toolbar?: ReactNode;
  pagination?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  emptyAction?: ReactNode;
  onRowClick?: (row: TData) => void;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  getRowId?: (row: TData, index: number) => string;
  manualSorting?: boolean;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  showColumnToggle?: boolean;
  stickyHeader?: boolean;
  className?: string;
}) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const sorting = controlledSorting ?? internalSorting;

  // TanStack Table's hook cannot be memoized safely, so the React Compiler
  // skips this component by design; its state is still local to this table.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    manualSorting,
    state: {
      sorting,
      columnVisibility,
      ...(rowSelection ? { rowSelection } : {}),
    },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      if (onSortingChange) onSortingChange(next);
      else setInternalSorting(next);
    },
    onColumnVisibilityChange: setColumnVisibility,
    ...(onRowSelectionChange
      ? {
          enableRowSelection: true,
          onRowSelectionChange: (updater) => {
            const next =
              typeof updater === "function" ? updater(rowSelection ?? {}) : updater;
            onRowSelectionChange(next);
          },
        }
      : {}),
    ...(getRowId ? { getRowId } : {}),
  });

  const hasRows = table.getRowModel().rows.length > 0;

  return (
    <div className={cn("space-y-4", className)}>
      {(toolbar || showColumnToggle) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">{toolbar}</div>

          {showColumnToggle && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0">
                  <Settings2 className="size-3.5" aria-hidden />
                  <span className="hidden sm:inline">Columns</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {typeof column.columnDef.header === "string"
                        ? column.columnDef.header
                        : titleCase(column.id)}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {isLoading ? (
        <TableSkeleton columns={columns.length} />
      ) : !hasRows ? (
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table containerClassName="scrollbar-thin max-h-[65vh] overflow-y-auto">
            <TableHeader
              className={cn(stickyHeader && "sticky top-0 z-10 bg-surface")}
            >
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sortDir = header.column.getIsSorted();

                    return (
                      <TableHead
                        key={header.id}
                        style={{
                          width:
                            header.getSize() !== 150 ? header.getSize() : undefined,
                        }}
                        className="whitespace-nowrap text-xs font-medium text-muted-foreground"
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground focus-brand"
                            aria-label={`Sort by ${
                              typeof header.column.columnDef.header === "string"
                                ? header.column.columnDef.header
                                : header.column.id
                            }`}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {sortDir === "asc" ? (
                              <ArrowUp className="size-3" aria-hidden />
                            ) : sortDir === "desc" ? (
                              <ArrowDown className="size-3" aria-hidden />
                            ) : (
                              <ChevronsUpDown
                                className="size-3 opacity-40"
                                aria-hidden
                              />
                            )}
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? "button" : undefined}
                  className={cn(
                    onRowClick &&
                      "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pagination && hasRows && !isLoading && (
        <div className="flex items-center justify-between gap-4">{pagination}</div>
      )}
    </div>
  );
}

/**
 * Cursor pagination controls for Convex `usePaginatedQuery`.
 * Convex pages forward only, so this is "load more" plus a live count rather
 * than numbered pages — showing page numbers would imply random access the
 * backend does not offer.
 */
export function CursorPagination({
  loadedCount,
  status,
  onLoadMore,
  pageSize = 25,
  label = "results",
}: {
  loadedCount: number;
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  onLoadMore: (count: number) => void;
  pageSize?: number;
  label?: string;
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Showing {loadedCount} {label}
        {status === "Exhausted" && loadedCount > 0 && " · all loaded"}
      </p>

      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onLoadMore(pageSize)}
          disabled={status === "LoadingMore"}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </>
  );
}
