import type { Metadata } from "next";
import { Suspense } from "react";

import { DestinationsBrowser } from "@/components/marketing/destinations-browser";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/final-cta";
import { CardGridSkeleton } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Visa destinations",
  description:
    "Browse the countries VisaDrive handles end to end, with the visa types available for each and what every application involves.",
  alternates: { canonical: "/destinations" },
};

export default function DestinationsPage() {
  return (
    <>
      {/* The browser reads the discovery parameters out of the URL, so it is
          dynamic and needs its own boundary rather than blocking the shell. */}
      <Suspense fallback={<DestinationsFallback />}>
        <DestinationsBrowser />
      </Suspense>
      <FaqSection
        scope="global"
        title="Before you apply"
        description="What people usually want to know before choosing a destination."
        tone="default"
      />
      <FinalCta
        title="Not sure which visa you need?"
        description="Tell us about your trip and we will tell you what is involved — including when the answer is that we cannot help."
        primaryHref="/contact"
        primaryLabel="Talk to an expert"
        secondaryHref="/how-it-works"
        secondaryLabel="See how it works"
      />
    </>
  );
}

function DestinationsFallback() {
  return (
    <>
      <section className="border-b border-border bg-background">
        <div className="container-page py-12 sm:py-16">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-4 h-11 w-full max-w-lg" />
          <Skeleton className="mt-4 h-5 w-full max-w-2xl" />
          <Skeleton className="mt-8 h-9 w-full max-w-sm" />
        </div>
      </section>
      <section className="bg-surface py-14 sm:py-16">
        <div className="container-page">
          <CardGridSkeleton count={6} />
        </div>
      </section>
    </>
  );
}
