import type { Metadata } from "next";

import { VisaProductDetail } from "@/components/marketing/visa-product-detail";
import { titleCase } from "@/lib/helpers/format";

/**
 * Both slugs are admin-managed Convex data, so there is no build-time list to
 * generate static params from. Let the route block on the request instead of
 * failing prerender validation.
 */
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; visaSlug: string }>;
}): Promise<Metadata> {
  const { slug, visaSlug } = await params;
  const country = titleCase(slug.replace(/-/g, " "));
  const visa = titleCase(visaSlug.replace(/-/g, " "));

  return {
    title: `${visa} — ${country}`,
    description: `What the ${visa} for ${country} covers, the documents required and how VisaDrive handles the application.`,
    alternates: { canonical: `/destinations/${slug}/${visaSlug}` },
  };
}

export default async function VisaProductPage({
  params,
}: {
  params: Promise<{ slug: string; visaSlug: string }>;
}) {
  const { slug, visaSlug } = await params;

  return <VisaProductDetail destinationSlug={slug} slug={visaSlug} />;
}
