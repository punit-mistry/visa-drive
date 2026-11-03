import type { Metadata } from "next";
import { Suspense } from "react";

import { ContactDetails } from "@/components/marketing/contact-details";
import { EnquiryForm } from "@/components/marketing/enquiry-form";
import { FaqSection } from "@/components/marketing/faq-section";
import { LegalNotes } from "@/components/marketing/legal-notes";
import { PageHero } from "@/components/marketing/page-hero";
import { Reveal } from "@/components/marketing/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { SITE } from "@/lib/constants/site";

export const metadata: Metadata = {
  title: "Contact VisaDrive",
  description: `Talk to VisaDrive about your visa application. ${SITE.address.short}. Send an enquiry and we will come back to you with a reference number.`,
  alternates: { canonical: "/contact" },
};

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=2400&q=72";

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title={
          <>
            Talk to
            <br />
            an expert.
          </>
        }
        description="Tell us about your trip. We will tell you what is involved, what we can do and what we cannot — before you commit to anything."
        image={HERO_IMAGE}
        marks={[SITE.address.locality + " · " + SITE.address.city]}
      />

      <section className="bg-paper py-20 sm:py-24 lg:py-32">
        <div className="container-wide grid gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7 xl:col-span-8">
            <Reveal>
              <p className="text-eyebrow">Send an enquiry</p>
              <h2 className="display-lg mt-4 text-ink-black">
                Write to us
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
                Send an enquiry and we will come back to you with a reference
                number.
              </p>
            </Reveal>

            <div className="mt-10">
              {/* The form reads prefill values out of the URL, so it is dynamic
                  and gets its own boundary. */}
              <Suspense fallback={<FormSkeleton />}>
                <EnquiryForm />
              </Suspense>
            </div>
          </div>

          <aside className="lg:col-span-5 lg:pt-3 xl:col-span-4">
            <Reveal delay={0.08}>
              <p className="text-eyebrow">Reach us directly</p>
              <h2 className="display-md mt-4 text-ink-black">
                Prefer to talk?
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                If it is urgent, calling or messaging is faster than the form.
              </p>
              <ContactDetails className="mt-8" layout="rows" />

              <LegalNotes
                className="mt-10"
                title="Before you write"
                keys={[
                  "notAffiliated",
                  "noGuarantee",
                  "noAdvancePayment",
                  "dataNotSold",
                ]}
              />
            </Reveal>
          </aside>
        </div>
      </section>

      <FaqSection
        scope="global"
        title="Might already be answered"
        description="A few of the questions we are asked most often."
      />
    </>
  );
}

function FormSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <div className="space-y-2 sm:col-span-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
      <Skeleton className="mt-6 h-10 w-40" />
    </div>
  );
}
