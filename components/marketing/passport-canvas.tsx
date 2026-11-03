"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Plane } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { PublishedDestination } from "@/components/marketing/catalogue";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The hero's interactive passport.
 *
 * Picking a destination presses a stamp onto the page. It is the one moment
 * on the site that is purely delightful, and it has to stay honest while it
 * does it: the stamp records an *appointment* — the thing VisaDrive actually
 * delivers and charges for — never an approval, which is the consulate's
 * decision alone. The wording on the stamp and the line beneath it both say
 * so, because a passport graphic that implies a granted visa would be the
 * exact false promise the client's own disclaimers forbid.
 *
 * Everything here is driven by `destinations.listPublished`. No country
 * appears that VisaDrive does not actually serve.
 */

interface StampEntry {
  key: string;
  slug: string;
  name: string;
  countryCode: string;
  /** Degrees of tilt, so no two stamps sit the same way. */
  tilt: number;
  ink: "red" | "navy" | "green";
}

const INKS: Array<StampEntry["ink"]> = ["red", "navy", "green"];
const TILTS = [-7, 5, -3, 8, -5, 4];

const INK_CLASSES: Record<StampEntry["ink"], string> = {
  red: "text-brand border-brand/70",
  navy: "text-navy border-navy/70",
  green: "text-success border-success/70",
};

/** Six slots: enough to feel like a well-travelled page, few enough to read. */
const SLOTS = 6;

const STAMP_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function PassportCanvas({ className }: { className?: string }) {
  const destinations = useQuery(api.destinations.listPublished, { limit: 8 }) as
    | PublishedDestination[]
    | undefined;
  const reduceMotion = useReducedMotion();

  // A fixed grid of slots rather than a list: a stamp keeps the position it
  // landed in, so re-pressing one never shuffles the other five around.
  const [slots, setSlots] = useState<Array<StampEntry | null>>(() =>
    Array.from({ length: SLOTS }, () => null),
  );
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  // A ref, not state: this guard decides nothing that is rendered, and as
  // state it would be a synchronous setState inside the fill effect.
  const filled = useRef(false);
  const counter = useRef(0);

  const available = useMemo(
    () => (destinations ?? []).slice(0, SLOTS),
    [destinations],
  );

  const entry = useCallback(
    (destination: PublishedDestination, slot: number): StampEntry => {
      counter.current += 1;
      return {
        key: `${destination.slug}-${counter.current}`,
        slug: destination.slug,
        name: destination.name,
        countryCode: destination.countryCode,
        tilt: TILTS[slot % TILTS.length],
        ink: INKS[slot % INKS.length],
      };
    },
    [],
  );

  const press = useCallback(
    (destination: PublishedDestination) => {
      setActiveSlug(destination.slug);
      setSlots((current) => {
        const existing = current.findIndex(
          (stamp) => stamp?.slug === destination.slug,
        );
        const target = existing === -1 ? current.findIndex((s) => s === null) : existing;
        if (target === -1) return current;
        const next = [...current];
        next[target] = entry(destination, target);
        return next;
      });
    },
    [entry],
  );

  // The page fills itself the moment the catalogue arrives, one stamp every
  // 140ms. A visitor should meet a well-travelled passport, not an empty one
  // that takes ten seconds to earn its first mark — the fill *is* the hook.
  useEffect(() => {
    if (filled.current || available.length === 0) return;
    filled.current = true;

    // Reduced motion collapses the stagger to zero, which lands every stamp
    // on the same tick instead of skipping the fill entirely.
    const step = reduceMotion ? 0 : 140;

    const timers = available.map((destination, index) =>
      setTimeout(() => {
        setSlots((current) => {
          const next = [...current];
          next[index] = entry(destination, index);
          return next;
        });
        if (index === 0) setActiveSlug(destination.slug);
      }, index * step),
    );

    return () => timers.forEach(clearTimeout);
  }, [available, reduceMotion, entry]);

  const stamps = useMemo(
    () => slots.filter((slot): slot is StampEntry => slot !== null),
    [slots],
  );
  const activeStamp = stamps.find((stamp) => stamp.slug === activeSlug) ?? null;

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {/* ------------------------------ passport --------------------------- */}
      <div
        className="relative"
        role="img"
        aria-label={
          stamps.length === 0
            ? "An empty passport visa page"
            : `A passport visa page stamped for ${stamps.map((s) => s.name).join(", ")}`
        }
      >
        {/* The page behind, peeking out — reads as a bound passport rather
            than a floating card. */}
        <div
          aria-hidden
          className="absolute inset-x-3 -bottom-2 top-3 rounded-2xl border border-border bg-surface-strong/70"
        />

        <div className="passport-paper relative overflow-hidden rounded-2xl border border-border-strong elev-lg">
          {/* Stitched spine */}
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 w-7 border-r border-border bg-surface-strong/60"
          >
            <div className="flex h-full flex-col items-center justify-evenly py-6">
              {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className="size-1 rounded-full bg-border-strong" />
              ))}
            </div>
          </div>

          <div className="pl-7">
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Visas · Visas
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                {stamps.length}/{SLOTS}
              </p>
            </div>

            <div className="relative grid min-h-[280px] grid-cols-2 gap-3 p-4 sm:min-h-[320px] sm:gap-4 sm:p-5">
              {/* Faint ruled guides, like a real visa page. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, transparent 0, transparent 31px, var(--border) 31px, var(--border) 32px)",
                }}
              />

              {slots.map((stamp, slot) => {
                return (
                  <div
                    key={slot}
                    className="relative flex min-h-[86px] items-center justify-center sm:min-h-[96px]"
                  >
                    <AnimatePresence mode="popLayout">
                      {stamp && <Stamp key={stamp.key} stamp={stamp} />}
                    </AnimatePresence>
                  </div>
                );
              })}

              {stamps.length === 0 && (
                <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-muted-foreground">
                  Pick a destination to see it stamped.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------- picker ---------------------------- */}
      <div>
        <p className="text-eyebrow mb-2.5">Where are you going?</p>

        {destinations === undefined ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-28 rounded-full" />
            ))}
          </div>
        ) : available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Our destination catalogue is being set up.{" "}
            <Link
              href="/contact"
              className="font-medium text-brand underline-offset-4 hover:underline focus-brand"
            >
              Tell us where you are going
            </Link>
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {available.map((destination) => {
                const active = destination.slug === activeSlug;
                return (
                  <button
                    key={destination._id}
                    type="button"
                    onClick={() => {
                      press(destination);
                    }}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-all focus-brand",
                      active
                        ? "border-brand bg-brand text-brand-foreground elev-sm"
                        : "border-border bg-card text-foreground hover:-translate-y-px hover:border-border-strong hover:elev-sm",
                    )}
                  >
                    <span aria-hidden>{destination.flagEmoji}</span>
                    {destination.name}
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              {activeStamp && (
                <motion.p
                  key={activeStamp.slug}
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                >
                  <Plane className="size-3.5 shrink-0 text-brand" aria-hidden />
                  <span className="text-muted-foreground">
                    We handle {activeStamp.name} appointments end to end.
                  </span>
                  <Link
                    href={`/destinations/${activeStamp.slug}`}
                    className="inline-flex items-center gap-1 font-medium text-brand underline-offset-4 hover:underline focus-brand"
                  >
                    See visa options
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </motion.p>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

function Stamp({ stamp }: { stamp: StampEntry }) {
  const reduceMotion = useReducedMotion();

  const content = (
    <div
      className={cn(
        "flex size-[84px] flex-col items-center justify-center rounded-full border-[2.5px] text-center sm:size-[94px]",
        INK_CLASSES[stamp.ink],
      )}
      style={{ transform: `rotate(${stamp.tilt}deg)` }}
    >
      <span className="font-mono text-[7px] font-bold uppercase tracking-[0.16em] opacity-80">
        Appointment
      </span>
      <span className="font-mono text-xl font-bold leading-none tracking-[0.04em]">
        {stamp.countryCode}
      </span>
      {/* Two tight lines rather than one truncated one: "United Arab
          Emirates" has to survive an 84px circle. */}
      <span className="mt-0.5 line-clamp-2 max-w-[70px] px-1 font-mono text-[6.5px] font-bold uppercase leading-[1.25] tracking-[0.06em]">
        {stamp.name}
      </span>
      <span className="mt-1 font-mono text-[6.5px] uppercase tracking-[0.1em] opacity-75">
        {STAMP_DATE.format(new Date())}
      </span>
      <span className="font-mono text-[5.5px] uppercase tracking-[0.18em] opacity-60">
        VisaDrive · Mumbai
      </span>
    </div>
  );

  if (reduceMotion) return content;

  return (
    <motion.div
      initial={{ scale: 2.1, opacity: 0, rotate: -22 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{
        type: "spring",
        stiffness: 520,
        damping: 26,
        mass: 0.7,
        opacity: { duration: 0.14 },
      }}
      className="will-change-transform"
    >
      {content}
    </motion.div>
  );
}
