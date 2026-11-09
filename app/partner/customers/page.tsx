"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  Archive,
  ArchiveRestore,
  Loader2,
  Mail,
  Pencil,
  Phone,
  PlusCircle,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGrid } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { PhoneField } from "@/components/shared/phone-field";
import { ApplicationStatusBadge } from "@/components/shared/status-badge";
import { EmptyState, ListSkeleton } from "@/components/shared/states";
import { CursorPagination } from "@/components/tables/data-table";
import { useDebounce } from "@/hooks/use-debounce";
import { useValidation, zodMessage, type FieldErrors } from "@/hooks/use-validation";
import { emailField, phoneField } from "@/lib/validators/forms";
import { formatDate, formatPhone, formatRelative } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";
import type { ApplicationStatus } from "@/lib/constants/statuses";
import { friendlyError } from "@/lib/helpers/error-messages";

type PartnerCustomer = Doc<"partnerCustomers">;

/**
 * The partner's own customer book.
 *
 * Everything on this page is scoped by `requirePartner(ctx)` server-side, so
 * there is no id a partner could substitute to reach another agency's
 * travellers. Archiving rather than deleting keeps a customer's booking
 * history intact — the bookings are real applications with real audit trails.
 */
export default function PartnerCustomersPage() {
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<PartnerCustomer | "new" | null>(null);
  const [detailId, setDetailId] = useState<Id<"partnerCustomers"> | null>(null);
  const debouncedSearch = useDebounce(search);

  const { results, status, loadMore } = usePaginatedQuery(
    api.partnerBookings.listMyCustomers,
    {
      search: debouncedSearch.trim() || undefined,
      includeArchived,
    },
    { initialNumItems: 25 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="The travellers you book for. Only your agency can see this list."
        actions={
          <Button onClick={() => setEditing("new")}>
            <PlusCircle className="size-4" aria-hidden />
            Add customer
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
            className="pl-9"
            aria-label="Search your customers"
          />
        </div>

        <Button
          variant={includeArchived ? "default" : "outline"}
          size="sm"
          onClick={() => setIncludeArchived((v) => !v)}
        >
          {includeArchived ? "Showing archived" : "Include archived"}
        </Button>
      </div>

      {status === "LoadingFirstPage" ? (
        <ListSkeleton rows={6} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? "No customers match" : "No customers yet"}
          description={
            search
              ? "Try a different name, or clear the search."
              : "Add a customer here, or they are created automatically the first time you book for them."
          }
          action={
            <Button onClick={() => setEditing("new")}>
              <PlusCircle className="size-4" aria-hidden />
              Add customer
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {results.map((customer) => (
              <Card key={customer._id} className="transition-shadow hover:elev-sm">
                <CardContent className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {customer.fullName}
                      {customer.isArchived && (
                        <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Archived
                        </span>
                      )}
                      {customer.reference && (
                        <span className="rounded-full border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {customer.reference}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="size-3" aria-hidden />
                        {customer.email}
                      </span>
                      {customer.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" aria-hidden />
                          {formatPhone(customer.phone)}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums">
                      {customer.bookingCount} booking
                      {customer.bookingCount === 1 ? "" : "s"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {customer.lastBookingAt
                        ? `Last ${formatRelative(customer.lastBookingAt)}`
                        : `Added ${formatDate(customer.createdAt)}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDetailId(customer._id)}
                    >
                      History
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${customer.fullName}`}
                      onClick={() => setEditing(customer)}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </Button>
                    <ArchiveButton customer={customer} />
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/partner/bookings/new?customer=${customer._id}`}
                      >
                        Book
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4">
            <CursorPagination
              loadedCount={results.length}
              status={status}
              onLoadMore={loadMore}
              label="customers"
            />
          </div>
        </>
      )}

      <CustomerDialog
        customer={editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      <CustomerHistoryDialog
        partnerCustomerId={detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
      />
    </div>
  );
}

function ArchiveButton({ customer }: { customer: PartnerCustomer }) {
  const archive = useMutation(api.partnerBookings.archiveCustomer);
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={busy}
      aria-label={
        customer.isArchived
          ? `Restore ${customer.fullName}`
          : `Archive ${customer.fullName}`
      }
      onClick={async () => {
        setBusy(true);
        try {
          await archive({
            partnerCustomerId: customer._id,
            archived: !customer.isArchived,
          });
          toast.success(
            customer.isArchived
              ? `${customer.fullName} restored.`
              : `${customer.fullName} archived.`,
          );
        } catch (error) {
          toast.error(
            friendlyError(error, "Could not update the customer."),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : customer.isArchived ? (
        <ArchiveRestore className="size-3.5" aria-hidden />
      ) : (
        <Archive className="size-3.5" aria-hidden />
      )}
    </Button>
  );
}

function CustomerDialog({
  customer,
  onOpenChange,
}: {
  customer: PartnerCustomer | "new" | null;
  onOpenChange: (open: boolean) => void;
}) {
  const upsert = useMutation(api.partnerBookings.upsertCustomer);
  const isNew = customer === "new";
  const existing = isNew ? null : customer;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  // Load the record into the form once per customer, rather than on every
  // render, so typing is never stamped over by a reactive re-read.
  const currentKey = isNew ? "new" : (existing?._id ?? null);
  if (currentKey !== key) {
    setKey(currentKey);
    setFullName(existing?.fullName ?? "");
    setEmail(existing?.email ?? "");
    setPhone(existing?.phone ?? "");
    setReference(existing?.reference ?? "");
    setNotes(existing?.notes ?? "");
  }

  const validate = useCallback((): FieldErrors => {
    const errors: FieldErrors = {};
    if (fullName.trim().length < 2) {
      errors["customer-name"] = "Enter the customer's name.";
    }
    const emailError = zodMessage(emailField, email);
    if (emailError) errors["customer-email"] = emailError;
    if (phone.trim()) {
      const phoneError = zodMessage(phoneField, phone);
      if (phoneError) errors["customer-phone"] = phoneError;
    }
    return errors;
  }, [fullName, email, phone]);
  const { errors, check } = useValidation(validate, currentKey ?? "closed");

  async function save() {
    if (!check()) return;

    setBusy(true);
    try {
      await upsert({
        partnerCustomerId: existing?._id,
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(isNew ? `${fullName.trim()} added.` : "Customer updated.");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        friendlyError(error, "Could not save the customer."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={customer !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add a customer" : "Edit customer"}</DialogTitle>
          <DialogDescription>
            Their email is how VisaDrive identifies the traveller. If they
            already have a VisaDrive account, the booking shows up in their own
            portal too.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <FieldGrid>
            <Field
              label="Full name"
              required
              htmlFor="customer-name"
              className="sm:col-span-2"
              error={errors["customer-name"]}
            >
              <Input
                id="customer-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Rahul Mehta"
                disabled={busy}
              />
            </Field>

            <Field label="Email" required htmlFor="customer-email" error={errors["customer-email"]}>
              <Input
                id="customer-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="rahul@example.com"
                disabled={busy}
              />
            </Field>

            <Field label="Phone" htmlFor="customer-phone" error={errors["customer-phone"]}>
              <PhoneField
                id="customer-phone"
                value={phone}
                onChange={setPhone}
                disabled={busy}
              />
            </Field>

            <Field
              label="Your reference"
              htmlFor="customer-reference"
              hint="Optional. Your own file number or label."
              className="sm:col-span-2"
            >
              <Input
                id="customer-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Mehta family — Europe 2026"
                disabled={busy}
              />
            </Field>

            <Field label="Notes" htmlFor="customer-notes" className="sm:col-span-2">
              <Textarea
                id="customer-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anything your team should remember about this customer."
                disabled={busy}
              />
            </Field>
          </FieldGrid>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {isNew ? "Add customer" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerHistoryDialog({
  partnerCustomerId,
  onOpenChange,
}: {
  partnerCustomerId: Id<"partnerCustomers"> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useQuery(
    api.partnerBookings.myCustomer,
    partnerCustomerId ? { partnerCustomerId } : "skip",
  );

  return (
    <Dialog open={partnerCustomerId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{detail?.customer.fullName ?? "Customer"}</DialogTitle>
          <DialogDescription>
            {detail
              ? `${detail.customer.email} · ${detail.bookings.length} booking${
                  detail.bookings.length === 1 ? "" : "s"
                } with your agency`
              : "Loading their booking history…"}
          </DialogDescription>
        </DialogHeader>

        {detail === undefined ? (
          <ListSkeleton rows={3} />
        ) : !detail ? (
          <EmptyState
            compact
            icon={Users}
            title="Customer not found"
            description="They may have been removed from your book."
          />
        ) : detail.bookings.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title="No bookings yet"
            description="Nothing has been booked for this customer."
            action={
              <Button asChild size="sm">
                <Link href={`/partner/bookings/new?customer=${detail.customer._id}`}>
                  Create a booking
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {detail.bookings.map((booking) => (
              <li key={booking._id} className="flex flex-wrap items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-muted-foreground">
                    {booking.referenceId}
                  </p>
                  <p className="truncate text-sm">
                    {booking.visaProductName} · {booking.destinationName}
                  </p>
                </div>
                {booking.isDraft ? (
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Draft
                  </span>
                ) : (
                  <ApplicationStatusBadge
                    status={booking.status as ApplicationStatus}
                    size="sm"
                  />
                )}
                <div className="shrink-0 text-right">
                  <p className="text-sm tabular-nums">
                    {formatMoney(booking.total, booking.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(booking.submittedAt ?? booking.createdAt)}
                  </p>
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link
                    href={
                      booking.isDraft
                        ? `/partner/bookings/new?draft=${booking._id}`
                        : `/partner/bookings/${booking._id}`
                    }
                  >
                    Open
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
