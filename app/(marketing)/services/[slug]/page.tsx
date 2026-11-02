import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

import { Crumbs } from "@/components/marketing/crumbs";
import { FinalCta } from "@/components/marketing/final-cta";
import { IconGlyph, IconTile } from "@/components/marketing/icon";
import { LegalNotes } from "@/components/marketing/legal-notes";
import { Reveal, RevealItem } from "@/components/marketing/reveal";
import {
  MARKETING_SERVICES,
  SERVICE_SLUGS,
  serviceBySlug,
} from "@/components/marketing/services";
import { HOW_IT_WORKS_STEPS } from "@/components/marketing/how-it-works";
import { Button } from "@/components/ui/button";
import { WhatsAppButton } from "@/components/shared/whatsapp-button";

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
  return (
    <>
      <section className="border-b border-border bg-background">
        <div className="container-page py-10 sm:py-14 lg:py-16">
          <Crumbs
            items={[
              { label: "Services", href: "/services" },
              { label: service.name },
            ]}
          />

          <div className="mt-8 max-w-2xl">
            <IconTile
              name={service.icon}
              className="size-12 rounded-2xl bg-surface"
              iconClassName="size-5"
            />
            <h1 className="mt-6 text-4xl sm:text-5xl">{service.name}</h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              {service.summary}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link
                  href={`/contact?service=${encodeURIComponent(service.name)}`}
                >
                  Enquire about this service
                </Link>
              </Button>
              <WhatsAppButton
                variant="inline"
                className="h-10 px-6"
                label="Ask on WhatsApp"
                message={`Hi VisaDrive, I would like help with ${service.name}.`}
              />
            </div>
          </div>
        </div>
      </section>

      {/* How this works — the same four steps every VisaDrive engagement runs
          through. Nothing service-specific is claimed here that the client has
          not already put in writing. */}
      <section className="border-b border-border bg-surface py-14 sm:py-20">
        <div className="container-page">
          <Reveal>
            <p className="text-eyebrow">How it works</p>
            <h2 className="mt-3 text-3xl sm:text-4xl">
              What happens after you get in touch
            </h2>
          </Reveal>

          <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            {HOW_IT_WORKS_STEPS.map((step, index) => (
              <RevealItem
                as="li"
                key={step.number}
                index={index}
                className="bg-card"
              >
                <div className="flex h-full gap-4 p-6 lg:p-7">
                  <span className="font-mono text-xs text-muted-foreground/70">
                    {step.number}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {step.detail}
                    </p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-background py-14 sm:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <h2 className="text-2xl">Good to know</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              These statements are VisaDrive&rsquo;s own terms and apply to this
              service.
            </p>
          </div>
          <div className="lg:col-span-7">
            <ul className="space-y-4">
              {service.disclaimers.map((statement) => (
                <li key={statement} className="flex items-start gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  <span className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                    {statement}
                  </span>
                </li>
              ))}
            </ul>
            <LegalNotes
              className="mt-8"
              title="Also worth knowing"
              keys={["notAffiliated"]}
            />
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-surface py-14 sm:py-16">
        <div className="container-page">
          <h2 className="text-2xl">Other services</h2>
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {others.map((other, index) => {
              return (
                <RevealItem as="li" key={other.key} index={index}>
                  <article className="group relative flex h-full flex-col rounded-2xl border border-border bg-card p-5 transition-shadow duration-300 hover:elev-md">
                    <IconGlyph name={other.icon} className="size-5 text-brand" />
                    <h3 className="mt-4 text-sm font-semibold">
                      <Link
                        href={`/services/${other.slug}`}
                        className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-brand"
                      >
                        {other.name}
                      </Link>
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                      {other.summary}
                    </p>
                    <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
                      Learn more
                      <ArrowRight
                        className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </p>
                  </article>
                </RevealItem>
              );
            })}
          </ul>
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
