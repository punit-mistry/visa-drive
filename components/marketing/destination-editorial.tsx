"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowUpRight, Globe } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { PublishedDestination } from "@/components/marketing/catalogue";
import {
  categoryLabel,
  distinctCategories,
  fastestProcessingTime,
  type CatalogueProduct,
} from "@/components/marketing/catalogue";
import { CountryImage } from "@/components/marketing/country-image";
import { Reveal, RevealItem } from "@/components/marketing/reveal";
import { useDestinationProducts } from "@/components/marketing/use-destination-products";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/states";
import { formatMoney } from "@/lib/helpers/pricing";
import { cn } from "@/lib/utils";

/**
 * Destination discovery, art-directed.
 *
 * A uniform grid of identical cards reads as a product catalogue; a magazine
 * varies the plate sizes. So the first destination runs wide and tall, the
 * next two stack beside it, and the remainder fall into a quieter row —
 * which also matches how the catalogue is ordered, with the destinations
 * VisaDrive leads on first.
 *
 * Every figure shown comes from the catalogue. A destination with no
 * configured price simply does not print one.
 */
export function DestinationEditorial({ limit = 6 }: { limit?: number }) {
  const destinations = useQuery(api.destinations.listPublished, { limit }) as
    | PublishedDestination[]
    | undefined;
  const { byDestination } = useDestinationProducts();

  return (
    <section
      id="destinations"
      className="relative isolate overflow-hidden bg-paper py-20 sm:py-24 lg:py-32"
    >
      {/*
        Ambient red, drifting behind the grid.

        Held at a few percent on purpose. Red is the signal colour in this
        product — it means "act on this" — so a field of it this faint is
        the most it can be without starting to compete with the buttons it
        is supposed to leave alone.
      */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="vd-drift-a absolute -left-[12%] top-[-18%] size-[45rem] rounded-full bg-[radial-gradient(circle,var(--brand)_0%,transparent_68%)] opacity-[0.07]" />
        <div className="vd-drift-b absolute -right-[14%] bottom-[-22%] size-[38rem] rounded-full bg-[radial-gradient(circle,var(--brand)_0%,transparent_70%)] opacity-[0.05]" />
      </div>

      <div className="container-wide">
        <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-eyebrow">Destinations</p>
            <h2 className="display-xl mt-4 text-foreground">
              Where will you
              <br />
              go next?
            </h2>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/destinations">
              All destinations
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </Reveal>

        <div className="mt-12 lg:mt-16">
          {destinations === undefined ? (
            <EditorialSkeleton />
          ) : destinations.length === 0 ? (
            <Reveal>
              <EmptyState
                icon={Globe}
                title="Destinations are being added"
                description="Our visa catalogue is not published yet. Tell us where you are travelling and we will come back to you with the options."
                action={
                  <Button asChild>
                    <Link href="/contact">Talk to an expert</Link>
                  </Button>
                }
              />
            </Reveal>
          ) : (
            <EditorialGrid
              destinations={destinations}
              byDestination={byDestination}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function EditorialGrid({
  destinations,
  byDestination,
}: {
  destinations: PublishedDestination[];
  byDestination: Record<string, CatalogueProduct[]>;
}) {
  const [lead, second, third, ...rest] = destinations;

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* The plate: one wide composition, two stacked beside it. */}
      <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
        {lead && (
          <RevealItem index={0} className="lg:col-span-7">
            <Plate
              destination={lead}
              products={byDestination[lead.slug] ?? []}
              size="lead"
              priority
            />
          </RevealItem>
        )}

        <div className="grid gap-5 lg:col-span-5 lg:gap-6">
          {[second, third].filter(Boolean).map((destination, index) => (
            <RevealItem key={destination._id} index={index + 1}>
              <Plate
                destination={destination}
                products={byDestination[destination.slug] ?? []}
                size="stack"
                priority={index === 0}
              />
            </RevealItem>
          ))}
        </div>
      </div>

      {rest.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {rest.map((destination, index) => (
            <RevealItem key={destination._id} index={index}>
              <Plate
                destination={destination}
                products={byDestination[destination.slug] ?? []}
                size="row"
              />
            </RevealItem>
          ))}
        </div>
      )}
    </div>
  );
}

const SIZES = {
  lead: {
    frame: "min-h-[30rem] lg:min-h-[38rem]",
    title: "display-lg",
    sizes: "(max-width: 1024px) 100vw, 58vw",
  },
  stack: {
    frame: "min-h-[18rem] lg:min-h-[18.25rem]",
    title: "display-md",
    sizes: "(max-width: 1024px) 100vw, 40vw",
  },
  row: {
    frame: "min-h-[22rem]",
    title: "display-md",
    sizes: "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 30vw",
  },
} as const;

function Plate({
  destination,
  products,
  size,
  priority = false,
}: {
  destination: PublishedDestination;
  products: CatalogueProduct[];
  size: keyof typeof SIZES;
  priority?: boolean;
}) {
  const spec = SIZES[size];
  const categories = distinctCategories(products).slice(0, 3);
  const processing = fastestProcessingTime(products);
  const price =
    typeof destination.startingPrice === "number" && destination.startingPrice > 0
      ? destination.startingPrice
      : null;

  const meta = [
    price !== null
      ? `From ${formatMoney(price, destination.currency, "en-IN", { hideDecimals: true })}`
      : null,
    processing,
  ].filter(Boolean) as string[];

  return (
    <article
      className={cn(
"group relative isolate flex h-full flex-col justify-end overflow-hidden rounded-2xl bg-ink-black",
"has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-paper",
        spec.frame,
      )}
    >
      <CountryImage
        src={destination.cardImageUrl}
        countryCode={destination.countryCode}
        flagEmoji={destination.flagEmoji}
        name={destination.name}
        priority={priority}
        fallbackTone="dark"
        sizes={spec.sizes}
        className="absolute inset-0 h-full w-full"
      />

      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-ink-black via-ink-black/45 via-50% to-ink-black/5 transition-opacity duration-500 group-hover:via-ink-black/55"
      />

      <div className="relative z-10 p-6 lg:p-8">
        <p className="text-eyebrow-dark flex items-center gap-2">
          <span className="text-sm leading-none" aria-hidden>
            {destination.flagEmoji}
          </span>
          {destination.region ?? "Visa services"}
        </p>

        <h3 className={cn("mt-3 text-paper", spec.title)}>
          <Link
            href={`/destinations/${destination.slug}`}
            className="outline-none after:absolute after:inset-0 after:content-['']"
          >
            {destination.name}
          </Link>
        </h3>

        {(destination.tagline ?? destination.summary) && (
          <p
            className={cn(
"mt-2.5 max-w-md text-sm leading-relaxed text-white/60",
              size === "stack" && "line-clamp-2",
            )}
          >
            {destination.tagline ?? destination.summary}
          </p>
        )}

        <div className="mt-6 flex items-end justify-between gap-4 border-t border-white/15 pt-5">
          <div className="min-w-0">
            {categories.length > 0 && (
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
                {categories.map((category) => categoryLabel(category)).join(" · ")}
              </p>
            )}
            {meta.length > 0 && (
              <p className="mt-1.5 truncate text-sm font-medium text-white">
                {meta.join("·")}
              </p>
            )}
          </div>

          <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/25 text-white transition-all duration-500 group-hover:border-brand group-hover:bg-brand">
            <ArrowUpRight
              className="size-4 transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              aria-hidden
            />
            <span className="sr-only">Explore {destination.name} visas</span>
          </span>
        </div>
      </div>
    </article>
  );
}

function EditorialSkeleton() {
  return (
    <div className="space-y-5 lg:space-y-6" aria-busy aria-label="Loading destinations">
      <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
        <Skeleton className="min-h-[30rem] rounded-2xl lg:col-span-7 lg:min-h-[38rem]" />
        <div className="grid gap-5 lg:col-span-5 lg:gap-6">
          <Skeleton className="min-h-[18rem] rounded-2xl lg:min-h-[18.25rem]" />
          <Skeleton className="min-h-[18rem] rounded-2xl lg:min-h-[18.25rem]" />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="min-h-[22rem] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
