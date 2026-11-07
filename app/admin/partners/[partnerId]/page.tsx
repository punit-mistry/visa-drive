"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Handshake,
  Mail,
  MapPin,
  Phone,
  Save,
  Tags,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PartnerDocumentViewer } from "@/components/admin/partner-document-viewer";
import { PartnerLoginDialog } from "@/components/admin/partner-login-dialog";
import { PartnerStatusActions } from "@/components/admin/partner-status-actions";
import {
  PartnerPricingDialog,
  type PricingTarget,
} from "@/components/admin/partner-pricing-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import {
  ApplicationStatusBadge,
  PartnerDocumentStatusBadge,
  PartnerStatusBadge,
  PaymentStatusBadge,
} from "@/components/shared/status-badge";
import {
  DetailSkeleton,
  EmptyState,
  ErrorState,
  ListSkeleton,
  NoAccessState,
} from "@/components/shared/states";
import { CursorPagination } from "@/components/tables/data-table";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  formatDate,
  formatDateTime,
  formatPhone,
  formatRelative,
} from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";
import { formatMarginPercent } from "@/lib/helpers/partner-pricing";
import { PERMISSIONS } from "@/lib/constants/roles";
import {
  MAX_MARKUP_PERCENT,
  PARTNER_BUSINESS_TYPE_LABELS,
  PARTNER_DOCUMENT_DEFINITIONS,
  PARTNER_STATUS_CONFIG,
  type PartnerBusinessType,
  type PartnerDocumentStatus,
  type PartnerPricingMode,
  type PartnerStatus,
} from "@/lib/constants/partners";
import type { ApplicationStatus, PaymentStatusValue } from "@/lib/constants/statuses";

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default function AdminPartnerDetailPage() {
  const partnerId = param(useParams().partnerId) as Id<"partners">;
  const { can, isLoading: userLoading } = useCurrentUser();
  const canView = can(PERMISSIONS.PARTNER_VIEW);

  const detail = useQuery(
    api.partners.getForAdmin,
    canView ? { partnerId } : "skip",
  );

  if (userLoading) return <DetailSkeleton />;
  if (!canView) return <NoAccessState />;
  if (detail === undefined) return <DetailSkeleton />;
  if (detail === null) {
    return (
      <ErrorState
        title="Partner not found"
        description="This partner account does not exist, or it has been removed."
      />
    );
  }

  const { partner } = detail;
  const status = partner.status as PartnerStatus;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "B2B Partners", href: "/admin/partners" },
          { label: partner.agencyName },
        ]}
        title={partner.agencyName}
        description={`${
          PARTNER_BUSINESS_TYPE_LABELS[partner.businessType as PartnerBusinessType] ??
          partner.businessType
        } · ${partner.city}${partner.country ? `, ${partner.country}` : ""}`}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/partners">
              <ArrowLeft className="size-4" aria-hidden />
              All partners
            </Link>
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <PartnerStatusBadge status={status} />
          <span className="font-mono text-xs text-muted-foreground">
            {partner.partnerCode}
          </span>
          {partner.isDeleted && (
            <span className="rounded-full border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
              Removed
            </span>
          )}
        </div>
      </PageHeader>

      {partner.statusReason && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Status note
          </p>
          <p className="mt-1 text-sm">{partner.statusReason}</p>
          {detail.reviewer && partner.reviewedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              {detail.reviewer.fullName} · {formatDateTime(partner.reviewedAt)}
            </p>
          )}
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="pricing">Pricing &amp; margins</TabsTrigger>
          <TabsTrigger value="documents">
            Documents
            {detail.documents.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                {detail.documents.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab partnerId={partnerId} detail={detail} />
        </TabsContent>

        <TabsContent value="bookings" className="mt-6">
          <BookingsTab partnerId={partnerId} />
        </TabsContent>

        <TabsContent value="customers" className="mt-6">
          <CustomersTab partnerId={partnerId} />
        </TabsContent>

        <TabsContent value="pricing" className="mt-6">
          <PricingTab
            partnerId={partnerId}
            defaultMarkupPercent={partner.defaultMarkupPercent}
            agencyName={partner.agencyName}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <DocumentsTab partnerId={partnerId} />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <ActivityTab partnerId={partnerId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  overview                                  */
/* -------------------------------------------------------------------------- */

function OverviewTab({
  partnerId,
  detail,
}: {
  partnerId: Id<"partners">;
  // Shaped by `partners.getForAdmin`; typed loosely here because Convex infers
  // the return and re-declaring it would only let the two drift apart.
  detail: {
    partner: {
      agencyName: string;
      partnerCode: string;
      status: string;
      businessType: string;
      gstNumber?: string;
      panNumber?: string;
      website?: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      state?: string;
      postalCode?: string;
      country: string;
      contactPersonName: string;
      contactEmail: string;
      contactPhone: string;
      alternatePhone?: string;
      internalNote?: string;
      defaultMarkupPercent: number;
      bookingCount: number;
      customerCount: number;
      grossVolume: number;
      grossMargin: number;
      lastBookingAt?: number;
      createdAt: number;
      approvedAt?: number;
    };
    login: {
      _id: string;
      fullName: string;
      email: string;
      role: string;
      status: string;
      lastActiveAt?: number;
      hasSignedIn: boolean;
    } | null;
    pricingRuleCount: number;
  };
}) {
  const { can } = useCurrentUser();
  const canManage = can(PERMISSIONS.PARTNER_MANAGE);
  const canPrice = can(PERMISSIONS.PARTNER_PRICING);

  const setInternalNote = useMutation(api.partners.setInternalNote);
  const setDefaultMarkup = useMutation(api.partners.setDefaultMarkup);
  const remove = useMutation(api.partners.remove);

  const partner = detail.partner;

  const [note, setNote] = useState(partner.internalNote ?? "");
  const [markup, setMarkup] = useState(String(partner.defaultMarkupPercent));
  const [savingNote, setSavingNote] = useState(false);
  const [savingMarkup, setSavingMarkup] = useState(false);

  async function saveNote() {
    setSavingNote(true);
    try {
      await setInternalNote({ partnerId, note });
      toast.success("Internal note saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the note.");
    } finally {
      setSavingNote(false);
    }
  }

  async function saveMarkup() {
    const value = Number.parseFloat(markup);
    if (!Number.isFinite(value) || value < 0 || value > MAX_MARKUP_PERCENT) {
      toast.error(`Enter a markup between 0 and ${MAX_MARKUP_PERCENT}%.`);
      return;
    }
    setSavingMarkup(true);
    try {
      const result = await setDefaultMarkup({
        partnerId,
        defaultMarkupPercent: value,
      });
      toast.success(`Default markup set to ${result.defaultMarkupPercent}%.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the markup.",
      );
    } finally {
      setSavingMarkup(false);
    }
  }

  return (
    <div className="space-y-6">
      <StatGrid columns={4}>
        <StatCard
          label="Bookings"
          value={partner.bookingCount}
          icon={Handshake}
          hint={
            partner.lastBookingAt
              ? `Last ${formatRelative(partner.lastBookingAt)}`
              : "No bookings yet"
          }
        />
        <StatCard label="Customers" value={partner.customerCount} icon={Users} />
        <StatCard
          label="Business volume"
          value={formatMoney(partner.grossVolume, "INR")}
          icon={Wallet}
        />
        <StatCard
          label="Partner margin"
          value={formatMoney(partner.grossMargin, "INR")}
          icon={Tags}
          hint={
            partner.grossVolume > 0
              ? `${((partner.grossMargin / partner.grossVolume) * 100).toFixed(1)}% of volume`
              : undefined
          }
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Business details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label="Business type">
                {PARTNER_BUSINESS_TYPE_LABELS[
                  partner.businessType as PartnerBusinessType
                ] ?? partner.businessType}
              </Detail>
              <Detail label="Partner ID">
                <span className="font-mono">{partner.partnerCode}</span>
              </Detail>
              <Detail label="GSTIN">
                {partner.gstNumber ? (
                  <span className="font-mono">{partner.gstNumber}</span>
                ) : (
                  <span className="text-muted-foreground">Not registered</span>
                )}
              </Detail>
              <Detail label="PAN">
                {partner.panNumber ? (
                  <span className="font-mono">{partner.panNumber}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Detail>
              <Detail label="Website">
                {partner.website ? (
                  <a
                    href={partner.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-sm text-brand transition-colors hover:text-brand-deep focus-brand"
                  >
                    <Globe className="size-3.5" aria-hidden />
                    {partner.website.replace(/^https?:\/\//, "")}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Detail>
              <Detail label="Registered">{formatDate(partner.createdAt)}</Detail>
              <Detail label="Address" className="sm:col-span-2">
                <span className="inline-flex items-start gap-1.5">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span>
                    {[
                      partner.addressLine1,
                      partner.addressLine2,
                      partner.city,
                      partner.state,
                      partner.postalCode,
                      partner.country,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </span>
              </Detail>
            </dl>

            <Separator />

            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label="Contact person">{partner.contactPersonName}</Detail>
              <Detail label="Email">
                <a
                  href={`mailto:${partner.contactEmail}`}
                  className="inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-brand focus-brand"
                >
                  <Mail className="size-3.5 text-muted-foreground" aria-hidden />
                  {partner.contactEmail}
                </a>
              </Detail>
              <Detail label="Mobile">
                <a
                  href={`tel:${partner.contactPhone}`}
                  className="inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-brand focus-brand"
                >
                  <Phone className="size-3.5 text-muted-foreground" aria-hidden />
                  {formatPhone(partner.contactPhone)}
                </a>
              </Detail>
              <Detail label="Alternative">
                {partner.alternatePhone ? (
                  formatPhone(partner.alternatePhone)
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Detail>
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  {PARTNER_STATUS_CONFIG[partner.status as PartnerStatus]?.description}
                </p>
              </div>

              <PartnerStatusActions
                partnerId={partnerId}
                status={partner.status as PartnerStatus}
                agencyName={partner.agencyName}
              />

              <Separator />

              <dl className="space-y-3 text-sm">
                <Detail label="Portal login">
                  {detail.login ? (
                    <span className="block truncate">{detail.login.email}</span>
                  ) : (
                    <span className="text-muted-foreground">Not linked</span>
                  )}
                </Detail>
                {canManage && !detail.login?.hasSignedIn && (
                  <PartnerLoginDialog partnerId={partnerId} agencyName={partner.agencyName} />
                )}
                <Detail label="Signed in yet">
                  {detail.login?.hasSignedIn ? (
                    detail.login.lastActiveAt ? (
                      `Yes · last active ${formatRelative(detail.login.lastActiveAt)}`
                    ) : (
                      "Yes"
                    )
                  ) : (
                    <span className="text-muted-foreground">
                      Not yet — they sign up with that address
                    </span>
                  )}
                </Detail>
                <Detail label="Role on the login">
                  <span className="capitalize">
                    {(detail.login?.role ?? "—").replace("_", " ")}
                  </span>
                </Detail>
                {partner.approvedAt && (
                  <Detail label="Approved">{formatDate(partner.approvedAt)}</Detail>
                )}
              </dl>
            </CardContent>
          </Card>

          {canPrice && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Default markup</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Applied to every service without a price of its own.{" "}
                  {detail.pricingRuleCount > 0
                    ? `${detail.pricingRuleCount} service${
                        detail.pricingRuleCount === 1 ? " has" : "s have"
                      } a specific rate.`
                    : "No service-specific rates are set."}
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={MAX_MARKUP_PERCENT}
                    step="0.5"
                    value={markup}
                    onChange={(e) => setMarkup(e.target.value)}
                    className="w-28 tabular-nums"
                    aria-label="Default markup percent"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={saveMarkup}
                    disabled={savingMarkup}
                  >
                    <Save className="size-3.5" aria-hidden />
                    {savingMarkup ? "Saving…" : "Save"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Internal note</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="Only VisaDrive staff see this. The partner never does."
                  aria-label="Internal note"
                />
                <div className="flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={saveNote}
                    disabled={savingNote}
                  >
                    <Save className="size-3.5" aria-hidden />
                    {savingNote ? "Saving…" : "Save note"}
                  </Button>

                  <ConfirmDialog
                    title={`Remove ${partner.agencyName}?`}
                    description="They stop appearing in the directory and can no longer trade. Their bookings, margins and audit trail are kept."
                    confirmLabel="Remove partner"
                    destructive
                    requireReason
                    reasonLabel="Reason"
                    reasonPlaceholder="Why is this partner being removed?"
                    onConfirm={async (reason) => {
                      try {
                        await remove({ partnerId, reason: reason ?? "" });
                        toast.success(`${partner.agencyName} removed.`);
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not remove the partner.",
                        );
                      }
                    }}
                    trigger={
                      <Button size="sm" variant="ghost" className="text-destructive">
                        <Trash2 className="size-3.5" aria-hidden />
                        Remove
                      </Button>
                    }
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  bookings                                  */
/* -------------------------------------------------------------------------- */

function BookingsTab({ partnerId }: { partnerId: Id<"partners"> }) {
  const [includeDrafts, setIncludeDrafts] = useState(false);

  const { results, status, loadMore } = usePaginatedQuery(
    api.partners.bookingsForAdmin,
    { partnerId, includeDrafts },
    { initialNumItems: 20 },
  );

  if (status === "LoadingFirstPage") return <ListSkeleton rows={5} />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Bookings placed by this partner</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIncludeDrafts((v) => !v)}
        >
          {includeDrafts ? "Hide drafts" : "Include drafts"}
        </Button>
      </CardHeader>
      <CardContent>
        {results.length === 0 ? (
          <EmptyState
            compact
            icon={Handshake}
            title="No bookings yet"
            description="Bookings this partner creates for their customers appear here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {results.map((booking) => (
              <li key={booking._id} className="flex flex-wrap items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/applications/${booking._id}`}
                    className="inline-flex items-center gap-2 rounded-sm font-mono text-sm font-medium transition-colors hover:text-brand focus-brand"
                  >
                    {booking.referenceId}
                  </Link>
                  <p className="truncate text-sm">{booking.customerName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {booking.visaProductName} · {booking.destinationName} ·{" "}
                    {booking.travellerCount} traveller
                    {booking.travellerCount === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                  <PaymentStatusBadge
                    status={booking.paymentStatus as PaymentStatusValue}
                    size="sm"
                  />
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium tabular-nums">
                    {formatMoney(
                      booking.partnerMargin?.partnerPrice ?? booking.pricing.total,
                      booking.pricing.currency,
                    )}
                  </p>
                  {booking.partnerMargin && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatMoney(
                        booking.partnerMargin.marginAmount,
                        booking.pricing.currency,
                      )}{" "}
                      margin
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatDate(booking.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {results.length > 0 && (
          <div className="mt-4 flex items-center justify-between gap-4">
            <CursorPagination
              loadedCount={results.length}
              status={status}
              onLoadMore={loadMore}
              label="bookings"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  customers                                 */
/* -------------------------------------------------------------------------- */

function CustomersTab({ partnerId }: { partnerId: Id<"partners"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.partners.customersForAdmin,
    { partnerId },
    { initialNumItems: 25 },
  );

  if (status === "LoadingFirstPage") return <ListSkeleton rows={5} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Customers on this partner&apos;s book</CardTitle>
      </CardHeader>
      <CardContent>
        {results.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title="No customers yet"
            description="Travellers this partner has added appear here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {results.map((customer) => (
              <li key={customer._id} className="flex flex-wrap items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {customer.fullName}
                    {customer.isArchived && (
                      <span className="ml-2 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Archived
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {customer.email}
                    {customer.phone ? ` · ${formatPhone(customer.phone)}` : ""}
                    {customer.reference ? ` · ${customer.reference}` : ""}
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
              </li>
            ))}
          </ul>
        )}

        {results.length > 0 && (
          <div className="mt-4 flex items-center justify-between gap-4">
            <CursorPagination
              loadedCount={results.length}
              status={status}
              onLoadMore={loadMore}
              label="customers"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*                             pricing and margins                            */
/* -------------------------------------------------------------------------- */

function PricingTab({
  partnerId,
  defaultMarkupPercent,
  agencyName,
}: {
  partnerId: Id<"partners">;
  defaultMarkupPercent: number;
  agencyName: string;
}) {
  const { can } = useCurrentUser();
  const canPrice = can(PERMISSIONS.PARTNER_PRICING);

  const [destinationId, setDestinationId] = useState<string>("");
  const [configuredOnly, setConfiguredOnly] = useState(false);
  const [target, setTarget] = useState<PricingTarget | null>(null);

  const pricing = useQuery(api.partnerPricing.listForPartner, {
    partnerId,
    destinationId: destinationId
      ? (destinationId as Id<"destinations">)
      : undefined,
    configuredOnly,
  });

  const products = useQuery(api.visaProducts.listAll, { isPublished: true });

  const productById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof products>[number]>();
    for (const product of products ?? []) map.set(product._id, product);
    return map;
  }, [products]);

  const destinations = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of pricing?.rows ?? []) {
      seen.set(row.destinationId, row.destinationName);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [pricing?.rows]);

  if (pricing === undefined) return <ListSkeleton rows={6} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={destinationId}
          onChange={(e) => setDestinationId(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand"
          aria-label="Filter by destination"
        >
          <option value="">All destinations</option>
          {destinations.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>

        <Button
          variant={configuredOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setConfiguredOnly((v) => !v)}
        >
          {configuredOnly ? "Showing custom rates" : "Custom rates only"}
        </Button>

        <p className="ml-auto text-sm text-muted-foreground">
          Default markup{" "}
          <span className="font-medium text-foreground tabular-nums">
            {defaultMarkupPercent}%
          </span>
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {pricing.rows.length === 0 ? (
            <EmptyState
              icon={Tags}
              title={
                configuredOnly
                  ? "No service-specific rates"
                  : "No published services"
              }
              description={
                configuredOnly
                  ? `${agencyName} trades on the default ${defaultMarkupPercent}% markup for everything.`
                  : "Publish a visa service in the catalogue and it will appear here."
              }
            />
          ) : (
            <div className="scrollbar-thin max-h-[65vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-surface">
                  <tr className="text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3">Destination</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3 text-right">Base price</th>
                    <th className="px-4 py-3 text-right">Partner price</th>
                    <th className="px-4 py-3 text-right">Margin</th>
                    <th className="px-4 py-3">Rate</th>
                    {canPrice && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pricing.rows.map((row) => (
                    <tr key={row.visaProductId} className="align-middle">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {row.destinationName}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{row.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.visaType}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatMoney(row.basePrice, row.currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                        {formatMoney(row.partnerPrice, row.currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        <span
                          className={
                            row.marginAmount > 0 ? "text-success" : "text-muted-foreground"
                          }
                        >
                          {formatMoney(row.marginAmount, row.currency)}
                        </span>
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {formatMarginPercent(row.marginPercent)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={
                            row.source === "product"
                              ? "rounded-full border border-brand/25 bg-brand-tint px-2 py-0.5 text-[11px] font-medium text-brand-deep"
                              : "rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                          }
                        >
                          {row.source === "product"
                            ? "Custom"
                            : row.source === "default"
                              ? `Default ${defaultMarkupPercent}%`
                              : "Base price"}
                        </span>
                      </td>
                      {canPrice && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const product = productById.get(row.visaProductId);
                              if (!product) {
                                toast.error(
                                  "The catalogue is still loading. Try again in a moment.",
                                );
                                return;
                              }
                              setTarget({
                                visaProductId: row.visaProductId,
                                productName: row.productName,
                                destinationName: row.destinationName,
                                currency: row.currency,
                                product: {
                                  currency: product.currency,
                                  governmentFee: product.governmentFee,
                                  serviceFee: product.serviceFee,
                                  additionalCharges: product.additionalCharges,
                                  taxPercent: product.taxPercent,
                                  promoPrice: product.promoPrice,
                                  promoEndsAt: product.promoEndsAt,
                                },
                                existing: row.rule
                                  ? {
                                      mode: row.rule.mode as PartnerPricingMode,
                                      value: row.rule.value,
                                      note: row.rule.note,
                                    }
                                  : null,
                              });
                            }}
                          >
                            {row.rule ? "Edit" : "Set price"}
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {pricing.truncated && (
        <p className="text-xs text-muted-foreground">
          Showing the first 500 published services. Filter by destination to see
          the rest.
        </p>
      )}

      <PartnerPricingDialog
        partnerId={partnerId}
        target={target}
        onOpenChange={setTarget}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  documents                                 */
/* -------------------------------------------------------------------------- */

function DocumentsTab({ partnerId }: { partnerId: Id<"partners"> }) {
  const [includeSuperseded, setIncludeSuperseded] = useState(false);
  const [openId, setOpenId] = useState<Id<"partnerDocuments"> | null>(null);

  const documents = useQuery(api.partnerDocuments.listForAdmin, {
    partnerId,
    includeSuperseded,
  });

  if (documents === undefined) return <ListSkeleton rows={4} />;

  const byKind = new Map(
    documents.filter((d) => d.isCurrent).map((d) => [d.documentKind, d]),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Business paperwork submitted for verification.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIncludeSuperseded((v) => !v)}
        >
          {includeSuperseded ? "Current versions only" : "Show earlier versions"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {PARTNER_DOCUMENT_DEFINITIONS.map((definition) => {
              const document = byKind.get(definition.key);

              return (
                <li
                  key={definition.key}
                  className="flex flex-wrap items-center gap-4 px-4 py-3.5"
                >
                  <FileText
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {definition.label}
                      {definition.isMandatory && (
                        <span className="ml-1 text-destructive" aria-label="required">
                          *
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {document
                        ? `${document.fileName} · ${formatDate(document.createdAt)}`
                        : definition.description}
                    </p>
                  </div>

                  {document ? (
                    <>
                      <PartnerDocumentStatusBadge
                        status={document.status as PartnerDocumentStatus}
                        size="sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOpenId(document._id)}
                      >
                        Review
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Not uploaded
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {includeSuperseded && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Earlier versions</CardTitle>
          </CardHeader>
          <CardContent>
            {documents.filter((d) => !d.isCurrent).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing has been replaced yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {documents
                  .filter((d) => !d.isCurrent)
                  .map((document) => (
                    <li
                      key={document._id}
                      className="flex items-center gap-4 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          {document.label}{" "}
                          <span className="text-xs text-muted-foreground">
                            v{document.version}
                          </span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {document.fileName} · {formatDateTime(document.createdAt)}
                        </p>
                      </div>
                      <PartnerDocumentStatusBadge
                        status={document.status as PartnerDocumentStatus}
                        size="sm"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOpenId(document._id)}
                      >
                        View
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <PartnerDocumentViewer
        documents={documents}
        openId={openId}
        onOpenChange={setOpenId}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  activity                                  */
/* -------------------------------------------------------------------------- */

function ActivityTab({ partnerId }: { partnerId: Id<"partners"> }) {
  const activity = useQuery(api.partners.activityForAdmin, {
    partnerId,
    limit: 100,
  });

  if (activity === undefined) return <ListSkeleton rows={6} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity log</CardTitle>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <EmptyState
            compact
            icon={Clock}
            title="Nothing recorded yet"
            description="Registration, approvals, pricing changes and bookings all appear here."
          />
        ) : (
          <ol className="relative space-y-5 border-l border-border pl-5">
            {activity.map((row) => (
              <li key={row._id} className="relative">
                <span
                  className="absolute -left-[1.4375rem] top-1.5 size-2 rounded-full bg-brand ring-4 ring-background"
                  aria-hidden
                />
                <p className="text-sm">{row.summary}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-mono">{row.action}</span> · {row.actorName} ·{" "}
                  {formatDateTime(row.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
