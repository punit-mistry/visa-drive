"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Globe } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { PublishedDestination } from "@/components/marketing/catalogue";
import { DestinationCard } from "@/components/marketing/destination-card";
import { Reveal, RevealItem } from "@/components/marketing/reveal";
import { Section, SectionIntro } from "@/components/marketing/section";
import { useDestinationProducts } from "@/components/marketing/use-destination-products";
import { EmptyState, CardGridSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

/**
 * The six launch destinations, straight off `destinations.listPublished`.
 * Nothing is hard-coded: if the catalogue is empty the section says so and
 * points at the contact form rather than rendering invented countries.
 */
export function PopularDestinations({ limit = 6 }: { limit?: number }) {
  const destinations = useQuery(api.destinations.listPublished, { limit }) as
    | PublishedDestination[]
    | undefined;
  const { byDestination } = useDestinationProducts();

  return (
    <Section tone="surface">
      <SectionIntro
        eyebrow="Destinations"
        title="Where are you headed?"
        description="The countries we currently handle end to end, with the visa types available for each."
        action={
          <Button asChild variant="outline">
            <Link href="/destinations">All destinations</Link>
          </Button>
        }
      />

      <div className="mt-10 sm:mt-12">
        {destinations === undefined ? (
          <CardGridSkeleton count={6} />
        ) : destinations.length === 0 ? (
          <Reveal>
            <EmptyState
              icon={Globe}
              title="Destinations are being added"
              description="Our visa catalogue is not published yet. Tell us where you are travelling and we will come back to you with the options."
              action={
                <Button asChild>
                  <Link href="/contact">Talk to an expert</Link>
                </Button>
              }
            />
          </Reveal>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {destinations.map((destination, index) => (
              <RevealItem as="li" key={destination._id} index={index}>
                <DestinationCard
                  className="h-full"
                  priority={index < 3}
                  destination={{
                    _id: destination._id,
                    slug: destination.slug,
                    name: destination.name,
                    countryCode: destination.countryCode,
                    flagEmoji: destination.flagEmoji,
                    tagline: destination.tagline,
                    summary: destination.summary,
                    cardImageUrl: destination.cardImageUrl,
                    currency: destination.currency,
                    productCount: destination.productCount,
                    startingPrice: destination.startingPrice,
                  }}
                  products={byDestination[destination.slug] ?? []}
                />
              </RevealItem>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
