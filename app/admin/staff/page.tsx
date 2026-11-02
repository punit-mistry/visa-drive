"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Mail, Search, ShieldCheck, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatDate, formatRelative, initials } from "@/lib/helpers/format";
import {
  PERMISSIONS,
  ROLE_LABELS,
  STAFF_ROLES,
  type StaffRole,
  type UserRole,
} from "@/lib/constants/roles";

type StaffRow = Doc<"users"> & {
  isStaff: boolean;
  staffProfile: Doc<"staffProfiles"> | null;
  permissions: string[];
  isPendingInvite: boolean;
};

const selectClass =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

export default function AdminStaffPage() {
  const { can } = useCurrentUser();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<StaffRole | "">("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const staff = useQuery(
    api.users.listStaff,
    can(PERMISSIONS.STAFF_VIEW) ? { includeInactive } : "skip",
  );

  const filtered = useMemo(() => {
    if (!staff) return [];
    const term = search.trim().toLowerCase();
    return (staff as StaffRow[]).filter((person) => {
      if (role && person.role !== role) return false;
      if (!term) return true;
      return (
        person.fullName.toLowerCase().includes(term) ||
        person.email.toLowerCase().includes(term) ||
        (person.staffProfile?.employeeCode ?? "").toLowerCase().includes(term)
      );
    });
  }, [staff, search, role]);

  const columns = useMemo<ColumnDef<StaffRow>[]>(
    () => [
      {
        id: "person",
        header: "Staff member",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-brand-deep">
              {initials(row.original.fullName)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.fullName}</p>
              <a
                href={`mailto:${row.original.email}`}
                className="truncate text-xs text-muted-foreground underline-offset-2 hover:underline focus-brand"
              >
                {row.original.email}
              </a>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => (
          <span>{ROLE_LABELS[row.original.role as UserRole] ?? row.original.role}</span>
        ),
      },
      {
        id: "profile",
        header: "Team",
        cell: ({ row }) => (
          <div className="min-w-0 text-sm">
            <p className="truncate">
              {row.original.staffProfile?.designation ?? "—"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.staffProfile?.department ??
                row.original.staffProfile?.employeeCode ??
                "No staff profile"}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const profile = row.original.staffProfile;
          if (row.original.isPendingInvite) {
            return <ToneBadge label="Invite pending" tone="warning" size="sm" />;
          }
          if (profile && !profile.isActive) {
            return <ToneBadge label="Inactive" tone="neutral" size="sm" />;
          }
          if (row.original.status === "suspended") {
            return <ToneBadge label="Suspended" tone="danger" size="sm" />;
          }
          return <ToneBadge label="Active" tone="success" size="sm" />;
        },
      },
      {
        id: "permissions",
        header: "Permissions",
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.permissions.length}
          </span>
        ),
      },
      {
        id: "lastActiveAt",
        header: "Last active",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.lastActiveAt
              ? formatRelative(row.original.lastActiveAt)
              : "Never signed in"}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Added",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "email",
        header: "",
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="sm">
            <a href={`mailto:${row.original.email}`}>
              <Mail className="size-3.5" aria-hidden />
              Email
            </a>
          </Button>
        ),
      },
    ],
    [],
  );

  if (!can(PERMISSIONS.STAFF_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Staff" description="The VisaDrive team and their access." />
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            You do not have permission to view the staff roster.
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasFilters = !!search || !!role || includeInactive;

  function resetFilters() {
    setSearch("");
    setRole("");
    setIncludeInactive(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description="The VisaDrive team, their roles and the permissions those roles grant."
      />

      <Card>
        <CardContent className="p-4">
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={staff === undefined}
            getRowId={(row) => row._id}
            emptyIcon={ShieldCheck}
            emptyTitle={hasFilters ? "No staff match" : "No staff yet"}
            emptyDescription={
              hasFilters
                ? "Try clearing one or more filters to see more results."
                : "Staff appear here once they are invited or promoted."
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
                    placeholder="Search name, email or employee code"
                    className="pl-9"
                    aria-label="Search staff"
                  />
                </div>

                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as StaffRole | "")}
                  className={selectClass}
                  aria-label="Filter staff by role"
                >
                  <option value="">All roles</option>
                  {STAFF_ROLES.map((value) => (
                    <option key={value} value={value}>
                      {ROLE_LABELS[value]}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={includeInactive}
                    onChange={(event) => setIncludeInactive(event.target.checked)}
                    className="size-4 rounded border-input"
                  />
                  Include inactive
                </label>

                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={resetFilters}>
                    <X className="size-3.5" aria-hidden />
                    Clear
                  </Button>
                )}
              </>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
