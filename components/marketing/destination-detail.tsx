"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight, ExternalLink, Globe } from "lucide-react";

import { api } from "@/convex/_generated/api";
import {
  fastestProcessingTime,
  longestValidity,
  type CatalogueProduct,
} from "@/components/marketing/catalogue";
import { CountryImage } from "@/components/marketing/country-image";
import { Crumbs } from "@/components/marketing/crumbs";
import { LegalNotes } from "@/components/marketing/legal-notes";
import { FadeIn, Reveal, RevealItem } from "@/components/marketing/reveal";
import { VisaProductCard } from "@/components/marketing/visa-product-card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/states";
import { DemoContentBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";
import { cn } from "@/lib/utils";

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
 * Breadcrumbs for a dark masthead.
 *
 * `Crumbs` reads its colours from the semantic tokens, and the `.dark` class
 * redefines exactly those tokens — so scoping it to the nav gives light type
 * on the photograph without a second set of hard-coded colours.
 */
export function DarkCrumbs({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  return <Crumbs className="dark" items={items} />;
}

/**
 * One country, laid out as a feature.
 *
 * The page opens on a full-bleed photograph, then settles into the warm
 * paper-and-white editorial grounds the homepage uses. Everything on it comes
 * from `destinations.getBySlug` — summary, highlights, travel notes, products
 * and FAQs. Fields the admin has left blank are omitted entirely rather than
 * filled in, including the fact strip under the headline: each figure there
 * is derived from the published products or omitted.
 */
export function DestinationDetail({ slug }: { slug: string }) {
  const destination = useQuery(api.destinations.getBySlug, { slug }) as
    | DestinationDetailData
    | null
    | undefined;

  if (destination === undefined) return <DestinationSkeleton />;

  if (destination === null) {
    return (
      <section className="bg-paper py-20 sm:py-24 lg:py-32">
        <div className="container-wide">
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
      </section>
    );
  }

  const hasDemoContent = destination.products.some((p) => p.isDemoContent);
  const processing = fastestProcessingTime(destination.products);
  const validity = longestValidity(destination.products);
  const startingPrice =
    typeof destination.startingPrice === "number" && destination.startingPrice > 0
      ? destination.startingPrice
      : null;

  const facts: Array<{ label: string; value: string; demo?: boolean }> = [];
  if (destination.productCount > 0) {
    facts.push({ label: "Visa options", value: String(destination.productCount) });
  }
  if (startingPrice !== null) {
    facts.push({
      label: "Starting from",
      value: formatMoney(startingPrice, destination.currency, "en-IN", {
        hideDecimals: true,
      }),
      demo: hasDemoContent,
    });
  }
  if (processing) facts.push({ label: "Fastest processing", value: processing });
  if (validity) facts.push({ label: "Longest validity", value: validity });

  const contactHref = `/contact?destination=${encodeURIComponent(destination.name)}`;

  return (
    <>
      {destination.isPreview && (
        <div className="border-b border-warning/25 bg-warning-soft">
          <div className="container-wide py-2.5 text-sm font-medium text-warning">
            Draft preview — this destination is not published and is visible to
            staff only.
          </div>
        </div>
      )}

      {/* ------------------------------- hero ------------------------------- */}
      <section className="relative isolate flex min-h-[34rem] flex-col justify-end overflow-hidden bg-ink-black sm:min-h-[40rem] lg:min-h-[46rem]">
        {/* The photograph carries no negative z-index: inside an `isolate`
            parent a -z-10 layer paints behind the parent's own background
            and vanishes. Text sits in a later sibling instead. */}
        <CountryImage
          src={destination.heroImageUrl ?? destination.cardImageUrl}
          countryCode={destination.countryCode}
          flagEmoji={destination.flagEmoji}
          name={destination.name}
          priority
          fallbackTone="dark"
          sizes="100vw"
          className="absolute inset-0 h-full w-full"
        />

        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-ink-black via-ink-black/60 via-45% to-ink-black/25"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-ink-black/70 via-transparent to-transparent"
        />

        <div className="container-wide relative z-10 pb-12 pt-10 sm:pb-14 lg:pb-20">
          <DarkCrumbs
            items={[
              { label: "Destinations", href: "/destinations" },
              { label: destination.name },
            ]}
          />

          <FadeIn className="mt-16 sm:mt-24 lg:mt-32">
            <p className="text-eyebrow-dark flex items-center gap-2.5">
              <span aria-hidden className="text-base leading-none">
                {destination.flagEmoji}
              </span>
              {destination.region ?? "Destination"}
            </p>

            <h1 className="display-xl mt-5 max-w-5xl text-paper">
              {destination.name} visas
            </h1>

            <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:items-end">
              <div className="max-w-2xl lg:col-span-7">
                {destination.tagline && (
                  <p className="text-lg leading-relaxed text-white/80 sm:text-xl">
                    {destination.tagline}
                  </p>
                )}
                <p
                  className={cn(
                    "max-w-xl text-base leading-relaxed text-white/60",
                    destination.tagline && "mt-4",
                  )}
                >
                  {destination.summary}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:col-span-5 lg:justify-end">
                <Button
                  asChild
                  size="lg"
                  className="h-12 px-7 text-[15px] font-semibold"
                >
                  <a href="#visa-options">
                    See visa options
                    <ArrowRight className="size-4" aria-hidden />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 border-white/30 bg-white/5 px-6 text-[15px] font-semibold text-white backdrop-blur-sm hover:border-white/50 hover:bg-white/10 hover:text-white dark:border-white/30 dark:bg-white/5"
                >
                  <Link href={contactHref}>Ask about {destination.name}</Link>
                </Button>
              </div>
            </div>

            {facts.length > 0 && (
              <dl className="mt-12 grid grid-cols-2 gap-x-8 gap-y-8 border-t border-white/15 pt-8 sm:grid-cols-4 lg:mt-16">
                {facts.map((fact) => (
                  <div key={fact.label}>
                    <dt className="text-eyebrow-dark">{fact.label}</dt>
                    <dd className="mt-3">
                      <span className="numeral block text-3xl leading-none text-paper sm:text-4xl">
                        {fact.value}
                      </span>
                      {fact.demo && <DemoContentBadge className="mt-3" />}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </FadeIn>
        </div>
      </section>

      {/* ------------------------ about + highlights ------------------------ */}
      {(destination.highlights.length > 0 || destination.description) && (
        <section className="bg-background py-20 sm:py-24 lg:py-32">
          <div className="container-wide">
            {destination.description && (
              <Reveal className="grid gap-8 lg:grid-cols-12 lg:gap-16">
                <div className="lg:col-span-5">
                  <p className="text-eyebrow">The destination</p>
                  <h2 className="display-lg mt-4 text-foreground">
                    About travelling to {destination.name}
                  </h2>
                </div>
                <p className="max-w-2xl whitespace-pre-line text-base leading-relaxed text-muted-foreground sm:text-lg lg:col-span-7">
                  {destination.description}
                </p>
              </Reveal>
            )}

            {destination.highlights.length > 0 && (
              <Reveal
                className={cn(
                  "grid gap-8 lg:grid-cols-12 lg:gap-16",
                  destination.description &&
                    "mt-16 border-t border-border pt-16 lg:mt-24 lg:pt-24",
                )}
              >
                <div className="lg:col-span-5">
                  <p className="text-eyebrow">Highlights</p>
                  <h2 className="display-lg mt-4 text-foreground">Good to know</h2>
                </div>
                <ul className="divide-y divide-border border-y border-border lg:col-span-7">
                  {destination.highlights.map((highlight, index) => (
                    <li key={highlight} className="flex items-baseline gap-5 py-5 sm:gap-8">
                      <span
                        aria-hidden
                        className="numeral w-8 shrink-0 text-xl text-brand"
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-base leading-relaxed text-foreground">
                        {highlight}
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}
          </div>
        </section>
      )}

      {/* --------------------------- visa products --------------------------- */}
      <section id="visa-options" className="scroll-mt-24 bg-paper py-20 sm:py-24 lg:py-32">
        <div className="container-wide">
          <Reveal className="max-w-3xl">
            <p className="text-eyebrow">Visa options</p>
            <h2 className="display-xl mt-4 text-foreground">
              What you can
              <br />
              apply for
            </h2>
          </Reveal>

          <div className="mt-12 lg:mt-16">
            {destination.products.length === 0 ? (
              <Reveal>
                <EmptyState
                  icon={Globe}
                  title="No visa types are published for this destination yet"
                  description="We may still be able to help with your application. Tell us about your trip and we will come back to you."
                  action={
                    <Button asChild>
                      <Link href={contactHref}>Ask about {destination.name}</Link>
                    </Button>
                  }
                />
              </Reveal>
            ) : (
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                {destination.products.map((product, index) => (
                  <RevealItem
                    as="li"
                    key={product._id}
                    index={index}
                    className="h-full"
                  >
                    <VisaProductCard product={product} />
                  </RevealItem>
                ))}
              </ul>
            )}
          </div>

          {destination.travelNotes && (
            <Reveal className="mt-16 grid gap-6 border-t border-border pt-12 lg:mt-24 lg:grid-cols-12 lg:gap-16 lg:pt-16">
              <div className="lg:col-span-5">
                <p className="text-eyebrow">Before you travel</p>
                <h3 className="display-md mt-4 text-foreground">Travel notes</h3>
              </div>
              <p className="max-w-2xl whitespace-pre-line text-base leading-relaxed text-muted-foreground lg:col-span-7">
                {destination.travelNotes}
              </p>
            </Reveal>
          )}

          {destination.officialSourceUrl && (
            <Reveal>
              <p className="mt-10 break-words text-sm text-muted-foreground">
                Official source:{" "}
                <a
                  href={destination.officialSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-rule rounded-sm font-medium text-brand focus-brand"
                >
                  {destination.officialSourceUrl}
                  <ExternalLink className="size-3.5 shrink-0" aria-hidden />
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
        <section className="bg-background py-20 sm:py-24 lg:py-32">
          <div className="container-wide grid gap-10 lg:grid-cols-12 lg:gap-16">
            <Reveal className="lg:col-span-5">
              <p className="text-eyebrow">FAQ</p>
              <h2 className="display-lg mt-4 text-foreground">
                {destination.name} questions
              </h2>
            </Reveal>
            <Reveal className="lg:col-span-7" delay={0.08}>
              <Accordion
                type="single"
                collapsible
                className="border-t border-border"
              >
                {destination.faqs.map((faq) => (
                  <AccordionItem key={faq._id} value={faq._id}>
                    <AccordionTrigger className="py-6 text-left text-base font-medium hover:no-underline sm:text-lg">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="max-w-prose whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Reveal>
          </div>
        </section>
      )}

      <section className="border-t border-border bg-background py-14 sm:py-16">
        <div className="container-wide">
          <LegalNotes keys={["notAffiliated", "noGuarantee", "governmentFeesSeparate"]} />
        </div>
      </section>
    </>
  );
}

function DestinationSkeleton() {
  return (
    <>
      <section
        className="relative flex min-h-[34rem] flex-col justify-end bg-ink-black sm:min-h-[40rem] lg:min-h-[46rem]"
        aria-busy
        aria-label="Loading destination"
      >
        <div className="container-wide pb-12 pt-10 sm:pb-14 lg:pb-20">
          <Skeleton className="h-4 w-48 bg-white/10" />
          <Skeleton className="mt-24 h-3.5 w-28 bg-white/10" />
          <Skeleton className="mt-5 h-16 w-full max-w-xl bg-white/10 sm:h-24" />
          <Skeleton className="mt-8 h-5 w-full max-w-lg bg-white/10" />
          <Skeleton className="mt-3 h-5 w-3/4 max-w-md bg-white/10" />
          <div className="mt-8 flex gap-3">
            <Skeleton className="h-12 w-44 bg-white/10" />
            <Skeleton className="h-12 w-44 bg-white/10" />
          </div>
        </div>
      </section>
      <section className="bg-paper py-20 sm:py-24 lg:py-32">
        <div className="container-wide">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-4 h-14 w-80 max-w-full" />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="min-h-[22rem] rounded-2xl" />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
