"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Globe, Search, SearchX } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type {
  CatalogueProduct,
  PublishedDestination,
} from "@/components/marketing/catalogue";
import { DestinationCard } from "@/components/marketing/destination-card";
import { FadeIn, Reveal, RevealItem } from "@/components/marketing/reveal";
import { useDestinationProducts } from "@/components/marketing/use-destination-products";
import { VisaDiscoveryForm } from "@/components/marketing/visa-discovery-form";
import { VisaProductCard } from "@/components/marketing/visa-product-card";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { countryName, TRAVEL_PURPOSES } from "@/lib/constants/countries";
import { formatDate, titleCase } from "@/lib/helpers/format";
import { cn } from "@/lib/utils";

interface DiscoveryResult extends CatalogueProduct {
  meetsTravelDate: boolean | null;
  destination: {
    _id: string;
    slug: string;
    name: string;
    flagEmoji: string;
    countryCode: string;
  };
}

/**
 * The destinations surface, in two modes.
 *
 * With discovery parameters in the URL it renders the result of
 * `visaProducts.searchForDiscovery` for that search; without them it renders
 * the full published catalogue. Keeping the search in the URL means a result
 * set is shareable and the back button does the obvious thing.
 *
 * Both modes open on the same dark masthead and resolve onto the warm paper
 * ground the homepage uses, so the catalogue reads as a continuation of the
 * homepage's destinations plates rather than a separate template.
 */
export function DestinationsBrowser() {
  const params = useSearchParams();

  const toCountry = params.get("to") ?? undefined;
  const fromCountry = params.get("from") ?? undefined;
  const purpose = params.get("purpose") ?? undefined;
  const dateParam = params.get("date") ?? undefined;

  const travelDate = useMemo(() => {
    if (!dateParam) return undefined;
    const parsed = Date.parse(`${dateParam}T00:00:00`);
    return Number.isNaN(parsed) ? undefined : parsed;
  }, [dateParam]);

  const isSearch = Boolean(toCountry);

  return isSearch ? (
    <DiscoveryResults
      toCountry={toCountry!}
      fromCountry={fromCountry}
      purpose={purpose}
      travelDate={travelDate}
    />
  ) : (
    <DestinationGrid />
  );
}

/* -------------------------------------------------------------------------- */
/*                               search results                               */
/* -------------------------------------------------------------------------- */

function DiscoveryResults({
  toCountry,
  fromCountry,
  purpose,
  travelDate,
}: {
  toCountry: string;
  fromCountry?: string;
  purpose?: string;
  travelDate?: number;
}) {
  const search = useQuery(api.visaProducts.searchForDiscovery, {
    toCountry,
    ...(fromCountry ? { fromCountry } : {}),
    ...(purpose ? { purpose } : {}),
    ...(travelDate ? { travelDate } : {}),
  }) as
    | {
        matchedDestinations: number;
        resolvedCategory: string | null;
        results: DiscoveryResult[];
      }
    | undefined;

  const grouped = useMemo(() => {
    if (!search) return [];
    const map = new Map<string, { destination: DiscoveryResult["destination"]; products: DiscoveryResult[] }>();
    for (const result of search.results) {
      const key = result.destination.slug;
      if (!map.has(key)) {
        map.set(key, { destination: result.destination, products: [] });
      }
      map.get(key)!.products.push(result);
    }
    return [...map.values()];
  }, [search]);

  // Prefer the destination's real name over the slug once the query resolves,
  // so the heading reads "Visas for United Arab Emirates", not the URL.
  const headingName =
    grouped[0]?.destination.name ?? titleCase(toCountry.replace(/-/g, " "));

  const purposeLabel = TRAVEL_PURPOSES.find((p) => p.value === purpose)?.label;

  return (
    <>
      <section className="bg-ink-black">
        <div className="container-wide pb-14 pt-10 sm:pb-16 sm:pt-14 lg:pb-24 lg:pt-20">
          <FadeIn>
            <p className="text-eyebrow-dark">Your search</p>
            <h1 className="display-xl mt-4 max-w-4xl text-paper">
              Visas for {headingName}
            </h1>
            <p className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-white/55 sm:text-base">
              {fromCountry && <span>Travelling from {countryName(fromCountry)}</span>}
              {travelDate && (
                <>
                  <span aria-hidden>·</span>
                  <span>Around {formatDate(travelDate)}</span>
                </>
              )}
              {purposeLabel && (
                <>
                  <span aria-hidden>·</span>
                  <span>{purposeLabel}</span>
                </>
              )}
            </p>
          </FadeIn>

          <FadeIn delay={0.12} className="mt-10 lg:mt-12">
            <VisaDiscoveryForm
              variant="compact"
              defaultValues={{
                fromCountry: fromCountry ?? "IN",
                toCountry,
                purpose: purpose as never,
                travelDate,
              }}
            />
          </FadeIn>
        </div>
      </section>

      <section className="bg-paper py-20 sm:py-24 lg:py-32">
        <div className="container-wide">
          {search === undefined ? (
            <ProductGridSkeleton />
          ) : search.results.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No visas matched that search"
              description="We may still be able to help — the catalogue only lists what we have published so far."
              action={
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button asChild>
                    <Link href="/contact">Ask us about this trip</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/destinations">Browse all destinations</Link>
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="space-y-16 lg:space-y-24">
              {grouped.map((group, groupIndex) => (
                <div
                  key={group.destination.slug}
                  className={cn(
                    groupIndex > 0 && "border-t border-border pt-16 lg:pt-24",
                  )}
                >
                  <Reveal className="flex flex-wrap items-end justify-between gap-5">
                    <div>
                      <p className="text-eyebrow">
                        {group.products.length}{" "}
                        {group.products.length === 1 ? "visa" : "visas"}
                      </p>
                      <h2 className="display-lg mt-3 flex items-center gap-3 text-foreground">
                        <span aria-hidden className="text-[0.8em] leading-none">
                          {group.destination.flagEmoji}
                        </span>
                        {group.destination.name}
                      </h2>
                    </div>
                    <Button asChild variant="outline">
                      <Link href={`/destinations/${group.destination.slug}`}>
                        About {group.destination.name}
                      </Link>
                    </Button>
                  </Reveal>

                  <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                    {group.products.map((product, index) => (
                      <RevealItem
                        as="li"
                        key={product._id}
                        index={index}
                        className="h-full"
                      >
                        <VisaProductCard
                          product={product}
                          meetsTravelDate={product.meetsTravelDate}
                        />
                      </RevealItem>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                               full catalogue                               */
/* -------------------------------------------------------------------------- */

/**
 * Which cells run two columns wide on the desktop grid. Ten positions repeat:
 * a wide plate opens the first row, and the next one lands on the right of the
 * third row, so the eye is walked across the page instead of down a column.
 * Rows with a wide plate hold two items; every other row holds three, so the
 * pattern never leaves a gap in a full catalogue.
 */
function isWideCell(index: number): boolean {
  const slot = index % 10;
  return slot === 0 || slot === 6;
}

function DestinationGrid() {
  const destinations = useQuery(api.destinations.listPublished, {}) as
    | PublishedDestination[]
    | undefined;
  const { byDestination } = useDestinationProducts();
  const [filter, setFilter] = useState("");
  const [region, setRegion] = useState<string>("all");

  // Region chips come from the catalogue itself, so a region only appears
  // once a published destination actually belongs to it.
  const regions = useMemo(() => {
    if (!destinations) return [];
    return [...new Set(destinations.map((d) => d.region).filter(Boolean))].sort() as string[];
  }, [destinations]);

  const visible = useMemo(() => {
    if (!destinations) return undefined;
    const term = filter.trim().toLowerCase();
    return destinations.filter((destination) => {
      if (region !== "all" && destination.region !== region) return false;
      if (!term) return true;
      return (
        destination.name.toLowerCase().includes(term) ||
        destination.countryCode.toLowerCase() === term ||
        (destination.region ?? "").toLowerCase().includes(term)
      );
    });
  }, [destinations, filter, region]);

  const hasActiveFilter = filter.trim().length > 0 || region !== "all";

  return (
    <>
      <section className="bg-ink-black">
        <div className="container-wide pb-14 pt-10 sm:pb-16 sm:pt-14 lg:pb-24 lg:pt-20">
          <FadeIn className="grid gap-10 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <p className="text-eyebrow-dark">Destinations</p>
              <h1 className="display-xl mt-4 text-paper">
                Where we can
                <br />
                help you go
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-white/55 sm:text-lg">
                Every country below is one we handle end to end. Open a
                destination to see the visa types available and what each one
                involves.
              </p>
            </div>

            {destinations !== undefined && destinations.length > 0 && (
              <div className="lg:col-span-4 lg:text-right">
                <p
                  aria-hidden
                  className="numeral text-7xl leading-none text-paper sm:text-8xl"
                >
                  {String(destinations.length).padStart(2, "0")}
                </p>
                <p className="mt-3 text-eyebrow-dark">
                  {destinations.length === 1
                    ? "Destination published"
                    : "Destinations published"}
                </p>
              </div>
            )}
          </FadeIn>

          <FadeIn delay={0.12} className="mt-12 lg:mt-14">
            <div className="max-w-md">
              <label htmlFor="destination-filter" className="sr-only">
                Filter destinations
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/55"
                  aria-hidden
                />
                <Input
                  id="destination-filter"
                  type="search"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Search a country"
                  className="h-12 rounded-full border-white/20 bg-white/5 pl-11 text-paper shadow-none placeholder:text-white/55 hover:border-white/35 focus-visible:border-white/50 focus-visible:ring-white/20 dark:bg-white/5"
                />
              </div>
            </div>

            {regions.length > 1 && (
              <div
                className="mt-5 flex flex-wrap gap-2"
                role="group"
                aria-label="Filter by region"
              >
                {["all", ...regions].map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={region === option}
                    onClick={() => setRegion(option)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-medium outline-none transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink-black",
                      region === option
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-white/20 text-white/70 hover:border-white/45 hover:text-white",
                    )}
                  >
                    {option === "all" ? "All destinations" : option}
                  </button>
                ))}
              </div>
            )}
          </FadeIn>
        </div>
      </section>

      <section className="bg-paper py-20 sm:py-24 lg:py-32">
        <div className="container-wide">
          {visible === undefined ? (
            <DestinationGridSkeleton />
          ) : visible.length === 0 ? (
            <Reveal>
              <EmptyState
                icon={destinations && destinations.length > 0 ? SearchX : Globe}
                title={
                  destinations && destinations.length > 0
                    ? "No destination matched that filter"
                    : "Destinations are being added"
                }
                description={
                  destinations && destinations.length > 0
                    ? "Try a different country name, or tell us where you are going."
                    : "Our visa catalogue is not published yet. Tell us where you are travelling and we will come back to you with the options."
                }
                action={
                  hasActiveFilter ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFilter("");
                        setRegion("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button asChild>
                      <Link href="/contact">Talk to an expert</Link>
                    </Button>
                  )
                }
              />
            </Reveal>
          ) : (
            <>
              <p className="sr-only" role="status" aria-live="polite">
                {visible.length} {visible.length === 1 ? "destination" : "destinations"}{" "}
                shown
              </p>
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                {visible.map((destination, index) => {
                  const wide = isWideCell(index);
                  return (
                    <RevealItem
                      as="li"
                      key={destination._id}
                      index={index}
                      className={cn("h-full", wide && "lg:col-span-2")}
                    >
                      <DestinationCard
                        className={cn("h-full", wide && "lg:min-h-[34rem]")}
                        priority={index < 3}
                        destination={{
                          _id: destination._id,
                          slug: destination.slug,
                          name: destination.name,
                          countryCode: destination.countryCode,
                          flagEmoji: destination.flagEmoji,
                          region: destination.region,
                          tagline: destination.tagline,
                          summary: destination.summary,
                          cardImageUrl: destination.cardImageUrl,
                          currency: destination.currency,
                          productCount: destination.productCount,
                          startingPrice: destination.startingPrice,
                        }}
                        products={byDestination[destination.slug] ?? []}
                      />
                    </RevealItem>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  skeletons                                 */
/* -------------------------------------------------------------------------- */

function DestinationGridSkeleton() {
  return (
    <div
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6"
      aria-busy
      aria-label="Loading destinations"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "min-h-[27rem] rounded-3xl",
            i === 0 && "lg:col-span-2 lg:min-h-[34rem]",
          )}
        />
      ))}
    </div>
  );
}

function ProductGridSkeleton() {
  return (
    <div
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6"
      aria-busy
      aria-label="Loading visas"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="min-h-[22rem] rounded-2xl" />
      ))}
    </div>
  );
}
