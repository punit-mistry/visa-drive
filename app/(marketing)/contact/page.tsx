import type { Metadata } from "next";
import { Suspense } from "react";

import { ContactDetails } from "@/components/marketing/contact-details";
import { EnquiryForm } from "@/components/marketing/enquiry-form";
import { FaqSection } from "@/components/marketing/faq-section";
import { LegalNotes } from "@/components/marketing/legal-notes";
import { Skeleton } from "@/components/ui/skeleton";
import { SITE } from "@/lib/constants/site";

export const metadata: Metadata = {
  title: "Contact VisaDrive",
  description: `Talk to VisaDrive about your visa application. ${SITE.address.short}. Send an enquiry and we will come back to you with a reference number.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <section className="border-b border-border bg-background">
        <div className="container-page py-12 sm:py-16">
          <div className="max-w-2xl">
            <p className="text-eyebrow">Contact</p>
            <h1 className="mt-3 text-4xl sm:text-5xl">Talk to an expert</h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Tell us about your trip. We will tell you what is involved, what we
              can do and what we cannot — before you commit to anything.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-surface py-12 sm:py-16">
        <div className="container-page grid gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7 xl:col-span-8">
            {/* The form reads prefill values out of the URL, so it is dynamic
                and gets its own boundary. */}
            <Suspense fallback={<FormSkeleton />}>
              <EnquiryForm />
            </Suspense>
          </div>

          <aside className="lg:col-span-5 xl:col-span-4">
            <div className="rounded-2xl border border-border bg-card p-6 sm:p-7">
              <h2 className="text-xl font-semibold">Reach us directly</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                If it is urgent, calling or messaging is faster than the form.
              </p>
              <ContactDetails className="mt-6" layout="stack" />
            </div>

            <LegalNotes
              className="mt-6"
              title="Before you write"
              keys={[
                "notAffiliated",
                "noGuarantee",
                "noAdvancePayment",
                "dataNotSold",
              ]}
            />
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
