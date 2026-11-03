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
import { Reveal, RevealItem } from "@/components/marketing/reveal";
import { useDestinationProducts } from "@/components/marketing/use-destination-products";
import { VisaDiscoveryForm } from "@/components/marketing/visa-discovery-form";
import { VisaProductCard } from "@/components/marketing/visa-product-card";
import { CardGridSkeleton, EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <section className="border-b border-border bg-background">
        <div className="container-page py-10 sm:py-14">
          <p className="text-eyebrow">Your search</p>
          <h1 className="mt-3 text-3xl sm:text-4xl">Visas for {headingName}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
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

          <div className="mt-8">
            <VisaDiscoveryForm
              variant="compact"
              defaultValues={{
                fromCountry: fromCountry ?? "IN",
                toCountry,
                purpose: purpose as never,
                travelDate,
              }}
            />
          </div>
        </div>
      </section>

      <section className="bg-surface py-14 sm:py-16">
        <div className="container-page">
          {search === undefined ? (
            <CardGridSkeleton count={3} />
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
            <div className="space-y-14">
              {grouped.map((group) => (
                <div key={group.destination.slug}>
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <h2 className="flex items-center gap-2.5 text-2xl">
                      <span aria-hidden className="text-2xl leading-none">
                        {group.destination.flagEmoji}
                      </span>
                      {group.destination.name}
                    </h2>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/destinations/${group.destination.slug}`}>
                        About {group.destination.name}
                      </Link>
                    </Button>
                  </div>

                  <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {group.products.map((product, index) => (
                      <RevealItem as="li" key={product._id} index={index}>
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
      <section className="border-b border-border bg-background">
        <div className="container-page py-12 sm:py-16">
          <div className="max-w-2xl">
            <p className="text-eyebrow">Destinations</p>
            <h1 className="mt-3 text-4xl sm:text-5xl">Where we can help you go</h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Every country below is one we handle end to end. Open a destination
              to see the visa types available and what each one involves.
            </p>
          </div>

          <div className="mt-8 max-w-md">
            <label htmlFor="destination-filter" className="sr-only">
              Filter destinations
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="destination-filter"
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Search a country"
                className="h-12 rounded-full border-border bg-card pl-11 shadow-none"
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
                    "rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-brand",
                    region === option
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-brand/40 hover:text-foreground",
                  )}
                >
                  {option === "all" ? "All destinations" : option}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-surface py-14 sm:py-16">
        <div className="container-page">
          {visible === undefined ? (
            <CardGridSkeleton count={6} />
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
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((destination, index) => (
                <RevealItem as="li" key={destination._id} index={index}>
                  <DestinationCard
                    className="h-full"
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
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
