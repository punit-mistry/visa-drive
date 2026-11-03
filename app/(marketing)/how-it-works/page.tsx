import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/final-cta";
import { HowItWorksSteps } from "@/components/marketing/how-it-works";
import { ON_DARK_OUTLINE, PageHero } from "@/components/marketing/page-hero";
import { PrinciplesEditorial } from "@/components/marketing/principles-editorial";
import { Reveal, RevealItem } from "@/components/marketing/reveal";
import { Button } from "@/components/ui/button";
import { LEGAL } from "@/lib/constants/site";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Choose your destination, complete your application, upload your documents and track progress — the four stages of a VisaDrive application, explained.",
  alternates: { canonical: "/how-it-works" },
};

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=2400&q=72";

/** The statements the site can never make for the authorities. Verbatim. */
const NOT_IN_OUR_HANDS = [
  LEGAL.noGuarantee,
  LEGAL.appointmentAvailability,
  LEGAL.governmentFeesSeparate,
  LEGAL.accuracyObligation,
] as const;

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title={
          <>
            Four steps,
            <br />
            start to finish.
          </>
        }
        description="A visa application is mostly paperwork and timing. Here is exactly what we do, what we need from you, and what remains outside anyone’s control."
        image={HERO_IMAGE}
        actions={
          <>
            <Button
              asChild
              size="lg"
              className="h-12 px-7 text-[15px] font-semibold"
            >
              <Link href="/destinations">
                Start your application
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className={ON_DARK_OUTLINE}
            >
              <Link href="/contact">Talk to an expert</Link>
            </Button>
          </>
        }
      />

      {/* The walk-through and its limits — paper ground. */}
      <section className="bg-paper py-20 sm:py-24 lg:py-32">
        <div className="container-wide">
          <HowItWorksSteps />

          <div className="mt-20 grid gap-10 lg:mt-28 lg:grid-cols-12 lg:gap-16">
            <Reveal className="lg:col-span-5">
              <p className="text-eyebrow">Good to know</p>
              <h2 className="display-lg mt-4 text-ink-black">
                What is not in our hands
              </h2>
            </Reveal>

            <ul className="lg:col-span-7">
              {NOT_IN_OUR_HANDS.map((statement, index) => (
                <RevealItem
                  as="li"
                  key={statement}
                  index={index}
                  className="flex gap-4 border-t border-ink-black/12 py-5 last:border-b"
                >
                  <span
                    aria-hidden
                    className="mt-2.5 size-1.5 shrink-0 rounded-full bg-brand"
                  />
                  <p className="max-w-xl text-base leading-relaxed text-ink-black">
                    {statement}
                  </p>
                </RevealItem>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Why VisaDrive — ink ground. */}
      <PrinciplesEditorial />

      <FaqSection
        scope="global"
        tone="surface"
        title="Questions about the process"
        description="What people usually ask before they begin."
      />

      <FinalCta />
    </>
  );
}
