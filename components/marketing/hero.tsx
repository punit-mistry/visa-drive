"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/constants/site";

/**
 * Cinematic hero.
 *
 * One photograph, one sentence, two ways in. Everything else on the first
 * screen is a small editorial mark — the kind of detail a travel magazine
 * masthead carries — so the image is what lands first and the type is what
 * holds.
 *
 * The photograph is a full-bleed background rather than an `<img>` in flow,
 * so there is no layout shift while it loads; the ink underneath is already
 * the final composition's base colour, which means a slow connection sees a
 * deliberate black frame rather than a white flash.
 */

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=2400&q=72";

const MARKS = [
  "EST. VISADRIVE",
  "KHAR WEST · MUMBAI",
  "GLOBAL VISA ASSISTANCE",
];

export function Hero() {
  const reduceMotion = useReducedMotion();

  // One shared curve for every entrance, so the hero resolves as a single
  // movement rather than four independent animations.
  const ease = [0.22, 1, 0.36, 1] as const;
  const rise = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 26 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.9, delay, ease },
        };

  return (
    <section className="relative isolate flex min-h-[88svh] flex-col justify-end overflow-hidden bg-ink-black lg:min-h-[94svh]">
      {/* ---------------------------- photograph --------------------------- */}
      <motion.div
        aria-hidden
        className="absolute inset-0 -z-10"
        initial={reduceMotion ? false : { scale: 1.08, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.8, ease }}
      >
        <Image
          src={HERO_IMAGE}
          alt=""
          fill
          priority
          sizes="100vw"
          quality={80}
          className="object-cover object-center"
        />
      </motion.div>

      {/* Two scrims: a vertical one that beds the type into the frame, and a
          slight left-weighted one so the headline keeps contrast over the
          brighter part of the photograph. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-black via-ink-black/55 via-45% to-ink-black/25"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-r from-ink-black/70 via-transparent to-transparent"
      />

      {/* ------------------------------ masthead --------------------------- */}
      <div className="container-wide relative pb-14 pt-32 sm:pb-16 lg:pb-20 lg:pt-40">
        <motion.p
          {...rise(0.15)}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/55 sm:text-[11px]"
        >
          {MARKS.map((mark, index) => (
            <span key={mark} className="flex items-center gap-4">
              {index > 0 && (
                <span aria-hidden className="h-px w-6 bg-white/25" />
              )}
              {mark}
            </span>
          ))}
        </motion.p>

        <motion.h1
          {...rise(0.28)}
          className="display-hero mt-7 max-w-[14ch] text-paper"
        >
          The world
          <br />
          is <em className="not-italic text-brand">waiting.</em>
        </motion.h1>

        <div className="mt-9 flex flex-col gap-9 lg:mt-12 lg:flex-row lg:items-end lg:justify-between">
          <motion.p
            {...rise(0.42)}
            className="max-w-xl text-base leading-relaxed text-white/70 sm:text-lg"
          >
            Your next destination is closer than you think. {SITE.heroSubline}
          </motion.p>

          <motion.div
            {...rise(0.52)}
            className="flex flex-col gap-3 sm:flex-row sm:items-center lg:shrink-0"
          >
            <Button
              asChild
              size="lg"
              className="h-12 px-7 text-[15px] font-semibold"
            >
              <Link href="/destinations">
                Start your journey
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 border-white/30 bg-white/5 px-6 text-[15px] font-semibold text-white backdrop-blur-sm hover:border-white/50 hover:bg-white/10 hover:text-white dark:border-white/30 dark:bg-white/5"
            >
              <Link href="/how-it-works">Explore destinations</Link>
            </Button>
          </motion.div>
        </div>
      </div>

      {/* ---------------------------- scroll cue --------------------------- */}
      <motion.div
        {...rise(0.7)}
        className="container-wide relative border-t border-white/12 py-5"
      >
        <a
          href="#destinations"
          className="link-rule inline-flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none"
        >
          Discover more
          <ArrowDown className="size-3.5" aria-hidden />
        </a>
      </motion.div>
    </section>
  );
}
