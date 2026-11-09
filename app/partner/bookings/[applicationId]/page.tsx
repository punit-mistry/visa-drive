"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useConvex, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Download,
  FileText,
  Loader2,
  Upload,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { PageHeader } from "@/components/shared/page-header";
import {
  ApplicationStatusBadge,
  DocumentStatusBadge,
  PaymentStatusBadge,
} from "@/components/shared/status-badge";
import { StatusTimeline } from "@/components/shared/status-timeline";
import { DetailSkeleton, EmptyState, ErrorState } from "@/components/shared/states";
import { useDocumentUpload } from "@/hooks/use-document-upload";
import { formatDate, formatDateTime, fullName, maskPassport } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";
import {
  APPLICATION_STATUS_CONFIG,
  type ApplicationStatus,
  type DocumentStatusValue,
  type PaymentStatusValue,
} from "@/lib/constants/statuses";
import { friendlyError } from "@/lib/helpers/error-messages";

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/**
 * One booking, from the agent's side.
 *
 * They can see everything the traveller can — status, documents, timeline —
 * plus the margin, which is theirs. They cannot change the official status:
 * `partnerBookings.getMine` never returns the internal timeline, and every
 * mutation that moves an application refuses a partner caller outright.
 */
export default function PartnerBookingDetailPage() {
  const applicationId = param(useParams().applicationId) as Id<"applications">;
  const convex = useConvex();

  const detail = useQuery(api.partnerBookings.getMine, { applicationId });
  const cancelMine = useMutation(api.applications.cancelMine);

  const [downloading, setDownloading] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [uploadTried, setUploadTried] = useState(false);
  const [uploadApplicant, setUploadApplicant] = useState<string | null>(null);

  const upload = useDocumentUpload({ applicationId });

  if (detail === undefined) return <DetailSkeleton />;
  if (detail === null) {
    return (
      <ErrorState
        title="Booking not found"
        description="This booking does not exist, or it was not placed by your agency."
      />
    );
  }

  const { application, applicants, documents, documentRequests, requirements } =
    detail;
  const status = application.status as ApplicationStatus;
  const config = APPLICATION_STATUS_CONFIG[status];
  const canUpload = config?.customerCanUpload === true;
  const canCancel =
    canUpload &&
    (APPLICATION_STATUS_CONFIG[status]?.isTerminal ?? false) === false &&
    status !== "cancelled";

  const targetRequirement = requirements.find(
    (r) => r.documentKey === uploadTarget,
  );
  const needsTraveller = targetRequirement?.appliesTo === "all";
  const effectiveApplicant = needsTraveller
    ? (applicants.length === 1 ? applicants[0]._id : uploadApplicant)
    : null;

  async function openDocument(documentId: Id<"documents">) {
    setDownloading(documentId);
    try {
      const url = await convex.query(api.documents.getSignedUrl, { documentId });
      if (!url) {
        toast.error("That file could not be opened.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(
        friendlyError(error, "Could not open the file."),
      );
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/partner/bookings" },
          { label: application.referenceId },
        ]}
        title={application.customerName}
        description={`${application.visaProductName} · ${application.destinationName} · ${application.travellerCount} traveller${
          application.travellerCount === 1 ? "" : "s"
        }`}
        actions={
          <Button asChild variant="outline">
            <Link href="/partner/bookings">
              <ArrowLeft className="size-4" aria-hidden />
              All bookings
            </Link>
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <ApplicationStatusBadge status={status} />
          <PaymentStatusBadge
            status={application.paymentStatus as PaymentStatusValue}
          />
          <span className="font-mono text-xs text-muted-foreground">
            {application.referenceId}
          </span>
        </div>
      </PageHeader>

      {documentRequests.length > 0 && (
        <div className="rounded-xl border border-warning/25 bg-warning-soft p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-warning">
            <AlertTriangle className="size-4" aria-hidden />
            {documentRequests.length} document
            {documentRequests.length === 1 ? "" : "s"} requested
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-foreground">
            {documentRequests.map((request) => (
              <li key={request._id}>
                <span className="font-medium">{request.label}</span> —{" "}
                {request.reason}
                {request.dueDate && (
                  <span className="text-muted-foreground">
                    {" "}
                    (by {formatDate(request.dueDate)})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Travellers</CardTitle>
            </CardHeader>
            <CardContent>
              {applicants.length === 0 ? (
                <EmptyState
                  compact
                  icon={User}
                  title="No travellers recorded"
                  description="This booking was submitted without traveller details."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {applicants.map((applicant) => (
                    <li key={applicant._id} className="py-3">
                      <p className="text-sm font-medium">
                        {fullName(applicant)}
                        {applicant.isPrimary && (
                          <span className="ml-2 rounded-full border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Primary
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          applicant.nationality,
                          applicant.passportNumber
                            ? `Passport ${maskPassport(applicant.passportNumber)}`
                            : null,
                          applicant.dateOfBirth
                            ? `Born ${formatDate(applicant.dateOfBirth)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Documents</CardTitle>
              <span className="text-xs text-muted-foreground tabular-nums">
                {application.documentsApprovedCount} /{" "}
                {application.documentsRequiredCount} approved
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              {documents.length === 0 ? (
                <EmptyState
                  compact
                  icon={FileText}
                  title="Nothing uploaded yet"
                  description={
                    canUpload
                      ? "Add your customer's documents below."
                      : "This booking is past the upload stage."
                  }
                />
              ) : (
                <ul className="divide-y divide-border">
                  {documents.map((document) => (
                    <li
                      key={document._id}
                      className="flex flex-wrap items-center gap-3 py-3"
                    >
                      <FileText
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {document.label}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {document.fileName} · {formatDate(document.createdAt)}
                        </p>
                        {document.rejectionReason && (
                          <p className="mt-0.5 text-xs text-destructive">
                            {document.rejectionReason}
                          </p>
                        )}
                      </div>
                      <DocumentStatusBadge
                        status={document.status as DocumentStatusValue}
                        size="sm"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDocument(document._id)}
                        disabled={downloading === document._id}
                      >
                        {downloading === document._id ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Download className="size-3.5" aria-hidden />
                        )}
                        Open
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {canUpload && requirements.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Upload a document</p>
                    <select
                      value={uploadTarget ?? ""}
                      id="upload-target"
                      onChange={(e) => setUploadTarget(e.target.value || null)}
                      aria-describedby={
                        uploadTried && !uploadTarget ? "upload-target-error" : undefined
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand"
                      aria-label="Which document is this?"
                    >
                      <option value="">Choose the document type…</option>
                      {requirements.map((requirement) => (
                        <option
                          key={requirement._id}
                          value={requirement.documentKey}
                        >
                          {requirement.label}
                          {requirement.isMandatory ? " (required)" : ""}
                        </option>
                      ))}
                    </select>

                    {uploadTried && !uploadTarget && (
                      <p id="upload-target-error" role="alert" className="text-xs text-destructive">
                        Choose which document this is before uploading.
                      </p>
                    )}

                    {needsTraveller && applicants.length > 1 && (
                      <select
                        value={uploadApplicant ?? ""}
                        id="upload-applicant"
                        onChange={(e) => setUploadApplicant(e.target.value || null)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand"
                        aria-label="Which traveller is this for?"
                      >
                        <option value="">Choose the traveller…</option>
                        {applicants.map((applicant) => (
                          <option key={applicant._id} value={applicant._id}>
                            {fullName(applicant)}
                          </option>
                        ))}
                      </select>
                    )}

                    {uploadTried && needsTraveller && !effectiveApplicant && (
                      <p role="alert" className="text-xs text-destructive">
                        Choose which traveller this document is for.
                      </p>
                    )}

                    <FileDropzone
                      compact
                      disabled={upload.isUploading}
                      uploads={upload.uploads}
                      onRemove={upload.removeUpload}
                      label={
                        uploadTarget
                          ? "Drag and drop, or click to choose"
                          : "Choose a document type, then add your file"
                      }
                      onFiles={(files) => {
                        if (!uploadTarget) {
                          setUploadTried(true);
                          document.getElementById("upload-target")?.focus();
                          return;
                        }
                        if (needsTraveller && !effectiveApplicant) {
                          setUploadTried(true);
                          document.getElementById("upload-applicant")?.focus();
                          return;
                        }
                        const requirement = targetRequirement;
                        void upload.uploadMany(files, {
                          documentKey: uploadTarget,
                          label: requirement?.label ?? uploadTarget,
                          applicantId: effectiveApplicant
                            ? (effectiveApplicant as Id<"applicants">)
                            : undefined,
                          constraints: requirement
                            ? {
                                allowedMimeTypes: requirement.allowedMimeTypes,
                                maxSizeBytes: requirement.maxSizeBytes,
                              }
                            : undefined,
                        });
                      }}
                      multiple
                    />

                    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                      <Upload className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      Uploading a replacement keeps the previous version on
                      record rather than overwriting it.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusTimeline
                currentStatus={status}
                history={detail.timeline}
                audience="customer"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your margin</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.margin ? (
                <dl className="space-y-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Base price</dt>
                    <dd className="tabular-nums">
                      {formatMoney(detail.margin.basePrice, detail.margin.currency)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Customer pays</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatMoney(
                        detail.margin.partnerPrice,
                        detail.margin.currency,
                      )}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2.5">
                    <dt className="text-muted-foreground">Your margin</dt>
                    <dd className="font-semibold tabular-nums text-success">
                      {formatMoney(
                        detail.margin.marginAmount,
                        detail.margin.currency,
                      )}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This booking is at VisaDrive&apos;s base price —{" "}
                  {formatMoney(
                    application.pricing.total,
                    application.pricing.currency,
                  )}{" "}
                  with no markup applied.
                </p>
              )}

              <Separator className="my-4" />

              <dl className="space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Travellers</dt>
                  <dd className="tabular-nums">{application.travellerCount}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Payment</dt>
                  <dd>
                    <PaymentStatusBadge
                      status={application.paymentStatus as PaymentStatusValue}
                      size="sm"
                      withDot={false}
                    />
                  </dd>
                </div>
                {application.submittedAt && (
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Submitted</dt>
                    <dd>{formatDate(application.submittedAt)}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p className="font-medium">{application.customerName}</p>
              <p className="break-words text-muted-foreground">
                {application.customerEmail}
              </p>
              {application.customerPhone && (
                <p className="text-muted-foreground">{application.customerPhone}</p>
              )}
            </CardContent>
          </Card>

          {canCancel && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cancel this booking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Only possible before the application moves into processing.
                  After that, call the VisaDrive team.
                </p>
                <ConfirmDialog
                  title={`Cancel ${application.referenceId}?`}
                  description="The application stops immediately. Any payment already taken is handled by the VisaDrive team."
                  confirmLabel="Cancel booking"
                  destructive
                  requireReason
                  reasonLabel="Reason"
                  reasonPlaceholder="Why is this booking being cancelled?"
                  onConfirm={async (reason) => {
                    try {
                      await cancelMine({ applicationId, reason });
                      toast.success(`${application.referenceId} cancelled.`);
                    } catch (error) {
                      toast.error(
                        friendlyError(error, "Could not cancel the booking."),
                      );
                    }
                  }}
                  trigger={
                    <Button variant="outline" size="sm" className="text-destructive">
                      <Ban className="size-3.5" aria-hidden />
                      Cancel booking
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          )}

          <p className="text-xs leading-relaxed text-muted-foreground">
            Last updated {formatDateTime(application.updatedAt)}. Official
            status changes are made by the VisaDrive team — you will be
            notified of each one.
          </p>
        </div>
      </div>
    </div>
  );
}
