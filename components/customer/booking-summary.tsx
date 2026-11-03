"use client";

import { Clock, Info, Users } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { DemoContentBadge } from "@/components/shared/status-badge";
import { countryFlag } from "@/lib/constants/countries";
import { formatMoney, formatProcessingTime } from "@/lib/helpers/pricing";
import type { PriceBreakdown } from "@/lib/helpers/pricing";
import { cn } from "@/lib/utils";

/**
 * The rail that travels with the booking wizard.
 *
 * It answers the two questions a customer re-asks at every step — "what am I
 * buying?" and "what will it cost?" — so neither is ever more than a glance
 * away. The figures come from the same `computePricing` the server runs, and
 * the copy says plainly that the server re-checks them at submit.
 */
export function BookingSummary({
  visaProductName,
  destinationName,
  destinationCountryCode,
  visaType,
  travellerCount,
  pricing,
  processingTimeMinDays,
  processingTimeMaxDays,
  processingTimeNote,
  isDemoContent,
  footnote,
  className,
}: {
  visaProductName: string;
  destinationName: string;
  destinationCountryCode?: string;
  visaType?: string;
  travellerCount: number;
  pricing: PriceBreakdown;
  processingTimeMinDays?: number | null;
  processingTimeMaxDays?: number | null;
  processingTimeNote?: string | null;
  isDemoContent?: boolean;
  footnote?: string;
  className?: string;
}) {
  const processing = formatProcessingTime(
    processingTimeMinDays,
    processingTimeMaxDays,
    processingTimeNote,
  );
  const flag = countryFlag(destinationCountryCode);

  return (
    <aside
      aria-label="Booking summary"
      className={cn(
        "rounded-2xl border border-border bg-card elev-sm",
        className,
      )}
    >
      <div className="flex items-start gap-3 p-5">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-xl leading-none"
          aria-hidden
        >
          {flag || "🛫"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-eyebrow">{destinationName}</p>
          <p className="mt-1 text-sm font-semibold leading-snug text-foreground">
            {visaProductName}
          </p>
          {visaType && (
            <p className="mt-0.5 text-xs text-muted-foreground">{visaType}</p>
          )}
        </div>
      </div>

      <div className="space-y-2.5 px-5 pb-4 text-xs text-muted-foreground">
        <p className="flex items-center gap-2">
          <Users className="size-3.5 shrink-0" aria-hidden />
          {travellerCount} {travellerCount === 1 ? "traveller" : "travellers"}
        </p>
        {processing && (
          <p className="flex items-center gap-2">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            {processing}
          </p>
        )}
        {isDemoContent && <DemoContentBadge />}
      </div>

      <Separator />

      <dl className="space-y-2.5 p-5 text-sm">
        <Line
          label="Government fee"
          value={formatMoney(pricing.governmentFee, pricing.currency)}
        />
        <Line
          label="Service fee"
          value={formatMoney(pricing.serviceFee, pricing.currency)}
        />
        {pricing.additionalCharges > 0 && (
          <Line
            label="Additional charges"
            value={formatMoney(pricing.additionalCharges, pricing.currency)}
          />
        )}
        {pricing.discountAmount > 0 && (
          <Line
            label="Discount"
            value={`− ${formatMoney(pricing.discountAmount, pricing.currency)}`}
            tone="success"
          />
        )}
        {pricing.taxPercent > 0 && (
          <Line
            label={`Tax (${pricing.taxPercent}%)`}
            value={formatMoney(pricing.taxAmount, pricing.currency)}
          />
        )}

        <Separator className="my-1" />

        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm font-medium text-foreground">Total</dt>
          <dd className="text-xl font-semibold tabular-nums tracking-tight text-foreground">
            {formatMoney(pricing.total, pricing.currency)}
          </dd>
        </div>
      </dl>

      {footnote && (
        <p className="flex items-start gap-2 border-t border-border px-5 py-3.5 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          {footnote}
        </p>
      )}
    </aside>
  );
}

function Line({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          tone === "success" ? "text-success" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
