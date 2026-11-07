"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAction, usePaginatedQuery, useQuery } from "convex/react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Handshake,
  PauseCircle,
  Plus,
  Search,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { AddPartnerDialog } from "@/components/admin/add-partner-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { PartnerStatusBadge } from "@/components/shared/status-badge";
import {
  EmptyState,
  ListSkeleton,
  NoAccessState,
  StatCardSkeleton,
} from "@/components/shared/states";
import { CursorPagination, DataTable } from "@/components/tables/data-table";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDebounce } from "@/hooks/use-debounce";
import { downloadCsv, formatDate, formatPhone, formatRelative } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";
import { PERMISSIONS } from "@/lib/constants/roles";
import {
  PARTNER_BUSINESS_TYPE_LABELS,
  PARTNER_BUSINESS_TYPES,
  PARTNER_STATUSES,
  PARTNER_STATUS_CONFIG,
  type PartnerBusinessType,
  type PartnerStatus,
} from "@/lib/constants/partners";

type PartnerRow = Doc<"partners">;

const selectClass =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

export default function AdminPartnersPage() {
  const { can, isLoading: userLoading } = useCurrentUser();
  const canView = can(PERMISSIONS.PARTNER_VIEW);
  const canManage = can(PERMISSIONS.PARTNER_MANAGE);
  const canExport = can(PERMISSIONS.PARTNER_EXPORT);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PartnerStatus | "">("");
  const [businessType, setBusinessType] = useState<PartnerBusinessType | "">("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [exporting, setExporting] = useState(false);
  const debouncedSearch = useDebounce(search);

  const overview = useQuery(api.partners.overview, canView ? {} : "skip");
  const exportCsv = useAction(api.partners.exportCsv);

  const filters = {
    search: debouncedSearch.trim() || undefined,
    status: status || undefined,
    businessType: businessType || undefined,
    sort,
  };

  const { results, status: pageStatus, loadMore } = usePaginatedQuery(
    api.partners.listForAdmin,
    canView ? filters : "skip",
    { initialNumItems: 25 },
  );

  const columns = useMemo<ColumnDef<PartnerRow>[]>(
    () => [
      {
        accessorKey: "agencyName",
        header: "Partner",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.agencyName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {PARTNER_BUSINESS_TYPE_LABELS[
                row.original.businessType as PartnerBusinessType
              ] ?? row.original.businessType}
              {" · "}
              {row.original.city}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "partnerCode",
        header: "Partner ID",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {row.original.partnerCode}
          </span>
        ),
      },
      {
        accessorKey: "contactPersonName",
        header: "Contact",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm">{row.original.contactPersonName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.contactEmail}
            </p>
          </div>
        ),
      },
      {
        id: "contactPhone",
        header: "Phone",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatPhone(row.original.contactPhone)}
          </span>
        ),
      },
      {
        accessorKey: "bookingCount",
        header: "Bookings",
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <span className="tabular-nums">{row.original.bookingCount}</span>
            {row.original.grossVolume > 0 && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatMoney(row.original.grossVolume, "INR", "en-IN", {
                  compact: true,
                  hideDecimals: true,
                })}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <PartnerStatusBadge
            status={row.original.status as PartnerStatus}
            size="sm"
          />
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Registered",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableHiding: false,
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link href={`/admin/partners/${row.original._id}`}>
              View
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
        ),
      },
    ],
    [],
  );

  const hasFilters = !!search || !!status || !!businessType || sort !== "newest";

  function resetFilters() {
    setSearch("");
    setStatus("");
    setBusinessType("");
    setSort("newest");
  }

  async function handleExport() {
    setExporting(true);
    try {
      const result = await exportCsv(filters);
      downloadCsv(
        `visadrive-partners-${new Date().toISOString().slice(0, 10)}.csv`,
        result.csv,
      );
      toast.success(`Exported ${result.rowCount} partners.`, {
        description: result.truncated
          ? "The export was capped at 5,000 rows. Narrow the filters for the rest."
          : undefined,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not export the partners.",
      );
    } finally {
      setExporting(false);
    }
  }

  if (userLoading) return <ListSkeleton rows={6} />;
  if (!canView) return <NoAccessState />;

  return (
    <div className="space-y-8">
      <PageHeader
        title="B2B Partners"
        description="Travel agents, agencies and corporate desks booking through VisaDrive."
        actions={
          <>
            {canExport && (
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={exporting || results.length === 0}
              >
                <Download className="size-4" aria-hidden />
                {exporting ? "Exporting…" : "Export"}
              </Button>
            )}
            {canManage && <AddPartnerDialog />}
          </>
        }
      />

      {overview === undefined ? (
        <StatCardSkeleton count={4} />
      ) : (
        <>
          <StatGrid columns={4}>
            <StatCard
              label="Total partners"
              value={overview.kpis.totalPartners}
              icon={Building2}
              hint={`${overview.kpis.activePartners} approved`}
            />
            <StatCard
              label="Pending approvals"
              value={overview.kpis.pendingApprovals}
              icon={Clock}
              invertDelta
              hint={
                overview.kpis.pendingApprovals > 0
                  ? "Waiting on a decision from the team"
                  : "Nothing waiting"
              }
            />
            <StatCard
              label="B2B bookings"
              value={overview.kpis.totalBookings}
              icon={Handshake}
              hint={`${overview.kpis.suspendedPartners} partner${
                overview.kpis.suspendedPartners === 1 ? "" : "s"
              } suspended`}
            />
            <StatCard
              label="B2B revenue"
              value={formatMoney(overview.kpis.totalVolume, overview.currency)}
              icon={Wallet}
              hint={`${formatMoney(
                overview.kpis.totalMargin,
                overview.currency,
              )} partner margin`}
            />
          </StatGrid>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">
                  <span className="inline-flex items-center gap-2">
                    <TrendingUp className="size-4 text-muted-foreground" aria-hidden />
                    Top performing partners
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {overview.topPartners.length === 0 ? (
                  <EmptyState
                    compact
                    icon={TrendingUp}
                    title="No B2B bookings yet"
                    description="Once an approved partner places their first booking, their volume appears here."
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {overview.topPartners.map((partner) => (
                      <li key={partner._id} className="flex items-center gap-4 py-3">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/admin/partners/${partner._id}`}
                            className="truncate rounded-sm text-sm font-medium transition-colors hover:text-brand focus-brand"
                          >
                            {partner.agencyName}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {partner.partnerCode} ·{" "}
                            {partner.bookingCount} booking
                            {partner.bookingCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-medium tabular-nums">
                            {formatMoney(partner.grossVolume, overview.currency)}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {formatMoney(partner.grossMargin, overview.currency)} margin
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  <span className="inline-flex items-center gap-2">
                    <Clock className="size-4 text-muted-foreground" aria-hidden />
                    Waiting for a decision
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {overview.awaitingDecision.length === 0 ? (
                  <EmptyState
                    compact
                    icon={CheckCircle2}
                    title="All caught up"
                    description="No partner registrations are waiting for review."
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {overview.awaitingDecision.map((partner) => (
                      <li key={partner._id} className="flex items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/admin/partners/${partner._id}`}
                            className="truncate rounded-sm text-sm font-medium transition-colors hover:text-brand focus-brand"
                          >
                            {partner.agencyName}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            Registered {formatRelative(partner.createdAt)}
                          </p>
                        </div>
                        <PartnerStatusBadge
                          status={partner.status as PartnerStatus}
                          size="sm"
                          withDot={false}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {overview.recentActivity.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent partner activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {overview.recentActivity.map((row) => (
                    <li key={row._id} className="flex items-start gap-3 py-2.5">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{row.summary}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.actorName} · {formatRelative(row.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <section>
        <SectionHeader
          title="All partners"
          description="Search, filter and open any partner account."
        />
        <Card>
          <CardContent className="p-4">
            <DataTable
              columns={columns}
              data={results}
              isLoading={pageStatus === "LoadingFirstPage"}
              getRowId={(row) => row._id}
              emptyIcon={Building2}
              emptyTitle={hasFilters ? "No partners match" : "No partners yet"}
              emptyDescription={
                hasFilters
                  ? "Try clearing one or more filters to see more results."
                  : "Partners appear here once an agency registers, or when you add one."
              }
              emptyAction={
                hasFilters ? (
                  <Button variant="outline" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : canManage ? (
                  <AddPartnerDialog
                    trigger={
                      <Button>
                        <Plus className="size-4" aria-hidden />
                        Add a partner
                      </Button>
                    }
                  />
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
                      placeholder="Search by agency name"
                      className="pl-9"
                      aria-label="Search partners"
                    />
                  </div>

                  <select
                    value={status}
                    onChange={(event) =>
                      setStatus(event.target.value as PartnerStatus | "")
                    }
                    className={selectClass}
                    aria-label="Filter by partner status"
                  >
                    <option value="">All statuses</option>
                    {PARTNER_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {PARTNER_STATUS_CONFIG[value].label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={businessType}
                    onChange={(event) =>
                      setBusinessType(event.target.value as PartnerBusinessType | "")
                    }
                    className={selectClass}
                    aria-label="Filter by business type"
                  >
                    <option value="">All business types</option>
                    {PARTNER_BUSINESS_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {PARTNER_BUSINESS_TYPE_LABELS[value]}
                      </option>
                    ))}
                  </select>

                  <select
                    value={sort}
                    onChange={(event) =>
                      setSort(event.target.value as "newest" | "oldest")
                    }
                    className={selectClass}
                    aria-label="Sort partners"
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
                  label="partners"
                />
              }
            />
          </CardContent>
        </Card>
      </section>

      {overview?.truncated && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <PauseCircle className="size-3.5" aria-hidden />
          The figures above are computed from the 1,000 most recent partner
          accounts.
        </p>
      )}
    </div>
  );
}
