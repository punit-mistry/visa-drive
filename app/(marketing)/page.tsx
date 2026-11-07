import type { Metadata } from "next";

import { DestinationEditorial } from "@/components/marketing/destination-editorial";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { PlaneCursor } from "@/components/marketing/plane-cursor";
import { PassportSection } from "@/components/marketing/passport-section";
import { ServicesEditorial } from "@/components/marketing/services-editorial";
import { Testimonials } from "@/components/marketing/testimonials";
import { TrustSection } from "@/components/marketing/trust-section";
import { VisaJourney } from "@/components/marketing/visa-journey";
import { WhoWeAre } from "@/components/marketing/who-we-are";
import { SITE } from "@/lib/constants/site";

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.heroSubline,
  alternates: { canonical: "/" },
};

/**
 * Homepage composition, read as a magazine: a cover (the hero), the plates
 * everyone came for (destinations), who is behind the counter, the reason to
 * believe (trust), how it works (the journey), the interactive plate (the
 * passport), the index of what we sell (services), then a closing frame.
 *
 * The grounds are weighted deliberately — roughly six parts dark to three
 * parts warm paper. Dark is the brand's resting state and what makes the
 * photography and the red read as cinematic; the paper sections exist to
 * break it, which only works while they stay the minority.
 *
 *   dark   hero · trust · journey · passport · testimonials · closing frame
 *   paper  destinations · services · questions
 *   white  who we are
 *
 * "Who we are" sits on plain white rather than paper, which is what lets it
 * follow the paper destinations block without the two reading as one slab:
 * the run is dark → paper → white → dark.
 */
export default function HomePage() {
  return (
    <>
      {/* Homepage only: decoration has no business over a booking form. */}
      <PlaneCursor />

      <Hero />
      <DestinationEditorial />
      <WhoWeAre />
      <TrustSection />
      <VisaJourney />
      <PassportSection />
      <ServicesEditorial />
      <Testimonials tone="surface" />
      <FaqSection
        tone="paper"
        scope="global"
        title="Questions, answered"
        description="The things people ask us most often, answered by our team."
      />
      <FinalCta />
    </>
  );
}
