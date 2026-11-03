"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";

import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/constants/site";

/**
 * Cinematic hero.
 *
 * One photograph, one sentence, two ways in. Everything else on the first screen
 * is a small editorial mark — the kind of detail a travel magazine masthead
 * carries — so the imagery is what lands first and the type is what holds.
 *
 * The backdrop is a full-bleed background rather than media in flow, so there
 * is no layout shift while it loads; the ink underneath is already the final
 * composition's base colour, which means a slow connection sees a deliberate
 * black frame rather than a white flash.
 */

/**
 * The opening frame: the Burj Al Arab from the air.
 *
 * Chosen over the more dramatic options for two reasons. The water gives an
 * even mid-tone across the whole lower left, which is where the headline
 * sits — a sunrise over cloud looks better in isolation and then loses the
 * type in its own highlights. And the UAE is a destination VisaDrive
 * actually handles, so the first thing a visitor sees is aspirational
 * without being a place we cannot send them.
 */
const HERO_IMAGE =
  "https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=2400&q=72";

const MARKS = [
  "EST. VISADRIVE",
  "KHAR WEST · MUMBAI",
  "GLOBAL VISA ASSISTANCE",
];

/**
 * The second line finishes itself. Each word is something VisaDrive actually
 * takes off the customer — the paperwork, the queue, the guesswork — so the
 * rotation reads as a claim the rest of the page backs up.
 */
const BEYOND = ["ordinary.", "the paperwork.", "the queue.", "the guesswork."];
const WORD_MS = 2600;

export function Hero() {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  // A spring keeps the drift from tracking the wheel one-to-one, which is
  // what makes a parallax feel cheap.
  const eased = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 30,
    mass: 0.4,
  });
  const mediaY = useTransform(eased, [0, 1], ["0%", "16%"]);
  const copyY = useTransform(eased, [0, 1], ["0%", "-8%"]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

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
    <section
      ref={sectionRef}
      className="relative isolate flex min-h-[88svh] flex-col justify-end overflow-hidden bg-ink-black lg:min-h-[94svh]"
    >
      {/* ----------------------------- backdrop ---------------------------- */}
      <motion.div
        aria-hidden
        className="absolute inset-0 scale-110"
        style={reduceMotion ? undefined : { y: mediaY }}
        initial={reduceMotion ? false : { scale: 1.18, opacity: 0 }}
        animate={{ scale: 1.1, opacity: 1 }}
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
          brighter part of the frame. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-ink-black via-ink-black/60 via-45% to-ink-black/25"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-ink-black/75 via-transparent to-transparent"
      />

      {/* ------------------------------ masthead --------------------------- */}
      <motion.div
        style={reduceMotion ? undefined : { y: copyY, opacity: copyOpacity }}
        className="container-wide relative z-10 pb-14 pt-32 sm:pb-16 lg:pb-20 lg:pt-40"
      >
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
          className="display-hero mt-7 max-w-[18ch] text-paper"
        >
          Beyond borders.
          <br />
          Beyond <BeyondWord reduceMotion={Boolean(reduceMotion)} />
        </motion.h1>

        <div className="mt-9 flex flex-col gap-9 lg:mt-12 lg:flex-row lg:items-end lg:justify-between">
          <motion.p
            {...rise(0.42)}
            className="max-w-xl text-base leading-relaxed text-white/70 sm:text-lg"
          >
            A premium visa application experience, designed around your next
            destination. {SITE.heroSubline}
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
      </motion.div>

      {/* ---------------------------- scroll cue --------------------------- */}
      <motion.div
        {...rise(0.7)}
        className="container-wide relative z-10 border-t border-white/12 py-5"
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

/**
 * The rotating tail of the headline.
 *
 * `layout` animates the inline width as the word changes, so the line
 * re-flows smoothly instead of snapping between measures. Under reduced
 * motion it renders the first word and stops — a word that swaps itself every
 * few seconds is precisely the movement that setting is asking us to drop.
 */
function BeyondWord({ reduceMotion }: { reduceMotion: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % BEYOND.length),
      WORD_MS,
    );
    return () => clearInterval(timer);
  }, [reduceMotion]);

  if (reduceMotion) {
    return <em className="not-italic text-brand">{BEYOND[0]}</em>;
  }

  return (
    <span className="relative inline-flex overflow-hidden align-bottom">
      <AnimatePresence mode="wait" initial={false}>
        <motion.em
          key={BEYOND[index]}
          layout
          initial={{ y: "0.9em", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-0.9em", opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block whitespace-nowrap not-italic text-brand"
        >
          {BEYOND[index]}
        </motion.em>
      </AnimatePresence>
    </span>
  );
}
