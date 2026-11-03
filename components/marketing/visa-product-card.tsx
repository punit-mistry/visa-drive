"use client";

import Link from "next/link";
import { ArrowUpRight, TriangleAlert } from "lucide-react";

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
 * One bookable visa, set as a catalogue entry rather than a product tile.
 *
 * The serif name leads, a hairline-ruled spec sheet follows, and the price
 * closes the card in the same numeral face the rest of the publication uses
 * for figures. Each spec row prints only when the catalogue holds a real
 * value for it, and a product whose fees have not been verified carries the
 * "Sample data" badge beside its price — the figure most likely to be
 * mistaken for official.
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

  const specs: Array<{ label: string; value: string }> = [];
  if (processing) specs.push({ label: "Processing", value: processing });
  if (entry && entry !== ENTRY_TYPE_LABELS.not_applicable) {
    specs.push({ label: "Entry", value: entry });
  }
  if (typeof product.validityDays === "number" && product.validityDays > 0) {
    specs.push({ label: "Validity", value: `${product.validityDays} days` });
  }
  if (typeof product.maxStayDays === "number" && product.maxStayDays > 0) {
    specs.push({ label: "Stay up to", value: `${product.maxStayDays} days` });
  }

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-all duration-500 ease-out lg:p-7",
        "hover:-translate-y-0.5 hover:border-foreground/25 hover:elev-lg",
        // Hover must never be the only cue: keyboard focus lights the whole
        // card, not just the link text inside it.
        "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-paper",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-eyebrow flex items-center gap-2.5">
          {categoryLabel(product.category)}
          {product.visaType && (
            <>
              <span aria-hidden className="size-1 rounded-full bg-brand" />
              {product.visaType}
            </>
          )}
        </p>
        {product.promoLabel && promoActive && (
          <span className="rounded-full border border-success/25 bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
            {product.promoLabel}
          </span>
        )}
      </div>

      <h3 className="display-md mt-5 line-clamp-3 text-balance text-foreground">
        <Link
          href={`/destinations/${product.destinationSlug}/${product.slug}`}
          className="outline-none after:absolute after:inset-0 after:content-['']"
        >
          {product.name}
        </Link>
      </h3>

      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
        {product.shortDescription}
      </p>

      {specs.length > 0 && (
        <dl className="mt-6 divide-y divide-border border-y border-border text-sm">
          {specs.map((spec) => (
            <div
              key={spec.label}
              className="flex items-baseline justify-between gap-4 py-2.5"
            >
              <dt className="text-muted-foreground">{spec.label}</dt>
              <dd className="text-right font-medium text-foreground">
                {spec.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {meetsTravelDate === false && processing && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Your travel date is sooner than the processing window recorded for this
          visa. We can still look at it with you.
        </p>
      )}

      <div className="mt-auto flex items-end justify-between gap-4 pt-6">
        <div className="min-w-0">
          {price !== null ? (
            <>
              <p className="text-eyebrow">From</p>
              <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5">
                <span className="numeral text-3xl leading-none text-foreground">
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
                <DemoContentBadge className="relative z-10 mt-2.5" />
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

        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-all duration-500 group-hover:border-brand group-hover:bg-brand group-hover:text-brand-foreground"
        >
          <ArrowUpRight className="size-4 transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </span>
      </div>
    </article>
  );
}
