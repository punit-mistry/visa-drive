import type { Metadata } from "next";

import { DestinationDetail } from "@/components/marketing/destination-detail";
import { FinalCta } from "@/components/marketing/final-cta";
import { titleCase } from "@/lib/helpers/format";

/**
 * Destination slugs are admin-managed Convex data, so there is no build-time
 * list to generate static params from. Let the route block on the request
 * instead of failing prerender validation.
 */
export const instant = false;

/**
 * Metadata is built from the slug rather than a catalogue read, because the
 * copy an admin writes for a destination is editorial and may be empty. A
 * title derived from the route can never claim something the database does
 * not say.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = titleCase(slug.replace(/-/g, " "));

  return {
    title: `${name} visas`,
    description: `Visa types for ${name} handled by VisaDrive — what each one covers, what we do for you, and what the application involves.`,
    alternates: { canonical: `/destinations/${slug}` },
  };
}

export default async function DestinationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <>
      <DestinationDetail slug={slug} />
      <FinalCta
        title="Ready to plan your next journey?"
        description="Start your application online, or speak to someone who has handled this route before."
        primaryHref="/destinations"
        primaryLabel="Start your application"
        secondaryHref="/contact"
        secondaryLabel="Talk to an expert"
        withDisclaimer={false}
      />
    </>
  );
}
