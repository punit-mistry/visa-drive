"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Globe } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { PublishedDestination } from "@/components/marketing/catalogue";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The passport plate.
 *
 * It runs as a loop rather than a one-shot: the cover swings open, six stamps
 * land in sequence, the page holds, the cover closes, and it begins again. A
 * demo that plays once and then sits still reads as broken to anyone who
 * arrives a few seconds late.
 *
 * It stays honest while it does it. A stamp records an *appointment* — the
 * thing VisaDrive actually delivers and charges for — never an approval,
 * which is the consulate's decision alone. Every country shown comes from
 * `destinations.listPublished`; none is invented.
 *
 * Interaction wins over the loop. Picking a destination pauses the cycle and
 * presses that stamp immediately; the loop resumes only after the visitor has
 * been idle for a while, so it never yanks the page out from under them.
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

/* Cycle timings, in milliseconds. */
const COVER_OPEN_MS = 950;
const STAMP_GAP_MS = 430;
const HOLD_MS = 2400;
const COVER_CLOSE_MS = 700;
/** How long an interaction suspends the loop for. */
const RESUME_AFTER_MS = 9000;

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
  const [open, setOpen] = useState(false);
  /** Bumping this restarts the cycle effect from the top. */
  const [cycle, setCycle] = useState(0);
  const [paused, setPaused] = useState(false);
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
      setOpen(true);
      setSlots((current) => {
        const existing = current.findIndex(
          (stamp) => stamp?.slug === destination.slug,
        );
        const target =
          existing === -1 ? current.findIndex((s) => s === null) : existing;
        if (target === -1) return current;
        const next = [...current];
        next[target] = entry(destination, target);
        return next;
      });
    },
    [entry],
  );

  /* ------------------------------ the loop ------------------------------ */
  useEffect(() => {
    if (available.length === 0 || paused) return;

    // Reduced motion gets the finished state, held, with no cover theatre and
    // no looping — the loop is the part that would be distracting.
    if (reduceMotion) {
      const t = setTimeout(() => {
        setOpen(true);
        setSlots(available.map((d, i) => entry(d, i)));
        setActiveSlug(available[0].slug);
      }, 0);
      return () => clearTimeout(t);
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    // 1. open the cover
    at(260, () => setOpen(true));

    // 2. land each stamp behind it
    available.forEach((destination, index) => {
      at(260 + COVER_OPEN_MS + index * STAMP_GAP_MS, () => {
        setSlots((current) => {
          const next = [...current];
          next[index] = entry(destination, index);
          return next;
        });
        if (index === 0) setActiveSlug(destination.slug);
      });
    });

    const stampedAt = 260 + COVER_OPEN_MS + available.length * STAMP_GAP_MS;

    // 3. hold, close, clear, and go round again
    at(stampedAt + HOLD_MS, () => setOpen(false));
    at(stampedAt + HOLD_MS + COVER_CLOSE_MS, () => {
      setSlots(Array.from({ length: SLOTS }, () => null));
      setActiveSlug(null);
    });
    at(stampedAt + HOLD_MS + COVER_CLOSE_MS + 320, () =>
      setCycle((value) => value + 1),
    );

    return () => timers.forEach(clearTimeout);
  }, [available, cycle, paused, reduceMotion, entry]);

  /* --------------------- resume after an interaction -------------------- */
  useEffect(() => {
    if (!paused || reduceMotion) return;
    const t = setTimeout(() => {
      setSlots(Array.from({ length: SLOTS }, () => null));
      setActiveSlug(null);
      setOpen(false);
      setPaused(false);
      setCycle((value) => value + 1);
    }, RESUME_AFTER_MS);
    return () => clearTimeout(t);
  }, [paused, reduceMotion]);

  const stamps = useMemo(
    () => slots.filter((slot): slot is StampEntry => slot !== null),
    [slots],
  );
  const activeStamp = stamps.find((stamp) => stamp.slug === activeSlug) ?? null;

  function pick(destination: PublishedDestination) {
    setPaused(true);
    press(destination);
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* ------------------------------ passport --------------------------- */}
      <div
        className="relative [perspective:1800px]"
        role="img"
        aria-label={
          stamps.length === 0
            ? "A passport, closed"
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
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-2.5">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Visas · Visas
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                {stamps.length}/{SLOTS}
              </p>
            </div>

            <div className="relative grid min-h-[250px] grid-cols-2 gap-2 p-3.5 sm:min-h-[285px] sm:gap-3 sm:p-4">
              {/* Faint ruled guides, like a real visa page. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, transparent 0, transparent 31px, var(--border) 31px, var(--border) 32px)",
                }}
              />

              {slots.map((stamp, slot) => (
                <div
                  key={slot}
                  className="relative flex min-h-[78px] items-center justify-center sm:min-h-[88px]"
                >
                  <AnimatePresence mode="popLayout">
                    {stamp && <Stamp key={stamp.key} stamp={stamp} />}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ------------------------------- cover ---------------------------- */}
        <PassportCover open={open} reduceMotion={Boolean(reduceMotion)} />
      </div>

      {/* ------------------------------- picker ---------------------------- */}
      <div>
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
                    onClick={() => pick(destination)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-all focus-brand",
                      active
                        ? "border-brand bg-brand text-brand-foreground elev-sm"
                        : "border-border-strong bg-card text-foreground/75 hover:-translate-y-px hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    <span aria-hidden>{destination.flagEmoji}</span>
                    {destination.name}
                  </button>
                );
              })}
            </div>

            {/* Reserved height, so the caption appearing never nudges the
                chips above it. */}
            <div className="mt-3 min-h-6">
              <AnimatePresence mode="wait">
                {activeStamp && (
                  <motion.p
                    key={activeStamp.slug}
                    initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {activeStamp.name} appointments, handled end to end.
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The cover, hinged on the spine.
 *
 * It swings back on the left edge and fades as it passes the hinge, so it
 * never escapes the layout on a narrow screen — a cover flapping outside the
 * grid is the one thing that would make this read as a gimmick.
 */
function PassportCover({
  open,
  reduceMotion,
}: {
  open: boolean;
  reduceMotion: boolean;
}) {
  if (reduceMotion) return null;

  return (
    <motion.div
      aria-hidden
      className="absolute inset-0 origin-left rounded-2xl border border-white/10 [transform-style:preserve-3d]"
      style={{
        background:
          "linear-gradient(145deg, #2a1012 0%, #1a0a0c 45%, #250f11 100%)",
      }}
      animate={{ rotateY: open ? -162 : 0, opacity: open ? 0 : 1 }}
      transition={{
        rotateY: { duration: 0.95, ease: [0.76, 0, 0.24, 1] },
        opacity: { duration: 0.45, delay: open ? 0.5 : 0 },
      }}
    >
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.3em] text-white/60">
          Passport
        </span>

        <span className="flex size-16 items-center justify-center rounded-full border border-white/20 text-white/40">
          <Globe className="size-7" strokeWidth={1.2} />
        </span>

        <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-white/30">
          VisaDrive
        </span>
      </div>

      {/* A hairline inset frame, the way a real cover is blind-embossed. */}
      <span className="pointer-events-none absolute inset-3 rounded-xl border border-white/10" />
    </motion.div>
  );
}

function Stamp({ stamp }: { stamp: StampEntry }) {
  const reduceMotion = useReducedMotion();

  const content = (
    <div
      className={cn(
        "flex size-[78px] flex-col items-center justify-center rounded-full border-[2.5px] text-center sm:size-[88px]",
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
          Emirates" has to survive a 78px circle. */}
      <span className="mt-0.5 line-clamp-2 max-w-[66px] px-1 font-mono text-[6.5px] font-bold uppercase leading-[1.25] tracking-[0.06em]">
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
