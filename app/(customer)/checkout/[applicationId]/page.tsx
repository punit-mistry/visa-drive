"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/page-header";
import { PaymentStatusBadge } from "@/components/shared/status-badge";
import { DetailSkeleton, ErrorState } from "@/components/shared/states";
import { openRazorpayCheckout } from "@/lib/payments/razorpay";
import { formatMoney } from "@/lib/helpers/pricing";
import { formatDate } from "@/lib/helpers/format";

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const code = (data as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export default function CheckoutPage() {
  const applicationId = param(useParams().applicationId) as Id<"applications">;
  const router = useRouter();
  const detail = useQuery(api.applications.getMine, { applicationId });
  const createOrder = useAction(api.payments.createRazorpayOrder);
  const verifyPayment = useAction(api.payments.verifyRazorpayPayment);

  const [paying, setPaying] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [paid, setPaid] = useState(false);

  if (detail === undefined) return <DetailSkeleton />;
  if (detail === null) {
    return (
      <ErrorState
        title="Application not found"
        description="This application does not exist or you do not have access to it."
      />
    );
  }

  const { application } = detail;
  const isDraft = application.isDraft;
  const alreadyPaid =
    paid ||
    application.paymentStatus === "paid" ||
    application.paymentStatus === "not_required";

  if (isDraft) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Payment"
          breadcrumbs={[
            { label: "Applications", href: "/dashboard/applications" },
            { label: application.referenceId, href: `/dashboard/applications/${applicationId}` },
            { label: "Checkout" },
          ]}
        />
        <ErrorState
          title="Finish your application first"
          description="Payment becomes available once the application has been submitted. You can pick up your saved draft at any time."
        />
        <Button asChild variant="outline">
          <Link href={`/apply/${applicationId}`}>
            <ArrowLeft className="size-4" aria-hidden />
            Continue application
          </Link>
        </Button>
      </div>
    );
  }

  async function handlePay() {
    setPaying(true);
    setNotConfigured(false);
    try {
      const order = await createOrder({ applicationId });

      const outcome = await openRazorpayCheckout({
        keyId: order.keyId,
        orderId: order.razorpayOrderId,
        amount: order.amount,
        currency: order.currency,
        name: "VisaDrive",
        description: `${order.referenceId} · ${application.visaProductName}`,
        prefill: order.prefill,
        notes: {
          applicationReference: order.referenceId,
          paymentId: order.paymentId,
        },
      });

      if (outcome.status === "dismissed") {
        toast.info("Checkout closed before payment was completed.");
        return;
      }

      if (outcome.status === "failed") {
        toast.error(
          outcome.error.description ||
            "The payment did not go through. No money has been taken.",
        );
        return;
      }

      const verification = await verifyPayment({
        razorpayOrderId: outcome.response.razorpay_order_id,
        razorpayPaymentId: outcome.response.razorpay_payment_id,
        razorpaySignature: outcome.response.razorpay_signature,
      });

      if (verification.verified) {
        setPaid(true);
        toast.success("Payment received. Your application is now being processed.");
        router.push(`/dashboard/applications/${applicationId}`);
      } else {
        toast.error(
          "We could not confirm this payment yet. If money has left your account, contact support with your reference number.",
        );
      }
    } catch (error) {
      if (errorCode(error) === "PAYMENT_NOT_CONFIGURED") {
        setNotConfigured(true);
        toast.info("Online payment is not available right now.");
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not start the payment. Please try again.",
        );
      }
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Complete your payment"
        description={`${application.referenceId} · ${application.visaProductName} · ${application.destinationName}`}
        breadcrumbs={[
          { label: "Applications", href: "/dashboard/applications" },
          { label: application.referenceId, href: `/dashboard/applications/${applicationId}` },
          { label: "Checkout" },
        ]}
        actions={
          <Button asChild variant="outline">
            <Link href={`/dashboard/applications/${applicationId}`}>
              <ArrowLeft className="size-4" aria-hidden />
              Back to application
            </Link>
          </Button>
        }
      />

      {alreadyPaid ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="size-6" aria-hidden />
            </div>
            <div>
              <p className="text-lg font-semibold">
                {application.paymentStatus === "not_required"
                  ? "No payment is required"
                  : "This application is already paid"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Payment status: <PaymentStatusBadge status={application.paymentStatus} size="sm" />
              </p>
            </div>
            <Button asChild>
              <Link href={`/dashboard/applications/${applicationId}`}>
                View application
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Payment method</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background elev-sm">
                    <CreditCard className="size-5 text-brand" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Pay securely with Razorpay</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Cards, UPI, net banking and wallets. The amount is verified on our
                      server before checkout opens.
                    </p>
                  </div>
                </div>

                {notConfigured && (
                  <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft p-4 text-sm text-warning">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <div>
                      <p className="font-medium">Online payment is not configured yet</p>
                      <p className="mt-1">
                        Your application is saved and the VisaDrive team will send you
                        payment instructions. No money has been taken.
                      </p>
                      <Button asChild variant="outline" size="sm" className="mt-3">
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(
                            `Hi VisaDrive, I would like to pay for application ${application.referenceId}.`,
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle className="size-3.5" aria-hidden />
                          Request a payment link
                        </a>
                      </Button>
                    </div>
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handlePay}
                  disabled={paying}
                >
                  {paying ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Lock className="size-4" aria-hidden />
                  )}
                  Pay {formatMoney(application.pricing.total, application.pricing.currency)}
                </Button>

                <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  Verified server-side. We never store your card details.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Application</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                <Field label="Reference" value={application.referenceId} />
                <Field label="Travellers" value={String(application.travellerCount)} />
                <Field label="Destination" value={application.destinationName} />
                <Field label="Visa service" value={application.visaProductName} />
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
                <Field label="Submitted" value={formatDate(application.submittedAt)} />
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader>
                <CardTitle>Order summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
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
                {application.pricing.additionalCharges > 0 && (
                  <Row
                    label="Additional charges"
                    value={formatMoney(
                      application.pricing.additionalCharges,
                      application.pricing.currency,
                    )}
                  />
                )}
                {application.pricing.discountAmount > 0 && (
                  <Row
                    label="Discount"
                    value={`− ${formatMoney(
                      application.pricing.discountAmount,
                      application.pricing.currency,
                    )}`}
                  />
                )}
                <Row
                  label={`Tax (${application.pricing.taxPercent}%)`}
                  value={formatMoney(
                    application.pricing.taxAmount,
                    application.pricing.currency,
                  )}
                />
                <Separator />
                <Row
                  label="Total due"
                  value={formatMoney(
                    application.pricing.total,
                    application.pricing.currency,
                  )}
                  strong
                />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-muted-foreground">Payment status</span>
                  <PaymentStatusBadge status={application.paymentStatus} />
                </div>
                <p className="pt-2 text-xs text-muted-foreground">
                  The amount is recomputed from the catalogue on the server when the
                  order is created. The total shown here is the amount that will be
                  charged.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
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
