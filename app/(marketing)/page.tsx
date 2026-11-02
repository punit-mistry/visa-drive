import type { Metadata } from "next";

import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { PopularDestinations } from "@/components/marketing/popular-destinations";
import { ServicesSection } from "@/components/marketing/services-section";
import { Testimonials } from "@/components/marketing/testimonials";
import { ValueProps } from "@/components/marketing/value-props";
import { SITE } from "@/lib/constants/site";

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.heroSubline,
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <PopularDestinations />
      <HowItWorks />
      <ValueProps tone="surface" />
      <ServicesSection />
      <Testimonials tone="surface" />
      <FaqSection
        scope="global"
        title="Questions, answered"
        description="The things people ask us most often, answered by our team."
      />
      <FinalCta />
    </>
  );
}
