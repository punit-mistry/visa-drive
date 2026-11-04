"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FileCheck2, Headset, ShieldCheck } from "lucide-react";
import { useQuery } from "convex/react";
import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

import { api } from "@/convex/_generated/api";
import type { PublishedDestination } from "@/components/marketing/catalogue";
import { VisaDiscoveryForm } from "@/components/marketing/visa-discovery-form";
import { CountryFlag } from "@/components/shared/country-flag";
import { VisaLoader } from "@/components/shared/visa-loader";
import { formatMoney } from "@/lib/helpers/pricing";
import { SITE } from "@/lib/constants/site";

/**
 * The opening frame.
 *
 * The previous version was a travel masthead — "Beyond borders, beyond
 * ordinary" over a photograph, with "Start your journey" as the call to
 * action. It was handsome and it said nothing: a visitor could not tell in the
 * first second whether this was an airline, a tour operator or a hotel group,
 * and there was nothing on the first screen to *do*.
 *
 * So the composition is unchanged — full-bleed photograph, parallax drift,
 * one shared entrance curve — and the content is rebuilt around the job:
 *
 *   1. A headline that names the category in its first three words.
 *   2. The search itself, in the hero, where the eye lands. Picking a
 *      destination is the conversion path, and it was previously two pages
 *      away on `/destinations`.
 *   3. Real destinations with their real starting prices underneath, so the
 *      page proves what it sells rather than asserting it.
 *
 * Nothing in (3) is written here. Prices, processing times and the list of
 * countries all come from the published catalogue, and a destination whose
 * products are still seed data carries the "Sample data" mark it carries
 * everywhere else — a hero is exactly where an unverified fee would do the
 * most damage.
 */

/**
 * The opening frame: the Burj Al Arab from the air.
 *
 * The water gives an even mid-tone across the lower half, which is where the
 * type and the search panel sit — a sunrise over cloud looks better in
 * isolation and then loses both in its own highlights. And the UAE is a
 * destination VisaDrive actually handles, so the first thing a visitor sees is
 * aspirational without being a place we cannot send them.
 */
const HERO_IMAGE =
  "https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=1920&q=70";

/** Three promises the rest of the site has to keep, and does. */
const ASSURANCES = [
  { icon: FileCheck2, label: "Document checklist, checked by a specialist" },
  { icon: ShieldCheck, label: "Encrypted uploads, private to your file" },
  { icon: Headset, label: "A real team in Khar West, Mumbai" },
];

export function Hero() {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);

  const destinations = useQuery(api.destinations.listPublished, { limit: 6 }) as
    | PublishedDestination[]
    | undefined;

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  /**
   * Read straight off the scroll progress — no spring.
   *
   * This section used to feed `scrollYProgress` through `useSpring`, which on
   * the marketing site means the value is eased *twice*: Lenis already runs
   * the whole page through a 1.05s decelerating curve before motion ever sees
   * it. Two easings stacked is what made the backdrop lag a beat behind the
   * wheel and read as stutter. Lenis does the smoothing; this just maps it.
   */
  const mediaY = useTransform(scrollYProgress, [0, 1], ["0%", "14%"]);

  // One shared curve for every entrance, so the hero resolves as a single
  // movement rather than five independent animations.
  const ease = [0.22, 1, 0.36, 1] as const;

  /**
   * `step` is the element's place in the cascade, not a delay in seconds.
   *
   * The whole sequence has to finish inside the welcome splash's minimum
   * 750ms, or the splash lifts part-way through and you catch the hero
   * mid-flight — which looks like the page stuttering rather than arriving.
   * Six elements at 60ms apart plus a 0.55s travel lands at ~0.85s, and the
   * last two are below the fold anyway.
   */
  const rise = (step: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.55, delay: step * 0.06, ease },
        };

  return (
    <section
      ref={sectionRef}
      className="relative isolate flex min-h-[92svh] flex-col justify-end overflow-hidden bg-ink-black pt-28 lg:min-h-[96svh] lg:pt-32"
    >
      {/* ----------------------------- backdrop ---------------------------- */}
      {/*
        Two deliberate choices here, both about the first second of the page:

        1. Only `opacity` animates on entry. It used to animate `scale` from
           1.16 to 1.1 across 1.6s — a continuous re-rasterisation of a
           full-viewport photograph, running while the browser was still
           decoding that same photograph and hydrating the page. Opacity is
           composited; scale on a raster that size is not free.
        2. The layer is promoted up front with `will-change`, so the parallax
           `y` moves an existing texture instead of asking the compositor to
           build one on the first scroll frame — which is the jolt you feel
           at the exact moment you start scrolling.
      */}
      <motion.div
        aria-hidden
        className="absolute inset-0 scale-110 transform-gpu"
        style={
          reduceMotion
            ? undefined
            : { y: mediaY, willChange: "transform", backfaceVisibility: "hidden" }
        }
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.1, ease }}
      >
        <Image
          src={HERO_IMAGE}
          alt=""
          fill
          priority
          fetchPriority="high"
          sizes="100vw"
          quality={70}
          className="object-cover object-center"
        />
      </motion.div>

      {/* Two scrims: a vertical one that beds the type into the frame, and a
          left-weighted one so the headline keeps contrast over the brighter
          part of the photograph. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-ink-black from-15% via-ink-black/70 via-55% to-ink-black/25"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-ink-black/80 via-transparent to-transparent"
      />

      <div className="container-wide relative z-10 pb-10 lg:pb-14">
        {/* ------------------------------ masthead -------------------------- */}
        <motion.p
          {...rise(0)}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/55 sm:text-[11px]"
        >
          <span>Visa applications</span>
          <span aria-hidden className="h-px w-6 bg-white/25" />
          <span>Khar West · Mumbai</span>
        </motion.p>

        <motion.h1
          {...rise(1)}
          className="display-hero mt-5 max-w-[16ch] text-paper"
        >
          Apply for your visa.
          <br />
          <span className="text-brand">We handle the rest.</span>
        </motion.h1>

        <motion.p
          {...rise(2)}
          className="mt-5 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg"
        >
          {SITE.heroSubline}
        </motion.p>

        {/* ------------------------------- search --------------------------- */}
        {/* The point of the whole frame. A visitor who knows where they are
            going can start from here without reading another word. */}
        <motion.div {...rise(3)} className="mt-8">
          <VisaDiscoveryForm />
        </motion.div>

        {/* --------------------------- destinations ------------------------- */}
        <motion.div {...rise(4)} className="mt-7">
          <DestinationStrip destinations={destinations} />
        </motion.div>

        {/* ---------------------------- assurances -------------------------- */}
        <motion.ul
          {...rise(5)}
          className="mt-8 flex flex-col gap-2.5 border-t border-white/12 pt-6 sm:flex-row sm:flex-wrap sm:gap-x-8 sm:gap-y-3"
        >
          {ASSURANCES.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.label}
                className="flex items-center gap-2.5 text-[13px] text-white/60"
              >
                <Icon className="size-4 shrink-0 text-brand" aria-hidden />
                {item.label}
              </li>
            );
          })}
        </motion.ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Real destinations, with their real starting prices.
 *
 * This is the row that makes the page legible as a visa service at a glance —
 * six flags and six prices say it faster than any sentence. Which is also why
 * every figure must be true: a destination still carrying seed products is
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
        tone="dark"
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
        Popular right now
      </p>

      <ul className="scrollbar-thin -mx-1 mt-3 flex gap-2.5 overflow-x-auto px-1 pb-1">
        {destinations.map((destination) => (
          <li key={destination._id} className="shrink-0">
            <Link
              href={`/destinations/${destination.slug}`}
              className="group flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.07] px-3.5 py-2.5 backdrop-blur-sm transition-colors hover:border-white/35 hover:bg-white/[0.12] focus-visible:border-white/50 focus-visible:outline-none"
            >
              <CountryFlag
                countryCode={destination.countryCode}
                name={destination.name}
                className="transition-colors group-hover:border-white/45"
              />

              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium whitespace-nowrap text-white">
                  {destination.name}
                  <ArrowRight
                    className="size-3 shrink-0 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                    aria-hidden
                  />
                </span>
                <span className="mt-0.5 block text-xs whitespace-nowrap text-white/55">
                  <DestinationFacts destination={destination} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {anyUnverified && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-white/40">
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
