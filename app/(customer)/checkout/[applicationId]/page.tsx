"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  MessageCircle,
  ServerCog,
  ShieldCheck,
  Smartphone,
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
import { friendlyError } from "@/lib/helpers/error-messages";

/**
 * Checkout.
 *
 * The amount is the first thing on the page and the last thing before the
 * button, because that is the only number the customer is being asked to
 * agree to. Every figure here comes from the frozen pricing snapshot on the
 * application; the server recomputes it again when it creates the order, so
 * nothing on this screen can change what is actually charged.
 */

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

const ASSURANCES = [
  {
    icon: ServerCog,
    title: "Verified on our server",
    body: "The amount and the signature are checked server-side before your application is marked paid.",
  },
  {
    icon: Lock,
    title: "We never see your card",
    body: "Card, UPI and bank details are handled entirely by Razorpay. Nothing is stored by VisaDrive.",
  },
  {
    icon: BadgeCheck,
    title: "A receipt, straight away",
    body: "Your receipt appears under Payments the moment the payment clears.",
  },
];

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
            {
              label: application.referenceId,
              href: `/dashboard/applications/${applicationId}`,
            },
            { label: "Checkout" },
          ]}
        />
        <ErrorState
          title="Finish your application first"
          description="Payment becomes available once the application has been submitted. Your draft is saved and waiting."
        />
        <Button asChild>
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
        toast.error("The payment did not go through. No money has been taken.");
        return;
      }

      // Razorpay has said the payment went through, so a failure from here on
      // must never read as "the payment failed" or invite a second attempt.
      const notConfirmed =
        "We could not confirm this payment yet. If money has left your account, contact support with your reference number.";
      let verified = false;
      try {
        const verification = await verifyPayment({
          razorpayOrderId: outcome.response.razorpay_order_id,
          razorpayPaymentId: outcome.response.razorpay_payment_id,
          razorpaySignature: outcome.response.razorpay_signature,
        });
        verified = verification.verified;
      } catch {
        toast.error(notConfirmed);
        return;
      }

      if (verified) {
        setPaid(true);
        toast.success("Payment received. Your application is now being processed.");
        router.push(`/dashboard/applications/${applicationId}`);
      } else {
        toast.error(notConfirmed);
      }
    } catch (error) {
      if (errorCode(error) === "PAYMENT_NOT_CONFIGURED") {
        setNotConfigured(true);
        toast.info("Online payment is not available right now.");
      } else {
        toast.error(
          friendlyError(error, "Could not start the payment. Please try again."),
        );
      }
    } finally {
      setPaying(false);
    }
  }

  const total = formatMoney(application.pricing.total, application.pricing.currency);

  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      <PageHeader
        title="Complete your payment"
        description={`${application.referenceId} · ${application.visaProductName} · ${application.destinationName}`}
        breadcrumbs={[
          { label: "Applications", href: "/dashboard/applications" },
          {
            label: application.referenceId,
            href: `/dashboard/applications/${applicationId}`,
          },
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
        <Card className="animate-fade-up">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="animate-success-pop flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="size-7" aria-hidden />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-semibold">
                {application.paymentStatus === "not_required"
                  ? "No payment is required"
                  : "This application is already paid"}
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span>Payment status</span>
                <PaymentStatusBadge status={application.paymentStatus} size="sm" />
              </div>
            </div>
            <Button asChild>
              <Link href={`/dashboard/applications/${applicationId}`}>
                View application
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* ------------------------------ pay side ------------------------- */}
          <div className="space-y-6">
            <Card className="animate-fade-up gap-0 overflow-hidden py-0">
              <div className="border-b border-border bg-surface px-6 py-5">
                <p className="text-eyebrow">Amount due</p>
                <p className="mt-1.5 text-4xl font-semibold tracking-tight tabular-nums">
                  {total}
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  For {application.travellerCount}{" "}
                  {application.travellerCount === 1 ? "traveller" : "travellers"} ·{" "}
                  {application.visaProductName}
                </p>
              </div>

              <div className="space-y-5 p-6">
                <div className="flex items-start gap-3.5 rounded-xl border border-primary/25 bg-brand-tint p-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background elev-sm">
                    <CreditCard className="size-5 text-brand" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Pay securely with Razorpay</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Smartphone className="size-3" aria-hidden />
                        UPI
                      </span>
                      <span aria-hidden>·</span>
                      <span>Cards</span>
                      <span aria-hidden>·</span>
                      <span>Net banking</span>
                      <span aria-hidden>·</span>
                      <span>Wallets</span>
                    </p>
                  </div>
                </div>

                {notConfigured && (
                  <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                    <div>
                      <p className="font-medium text-foreground">
                        Online payment is not configured yet
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        Your application is saved and the VisaDrive team will send you
                        payment instructions. No money has been taken.
                      </p>
                      <Button asChild variant="outline" size="sm" className="mt-3 bg-background">
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
                  className="hidden w-full lg:inline-flex"
                  size="lg"
                  onClick={handlePay}
                  disabled={paying}
                >
                  {paying ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Lock className="size-4" aria-hidden />
                  )}
                  {paying ? "Opening secure checkout…" : `Pay ${total}`}
                </Button>

                <p className="hidden items-center justify-center gap-1.5 text-xs text-muted-foreground lg:flex">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  Verified server-side. We never store your card details.
                </p>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Why this is safe</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-3">
                {ASSURANCES.map((item) => (
                  <div key={item.title}>
                    <item.icon className="size-4 text-brand" aria-hidden />
                    <p className="mt-2.5 text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {item.body}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">What you are paying for</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                <DetailField label="Reference" value={application.referenceId} />
                <DetailField
                  label="Travellers"
                  value={String(application.travellerCount)}
                />
                <DetailField label="Destination" value={application.destinationName} />
                <DetailField label="Visa service" value={application.visaProductName} />
                <DetailField
                  label="Travel dates"
                  value={
                    application.intendedArrivalDate || application.intendedDepartureDate
                      ? `${formatDate(application.intendedArrivalDate)} – ${formatDate(
                          application.intendedDepartureDate,
                        )}`
                      : "Not provided"
                  }
                />
                <DetailField
                  label="Submitted"
                  value={formatDate(application.submittedAt)}
                />
              </CardContent>
            </Card>
          </div>

          {/* ---------------------------- summary rail ----------------------- */}
          <div>
            <Card className="lg:sticky lg:top-24">
              <CardHeader>
                <CardTitle className="text-base">Order summary</CardTitle>
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
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">Total due</span>
                  <span className="text-xl font-semibold tabular-nums tracking-tight">
                    {total}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-muted-foreground">Payment status</span>
                  <PaymentStatusBadge status={application.paymentStatus} />
                </div>
                <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                  The amount is recomputed from the catalogue on our server when the
                  order is created. The total shown here is the amount that will be
                  charged.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Phones: the action follows the customer down the page instead of
              sitting above a scroll they have to come back from. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 backdrop-blur-sm lg:hidden">
            <div className="container-page flex items-center gap-3 px-0">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Total due</p>
                <p className="truncate text-base font-semibold tabular-nums">{total}</p>
              </div>
              <Button size="lg" onClick={handlePay} disabled={paying} className="shrink-0">
                {paying ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Lock className="size-4" aria-hidden />
                )}
                {paying ? "Opening…" : "Pay now"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-eyebrow">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
