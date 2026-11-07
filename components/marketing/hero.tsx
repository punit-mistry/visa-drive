"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FileCheck2, Headset, ShieldCheck } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { PublishedDestination } from "@/components/marketing/catalogue";
import { AmbientVideo } from "@/components/marketing/ambient-video";
import { VisaDiscoveryForm } from "@/components/marketing/visa-discovery-form";
import { CountryFlag } from "@/components/shared/country-flag";
import { VisaLoader } from "@/components/shared/visa-loader";
import { formatMoney } from "@/lib/helpers/pricing";
import { SITE } from "@/lib/constants/site";

/**
 * The opening frame.
 *
 * This used to be a full-bleed dark photograph with a parallax drift, two
 * gradient scrims and a serif headline running to 144px. It looked like a
 * travel magazine and read like one: handsome, loud, and slow to say what the
 * business actually does.
 *
 * It is now a light frame on warm off-white, built the way the rest of the
 * product is built:
 *
 *   1. One contained photograph rather than a full-screen wash, so the type
 *      sits on paper instead of on an image and needs no scrim to be legible.
 *   2. Type at a readable size, carrying emphasis by weight rather than by
 *      filling the viewport.
 *   3. Red only where it means something — the one clause in the headline
 *      that is the promise, and the actions.
 *   4. The search form floating over the seam between the frame and the page,
 *      because a visitor who already knows where they are going should be
 *      able to start without reading a word.
 *
 * No parallax and no scroll-linked transforms: the entrance is the CSS
 * cascade in `[data-rise]`, which starts on the first painted frame instead
 * of waiting for React to hydrate.
 */

/**
 * The United States. It is the bulk of the work that actually comes through
 * the door, so it is what the first screen shows.
 */
const HERO_POSTER = "/media/newyork-approach.jpg";
const HERO_VIDEO = "/media/newyork-approach.mp4";

/** Three promises the rest of the site has to keep, and does. */
const ASSURANCES = [
  { icon: FileCheck2, label: "Checklist checked by a specialist" },
  { icon: ShieldCheck, label: "Encrypted, private uploads" },
  { icon: Headset, label: "A real team in Khar West" },
];

export function Hero() {
  // `destinations.listPublished` already leads with the United States, for
  // every surface at once, so the rail just takes what it is given.
  const destinations = useQuery(api.destinations.listPublished, { limit: 6 }) as
    | PublishedDestination[]
    | undefined;


  /**
   * `step` is the element's place in the entrance cascade, not a delay in
   * seconds. The whole sequence finishes inside the welcome splash's minimum
   * 750ms, so the splash never lifts part-way through it.
   */
  const rise = (step: number) => ({
    "data-rise": "",
    style: { animationDelay: step * 60 + "ms" } as React.CSSProperties,
  });

  return (
    <section className="relative bg-surface pt-24 pb-14 lg:pt-28 lg:pb-16">
      <div className="container-wide">
        <div className="grid items-center gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14">
          {/* ------------------------------ copy ---------------------------- */}
          <div>
            <p
              {...rise(0)}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
            >
              <span>Visa applications</span>
              <span aria-hidden className="h-px w-6 bg-border-strong" />
              <span>Khar West · Mumbai</span>
            </p>

            <h1 {...rise(1)} className="display-hero mt-4 max-w-[15ch] text-foreground">
              Apply for your visa.
              <br />
              <span className="text-brand">We handle the rest.</span>
            </h1>

            <p
              {...rise(2)}
              className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground"
            >
              {SITE.heroSubline}
            </p>

            <ul
              {...rise(3)}
              className="mt-7 flex flex-col gap-2.5 border-t border-border pt-5 sm:flex-row sm:flex-wrap sm:gap-x-7 sm:gap-y-2.5"
            >
              {ASSURANCES.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.label}
                    className="flex items-center gap-2 text-[13px] text-muted-foreground"
                  >
                    <Icon className="size-3.5 shrink-0 text-brand" aria-hidden />
                    {item.label}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ----------------------------- picture -------------------------- */}
          {/* One clean image, contained and cropped to a steady ratio, rather
              than a full-screen wash the type has to fight. */}
          <div
            {...rise(2)}
            className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-surface-strong lg:aspect-[5/4]"
          >
            <Image
              src={HERO_POSTER}
              alt="An aircraft on approach to New York — the destination VisaDrive files for most often"
              fill
              priority
              fetchPriority="high"
              sizes="(min-width: 1024px) 48vw, 100vw"
              quality={72}
              className="object-cover object-center"
            />
            <AmbientVideo src={HERO_VIDEO} />
          </div>
        </div>

        {/* ------------------------------ search ---------------------------- */}
        {/* Floats over the seam between the frame above and the page below.
            It is the point of the whole section, so it gets the one shadow. */}
        <div {...rise(4)} className="relative z-10 mt-8 lg:-mt-12">
          <VisaDiscoveryForm />
        </div>

        {/* --------------------------- destinations ------------------------- */}
        <div {...rise(5)} className="mt-7">
          <DestinationStrip destinations={destinations} />
        </div>
      </div>
    </section>
  );
}

/**
 * Real destinations, with their real starting prices.
 *
 * Every figure must be true: a destination still carrying seed products is
 * marked, and one with no configured price shows its visa count instead of a
 * number we would have had to invent.
 */
function DestinationStrip({
  destinations,
}: {
  destinations: PublishedDestination[] | undefined;
}) {
  // The real wait on this page: the catalogue read behind the rail. The
  // stamp says what is being waited for; grey bars only said "something".
  if (destinations === undefined) {
    return (
      <VisaLoader
        compact
        label="Loading live visa services"
        className="items-start text-left"
      />
    );
  }

  // An empty catalogue is a real state on a fresh deployment. Say nothing
  // rather than render an empty rail with a heading over it.
  if (destinations.length === 0) return null;

  // One mark for the row, not one per card. Six warning chips in a rail reads
  // as a broken page rather than as a disclosure, and the thing being
  // disclosed is the same thing six times over.
  const anyUnverified = destinations.some((destination) => destination.hasDemoContent);

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Popular right now
      </p>

      <ul className="scrollbar-thin -mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-1">
        {destinations.map((destination) => (
          <li key={destination._id} className="shrink-0">
            <Link
              href={`/destinations/${destination.slug}`}
              className="group focus-brand flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2 transition-colors hover:border-border-strong"
            >
              <CountryFlag
                countryCode={destination.countryCode}
                name={destination.name}
              />

              <span className="min-w-0">
                <span className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-foreground">
                  {destination.name}
                  <ArrowRight
                    className="size-3 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                    aria-hidden
                  />
                </span>
                <span className="mt-0.5 block whitespace-nowrap text-xs text-muted-foreground">
                  <DestinationFacts destination={destination} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {anyUnverified && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
          Sample pricing — these figures have not been verified against an official
          source yet.
        </p>
      )}
    </div>
  );
}

/**
 * The two facts a traveller actually chooses on: what it costs and how fast.
 *
 * Both are optional in the catalogue, and an absent one is simply left out —
 * a price of "—" or a made-up turnaround would be worse than a shorter line.
 * With neither configured, the visa count still says what the card is for.
 */
function DestinationFacts({ destination }: { destination: PublishedDestination }) {
  const price = destination.startingPrice;
  const days = destination.fastestProcessingDays;

  const facts: string[] = [];

  if (typeof price === "number" && price > 0) {
    facts.push(
      `from ${formatMoney(price, destination.currency, "en-IN", { hideDecimals: true })}`,
    );
  }
  if (typeof days === "number" && days > 0) {
    facts.push(`${days} ${days === 1 ? "day" : "days"}`);
  }
  if (facts.length === 0) {
    facts.push(
      `${destination.productCount} ${destination.productCount === 1 ? "visa type" : "visa types"}`,
    );
  }

  return <>{facts.join(" · ")}</>;
}
