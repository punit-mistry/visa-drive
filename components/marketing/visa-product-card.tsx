"use client";

import Link from "next/link";
import { ArrowRight, Clock, TriangleAlert } from "lucide-react";

import {
  categoryLabel,
  ENTRY_TYPE_LABELS,
  hasActivePromo,
  productPrice,
  productProcessingTime,
  standardPrice,
  type CatalogueProduct,
} from "@/components/marketing/catalogue";
import { DemoContentBadge } from "@/components/shared/status-badge";
import { useNow } from "@/hooks/use-current-date";
import { formatMoney } from "@/lib/helpers/pricing";
import { cn } from "@/lib/utils";

/**
 * One bookable visa.
 *
 * Price, processing time, validity and stay length are each printed only when
 * the catalogue holds a real value for them. A product whose fees have not
 * been verified carries the "Sample data" badge next to its price, which is
 * the figure most likely to be mistaken for official.
 */
export function VisaProductCard({
  product,
  meetsTravelDate,
  className,
}: {
  product: CatalogueProduct;
  meetsTravelDate?: boolean | null;
  className?: string;
}) {
  const now = useNow();

  /**
   * Promo windows depend on the current time, which a prerendered client
   * component cannot read without baking in the build date. Treat unknown
   * time as "no promo": the badge and promotional price appear after mount,
   * so an expired promo can never flash on screen.
   */
  const effectiveNow = now ?? Number.POSITIVE_INFINITY;

  const price = productPrice(product, effectiveNow);
  const standard = standardPrice(product, effectiveNow);
  const processing = productProcessingTime(product);
  const entry = ENTRY_TYPE_LABELS[product.entryType];
  const promoActive = hasActivePromo(product, effectiveNow);

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col rounded-3xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:elev-lg",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {categoryLabel(product.category)}
        </span>
        {product.visaType && (
          <span className="rounded-full border border-brand-soft bg-brand-tint px-2.5 py-1 text-xs font-medium text-brand">
            {product.visaType}
          </span>
        )}
        {product.promoLabel && promoActive && (
            <span className="rounded-full border border-success/25 bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
              {product.promoLabel}
            </span>
          )}
      </div>

      <h3 className="mt-4 text-lg font-semibold">
        <Link
          href={`/destinations/${product.destinationSlug}/${product.slug}`}
          className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-brand"
        >
          {product.name}
        </Link>
      </h3>

      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
        {product.shortDescription}
      </p>

      <dl className="mt-5 space-y-2 text-sm">
        {processing && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Processing time</dt>
            <dd>{processing}</dd>
          </div>
        )}
        {entry && entry !== ENTRY_TYPE_LABELS.not_applicable && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <dt className="sr-only">Entry type</dt>
            <dd>{entry}</dd>
          </div>
        )}
        {typeof product.maxStayDays === "number" && product.maxStayDays > 0 && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <dt className="sr-only">Maximum stay</dt>
            <dd>Stay up to {product.maxStayDays} days</dd>
          </div>
        )}
      </dl>

      {meetsTravelDate === false && processing && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Your travel date is sooner than the processing window recorded for this
          visa. We can still look at it with you.
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-border pt-5">
        <div>
          {price !== null ? (
            <>
              <p className="text-eyebrow">From</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-semibold text-foreground">
                  {formatMoney(price, product.currency, "en-IN", {
                    hideDecimals: true,
                  })}
                </span>
                {standard !== null && (
                  <span className="text-sm text-muted-foreground line-through">
                    {formatMoney(standard, product.currency, "en-IN", {
                      hideDecimals: true,
                    })}
                  </span>
                )}
              </p>
              {product.isDemoContent && (
                <DemoContentBadge className="relative z-10 mt-2" />
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pricing on request
              {product.isDemoContent && (
                <DemoContentBadge className="relative z-10 ml-2" />
              )}
            </p>
          )}
        </div>

        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-brand">
          View details
          <ArrowRight
            className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
            aria-hidden
          />
        </p>
      </div>
    </article>
  );
}
