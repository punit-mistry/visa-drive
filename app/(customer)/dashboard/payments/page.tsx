"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { CreditCard } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { PaymentRecordStatusBadge } from "@/components/shared/status-badge";
import { EmptyState, ListSkeleton } from "@/components/shared/states";
import { formatDateTime } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";

export default function PaymentsPage() {
  const payments = useQuery(api.payments.listMine, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Every payment and refund recorded against your applications."
      />

      {payments === undefined ? (
        <ListSkeleton rows={5} />
      ) : payments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No payments yet"
          description="Payments for your applications will appear here once they are created."
          action={
            <Button asChild>
              <Link href="/dashboard/applications">View applications</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {payments.map((payment) => (
                <div
                  key={payment._id}
                  className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{payment.receiptNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {payment.applicationId ? (
                        <Link
                          href={`/dashboard/applications/${payment.applicationId}`}
                          className="hover:underline focus-brand"
                        >
                          {payment.notes ?? "View application"}
                        </Link>
                      ) : (
                        "VisaDrive payment"
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(payment.createdAt)}
                      {payment.paidAt ? ` · paid ${formatDateTime(payment.paidAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">
                        {formatMoney(payment.amount, payment.currency)}
                      </p>
                      {payment.refundedAmount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Refunded {formatMoney(payment.refundedAmount, payment.currency)}
                        </p>
                      )}
                    </div>
                    <PaymentRecordStatusBadge status={payment.status} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
