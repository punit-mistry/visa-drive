import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ContactDetails } from "@/components/marketing/contact-details";
import { FinalCta } from "@/components/marketing/final-cta";
import { LegalNotes } from "@/components/marketing/legal-notes";
import { ON_DARK_OUTLINE, PageHero } from "@/components/marketing/page-hero";
import { PrinciplesEditorial } from "@/components/marketing/principles-editorial";
import { Reveal } from "@/components/marketing/reveal";
import { ServicesEditorial } from "@/components/marketing/services-editorial";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/constants/site";

export const metadata: Metadata = {
  title: "About VisaDrive",
  description: `${SITE.shortDescription} ${SITE.mission}`,
  alternates: { canonical: "/about" },
};

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=2400&q=72";

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About"
        title="A small team that reads your case."
        description={`${SITE.shortDescription} We handle visa documentation, appointment support and interview preparation for travellers from India and beyond.`}
        image={HERO_IMAGE}
        marks={[
          `Founded by ${SITE.founder}`,
          `${SITE.address.locality} · ${SITE.address.city}`,
        ]}
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

      {/* Mission and honesty — paper ground. */}
      <section className="bg-paper py-20 sm:py-24 lg:py-32">
        <div className="container-wide">
          <Reveal className="max-w-5xl">
            <p className="text-eyebrow">Our mission</p>
            <h2 className="display-xl mt-4 text-ink-black">{SITE.mission}</h2>
            <p className="mt-8 text-sm text-muted-foreground">
              Founded by{" "}
              <span className="font-medium text-ink-black">{SITE.founder}</span>
              , based in {SITE.address.locality}, {SITE.address.city}.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-10 border-t border-ink-black/12 pt-12 lg:mt-24 lg:grid-cols-12 lg:gap-16 lg:pt-16">
            <Reveal className="lg:col-span-5">
              <h2 className="display-md text-ink-black">
                How we talk about visas
              </h2>
            </Reveal>
            <Reveal className="space-y-5 lg:col-span-7" delay={0.06}>
              <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
                Visa marketing is full of promises nobody can keep — guaranteed
                approvals, guaranteed dates, approval rates nobody can audit. We
                do not make them, and we would rather lose the booking than
                imply an outcome we do not control.
              </p>
              <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
                What we can promise is the part that is ours: a complete,
                accurate application, documents checked before they go
                anywhere, and a straight answer whenever you ask where things
                stand.
              </p>
              <LegalNotes
                className="mt-8"
                title="In our own words"
                keys={["notAffiliated", "noGuarantee"]}
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* Why VisaDrive — ink ground. */}
      <PrinciplesEditorial />

      {/* Services — paper ground. */}
      <ServicesEditorial />

      {/* Find us — plain ground, a hairline above to mark the change. */}
      <section className="border-t border-border bg-background py-20 sm:py-24 lg:py-32">
        <div className="container-wide grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-6">
            <p className="text-eyebrow">Find us</p>
            <h2 className="display-xl mt-4 text-foreground">
              {SITE.address.locality},
              <br />
              {SITE.address.city}.
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
              We work with applicants across India and overseas. Call, email or
              message us on WhatsApp — whichever is easiest.
            </p>
          </Reveal>
          <Reveal className="lg:col-span-6 lg:pt-4" delay={0.08}>
            <ContactDetails layout="rows" />
          </Reveal>
        </div>
      </section>

      <FinalCta />
    </>
  );
}
