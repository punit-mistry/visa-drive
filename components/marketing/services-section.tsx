"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "motion/react";

import { Reveal, RevealItem } from "@/components/marketing/reveal";
import type { SectionTone } from "@/components/marketing/section";
import {
  MARKETING_SERVICES,
  type MarketingService,
} from "@/components/marketing/services";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Mirrors Section's grounds for the one section that builds its own shell. */
const SECTION_GROUND: Record<SectionTone, string> = {
  default: "bg-background",
  surface: "bg-paper",
  paper: "bg-paper",
  dark: "bg-surface text-foreground",
};

/**
 * Decorative photography for the hover reveal, one per service line.
 *
 * Atmosphere only — these carry no information, which is why they are
 * `alt=""` and why the list reads identically with images disabled. Keyed by
 * service key so adding a service without a photo degrades to no reveal
 * rather than to the wrong photo.
 */
const SERVICE_IMAGE: Record<string, string> = {
  ds160_form_filling:
"https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=600&q=60",
  express_appointment:
"https://images.unsplash.com/photo-1484100356142-db6ab6244067?auto=format&fit=crop&w=600&q=60",
  interview_guidance:
"https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=60",
  dropbox_renewal:
"https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&w=600&q=60",
  appointment_rescheduling:
"https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=600&q=60",
};

/**
 * A numbered editorial index of services.
 *
 * The row is the whole interaction: hovering fills it with ink, turns the
 * numeral red and floats the service's photograph under the cursor. That is
 * the point — you should know what a line is about before you have read it.
 *
 * The reveal is pointer-only by design. It is suppressed on touch, where
 * there is no hover to drive it, and under reduced motion, where a panel
 * chasing the cursor is exactly the kind of movement the setting asks us to
 * stop. In both cases the list still works and still reads.
 *
 * Numbers come from a service's position in `MARKETING_SERVICES`, not from
 * its position in whatever subset is passed in — so "Dropbox renewal" is `04`
 * on the index, on its own page's "other services" list and everywhere else.
 */
export function ServiceIndexList({
  services = MARKETING_SERVICES,
  className,
}: {
  services?: MarketingService[];
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const listRef = useRef<HTMLUListElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // Raw pointer position, then a spring, so the panel trails the cursor
  // instead of being welded to it.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const x = useSpring(pointerX, { stiffness: 260, damping: 32, mass: 0.6 });
  const y = useSpring(pointerY, { stiffness: 260, damping: 32, mass: 0.6 });

  const revealSrc = hovered ? SERVICE_IMAGE[hovered] : undefined;

  function handlePointerMove(event: React.PointerEvent<HTMLUListElement>) {
    if (event.pointerType !== "mouse" || reduceMotion) return;
    const bounds = listRef.current?.getBoundingClientRect();
    if (!bounds) return;
    pointerX.set(event.clientX - bounds.left);
    pointerY.set(event.clientY - bounds.top);
  }

  return (
    <ul
      ref={listRef}
      className={cn("relative border-t border-border", className)}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHovered(null)}
    >
      {/* The floating plate. Rendered once and re-pointed, so moving between
          rows slides one panel rather than cross-fading five. */}
      {!reduceMotion && (
        <motion.div
          aria-hidden
          style={{ x, y }}
          animate={{
            opacity: revealSrc ? 1 : 0,
            scale: revealSrc ? 1 : 0.92,
          }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute left-0 top-0 z-20 hidden h-44 w-64 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl lg:block"
        >
          {revealSrc && (
            <Image
              src={revealSrc}
              alt=""
              fill
              sizes="256px"
              className="object-cover"
            />
          )}
          <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-border" />
        </motion.div>
      )}

      {services.map((service, index) => {
        const position = MARKETING_SERVICES.findIndex(
          (item) => item.key === service.key,
        );
        const active = hovered === service.key;

        return (
          <RevealItem as="li" key={service.key} index={index}>
            <Link
              href={`/services/${service.slug}`}
              onPointerEnter={(event) => {
                if (event.pointerType !== "mouse") return;
                setHovered(service.key);
              }}
              onFocus={() => setHovered(service.key)}
              onBlur={() => setHovered(null)}
              className={cn(
"group relative grid items-baseline gap-x-8 gap-y-2 overflow-hidden rounded-xl border-b border-border px-4 py-8 outline-none transition-colors duration-500 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 sm:grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-cols-[5rem_minmax(0,22rem)_minmax(0,1fr)_auto] lg:px-6 lg:py-10",
                active && "bg-surface",
              )}
            >
              <span
                className={cn(
"numeral relative z-10 text-2xl leading-none transition-colors duration-500 lg:text-3xl",
                  active ? "text-brand" : "text-muted-foreground",
                )}
              >
                {String(position + 1).padStart(2, "0")}
              </span>

              <h3
                className={cn(
"display-md relative z-10 transition-[color,transform] duration-500 ease-out",
                  active ? "translate-x-1 text-foreground" : "text-foreground",
                )}
              >
                {service.name}
              </h3>

              <p
                className={cn(
"relative z-10 max-w-lg text-[15px] leading-relaxed transition-colors duration-500 sm:col-span-2 lg:col-span-1 lg:col-start-3",
                  active ? "text-muted-foreground" : "text-muted-foreground",
                )}
              >
                {service.summary}
              </p>

              <span
                aria-hidden
                className={cn(
"relative z-10 hidden size-11 shrink-0 items-center justify-center rounded-full border transition-all duration-500 lg:flex",
                  active
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-border text-foreground",
                )}
              >
                <ArrowUpRight className="size-4 transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
            </Link>
          </RevealItem>
        );
      })}
    </ul>
  );
}

/**
 * The five service lines VisaDrive already sells. This is the existing
 * business, so it gets a full section rather than a footer list.
 *
 * Used on the About page and the Services page. `tone="surface"` maps to the
 * warm `paper` ground; the default stays on the page background.
 */
export function ServicesSection({
  tone = "default",
  showIntro = true,
  className,
}: {
  tone?: SectionTone;
  showIntro?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(SECTION_GROUND[tone], "py-20 sm:py-24 lg:py-32", className)}
    >
      <div className="container-wide">
        {showIntro && (
          <Reveal className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <p className="text-eyebrow">Our services</p>
              <h2 className="display-xl mt-4 text-foreground">
                The work we take
                <br />
                off your hands.
              </h2>
            </div>
            <div className="flex flex-col items-start gap-6 lg:col-span-5">
              <p className="max-w-md text-base leading-relaxed text-muted-foreground">
                Form filling, appointments and interview preparation — the
                parts of a visa application that most often go wrong.
              </p>
              <Button asChild variant="outline">
                <Link href="/services">All services</Link>
              </Button>
            </div>
          </Reveal>
        )}

        <ServiceIndexList className={cn(showIntro && "mt-14 lg:mt-20")} />

        <Reveal className="mt-12 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h3 className="display-md text-foreground">Something else?</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              If your case does not fit neatly into one of these, tell us what
              you need and we will say honestly whether we can help.
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link href="/contact">Talk to an expert</Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
