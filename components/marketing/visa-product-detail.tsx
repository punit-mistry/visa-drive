"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight, Check, ExternalLink, FileText, Info, SearchX } from "lucide-react";

import { api } from "@/convex/_generated/api";
import {
  categoryLabel,
  ENTRY_TYPE_LABELS,
  PAYMENT_MODE_LABELS,
  productPrice,
  productProcessingTime,
  standardPrice,
  type CatalogueProduct,
} from "@/components/marketing/catalogue";
import { DarkCrumbs } from "@/components/marketing/destination-detail";
import { LegalNotes } from "@/components/marketing/legal-notes";
import { FadeIn, Reveal } from "@/components/marketing/reveal";
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

interface Requirement {
  _id: string;
  label: string;
  description?: string;
  isMandatory: boolean;
  appliesTo: string;
}

interface VisaProductDetailData extends CatalogueProduct {
  detailedDescription?: string;
  eligibilityNotes?: string;
  importantInformation?: string;
  taxPercent: number;
  additionalCharges: number;
  officialSourceUrl?: string;
  lastVerifiedAt?: number;
  isPreview: boolean;
  destination: {
    _id: string;
    slug: string;
    name: string;
    flagEmoji: string;
    countryCode: string;
  };
  requirements: Requirement[];
  faqs: Array<{ _id: string; question: string; answer: string }>;
}

const APPLIES_TO_LABELS: Record<string, string> = {
  all: "",
  adult: "Adults",
  minor: "Minors",
  employed: "Employed applicants",
  self_employed: "Self-employed applicants",
  student: "Students",
  retired: "Retired applicants",
};

/**
 * One visa product.
 *
 * Fees, processing times, validity, document checklists and eligibility notes
 * are all admin-configured. Each block below renders only when the database
 * holds a value for it, and the `isDemoContent` flag puts a "Sample data"
 * badge directly beside the price it applies to.
 *
 * Layout: a dark typographic masthead (this product has no photograph of its
 * own, so it does not pretend to), then a paper ground where the editorial
 * column reads on the left and the price sheet stays in view on the right.
 */
export function VisaProductDetail({
  destinationSlug,
  slug,
}: {
  destinationSlug: string;
  slug: string;
}) {
  const product = useQuery(api.visaProducts.getBySlug, {
    destinationSlug,
    slug,
  }) as VisaProductDetailData | null | undefined;

  if (product === undefined) return <ProductSkeleton />;

  if (product === null) {
    return (
      <section className="bg-paper py-20 sm:py-24 lg:py-32">
        <div className="container-wide">
          <EmptyState
            icon={SearchX}
            title="We could not find that visa"
            description="It may have been renamed or withdrawn from the catalogue."
            action={
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild>
                  <Link href={`/destinations/${destinationSlug}`}>
                    Back to destination
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/contact">Ask us about this visa</Link>
                </Button>
              </div>
            }
          />
        </div>
      </section>
    );
  }

  const price = productPrice(product);
  const standard = standardPrice(product);
  const processing = productProcessingTime(product);
  const entry = ENTRY_TYPE_LABELS[product.entryType];
  const paymentMode = PAYMENT_MODE_LABELS[product.paymentMode];

  const hasGovernmentFee = product.governmentFee > 0;
  const hasServiceFee = product.serviceFee > 0;

  return (
    <>
      {product.isPreview && (
        <div className="border-b border-warning/25 bg-warning-soft">
          <div className="container-wide py-2.5 text-sm font-medium text-warning">
            Draft preview — this visa is not published and is visible to staff
            only.
          </div>
        </div>
      )}

      {/* ----------------------------- masthead ----------------------------- */}
      <section className="bg-ink-black">
        <div className="container-wide pb-14 pt-10 sm:pb-16 lg:pb-24">
          <DarkCrumbs
            items={[
              { label: "Destinations", href: "/destinations" },
              {
                label: product.destination.name,
                href: `/destinations/${product.destination.slug}`,
              },
              { label: product.name },
            ]}
          />

          <FadeIn className="mt-14 sm:mt-20 lg:mt-24">
            <p className="text-eyebrow-dark flex flex-wrap items-center gap-x-3 gap-y-2">
              <span aria-hidden className="text-base leading-none">
                {product.destination.flagEmoji}
              </span>
              {product.destination.name}
              <span aria-hidden className="h-px w-6 bg-white/25" />
              {categoryLabel(product.category)}
              {product.visaType && (
                <>
                  <span aria-hidden className="size-1 rounded-full bg-brand" />
                  {product.visaType}
                </>
              )}
            </p>

            <h1 className="display-xl mt-6 max-w-5xl text-paper">
              {product.name}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/60 sm:text-lg">
              {product.shortDescription}
            </p>
          </FadeIn>
        </div>
      </section>

      <section className="bg-paper py-20 sm:py-24 lg:py-32">
        <div className="container-wide grid gap-14 lg:grid-cols-12 lg:gap-16">
          {/* ----------------------------- main ----------------------------- */}
          <div className="space-y-16 lg:col-span-7 lg:space-y-20 xl:col-span-8">
            {product.detailedDescription && (
              <Reveal>
                <p className="text-eyebrow">Overview</p>
                <h2 className="display-md mt-4 text-foreground">About this visa</h2>
                <p className="mt-6 max-w-prose whitespace-pre-line text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {product.detailedDescription}
                </p>
              </Reveal>
            )}

            {product.requirements.length > 0 && (
              <Reveal>
                <p className="text-eyebrow">Checklist</p>
                <h2 className="display-md mt-4 text-foreground">
                  Documents you will need
                </h2>
                <p className="mt-4 max-w-prose text-base leading-relaxed text-muted-foreground">
                  The checklist recorded for this visa. We review each document
                  before anything is submitted.
                </p>
                <ul className="mt-8 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                  {product.requirements.map((requirement) => {
                    const audience = APPLIES_TO_LABELS[requirement.appliesTo];
                    return (
                      <li key={requirement._id} className="flex gap-4 p-5 sm:p-6">
                        <FileText
                          className="mt-0.5 size-4 shrink-0 text-brand"
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                            {requirement.label}
                            {!requirement.isMandatory && (
                              <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                Optional
                              </span>
                            )}
                            {audience && (
                              <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                {audience}
                              </span>
                            )}
                          </p>
                          {requirement.description && (
                            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                              {requirement.description}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Reveal>
            )}

            {product.eligibilityNotes && (
              <Reveal>
                <p className="text-eyebrow">Eligibility</p>
                <h2 className="display-md mt-4 text-foreground">Who can apply</h2>
                <p className="mt-6 max-w-prose whitespace-pre-line text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {product.eligibilityNotes}
                </p>
              </Reveal>
            )}

            {product.importantInformation && (
              <Reveal>
                <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-6 sm:p-7">
                  <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Important information
                    </h2>
                    <p className="mt-2 max-w-prose whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                      {product.importantInformation}
                    </p>
                  </div>
                </div>
              </Reveal>
            )}

            {product.faqs.length > 0 && (
              <Reveal>
                <p className="text-eyebrow">FAQ</p>
                <h2 className="display-md mt-4 text-foreground">
                  Questions about this visa
                </h2>
                <Accordion
                  type="single"
                  collapsible
                  className="mt-8 border-t border-border"
                >
                  {product.faqs.map((faq) => (
                    <AccordionItem key={faq._id} value={faq._id}>
                      <AccordionTrigger className="py-5 text-left text-base font-medium hover:no-underline sm:text-lg">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent className="max-w-prose whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </Reveal>
            )}

            <LegalNotes
              className="bg-card"
              keys={[
                "notAffiliated",
                "noGuarantee",
                "governmentFeesSeparate",
                "accuracyObligation",
              ]}
            />
          </div>

          {/* ---------------------------- sidebar ---------------------------- */}
          <aside className="lg:col-span-5 xl:col-span-4">
            <div className="lg:sticky lg:top-28">
              <div className="rounded-2xl border border-border bg-card p-6 elev-md sm:p-7">
                {price !== null ? (
                  <>
                    <p className="text-eyebrow">Price per traveller</p>
                    <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="numeral text-5xl leading-none text-foreground">
                        {formatMoney(price, product.currency, "en-IN", {
                          hideDecimals: true,
                        })}
                      </span>
                      {standard !== null && (
                        <span className="text-base text-muted-foreground line-through">
                          {formatMoney(standard, product.currency, "en-IN", {
                            hideDecimals: true,
                          })}
                        </span>
                      )}
                    </p>
                    {product.isDemoContent && (
                      <DemoContentBadge className="mt-4" />
                    )}

                    {(hasGovernmentFee || hasServiceFee) && (
                      <dl className="mt-6 space-y-2.5 border-t border-border pt-6 text-sm">
                        {hasGovernmentFee && (
                          <div className="flex items-baseline justify-between gap-4">
                            <dt className="text-muted-foreground">
                              Government fee
                            </dt>
                            <dd className="font-medium text-foreground">
                              {formatMoney(
                                product.governmentFee,
                                product.currency,
                                "en-IN",
                                { hideDecimals: true },
                              )}
                            </dd>
                          </div>
                        )}
                        {hasServiceFee && (
                          <div className="flex items-baseline justify-between gap-4">
                            <dt className="text-muted-foreground">
                              VisaDrive service fee
                            </dt>
                            <dd className="font-medium text-foreground">
                              {formatMoney(
                                product.serviceFee,
                                product.currency,
                                "en-IN",
                                { hideDecimals: true },
                              )}
                            </dd>
                          </div>
                        )}
                        {product.additionalCharges > 0 && (
                          <div className="flex items-baseline justify-between gap-4">
                            <dt className="text-muted-foreground">
                              Additional charges
                            </dt>
                            <dd className="font-medium text-foreground">
                              {formatMoney(
                                product.additionalCharges,
                                product.currency,
                                "en-IN",
                                { hideDecimals: true },
                              )}
                            </dd>
                          </div>
                        )}
                        {product.taxPercent > 0 && (
                          <div className="flex items-baseline justify-between gap-4">
                            <dt className="text-muted-foreground">Tax</dt>
                            <dd className="font-medium text-foreground">
                              {product.taxPercent}%
                            </dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-eyebrow">Price</p>
                    <p className="display-md mt-3 text-foreground">
                      Quoted on enquiry
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      We have not published a fee for this visa yet. Ask us and we
                      will give you the current figure.
                    </p>
                  </>
                )}

                <dl className="mt-6 space-y-3 border-t border-border pt-6 text-sm">
                  {processing && (
                    <Row label="Processing time" value={processing} />
                  )}
                  {entry && entry !== ENTRY_TYPE_LABELS.not_applicable && (
                    <Row label="Entry" value={entry} />
                  )}
                  {typeof product.validityDays === "number" &&
                    product.validityDays > 0 && (
                      <Row
                        label="Validity"
                        value={`${product.validityDays} days`}
                      />
                    )}
                  {typeof product.maxStayDays === "number" &&
                    product.maxStayDays > 0 && (
                      <Row
                        label="Maximum stay"
                        value={`${product.maxStayDays} days`}
                      />
                    )}
                  {paymentMode && <Row label="Payment" value={paymentMode} />}
                </dl>

                <div className="mt-7 space-y-3">
                  <Button
                    asChild
                    size="lg"
                    className="h-12 w-full text-[15px] font-semibold"
                  >
                    <Link href={`/apply?product=${product._id}`}>
                      Start your application
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-12 w-full text-[15px] font-semibold"
                  >
                    <Link
                      href={`/contact?destination=${encodeURIComponent(
                        product.destination.name,
                      )}&visa=${encodeURIComponent(product.name)}`}
                    >
                      Talk to an expert
                    </Link>
                  </Button>
                </div>

                {product.officialSourceUrl && (
                  <p className="mt-6 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
                    Official source:{" "}
                    <a
                      href={product.officialSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-rule rounded-sm font-medium text-brand focus-brand"
                    >
                      view
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                    {product.lastVerifiedAt && (
                      <> · last checked {formatDate(product.lastVerifiedAt)}</>
                    )}
                  </p>
                )}
              </div>

              <ul className="mt-6 space-y-3 px-1 text-sm text-muted-foreground">
                {[
                  "Documents checked before submission",
                  "One team on your application, start to finish",
                  "Updates recorded in your dashboard",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ProductSkeleton() {
  return (
    <>
      <section className="bg-ink-black" aria-busy aria-label="Loading visa">
        <div className="container-wide pb-14 pt-10 sm:pb-16 lg:pb-24">
          <Skeleton className="h-4 w-64 bg-white/10" />
          <Skeleton className="mt-20 h-4 w-72 bg-white/10" />
          <Skeleton className="mt-6 h-16 w-full max-w-2xl bg-white/10 sm:h-24" />
          <Skeleton className="mt-6 h-5 w-full max-w-xl bg-white/10" />
        </div>
      </section>
      <section className="bg-paper py-20 sm:py-24 lg:py-32">
        <div className="container-wide grid gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="space-y-6 lg:col-span-7 xl:col-span-8">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-9/12" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
          <div className="lg:col-span-5 xl:col-span-4">
            <Skeleton className="h-[26rem] w-full rounded-2xl" />
          </div>
        </div>
      </section>
    </>
  );
}
