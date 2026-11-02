"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Check, ExternalLink, Globe, Info } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { CatalogueProduct } from "@/components/marketing/catalogue";
import { CountryImage } from "@/components/marketing/country-image";
import { Crumbs } from "@/components/marketing/crumbs";
import { LegalNotes } from "@/components/marketing/legal-notes";
import { Reveal, RevealItem } from "@/components/marketing/reveal";
import { VisaProductCard } from "@/components/marketing/visa-product-card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CardGridSkeleton, EmptyState } from "@/components/shared/states";
import { DemoContentBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";

interface DestinationDetailData {
  _id: string;
  slug: string;
  name: string;
  countryCode: string;
  flagEmoji: string;
  region?: string;
  tagline?: string;
  summary: string;
  description?: string;
  heroImageUrl?: string;
  cardImageUrl?: string;
  currency: string;
  highlights: string[];
  travelNotes?: string;
  officialSourceUrl?: string;
  lastVerifiedAt?: number;
  isPreview: boolean;
  productCount: number;
  startingPrice: number | null;
  products: CatalogueProduct[];
  faqs: Array<{ _id: string; question: string; answer: string }>;
}

/**
 * One country.
 *
 * Everything on this page comes from `destinations.getBySlug` — summary,
 * highlights, travel notes, products and FAQs. Fields the admin has left
 * blank are omitted entirely rather than filled in.
 */
export function DestinationDetail({ slug }: { slug: string }) {
  const destination = useQuery(api.destinations.getBySlug, { slug }) as
    | DestinationDetailData
    | null
    | undefined;

  if (destination === undefined) return <DestinationSkeleton />;

  if (destination === null) {
    return (
      <div className="container-page py-20 sm:py-28">
        <EmptyState
          icon={Globe}
          title="We could not find that destination"
          description="It may have been renamed, or it is not published yet."
          action={
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/destinations">Browse destinations</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/contact">Ask us about this country</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const hasDemoContent = destination.products.some((p) => p.isDemoContent);

  return (
    <>
      {destination.isPreview && (
        <div className="border-b border-warning/25 bg-warning-soft">
          <div className="container-page py-2.5 text-sm font-medium text-warning">
            Draft preview — this destination is not published and is visible to
            staff only.
          </div>
        </div>
      )}

      {/* ------------------------------- hero ------------------------------- */}
      <section className="border-b border-border bg-background">
        <div className="container-page py-10 sm:py-14">
          <Crumbs
            items={[
              { label: "Destinations", href: "/destinations" },
              { label: destination.name },
            ]}
          />

          <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-14">
            <div className="lg:col-span-7">
              <p className="flex items-center gap-2 text-eyebrow">
                <span aria-hidden className="text-base leading-none">
                  {destination.flagEmoji}
                </span>
                {destination.region ?? "Destination"}
              </p>

              <h1 className="mt-4 text-4xl sm:text-5xl">
                {destination.name} visas
              </h1>

              {destination.tagline && (
                <p className="mt-4 text-lg text-muted-foreground">
                  {destination.tagline}
                </p>
              )}

              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
                {destination.summary}
              </p>

              <dl className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
                {destination.productCount > 0 && (
                  <div>
                    <dt className="text-eyebrow">Visa options</dt>
                    <dd className="mt-1 text-xl font-semibold">
                      {destination.productCount}
                    </dd>
                  </div>
                )}
                {typeof destination.startingPrice === "number" &&
                  destination.startingPrice > 0 && (
                    <div>
                      <dt className="text-eyebrow">Starting from</dt>
                      <dd className="mt-1 flex items-center gap-2 text-xl font-semibold">
                        {formatMoney(
                          destination.startingPrice,
                          destination.currency,
                          "en-IN",
                          { hideDecimals: true },
                        )}
                        {hasDemoContent && <DemoContentBadge />}
                      </dd>
                    </div>
                  )}
              </dl>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <a href="#visa-options">See visa options</a>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link
                    href={`/contact?destination=${encodeURIComponent(destination.name)}`}
                  >
                    Ask about {destination.name}
                  </Link>
                </Button>
              </div>
            </div>

            <div className="lg:col-span-5">
              <CountryImage
                src={destination.heroImageUrl ?? destination.cardImageUrl}
                countryCode={destination.countryCode}
                flagEmoji={destination.flagEmoji}
                name={destination.name}
                priority
                sizes="(max-width: 1024px) 100vw, 480px"
                className="aspect-[4/3] w-full rounded-2xl border border-border"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------- highlights ---------------------------- */}
      {(destination.highlights.length > 0 || destination.description) && (
        <section className="border-b border-border bg-surface py-14 sm:py-16">
          <div className="container-page grid gap-10 lg:grid-cols-12 lg:gap-16">
            {destination.description && (
              <div className="lg:col-span-7">
                <h2 className="text-2xl">About travelling to {destination.name}</h2>
                <p className="mt-4 max-w-prose whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                  {destination.description}
                </p>
              </div>
            )}

            {destination.highlights.length > 0 && (
              <div className={destination.description ? "lg:col-span-5" : "lg:col-span-12"}>
                <h2 className="text-2xl">Good to know</h2>
                <ul className="mt-5 space-y-3">
                  {destination.highlights.map((highlight) => (
                    <li key={highlight} className="flex items-start gap-3 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                      <span className="leading-relaxed text-muted-foreground">
                        {highlight}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* --------------------------- visa products --------------------------- */}
      <section id="visa-options" className="bg-background py-14 sm:py-20">
        <div className="container-page">
          <Reveal>
            <p className="text-eyebrow">Visa options</p>
            <h2 className="mt-3 text-3xl sm:text-4xl">
              What you can apply for
            </h2>
          </Reveal>

          <div className="mt-8 sm:mt-10">
            {destination.products.length === 0 ? (
              <EmptyState
                icon={Globe}
                title="No visa types are published for this destination yet"
                description="We may still be able to help with your application. Tell us about your trip and we will come back to you."
                action={
                  <Button asChild>
                    <Link
                      href={`/contact?destination=${encodeURIComponent(destination.name)}`}
                    >
                      Ask about {destination.name}
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {destination.products.map((product, index) => (
                  <RevealItem as="li" key={product._id} index={index}>
                    <VisaProductCard product={product} />
                  </RevealItem>
                ))}
              </ul>
            )}
          </div>

          {destination.travelNotes && (
            <Reveal>
              <div className="mt-10 flex items-start gap-3 rounded-2xl border border-border bg-surface p-5">
                <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <div>
                  <h3 className="text-sm font-semibold">Travel notes</h3>
                  <p className="mt-1.5 max-w-prose whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {destination.travelNotes}
                  </p>
                </div>
              </div>
            </Reveal>
          )}

          {destination.officialSourceUrl && (
            <Reveal>
              <p className="mt-6 text-sm text-muted-foreground">
                Official source:{" "}
                <a
                  href={destination.officialSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-sm font-medium text-brand underline-offset-4 hover:underline focus-brand"
                >
                  {destination.officialSourceUrl}
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
                {destination.lastVerifiedAt && (
                  <span> · last checked {formatDate(destination.lastVerifiedAt)}</span>
                )}
              </p>
            </Reveal>
          )}
        </div>
      </section>

      {/* -------------------------------- FAQs ------------------------------- */}
      {destination.faqs.length > 0 && (
        <section className="border-t border-border bg-surface py-14 sm:py-20">
          <div className="container-page grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-4">
              <p className="text-eyebrow">FAQ</p>
              <h2 className="mt-3 text-3xl">
                {destination.name} questions
              </h2>
            </div>
            <div className="lg:col-span-8">
              <Accordion
                type="single"
                collapsible
                className="rounded-2xl border border-border bg-card px-5 sm:px-6"
              >
                {destination.faqs.map((faq) => (
                  <AccordionItem key={faq._id} value={faq._id}>
                    <AccordionTrigger className="text-left text-base font-medium hover:no-underline">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="max-w-prose whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>
      )}

      <section className="border-t border-border bg-background py-12">
        <div className="container-page">
          <LegalNotes keys={["notAffiliated", "noGuarantee", "governmentFeesSeparate"]} />
        </div>
      </section>
    </>
  );
}

function DestinationSkeleton() {
  return (
    <>
      <section className="border-b border-border bg-background">
        <div className="container-page py-10 sm:py-14">
          <Skeleton className="h-4 w-48" />
          <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-14">
            <div className="space-y-4 lg:col-span-7">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-12 w-full max-w-md" />
              <Skeleton className="h-5 w-full max-w-lg" />
              <Skeleton className="h-5 w-3/4 max-w-md" />
              <div className="flex gap-3 pt-4">
                <Skeleton className="h-10 w-40" />
                <Skeleton className="h-10 w-40" />
              </div>
            </div>
            <div className="lg:col-span-5">
              <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </section>
      <section className="bg-background py-14 sm:py-20">
        <div className="container-page">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-4 h-10 w-80 max-w-full" />
          <div className="mt-10">
            <CardGridSkeleton count={3} />
          </div>
        </div>
      </section>
    </>
  );
}
