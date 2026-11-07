"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Quote } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { isAllowedImageUrl } from "@/components/marketing/country-image";
import { Reveal } from "@/components/marketing/reveal";
import { Section, type SectionTone } from "@/components/marketing/section";
import { Skeleton } from "@/components/ui/skeleton";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { initials } from "@/lib/helpers/format";
import { cn } from "@/lib/utils";

/**
 * Testimonials, from admin-editable settings only.
 *
 * The live site has none, so the whole section disappears when the list is
 * empty rather than being filled with invented quotes. Seeded entries carry
 * `isDemo: true` and are labelled on the card itself — not in a tooltip — so
 * nobody can mistake them for a real customer.
 *
 * On the avatar: it is a monogram built from the name the admin entered, not
 * a stock photograph. A bought face attached to a quote is a fabricated
 * customer, which is the one thing a visa consultancy cannot afford to be
 * caught doing — and it would flatly contradict the "four things we will
 * never do" section further up the same page. When the client supplies a real
 * customer photo they have consent for, set `avatarUrl` on the testimonial in
 * Admin → Settings and it renders here instead.
 */

const ROTATE_MS = 4000;

interface Testimonial {
  quote: string;
  name: string;
  context?: string;
  avatarUrl?: string;
  isDemo?: boolean;
}

export function Testimonials({
  tone = "dark",
}: {
  tone?: SectionTone;
}) {
  const settings = useSiteSettings();
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const onDark = tone === "dark";
  const testimonials = (settings.testimonials ?? []) as Testimonial[];
  const count = testimonials.length;

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => (current + delta + count) % Math.max(count, 1));
    },
    [count],
  );

  // Auto-advance. Suspended while the visitor is reading one (hover or
  // keyboard focus) and switched off entirely under reduced motion, where a
  // panel that changes under you is the problem the setting describes.
  useEffect(() => {
    if (reduceMotion || paused || count < 2) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [reduceMotion, paused, count]);

  if (settings.isLoading) {
    return (
      <Section tone={tone} size="lg" width="wide">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-20">
          <div>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-5 h-16 w-72 max-w-full" />
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </Section>
    );
  }

  if (count === 0) return null;

  const active = testimonials[Math.min(index, count - 1)];

  return (
    <Section tone={tone} size="lg" width="wide">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:items-center lg:gap-20">
        {/* ------------------------------- left ---------------------------- */}
        <Reveal>
          <p className={onDark ? "text-eyebrow" : "text-eyebrow"}>
            In their words
          </p>
          <h2
            className={cn(
"display-xl mt-4",
              onDark ? "text-foreground" : "text-foreground",
            )}
          >
            What travellers
            <br />
            tell us.
          </h2>

          {count > 1 && (
            <div className="mt-10 flex items-center gap-5">
              <div className="flex gap-2">
                <CarouselButton
                  onDark={onDark}
                  label="Previous testimonial"
                  onClick={() => go(-1)}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                </CarouselButton>
                <CarouselButton
                  onDark={onDark}
                  label="Next testimonial"
                  onClick={() => go(1)}
                >
                  <ArrowRight className="size-4" aria-hidden />
                </CarouselButton>
              </div>

              <div className="flex items-center gap-2" role="tablist">
                {testimonials.map((item, i) => (
                  <button
                    key={`${item.name}-${i}`}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Testimonial ${i + 1} of ${count}`}
                    onClick={() => setIndex(i)}
                    className={cn(
"h-1.5 rounded-full transition-all duration-500 focus-brand",
                      i === index
                        ? "w-7 bg-brand"
                        : onDark
                          ? "w-1.5 bg-background hover:bg-background"
                          : "w-1.5 bg-surface hover:bg-surface",
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </Reveal>

        {/* ------------------------------- right --------------------------- */}
        <Reveal delay={0.1}>
          <div
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
            aria-live="polite"
            // Reserved height, so advancing never resizes the section under
            // the reader.
            className="relative min-h-[20rem] sm:min-h-[18rem]"
          >
            <AnimatePresence mode="wait">
              <motion.figure
                key={`${active.name}-${index}`}
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -16 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
"flex h-full flex-col rounded-2xl border p-7 lg:p-9",
                  onDark
                    ? "border-border bg-white/[0.04]"
                    : "border-border bg-card",
                )}
              >
                {active.isDemo && (
                  <p className="mb-5 inline-flex w-fit items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning">
                    <span className="size-1.5 rounded-full bg-warning" aria-hidden />
                    Sample content — not a real customer
                  </p>
                )}

                <Quote className="size-6 text-brand/50" aria-hidden />

                <blockquote
                  className={cn(
"mt-5 flex-1 text-lg leading-relaxed sm:text-xl",
                    onDark ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {active.quote}
                </blockquote>

                <figcaption
                  className={cn(
"mt-7 flex items-center gap-4 border-t pt-6",
                    onDark ? "border-border" : "border-border",
                  )}
                >
                  <Avatar
                    name={active.name}
                    src={active.avatarUrl}
                    onDark={onDark}
                  />
                  <div className="min-w-0">
                    <p
                      className={cn(
"text-sm font-semibold",
                        onDark ? "text-foreground" : "text-foreground",
                      )}
                    >
                      {active.name}
                    </p>
                    {active.context && (
                      <p
                        className={cn(
"truncate text-sm",
                          onDark ? "text-muted-foreground" : "text-muted-foreground",
                        )}
                      >
                        {active.context}
                      </p>
                    )}
                  </div>
                </figcaption>
              </motion.figure>
            </AnimatePresence>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/**
 * A real photograph when the client has supplied one, a monogram otherwise.
 * Never a stock face — see the note at the top of this file.
 */
function Avatar({
  name,
  src,
  onDark,
}: {
  name: string;
  src?: string;
  onDark: boolean;
}) {
  if (isAllowedImageUrl(src)) {
    return (
      <span className="relative size-12 shrink-0 overflow-hidden rounded-full">
        <Image src={src} alt="" fill sizes="48px" className="object-cover" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
"flex size-12 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
        onDark
          ? "border-border bg-background text-foreground"
          : "border-border bg-surface text-foreground",
      )}
    >
      {initials(name)}
    </span>
  );
}

function CarouselButton({
  onDark,
  label,
  onClick,
  children,
}: {
  onDark: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
"flex size-11 items-center justify-center rounded-full border transition-all duration-500 focus-brand",
        onDark
          ? "border-border-strong text-muted-foreground hover:border-brand hover:bg-brand hover:text-brand-foreground"
          : "border-border text-foreground hover:border-brand hover:bg-brand hover:text-brand-foreground",
      )}
    >
      {children}
    </button>
  );
}
