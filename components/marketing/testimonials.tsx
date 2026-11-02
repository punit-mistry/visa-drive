"use client";

import { Quote } from "lucide-react";

import { RevealItem } from "@/components/marketing/reveal";
import { Section, SectionIntro } from "@/components/marketing/section";
import { Skeleton } from "@/components/ui/skeleton";
import { useSiteSettings } from "@/hooks/use-site-settings";

/**
 * Testimonials, from admin-editable settings only.
 *
 * The live site has none, so the whole section disappears when the list is
 * empty rather than being filled with invented quotes. Seeded entries carry
 * `isDemo: true` and are labelled on the card itself — not in a tooltip —
 * so nobody can mistake them for a real customer.
 */
export function Testimonials({
  tone = "surface",
}: {
  tone?: "default" | "surface";
}) {
  const settings = useSiteSettings();

  if (settings.isLoading) {
    return (
      <Section tone={tone}>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-10 w-80 max-w-full" />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
          ))}
        </div>
      </Section>
    );
  }

  const testimonials = settings.testimonials ?? [];
  if (testimonials.length === 0) return null;

  return (
    <Section tone={tone}>
      <SectionIntro
        eyebrow="In their words"
        title="What travellers tell us"
      />

      <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:mt-12">
        {testimonials.map((testimonial, index) => (
          <RevealItem
            as="li"
            key={`${testimonial.name}-${index}`}
            index={index}
          >
            <figure className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 lg:p-7">
              {testimonial.isDemo && (
                <p className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-warning/25 bg-warning-soft px-2.5 py-1 text-[11px] font-medium text-warning">
                  <span className="size-1.5 rounded-full bg-warning" aria-hidden />
                  Sample content — not a real customer
                </p>
              )}

              <Quote className="size-5 text-brand/40" aria-hidden />

              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground">
                {testimonial.quote}
              </blockquote>

              <figcaption className="mt-5 border-t border-border pt-4 text-sm">
                <span className="font-medium text-foreground">
                  {testimonial.name}
                </span>
                {testimonial.context && (
                  <span className="block text-muted-foreground">
                    {testimonial.context}
                  </span>
                )}
              </figcaption>
            </figure>
          </RevealItem>
        ))}
      </ul>
    </Section>
  );
}
