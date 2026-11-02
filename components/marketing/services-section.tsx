import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { IconTile } from "@/components/marketing/icon";
import { RevealItem } from "@/components/marketing/reveal";
import { Section, SectionIntro } from "@/components/marketing/section";
import { MARKETING_SERVICES } from "@/components/marketing/services";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The five service lines VisaDrive already sells. This is the existing
 * business, so it gets a full section rather than a footer list.
 */
export function ServicesSection({
  tone = "default",
  showIntro = true,
  className,
}: {
  tone?: "default" | "surface";
  showIntro?: boolean;
  className?: string;
}) {
  return (
    <Section tone={tone} className={className}>
      {showIntro && (
        <SectionIntro
          eyebrow="Our services"
          title="The work we take off your hands"
          description="Form filling, appointments and interview preparation — the parts of a visa application that most often go wrong."
          action={
            <Button asChild variant="outline">
              <Link href="/services">All services</Link>
            </Button>
          }
        />
      )}

      <ul className={cn("grid gap-5 sm:grid-cols-2 lg:grid-cols-3", showIntro && "mt-10 lg:mt-12")}>
        {MARKETING_SERVICES.map((service, index) => {
          return (
            <RevealItem as="li" key={service.key} index={index}>
              <article className="group relative flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-shadow duration-300 hover:elev-md lg:p-7">
                <IconTile name={service.icon} className="bg-surface" />

                <h3 className="mt-5 text-base font-semibold">
                  <Link
                    href={`/services/${service.slug}`}
                    className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-brand"
                  >
                    {service.name}
                  </Link>
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {service.summary}
                </p>

                <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
                  Learn more
                  <ArrowRight
                    className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </p>
              </article>
            </RevealItem>
          );
        })}

        <RevealItem as="li" index={MARKETING_SERVICES.length}>
          <div className="flex h-full flex-col justify-between rounded-2xl border border-dashed border-border bg-surface p-6 lg:p-7">
            <div>
              <h3 className="text-base font-semibold">Something else?</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                If your case does not fit neatly into one of these, tell us what
                you need and we will say honestly whether we can help.
              </p>
            </div>
            <Button asChild variant="outline" className="mt-5 w-fit">
              <Link href="/contact">Talk to an expert</Link>
            </Button>
          </div>
        </RevealItem>
      </ul>
    </Section>
  );
}
