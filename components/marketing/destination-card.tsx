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
import { formatMoney } from "@/lib/helpers/pricing";
import { cn } from "@/lib/utils";

export interface DestinationCardData {
  _id: string;
  slug: string;
  name: string;
  countryCode: string;
  flagEmoji: string;
  region?: string;
  tagline?: string;
  summary: string;
  cardImageUrl?: string;
  currency: string;
  productCount: number;
  startingPrice: number | null;
}

/**
 * One destination, as a travel poster.
 *
 * The earlier version put a photo on top of a four-row spec table — the most
 * generic card layout there is, and it read as a data dump rather than a
 * place anyone wanted to go. This one is portrait and full-bleed, the way a
 * travel poster is, with the facts laid over the image in a hierarchy: the
 * country first, then the one number people actually compare on (the price),
 * then everything else.
 *
 * The rotated stamp in the corner is the same mark the hero passport presses,
 * which is what stops the grid looking like stock components — nobody else's
 * destination card carries it.
 *
 * Every fact is still rendered only when the catalogue supplies it, so an
 * unconfigured field disappears instead of showing a placeholder.
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

  const visibleCategories = categories.slice(0, 2);
  const extraCategories = categories.length - visibleCategories.length;

  // The secondary line under the price: whichever of these the catalogue
  // knows about, joined by a middot. Never a placeholder.
  const meta = [
    processing,
    validity ? `${validity} validity` : null,
    destination.productCount > 0
      ? `${destination.productCount} visa ${destination.productCount === 1 ? "type" : "types"}`
      : null,
  ].filter(Boolean) as string[];

  return (
    <article
      className={cn(
        "group relative isolate flex min-h-[27rem] flex-col overflow-hidden rounded-3xl bg-ink",
        "transition-all duration-300 ease-out hover:-translate-y-1 hover:elev-xl",
        // The research is unanimous that hover must not be the only cue, so
        // keyboard focus lights the whole card, not just the link text.
        "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background",
        className,
      )}
    >
      <CountryImage
        src={destination.cardImageUrl}
        countryCode={destination.countryCode}
        flagEmoji={destination.flagEmoji}
        name={destination.name}
        priority={priority}
        fallbackTone="dark"
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
        className="absolute inset-0 h-full w-full"
      />

      {/* Two stops rather than one, so the type sits on near-solid ink while
          the top of the photo stays untouched. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 via-40% to-ink/5 transition-opacity duration-300 group-hover:from-ink group-hover:via-ink/75"
      />

      {/* ------------------------------ top row ---------------------------- */}
      <div className="relative flex items-start justify-between gap-3 p-5">
        {hasDemoContent ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-ink/50 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-warning" aria-hidden />
            Sample data
          </span>
        ) : (
          <span />
        )}

        <StampMark code={destination.countryCode} />
      </div>

      {/* ------------------------------ content ---------------------------- */}
      <div className="relative mt-auto p-5 pt-10">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
          <span className="text-sm leading-none" aria-hidden>
            {destination.flagEmoji}
          </span>
          {destination.region ?? "Visa services"}
        </p>

        <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-white">
          <Link
            href={`/destinations/${destination.slug}`}
            className="outline-none after:absolute after:inset-0 after:content-['']"
          >
            {destination.name}
          </Link>
        </h3>

        {(destination.tagline ?? destination.summary) && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-white/65">
            {destination.tagline ?? destination.summary}
          </p>
        )}

        {visibleCategories.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {visibleCategories.map((category) => (
              <li
                key={category}
                className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm"
              >
                {categoryLabel(category)}
              </li>
            ))}
            {extraCategories > 0 && (
              <li className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/60">
                +{extraCategories}
              </li>
            )}
          </ul>
        )}

        <div className="mt-5 flex items-end justify-between gap-4 border-t border-white/15 pt-4">
          <div className="min-w-0">
            {price !== null ? (
              <>
                <p className="text-[11px] uppercase tracking-[0.12em] text-white/50">
                  From
                </p>
                <p className="text-xl font-semibold tabular-nums tracking-tight text-white">
                  {formatMoney(price, destination.currency, "en-IN", {
                    hideDecimals: true,
                  })}
                </p>
              </>
            ) : (
              <p className="text-sm font-medium text-white/80">
                Talk to us for a quote
              </p>
            )}
            {meta.length > 0 && (
              <p className="mt-1 truncate text-xs text-white/55">
                {meta.join(" · ")}
              </p>
            )}
          </div>

          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-sm transition-all duration-300 group-hover:border-white/40 group-hover:bg-brand group-hover:text-brand-foreground">
            <ArrowRight
              className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
              aria-hidden
            />
            <span className="sr-only">Explore {destination.name} visas</span>
          </span>
        </div>
      </div>
    </article>
  );
}

/**
 * The corner stamp. Deliberately the same construction as the hero passport's
 * — circular double rule, mono caps — so the two surfaces read as one brand
 * rather than two component libraries.
 */
function StampMark({ code }: { code: string }) {
  return (
    <span
      aria-hidden
      className="flex size-14 shrink-0 -rotate-6 flex-col items-center justify-center rounded-full border-2 border-white/35 text-white/70 transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-105"
    >
      <span className="font-mono text-[6px] font-bold uppercase tracking-[0.12em] opacity-80">
        Visa
      </span>
      <span className="font-mono text-base font-bold leading-none tracking-[0.04em]">
        {code}
      </span>
      <span className="font-mono text-[5px] uppercase tracking-[0.14em] opacity-70">
        VisaDrive
      </span>
    </span>
  );
}
