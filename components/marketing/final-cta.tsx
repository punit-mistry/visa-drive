"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal } from "@/components/marketing/reveal";
import { Button } from "@/components/ui/button";
import { LEGAL } from "@/lib/constants/site";

/**
 * Closing frame.
 *
 * It used to sit on a night photograph with a looping video behind it. Both
 * were decoration, both were held at 30% under a scrim, and neither said
 * anything the two buttons do not — so the section is just the ask now, on
 * paper. Both buttons go somewhere real: the catalogue, where an application
 * actually begins, and the contact form.
 */

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
    <section className="relative isolate overflow-hidden bg-surface py-24 sm:py-28 lg:py-36">
      <div className="container-wide relative z-10">
        <Reveal className="max-w-3xl">
          <p className="text-eyebrow">Ready when you are</p>

          <h2 className="display-xl mt-5 text-foreground">{title}</h2>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
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
              className="h-12 border-border-strong bg-background px-6 text-[15px] font-semibold text-foreground backdrop-blur-sm hover:border-border-strong hover:bg-background hover:text-foreground dark:border-border-strong dark:bg-background"
            >
              <Link href={secondaryHref}>{secondaryLabel}</Link>
            </Button>
          </div>

          {withDisclaimer && (
            <p className="mt-12 max-w-xl border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
              {LEGAL.noGuarantee}
            </p>
          )}
        </Reveal>
      </div>
    </section>
  );
}
