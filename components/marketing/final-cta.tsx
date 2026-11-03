"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AmbientVideo } from "@/components/marketing/ambient-video";
import { Reveal } from "@/components/marketing/reveal";
import { Button } from "@/components/ui/button";
import { LEGAL } from "@/lib/constants/site";

/**
 * Closing frame.
 *
 * Shibuya Crossing at night, held well back behind the type — it is
 * atmosphere, not content, so it carries no information and no alt text. The
 * still is a frame from the loop, so there is never a cut between scenes
 * when playback starts, and it is what renders whenever the video does not. Both buttons go
 * somewhere real: the catalogue, where an application actually begins, and
 * the contact form.
 */

/** A frame from the loop below, so the two never cut between scenes. */
const CTA_IMAGE = "/media/tokyo-night.jpg";
const CTA_VIDEO = "/media/tokyo-night.mp4";

export function FinalCta({
  title = "Your next chapter starts here.",
  description = "Make your next international journey a little simpler with VisaDrive.",
  primaryHref = "/destinations",
  primaryLabel = "Start your visa journey",
  secondaryHref = "/contact",
  secondaryLabel = "Talk to an expert",
  withDisclaimer = true,
}: {
  title?: string;
  description?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  withDisclaimer?: boolean;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-ink-black py-24 sm:py-28 lg:py-36">
      <div aria-hidden className="absolute inset-0 opacity-30">
        <Image
          src={CTA_IMAGE}
          alt=""
          fill
          sizes="100vw"
          quality={70}
          className="object-cover object-center"
        />
        <AmbientVideo src={CTA_VIDEO} poster={CTA_IMAGE} />
      </div>
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-ink-black via-ink-black/80 to-ink-black/70"
      />

      <div className="container-wide relative z-10">
        <Reveal className="max-w-3xl">
          <p className="text-eyebrow-dark">Ready when you are</p>

          <h2 className="display-xl mt-5 text-paper">{title}</h2>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">
            {description}
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              className="h-12 px-7 text-[15px] font-semibold"
            >
              <Link href={primaryHref}>
                {primaryLabel}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 border-white/30 bg-white/5 px-6 text-[15px] font-semibold text-white backdrop-blur-sm hover:border-white/50 hover:bg-white/10 hover:text-white dark:border-white/30 dark:bg-white/5"
            >
              <Link href={secondaryHref}>{secondaryLabel}</Link>
            </Button>
          </div>

          {withDisclaimer && (
            <p className="mt-12 max-w-xl border-t border-white/12 pt-6 text-xs leading-relaxed text-white/40">
              {LEGAL.noGuarantee}
            </p>
          )}
        </Reveal>
      </div>
    </section>
  );
}
