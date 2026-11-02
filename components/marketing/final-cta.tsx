import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal } from "@/components/marketing/reveal";
import { Button } from "@/components/ui/button";
import { LEGAL } from "@/lib/constants/site";

/**
 * Closing call to action. Both buttons go somewhere real: the catalogue,
 * which is where an application actually begins, and the contact form.
 */
export function FinalCta({
  title = "Ready to plan your next journey?",
  description = "Start with your destination, or talk to someone first. Either way you will get a straight answer about what is involved.",
  primaryHref = "/destinations",
  primaryLabel = "Start your application",
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
    <section className="border-y border-border bg-background py-16 sm:py-20 lg:py-24">
      <div className="container-page">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl">{title}</h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {description}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={primaryHref}>
                {primaryLabel}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href={secondaryHref}>{secondaryLabel}</Link>
            </Button>
          </div>

          {withDisclaimer && (
            <p className="mx-auto mt-8 max-w-xl text-xs leading-relaxed text-muted-foreground">
              {LEGAL.noGuarantee}
            </p>
          )}
        </Reveal>
      </div>
    </section>
  );
}
