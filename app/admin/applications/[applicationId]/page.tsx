"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useConvex, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Download,
  Eye,
  Handshake,
  Loader2,
  Mail,
  MessageCircle,
  Save,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DocumentViewer } from "@/components/admin/document-viewer";
import { EditCustomerDialog } from "@/components/admin/edit-customer-dialog";
import { EditTripDialog } from "@/components/admin/edit-trip-dialog";
import { EditTravellerDialog } from "@/components/admin/edit-traveller-dialog";
import { PageHeader } from "@/components/shared/page-header";
import {
  ApplicationStatusBadge,
  DocumentStatusBadge,
  PaymentRecordStatusBadge,
  PartnerStatusBadge,
  PaymentStatusBadge,
} from "@/components/shared/status-badge";
import { StatusTimeline } from "@/components/shared/status-timeline";
import { DetailSkeleton, EmptyState, ErrorState } from "@/components/shared/states";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useValidation, type FieldErrors } from "@/hooks/use-validation";
import {
  formatDate,
  formatDateTime,
  formatPhone,
  fullName,
  maskPassport,
} from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";
import { PERMISSIONS } from "@/lib/constants/roles";
import {
  APPLICATION_STATUS_CONFIG,
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type PaymentStatusValue,
} from "@/lib/constants/statuses";
import { friendlyError } from "@/lib/helpers/error-messages";
import {
  PARTNER_BUSINESS_TYPE_LABELS,
  type PartnerBusinessType,
  type PartnerStatus,
} from "@/lib/constants/partners";

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

export default function AdminApplicationDetailPage() {
  const applicationId = param(useParams().applicationId) as Id<"applications">;
  const detail = useQuery(api.applications.getForAdmin, { applicationId });
  const updateStatus = useMutation(api.applications.updateStatus);
  const assignAgent = useMutation(api.applications.assignAgent);
  const convex = useConvex();
  const { can, isLoading: userLoading } = useCurrentUser();

  const canUpdateStatus = can(PERMISSIONS.APPLICATION_UPDATE_STATUS);
  const canAssign = can(PERMISSIONS.APPLICATION_ASSIGN);
  const canViewStaff = can(PERMISSIONS.STAFF_VIEW);
  const canEditCustomer = can(PERMISSIONS.CUSTOMER_EDIT);
  const staff = useQuery(api.users.listStaff, canViewStaff ? {} : "skip");

  const [nextStatus, setNextStatus] = useState<ApplicationStatus | "">("");
  const [note, setNote] = useState("");
  const [visibleToCustomer, setVisibleToCustomer] = useState(true);
  const [force, setForce] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const [agentId, setAgentId] = useState<string>("");
  const [savingAgent, setSavingAgent] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<Id<"documents"> | null>(null);

  const statusValidation = useValidation((): FieldErrors =>
    nextStatus ? {} : { nextStatus: "Choose the status to move this application to." },
  );

  if (detail === undefined || userLoading) return <DetailSkeleton />;
  if (detail === null) {
    return (
      <ErrorState
        title="Application not found"
        description="This application does not exist or you do not have access to it."
      />
    );
  }

  const { application } = detail;
  const currentStatus = application.status as ApplicationStatus;
  const transitions = force
    ? APPLICATION_STATUSES.filter((value) => value !== currentStatus)
    : (detail.allowedTransitions as ApplicationStatus[]);

  async function saveStatus() {
    if (!statusValidation.check() || !nextStatus) return;
    setSavingStatus(true);
    try {
      await updateStatus({
        applicationId,
        status: nextStatus,
        note: note.trim() || undefined,
        visibleToCustomer,
        force,
      });
      toast.success(`Status updated to ${APPLICATION_STATUS_CONFIG[nextStatus].label}.`);
      setNextStatus("");
      setNote("");
      setForce(false);
    } catch (error) {
      toast.error(friendlyError(error, "Could not update the status."));
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveAgent() {
    setSavingAgent(true);
    try {
      await assignAgent({
        applicationId,
        agentId: agentId ? (agentId as Id<"users">) : null,
      });
      toast.success(agentId ? "Application assigned." : "Application unassigned.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not reassign this application."));
    } finally {
      setSavingAgent(false);
    }
  }

  async function openDocument(documentId: Id<"documents">) {
    setDownloadingId(documentId);
    try {
      const url = await convex.query(api.documents.getSignedUrl, { documentId });
      if (!url) {
        toast.error("This file is not available right now.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(friendlyError(error, "Could not open the document."));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${application.referenceId} · ${application.visaProductName}`}
        description={`${application.customerName} · ${application.destinationName}`}
        breadcrumbs={[
          { label: "Applications", href: "/admin/applications" },
          { label: application.referenceId },
        ]}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/applications">
              <ArrowLeft className="size-4" aria-hidden />
              All applications
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {detail.partner && (
          <Badge asChild variant="outline" className="h-6 max-w-full gap-1.5 px-2.5">
            <Link
              href={`/admin/partners/${detail.partner._id}`}
              aria-label={`B2B booking from partner ${detail.partner.agencyName}. Open partner.`}
            >
              <Handshake aria-hidden />
              <span className="font-semibold">B2B</span>
              <span aria-hidden>·</span>
              <span className="truncate">{detail.partner.agencyName}</span>
            </Link>
          </Badge>
        )}
        <ApplicationStatusBadge status={currentStatus} />
        <PaymentStatusBadge status={application.paymentStatus as PaymentStatusValue} />
        <span className="text-xs text-muted-foreground">
          Created {formatDateTime(application.createdAt)}
          {application.submittedAt
            ? ` · submitted ${formatDateTime(application.submittedAt)}`
            : " · not submitted"}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Customer</CardTitle>
              {canEditCustomer && detail.customer && (
                <EditCustomerDialog customer={detail.customer} />
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {detail.customer ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Name" value={detail.customer.fullName} />
                    <Field label="Email" value={detail.customer.email} />
                    <Field label="Phone" value={formatPhone(detail.customer.phone)} />
                    <Field
                      label="Account"
                      value={`${detail.customer.status} · ${detail.customer.applicationCount} applications`}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={`mailto:${detail.customer.email}`}>
                        <Mail className="size-3.5" aria-hidden />
                        Email customer
                      </a>
                    </Button>
                    {/* No phone on file means wa.me would open a blank chat
                        picker, which is a button that does nothing. */}
                    {detail.customer.phone && (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={`https://wa.me/${detail.customer.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle className="size-3.5" aria-hidden />
                          WhatsApp
                        </a>
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  The customer record is no longer available.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Trip details</CardTitle>
              {canUpdateStatus && <EditTripDialog application={application} />}
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Destination" value={application.destinationName} />
              <Field label="Visa service" value={application.visaProductName} />
              <Field label="Travellers" value={String(application.travellerCount)} />
              <Field
                label="Travel dates"
                value={
                  application.intendedArrivalDate || application.intendedDepartureDate
                    ? `${formatDate(application.intendedArrivalDate)} – ${formatDate(
                        application.intendedDepartureDate,
                      )}`
                    : "Not provided"
                }
              />
              <Field
                label="Departure country"
                value={application.departureCountry ?? "Not provided"}
              />
              <Field
                label="Purpose"
                value={application.travelPurpose ?? "Not provided"}
              />
              <Field
                label="Previous rejection"
                value={
                  application.hasPreviousVisaRejection === undefined
                    ? "Not provided"
                    : application.hasPreviousVisaRejection
                      ? "Yes"
                      : "No"
                }
              />
              <Field
                label="Contact phone"
                value={formatPhone(application.customerPhone)}
              />
              <Field
                label="Assigned agent"
                value={detail.assignedAgent?.fullName ?? "Unassigned"}
              />
              <Field
                label="Payment mode"
                value={application.paymentMode.replace(/_/g, " ")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Travellers</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {detail.applicants.length} on file
                </span>
                {canUpdateStatus && (
                  <EditTravellerDialog applicationId={applicationId} />
                )}
              </div>
            </CardHeader>
            <CardContent>
              {detail.applicants.length === 0 ? (
                <EmptyState
                  compact
                  title="No travellers added"
                  description="The customer has not added traveller details yet."
                />
              ) : (
                <div className="space-y-3">
                  {detail.applicants.map((applicant) => (
                    <div key={applicant._id} className="rounded-lg border border-border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{fullName(applicant)}</p>
                        {applicant.isPrimary && (
                          <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-medium text-brand-deep">
                            Primary
                          </span>
                        )}
                        {canUpdateStatus && (
                          <span className="ml-auto">
                            <EditTravellerDialog
                              applicationId={applicationId}
                              applicant={applicant}
                              canRemove={detail.applicants.length > 1}
                            />
                          </span>
                        )}
                      </div>
                      <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                        <p>Passport: {maskPassport(applicant.passportNumber)}</p>
                        <p>Nationality: {applicant.nationality ?? "—"}</p>
                        <p>Date of birth: {formatDate(applicant.dateOfBirth)}</p>
                        <p>Passport expires: {formatDate(applicant.passportExpiryDate)}</p>
                        <p>Email: {applicant.email ?? "—"}</p>
                        <p>Phone: {formatPhone(applicant.phone)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Documents</CardTitle>
              <span className="text-xs text-muted-foreground">
                {application.documentsApprovedCount}/{application.documentsRequiredCount}{" "}
                approved
              </span>
            </CardHeader>
            <CardContent className="space-y-2">
              {detail.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No documents uploaded yet.
                </p>
              ) : (
                detail.documents.map((document) => (
                  <div
                    key={document._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{document.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {document.fileName} · uploaded {formatDate(document.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <DocumentStatusBadge status={document.status} />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewerId(document._id)}
                      >
                        <Eye className="size-3.5" aria-hidden />
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openDocument(document._id)}
                        disabled={downloadingId === document._id}
                        aria-label={`Open ${document.label} in a new tab`}
                      >
                        {downloadingId === document._id ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Download className="size-3.5" aria-hidden />
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}

              {detail.documentRequests.length > 0 && (
                <>
                  <Separator className="my-3" />
                  <p className="text-sm font-medium">Document requests</p>
                  {detail.documentRequests.map((request) => (
                    <div
                      key={request._id}
                      className="rounded-lg border border-border p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{request.label}</p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          {request.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{request.reason}</p>
                      {request.dueDate && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Due {formatDate(request.dueDate)}
                        </p>
                      )}
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusTimeline
                currentStatus={currentStatus}
                history={detail.timeline}
                audience="staff"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {canUpdateStatus && (
            <Card>
              <CardHeader>
                <CardTitle>Update status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nextStatus">Move to</Label>
                  <select
                    id="nextStatus"
                    value={nextStatus}
                    onChange={(event) =>
                      setNextStatus(event.target.value as ApplicationStatus | "")
                    }
                    aria-invalid={statusValidation.errors.nextStatus ? true : undefined}
                    aria-describedby={
                      statusValidation.errors.nextStatus ? "nextStatus-error" : undefined
                    }
                    className={selectClass}
                  >
                    <option value="">Choose a status</option>
                    {transitions.map((value) => (
                      <option key={value} value={value}>
                        {APPLICATION_STATUS_CONFIG[value].label}
                      </option>
                    ))}
                  </select>
                  {statusValidation.errors.nextStatus && (
                    <p id="nextStatus-error" role="alert" className="text-xs text-destructive">
                      {statusValidation.errors.nextStatus}
                    </p>
                  )}
                  {transitions.length === 0 && !force && (
                    <p className="text-xs text-muted-foreground">
                      This status has no normal transitions. Enable an override below
                      if a correction is needed.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="statusNote">Note to customer</Label>
                  <Textarea
                    id="statusNote"
                    rows={3}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Optional — this appears in the customer's timeline."
                  />
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="visibleToCustomer"
                    checked={visibleToCustomer}
                    onCheckedChange={(value) => setVisibleToCustomer(value === true)}
                  />
                  <Label htmlFor="visibleToCustomer" className="leading-tight">
                    Notify the customer and show this in their timeline
                  </Label>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="forceStatus"
                    checked={force}
                    onCheckedChange={(value) => {
                      setForce(value === true);
                      setNextStatus("");
                    }}
                  />
                  <div>
                    <Label htmlFor="forceStatus">Override allowed transitions</Label>
                    <p className="text-xs text-muted-foreground">
                      Audited separately. Use only to correct a mistake.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={saveStatus}
                  disabled={savingStatus}
                  className="w-full"
                >
                  {savingStatus ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Save className="size-4" aria-hidden />
                  )}
                  Save status
                </Button>
              </CardContent>
            </Card>
          )}

          {canAssign && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCog className="size-4" aria-hidden />
                  Assignment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label htmlFor="agent">Assigned agent</Label>
                <select
                  id="agent"
                  value={agentId || (application.assignedAgentId ?? "")}
                  onChange={(event) => setAgentId(event.target.value)}
                  className={selectClass}
                >
                  <option value="">Unassigned</option>
                  {(staff ?? []).map((member) => (
                    <option key={member._id} value={member._id}>
                      {member.fullName} · {member.role.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                {!canViewStaff && (
                  <p className="text-xs text-muted-foreground">
                    Your role cannot list staff. Enter an agent id to assign manually.
                  </p>
                )}
                {!canViewStaff && (
                  <Input
                    value={agentId}
                    onChange={(event) => setAgentId(event.target.value)}
                    placeholder="Agent user id"
                  />
                )}
                <Button
                  onClick={saveAgent}
                  disabled={savingAgent}
                  variant="outline"
                  className="w-full"
                >
                  {savingAgent ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Save className="size-4" aria-hidden />
                  )}
                  Save assignment
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <PaymentStatusBadge
                  status={application.paymentStatus as PaymentStatusValue}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Mode</span>
                <span className="capitalize">{application.paymentMode.replace(/_/g, " ")}</span>
              </div>
              <Separator />
              <Row
                label="Government fee"
                value={formatMoney(
                  application.pricing.governmentFee,
                  application.pricing.currency,
                )}
              />
              <Row
                label="Service fee"
                value={formatMoney(
                  application.pricing.serviceFee,
                  application.pricing.currency,
                )}
              />
              <Row
                label={`Tax (${application.pricing.taxPercent}%)`}
                value={formatMoney(
                  application.pricing.taxAmount,
                  application.pricing.currency,
                )}
              />
              <Separator />
              <Row
                label="Total"
                value={formatMoney(
                  application.pricing.total,
                  application.pricing.currency,
                )}
                strong
              />

              {detail.payments.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    {detail.payments.map((payment) => (
                      <div
                        key={payment._id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border p-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium tabular-nums">
                            {formatMoney(payment.amount, payment.currency)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {payment.receiptNumber}
                          </p>
                        </div>
                        <PaymentRecordStatusBadge status={payment.status} size="sm" />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {detail.partner && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Handshake className="size-4" aria-hidden />
                  Partner (B2B)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <Link
                    href={`/admin/partners/${detail.partner._id}`}
                    className="font-medium text-primary hover:underline focus-brand"
                  >
                    {detail.partner.agencyName}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {detail.partner.partnerCode} ·{" "}
                    {PARTNER_BUSINESS_TYPE_LABELS[
                      detail.partner.businessType as PartnerBusinessType
                    ] ?? detail.partner.businessType}{" "}
                    · {detail.partner.city}, {detail.partner.country}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <PartnerStatusBadge status={detail.partner.status as PartnerStatus} />
                </div>
                <Row label="Contact" value={detail.partner.contactPersonName} />
                <Row
                  label="Email"
                  value={
                    <a
                      href={`mailto:${detail.partner.contactEmail}`}
                      className="text-primary hover:underline focus-brand"
                    >
                      {detail.partner.contactEmail}
                    </a>
                  }
                />
                <Row
                  label="Phone"
                  value={
                    <a
                      href={`tel:${detail.partner.contactPhone}`}
                      className="text-primary hover:underline focus-brand"
                    >
                      {formatPhone(detail.partner.contactPhone)}
                    </a>
                  }
                />
                <Row label="Total bookings" value={String(detail.partner.bookingCount)} />

                {detail.partnerCustomer && (
                  <>
                    <Separator />
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Partner&apos;s customer
                    </p>
                    <p className="font-medium">{detail.partnerCustomer.fullName}</p>
                    <p className="text-muted-foreground">
                      {detail.partnerCustomer.email}
                      {detail.partnerCustomer.phone
                        ? ` · ${formatPhone(detail.partnerCustomer.phone)}`
                        : ""}
                    </p>
                    {detail.partnerCustomer.reference && (
                      <Row
                        label="Partner reference"
                        value={detail.partnerCustomer.reference}
                      />
                    )}
                  </>
                )}

                <Separator />
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Commercials
                </p>
                {detail.commercials === null ? (
                  <p className="text-muted-foreground">
                    You don&apos;t have access to commercial details.
                  </p>
                ) : detail.commercials.partnerMargin ? (
                  <>
                    <Row
                      label="Base price (partner pays)"
                      value={formatMoney(
                        detail.commercials.partnerMargin.basePrice,
                        detail.commercials.partnerMargin.currency,
                      )}
                    />
                    <Row
                      label="Partner price (customer pays)"
                      value={formatMoney(
                        detail.commercials.partnerMargin.partnerPrice,
                        detail.commercials.partnerMargin.currency,
                      )}
                    />
                    <Row
                      label={`Margin (${detail.commercials.partnerMargin.marginPercent}%)`}
                      value={formatMoney(
                        detail.commercials.partnerMargin.marginAmount,
                        detail.commercials.partnerMargin.currency,
                      )}
                      strong
                    />
                    <p className="text-xs text-muted-foreground">
                      Frozen at submission. Margin percent is of the base price.
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Not frozen yet — set when the booking is submitted.
                  </p>
                )}

                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={`/admin/partners/${detail.partner._id}`}>
                    View all bookings from this partner
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {detail.requirements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Requirements</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {detail.requirements.map((requirement) => (
                  <div
                    key={requirement._id}
                    className="flex items-start justify-between gap-3"
                  >
                    <span>{requirement.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {requirement.isMandatory ? "Required" : "Optional"}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <DocumentViewer
        documents={detail.documents}
        openId={viewerId}
        onOpenChange={setViewerId}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm capitalize">{value}</p>
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={
        strong
          ? "flex items-center justify-between font-semibold"
          : "flex items-center justify-between"
      }
    >
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
