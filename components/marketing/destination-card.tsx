"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CountryImage } from "@/components/marketing/country-image";
import {
  categoryLabel,
  distinctCategories,
  fastestProcessingTime,
  longestValidity,
  type CatalogueProduct,
} from "@/components/marketing/catalogue";
import { DemoContentBadge } from "@/components/shared/status-badge";
import { formatMoney } from "@/lib/helpers/pricing";
import { cn } from "@/lib/utils";

export interface DestinationCardData {
  _id: string;
  slug: string;
  name: string;
  countryCode: string;
  flagEmoji: string;
  tagline?: string;
  summary: string;
  cardImageUrl?: string;
  currency: string;
  productCount: number;
  startingPrice: number | null;
}

/**
 * One destination, as a search-result style card: photo on top, a flag chip
 * straddling the photo and the body, then the facts a traveller compares
 * destinations on — visa types, validity, fee and processing time.
 *
 * Every row is rendered only when the catalogue actually supplies it, so an
 * unconfigured field disappears rather than showing a placeholder.
 */
export function DestinationCard({
  destination,
  products = [],
  priority = false,
  className,
}: {
  destination: DestinationCardData;
  products?: CatalogueProduct[];
  priority?: boolean;
  className?: string;
}) {
  const categories = distinctCategories(products);
  const processing = fastestProcessingTime(products);
  const validity = longestValidity(products);
  const hasDemoContent = products.some((product) => product.isDemoContent);
  const price =
    typeof destination.startingPrice === "number" && destination.startingPrice > 0
      ? destination.startingPrice
      : null;

  const facts: Array<{ label: string; value: string }> = [];
  if (categories.length > 0) {
    facts.push({
      label: "Type",
      value:
        categories
          .slice(0, 2)
          .map((category) => categoryLabel(category))
          .join(", ") + (categories.length > 2 ? ` +${categories.length - 2}` : ""),
    });
  }
  if (validity) facts.push({ label: "Valid", value: validity });
  if (price !== null) {
    facts.push({
      label: "Fees",
      value: `From ${formatMoney(price, destination.currency, "en-IN", {
        hideDecimals: true,
      })}`,
    });
  }
  if (processing) facts.push({ label: "Processing", value: processing });

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:elev-lg",
        className,
      )}
    >
      <div className="relative">
        <CountryImage
          src={destination.cardImageUrl}
          countryCode={destination.countryCode}
          flagEmoji={destination.flagEmoji}
          name={destination.name}
          priority={priority}
          className="aspect-[16/9] w-full"
        />
        <span
          aria-hidden
          className="absolute -bottom-5 left-5 flex size-11 items-center justify-center rounded-2xl border border-border bg-card text-2xl leading-none elev-md"
        >
          {destination.flagEmoji}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5 pt-7">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold leading-snug">
            <Link
              href={`/destinations/${destination.slug}`}
              className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-brand"
            >
              {destination.name}
            </Link>
          </h3>
          {hasDemoContent && <DemoContentBadge className="relative z-10 shrink-0" />}
        </div>

        {facts.length > 0 ? (
          <dl className="mt-4 divide-y divide-border border-y border-border">
            {facts.map((fact) => (
              <div
                key={fact.label}
                className="flex items-baseline justify-between gap-4 py-2.5 text-sm"
              >
                <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>
                <dd className="text-right font-medium text-foreground">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {destination.tagline ?? destination.summary}
          </p>
        )}

        <p className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium text-brand">
          Explore visas
          <ArrowRight
            className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
            aria-hidden
          />
        </p>
      </div>
    </article>
  );
}
