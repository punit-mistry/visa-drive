import type { Metadata } from "next";

import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/final-cta";
import { LegalNotes } from "@/components/marketing/legal-notes";
import { ServicesSection } from "@/components/marketing/services-section";
import { EXISTING_SERVICES } from "@/lib/constants/site";

export const metadata: Metadata = {
  title: "Visa services",
  description: `DS-160 form filling, express appointment assistance, interview guidance, Dropbox renewal support and appointment re-scheduling from VisaDrive, a private visa consultancy in Mumbai.`,
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <>
      <section className="border-b border-border bg-background">
        <div className="container-page py-12 sm:py-16 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-eyebrow">Services</p>
            <h1 className="mt-3 text-4xl sm:text-5xl">
              What VisaDrive actually does
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              {EXISTING_SERVICES.length} service lines, built around the parts of
              a visa application that most often go wrong: the form, the
              appointment and the interview.
            </p>
          </div>
        </div>
      </section>

      <ServicesSection showIntro={false} tone="surface" />

      <section className="bg-background py-12 sm:py-14">
        <div className="container-page">
          <LegalNotes
            title="What we can and cannot promise"
            keys={[
              "notAffiliated",
              "noGuarantee",
              "appointmentAvailability",
              "noAdvancePayment",
              "governmentFeesSeparate",
            ]}
          />
        </div>
      </section>

      <FaqSection
        scope="global"
        tone="surface"
        title="About our services"
        description="Questions people ask before booking one of our services."
      />

      <FinalCta
        title="Ready to plan your next journey?"
        description="Tell us what you need and we will say plainly how we can help — and when we cannot."
        primaryHref="/contact"
        primaryLabel="Talk to an expert"
        secondaryHref="/destinations"
        secondaryLabel="Browse destinations"
      />
    </>
  );
}
