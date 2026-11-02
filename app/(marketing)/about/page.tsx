import type { Metadata } from "next";
import Link from "next/link";

import { ContactDetails } from "@/components/marketing/contact-details";
import { FinalCta } from "@/components/marketing/final-cta";
import { LegalNotes } from "@/components/marketing/legal-notes";
import { Reveal } from "@/components/marketing/reveal";
import { ServicesSection } from "@/components/marketing/services-section";
import { ValueProps } from "@/components/marketing/value-props";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/constants/site";

export const metadata: Metadata = {
  title: "About VisaDrive",
  description: `${SITE.shortDescription} ${SITE.mission}`,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <section className="border-b border-border bg-background">
        <div className="container-page py-12 sm:py-16 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-7">
              <p className="text-eyebrow">About</p>
              <h1 className="mt-3 text-4xl sm:text-5xl">
                A small team that reads your case
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                {SITE.shortDescription} We handle visa documentation, appointment
                support and interview preparation for travellers from India and
                beyond.
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

            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
                <p className="text-eyebrow">Our mission</p>
                <p className="mt-4 text-xl font-medium leading-snug text-foreground sm:text-2xl">
                  {SITE.mission}
                </p>
                <p className="mt-6 border-t border-border pt-6 text-sm text-muted-foreground">
                  Founded by{" "}
                  <span className="font-medium text-foreground">
                    {SITE.founder}
                  </span>
                  , based in {SITE.address.locality}, {SITE.address.city}.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface py-14 sm:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <h2 className="text-3xl">How we talk about visas</h2>
          </div>
          <div className="space-y-5 lg:col-span-7">
            <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
              Visa marketing is full of promises nobody can keep — guaranteed
              approvals, guaranteed dates, approval rates nobody can audit. We do
              not make them, and we would rather lose the booking than imply an
              outcome we do not control.
            </p>
            <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
              What we can promise is the part that is ours: a complete, accurate
              application, documents checked before they go anywhere, and a
              straight answer whenever you ask where things stand.
            </p>
            <LegalNotes
              className="mt-8"
              title="In our own words"
              keys={["notAffiliated", "noGuarantee"]}
            />
          </div>
        </div>
      </section>

      <ValueProps />

      <ServicesSection tone="surface" />

      <section className="border-t border-border bg-background py-14 sm:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <Reveal>
              <p className="text-eyebrow">Find us</p>
              <h2 className="mt-3 text-3xl">Khar West, Mumbai</h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                We work with applicants across India and overseas. Call, email or
                message us on WhatsApp — whichever is easiest.
              </p>
            </Reveal>
          </div>
          <div className="lg:col-span-7">
            <ContactDetails layout="stack" />
          </div>
        </div>
      </section>

      <FinalCta />
    </>
  );
}
