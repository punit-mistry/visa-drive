import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Crumbs } from "@/components/marketing/crumbs";
import { FinalCta } from "@/components/marketing/final-cta";
import { HOW_IT_WORKS_STEPS } from "@/components/marketing/how-it-works";
import { LegalNotes } from "@/components/marketing/legal-notes";
import { FadeIn, Reveal, RevealItem } from "@/components/marketing/reveal";
import { ServiceIndexList } from "@/components/marketing/services-section";
import {
  MARKETING_SERVICES,
  SERVICE_SLUGS,
  serviceBySlug,
} from "@/components/marketing/services";
import { WhatsAppButton } from "@/components/shared/whatsapp-button";
import { Button } from "@/components/ui/button";

export function generateStaticParams() {
  return SERVICE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = serviceBySlug(slug);

  if (!service) {
    return { title: "Service not found" };
  }

  return {
    title: service.name,
    description: service.summary,
    alternates: { canonical: `/services/${service.slug}` },
  };
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = serviceBySlug(slug);

  if (!service) notFound();

  const others = MARKETING_SERVICES.filter((item) => item.key !== service.key);
  const position =
    MARKETING_SERVICES.findIndex((item) => item.key === service.key) + 1;
  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    <>
      {/* Opening — warm paper ground, the service's place in the index set
          oversized beside its name. */}
      <section className="bg-paper py-16 sm:py-20 lg:py-28">
        <div className="container-wide">
          <Crumbs
            items={[
              { label: "Services", href: "/services" },
              { label: service.name },
            ]}
          />

          <FadeIn className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <p className="text-eyebrow">
                Service {pad(position)} of {pad(MARKETING_SERVICES.length)}
              </p>
              <h1 className="display-xl mt-4 text-ink-black">{service.name}</h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                {service.summary}
              </p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 px-7 text-[15px] font-semibold">
                  <Link
                    href={`/contact?service=${encodeURIComponent(service.name)}`}
                  >
                    Enquire about this service
                  </Link>
                </Button>
                <WhatsAppButton
                  variant="inline"
                  className="h-12 px-6 text-[15px]"
                  label="Ask on WhatsApp"
                  message={`Hi VisaDrive, I would like help with ${service.name}.`}
                />
              </div>
            </div>

            <span
              aria-hidden
              className="numeral hidden text-[9rem] leading-none text-ink-black/10 lg:col-span-4 lg:block lg:text-right xl:text-[12rem]"
            >
              {pad(position)}
            </span>
          </FadeIn>
        </div>
      </section>

      {/* How this works — the same four steps every VisaDrive engagement runs
          through. Nothing service-specific is claimed here that the client has
          not already put in writing. */}
      <section className="bg-ink-black py-20 text-paper sm:py-24 lg:py-32">
        <div className="container-wide">
          <Reveal className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <p className="text-eyebrow-dark">How it works</p>
              <h2 className="display-xl mt-4 text-paper">
                What happens after
                <br />
                you get in touch.
              </h2>
            </div>
          </Reveal>

          <ol className="mt-14 lg:mt-20">
            {HOW_IT_WORKS_STEPS.map((step, index) => (
              <RevealItem as="li" key={step.number} index={index}>
                <div className="group grid gap-x-8 gap-y-3 border-t border-white/12 py-8 sm:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[10rem_minmax(0,22rem)_minmax(0,1fr)] lg:py-11">
                  <span className="numeral text-5xl leading-none text-white/25 transition-colors duration-500 group-hover:text-brand lg:text-7xl">
                    {step.number}
                  </span>

                  <h3 className="display-md text-paper">{step.title}</h3>

                  <p className="max-w-md text-[15px] leading-relaxed text-white/55 sm:col-start-2 lg:col-start-3">
                    {step.detail}
                  </p>
                </div>
              </RevealItem>
            ))}
          </ol>

          <div className="border-t border-white/12" />
        </div>
      </section>

      {/* Good to know — the client's own LEGAL statements for this service,
          reproduced verbatim from `service.disclaimers`. */}
      <section className="bg-background py-20 sm:py-24 lg:py-32">
        <div className="container-wide grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <p className="text-eyebrow">The fine print</p>
            <h2 className="display-lg mt-4 text-ink-black">Good to know.</h2>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              These statements are VisaDrive&rsquo;s own terms and apply to this
              service.
            </p>
          </Reveal>

          <div className="lg:col-span-7">
            <ol className="border-t border-ink-black/12">
              {service.disclaimers.map((statement, index) => (
                <RevealItem
                  as="li"
                  key={statement}
                  index={index}
                  className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 border-b border-ink-black/12 py-6 sm:grid-cols-[4rem_minmax(0,1fr)]"
                >
                  <span
                    aria-hidden
                    className="numeral text-xl leading-none text-ink-black/25 sm:text-2xl"
                  >
                    {pad(index + 1)}
                  </span>
                  <span className="max-w-prose text-[15px] leading-relaxed text-muted-foreground">
                    {statement}
                  </span>
                </RevealItem>
              ))}
            </ol>
            <LegalNotes
              className="mt-10"
              title="Also worth knowing"
              keys={["notAffiliated"]}
            />
          </div>
        </div>
      </section>

      <section className="bg-paper py-20 sm:py-24 lg:py-32">
        <div className="container-wide">
          <Reveal>
            <p className="text-eyebrow">Keep reading</p>
            <h2 className="display-lg mt-4 text-ink-black">Other services.</h2>
          </Reveal>
          <ServiceIndexList services={others} className="mt-12 lg:mt-16" />
        </div>
      </section>

      <FinalCta
        title="Ready to plan your next journey?"
        description="Start your application online, or tell us about your case and we will come back to you."
        primaryHref="/destinations"
        primaryLabel="Start your application"
        secondaryHref={`/contact?service=${encodeURIComponent(service.name)}`}
        secondaryLabel="Talk to an expert"
      />
    </>
  );
}
