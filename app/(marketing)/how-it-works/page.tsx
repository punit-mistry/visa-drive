import type { Metadata } from "next";
import Link from "next/link";

import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/final-cta";
import { HOW_IT_WORKS_STEPS } from "@/components/marketing/how-it-works";
import { LegalNotes } from "@/components/marketing/legal-notes";
import { Reveal, RevealItem } from "@/components/marketing/reveal";
import { ValueProps } from "@/components/marketing/value-props";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Choose your destination, complete your application, upload your documents and track progress — the four stages of a VisaDrive application, explained.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <>
      <section className="border-b border-border bg-background">
        <div className="container-page py-12 sm:py-16 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-eyebrow">How it works</p>
            <h1 className="mt-3 text-4xl sm:text-5xl">
              Four steps, start to finish
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              A visa application is mostly paperwork and timing. Here is exactly
              what we do, what we need from you, and what remains outside anyone&rsquo;s
              control.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/destinations">Start your application</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/contact">Talk to an expert</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface py-14 sm:py-20">
        <div className="container-page">
          <ol className="space-y-px overflow-hidden rounded-2xl border border-border bg-border">
            {HOW_IT_WORKS_STEPS.map((step, index) => (
              <RevealItem
                as="li"
                key={step.number}
                index={index}
                className="bg-card"
              >
                <div className="grid gap-6 p-6 sm:grid-cols-12 sm:gap-10 sm:p-8 lg:p-10">
                  <div className="sm:col-span-4">
                    <div className="flex items-center gap-4">
                      <span className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-surface text-brand">
                        <step.icon className="size-5" aria-hidden />
                      </span>
                      <span className="font-mono text-xs text-muted-foreground/70">
                        {step.number}
                      </span>
                    </div>
                    <h2 className="mt-5 text-xl font-semibold sm:text-2xl">
                      {step.title}
                    </h2>
                  </div>

                  <div className="sm:col-span-8">
                    <p className="text-base leading-relaxed text-foreground">
                      {step.body}
                    </p>
                    <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
                      {step.detail}
                    </p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </ol>

          <Reveal>
            <LegalNotes
              className="mt-10"
              title="What is not in our hands"
              keys={[
                "noGuarantee",
                "appointmentAvailability",
                "governmentFeesSeparate",
                "accuracyObligation",
              ]}
            />
          </Reveal>
        </div>
      </section>

      <ValueProps />

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
