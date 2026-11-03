import type { Metadata } from "next";
import Image from "next/image";

import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/final-cta";
import { LegalNotes } from "@/components/marketing/legal-notes";
import { FadeIn } from "@/components/marketing/reveal";
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
      <section className="relative isolate overflow-hidden bg-ink-black py-20 text-paper sm:py-24 lg:py-32">
        {/* Atmosphere only: reviewing the document set is the work this page
            sells, and the photograph carries no information the copy does not. */}
        <Image
          src="/media/hero-services.jpg"
          alt=""
          aria-hidden
          fill
          priority
          sizes="100vw"
          quality={70}
          className="object-cover object-center opacity-60"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-ink-black via-ink-black/45 to-ink-black/10"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-ink-black/90 via-ink-black/55 to-transparent"
        />

        <div className="container-wide relative z-10">
          <FadeIn className="grid gap-10 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <p className="text-eyebrow-dark">Services</p>
              <h1 className="display-xl mt-4 text-paper">
                What VisaDrive
                <br />
                actually does.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-white/55 sm:text-lg">
                {EXISTING_SERVICES.length} service lines, built around the
                parts of a visa application that most often go wrong: the form,
                the appointment and the interview.
              </p>
            </div>

            <div
              aria-hidden
              className="flex items-end gap-4 border-t border-white/12 pt-6 lg:col-span-4 lg:justify-end lg:border-t-0 lg:pt-0"
            >
              <span className="numeral text-7xl leading-none text-white/25 sm:text-8xl lg:text-9xl">
                {String(EXISTING_SERVICES.length).padStart(2, "0")}
              </span>
              <span className="text-eyebrow-dark pb-2">Service lines</span>
            </div>
          </FadeIn>
        </div>
      </section>

      <ServicesSection showIntro={false} tone="surface" />

      <section className="bg-background py-16 sm:py-20">
        <div className="container-wide">
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
