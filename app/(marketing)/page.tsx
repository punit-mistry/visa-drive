import type { Metadata } from "next";

import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { PopularDestinations } from "@/components/marketing/popular-destinations";
import { ServicesSection } from "@/components/marketing/services-section";
import { Testimonials } from "@/components/marketing/testimonials";
import { TrustSection } from "@/components/marketing/trust-section";
import { ValueProps } from "@/components/marketing/value-props";
import { SITE } from "@/lib/constants/site";

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.heroSubline,
  alternates: { canonical: "/" },
};

/**
 * Homepage order follows the order of a visitor's questions:
 * where can you send me → can I trust you → how does it work → what else do
 * you do → what are people asking. The trust section sits third because the
 * objection it answers ("is this a scam?") blocks every section after it.
 *
 * Tones alternate white/surface so the page reads as one document rather
 * than a stack of unrelated blocks.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <PopularDestinations />
      <TrustSection />
      <HowItWorks tone="surface" />
      <ValueProps />
      <ServicesSection tone="surface" />
      <Testimonials tone="default" />
      <FaqSection
        tone="surface"
        scope="global"
        title="Questions, answered"
        description="The things people ask us most often, answered by our team."
      />
      <FinalCta />
    </>
  );
}
