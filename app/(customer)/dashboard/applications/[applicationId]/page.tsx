"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import {
  CreditCard,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ApplicationStatusBadge, DocumentStatusBadge, PaymentRecordStatusBadge, PaymentStatusBadge } from "@/components/shared/status-badge";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { StatusTimeline } from "@/components/shared/status-timeline";
import { DetailSkeleton, EmptyState, ErrorState } from "@/components/shared/states";
import { useDocumentUpload } from "@/hooks/use-document-upload";
import { formatDate, formatDateTime, fullName, maskPassport } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";
import { DOCUMENT_TYPE_MAP } from "@/lib/constants/documents";
import { APPLICATION_STATUS_CONFIG } from "@/lib/constants/statuses";

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default function ApplicationDetailPage() {
  const applicationId = param(useParams().applicationId) as Id<"applications">;
  const detail = useQuery(api.applications.getMine, { applicationId });
  const uploader = useDocumentUpload({ applicationId });
  const cancel = useMutation(api.applications.cancelMine);
  const convex = useConvex();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  if (detail === undefined) return <DetailSkeleton />;
  if (detail === null) {
    return (
      <ErrorState
        title="Application not found"
        description="This application does not exist or you do not have access to it."
      />
    );
  }

  const { application, applicants, documents, timeline, payments, documentRequests } = detail;
  const config = APPLICATION_STATUS_CONFIG[application.status];
  const isDraft = application.isDraft;
  const cancellable = !isDraft && ["submitted", "documents_pending", "documents_submitted", "additional_documents_requested"].includes(application.status);
  const requiresPayment = application.paymentMode === "pay_now" && application.paymentStatus !== "paid" && !isDraft;

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
      toast.error(error instanceof Error ? error.message : "Could not open the document.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={application.visaProductName}
        description={`${application.referenceId} · ${application.destinationName}`}
        breadcrumbs={[
          { label: "Applications", href: "/dashboard/applications" },
          { label: application.referenceId },
        ]}
        actions={
          <>
            {requiresPayment && (
              <Button asChild>
                <Link href={`/checkout/${application._id}`}>
                  <CreditCard className="size-4" aria-hidden />
                  Pay {formatMoney(application.pricing.total, application.pricing.currency)}
                </Link>
              </Button>
            )}
            {cancellable && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline">
                    <XCircle className="size-4" aria-hidden />
                    Cancel application
                  </Button>
                }
                title="Cancel this application?"
                description="This cannot be undone. If you have already paid, contact the VisaDrive team about a refund."
                confirmLabel="Cancel application"
                destructive
                requireReason
                reasonLabel="Why are you cancelling?"
                onConfirm={async (reason) => {
                  try {
                    await cancel({ applicationId, reason });
                    toast.success("Application cancelled.");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not cancel.");
                  }
                }}
              />
            )}
          </>
        }
      />

      {(application.status === "documents_pending" ||
        application.status === "additional_documents_requested") && (
        <div className="rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-warning">
          {config.description}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ApplicationStatusBadge status={application.status} audience="customer" />
        <PaymentStatusBadge status={application.paymentStatus} />
        <span className="text-xs text-muted-foreground">
          Submitted {application.submittedAt ? formatDate(application.submittedAt) : "—"}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Trip details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Destination" value={application.destinationName} />
              <Field label="Visa service" value={application.visaProductName} />
              <Field label="Travellers" value={String(application.travellerCount)} />
              <Field
                label="Travel dates"
                value={
                  application.intendedArrivalDate || application.intendedDepartureDate
                    ? `${formatDate(application.intendedArrivalDate)} – ${formatDate(application.intendedDepartureDate)}`
                    : "Not provided"
                }
              />
              <Field label="Departure country" value={application.departureCountry ?? "Not provided"} />
              <Field label="Travel purpose" value={application.travelPurpose ?? "Not provided"} />
              <Field
                label="Previous visa rejection"
                value={
                  application.hasPreviousVisaRejection === undefined
                    ? "Not provided"
                    : application.hasPreviousVisaRejection
                      ? "Yes"
                      : "No"
                }
              />
              <Field label="Contact phone" value={application.customerPhone ?? "Not provided"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Travellers</CardTitle>
            </CardHeader>
            <CardContent>
              {applicants.length === 0 ? (
                <EmptyState compact title="No travellers added" description="Traveller details were not saved on this application." />
              ) : (
                <div className="space-y-3">
                  {applicants.map((applicant) => (
                    <div key={applicant._id} className="rounded-lg border border-border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{fullName(applicant)}</p>
                        {applicant.isPrimary && (
                          <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-medium text-brand-deep">
                            Primary
                          </span>
                        )}
                      </div>
                      <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                        <p>Passport: {maskPassport(applicant.passportNumber)}</p>
                        <p>Nationality: {applicant.nationality ?? "—"}</p>
                        <p>Date of birth: {formatDate(applicant.dateOfBirth)}</p>
                        <p>Passport expires: {formatDate(applicant.passportExpiryDate)}</p>
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
                {application.documentsApprovedCount}/{application.documentsRequiredCount} approved
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              {documentRequests.filter((request) => request.status === "open").length > 0 && (
                <div className="rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-warning">
                  <p className="font-medium">The team has requested more documents</p>
                  <ul className="mt-1 list-inside list-disc">
                    {documentRequests
                      .filter((request) => request.status === "open")
                      .map((request) => (
                        <li key={request._id}>{request.label} — {request.reason}</li>
                      ))}
                  </ul>
                </div>
              )}

              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((document) => (
                    <div key={document._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
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
                          onClick={() => openDocument(document._id)}
                          disabled={downloadingId === document._id}
                        >
                          {downloadingId === document._id ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Download className="size-3.5" aria-hidden />
                          )}
                          View
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {config.customerCanUpload && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-2 text-sm font-medium">Upload a document</p>
                    <FileDropzone
                      uploads={uploader.uploads}
                      onRemove={uploader.removeUpload}
                      disabled={uploader.isUploading}
                      onFiles={(files) => {
                        const file = files[0];
                        if (!file) return;
                        const key = "other";
                        const definition = DOCUMENT_TYPE_MAP[key];
                        void uploader.upload(file, {
                          documentKey: key,
                          label: definition?.label ?? "Other document",
                          constraints: {
                            allowedMimeTypes: definition?.allowedMimeTypes,
                            maxSizeBytes: definition?.maxSizeBytes,
                          },
                        });
                      }}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Use the document checklist from the team for specific requirements. Uploads appear here immediately.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusTimeline
                currentStatus={application.status}
                history={timeline}
                audience="customer"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Government fee" value={formatMoney(application.pricing.governmentFee, application.pricing.currency)} />
              <Row label="Service fee" value={formatMoney(application.pricing.serviceFee, application.pricing.currency)} />
              {application.pricing.additionalCharges > 0 && (
                <Row label="Additional charges" value={formatMoney(application.pricing.additionalCharges, application.pricing.currency)} />
              )}
              {application.pricing.discountAmount > 0 && (
                <Row label="Discount" value={`− ${formatMoney(application.pricing.discountAmount, application.pricing.currency)}`} />
              )}
              <Row label={`Tax (${application.pricing.taxPercent}%)`} value={formatMoney(application.pricing.taxAmount, application.pricing.currency)} />
              <Separator />
              <Row label="Total" value={formatMoney(application.pricing.total, application.pricing.currency)} strong />
              <Row label="Payment status" value={<PaymentStatusBadge status={application.paymentStatus} />} />
              {requiresPayment && (
                <Button asChild className="mt-2 w-full">
                  <Link href={`/checkout/${application._id}`}>
                    <CreditCard className="size-4" aria-hidden />
                    Pay now
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payment records yet.</p>
              ) : (
                <div className="space-y-3">
                  {payments.map((payment) => (
                    <div key={payment._id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{formatMoney(payment.amount, payment.currency)}</p>
                        <PaymentRecordStatusBadge status={payment.status} size="sm" />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {payment.receiptNumber} · {formatDateTime(payment.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Need help?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Contact the VisaDrive team about this application.</p>
              <Button asChild variant="outline" className="w-full">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Hi VisaDrive, I need help with application ${application.referenceId}.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="size-4" aria-hidden />
                  Chat on WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard/notifications">
                  <FileText className="size-4" aria-hidden />
                  View notifications
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
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
    <div className={strong ? "flex items-center justify-between font-semibold" : "flex items-center justify-between"}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
