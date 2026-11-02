"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Check, ExternalLink, FileText, Info, SearchX } from "lucide-react";

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
import { Crumbs } from "@/components/marketing/crumbs";
import { LegalNotes } from "@/components/marketing/legal-notes";
import { Reveal } from "@/components/marketing/reveal";
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
      <div className="container-page py-20 sm:py-28">
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
          <div className="container-page py-2.5 text-sm font-medium text-warning">
            Draft preview — this visa is not published and is visible to staff
            only.
          </div>
        </div>
      )}

      <section className="border-b border-border bg-background">
        <div className="container-page py-10 sm:py-12">
          <Crumbs
            items={[
              { label: "Destinations", href: "/destinations" },
              {
                label: product.destination.name,
                href: `/destinations/${product.destination.slug}`,
              },
              { label: product.name },
            ]}
          />

          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <span aria-hidden>{product.destination.flagEmoji}</span>
              {product.destination.name}
            </span>
            <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {categoryLabel(product.category)}
            </span>
            {product.visaType && (
              <span className="rounded-full border border-brand-soft bg-brand-tint px-2.5 py-1 text-xs font-medium text-brand">
                {product.visaType}
              </span>
            )}
          </div>

          <h1 className="mt-5 max-w-3xl text-4xl sm:text-5xl">{product.name}</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {product.shortDescription}
          </p>
        </div>
      </section>

      <section className="bg-background py-12 sm:py-16">
        <div className="container-page grid gap-10 lg:grid-cols-12 lg:gap-14">
          {/* ----------------------------- main ----------------------------- */}
          <div className="space-y-12 lg:col-span-7 xl:col-span-8">
            {product.detailedDescription && (
              <Reveal>
                <h2 className="text-2xl">About this visa</h2>
                <p className="mt-4 max-w-prose whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                  {product.detailedDescription}
                </p>
              </Reveal>
            )}

            {product.requirements.length > 0 && (
              <Reveal>
                <h2 className="text-2xl">Documents you will need</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  The checklist recorded for this visa. We review each document
                  before anything is submitted.
                </p>
                <ul className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                  {product.requirements.map((requirement) => {
                    const audience = APPLIES_TO_LABELS[requirement.appliesTo];
                    return (
                      <li key={requirement._id} className="flex gap-4 p-5">
                        <FileText
                          className="mt-0.5 size-4 shrink-0 text-brand"
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
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
                <h2 className="text-2xl">Who can apply</h2>
                <p className="mt-4 max-w-prose whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                  {product.eligibilityNotes}
                </p>
              </Reveal>
            )}

            {product.importantInformation && (
              <Reveal>
                <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5 sm:p-6">
                  <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  <div>
                    <h2 className="text-sm font-semibold">Important information</h2>
                    <p className="mt-2 max-w-prose whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                      {product.importantInformation}
                    </p>
                  </div>
                </div>
              </Reveal>
            )}

            {product.faqs.length > 0 && (
              <Reveal>
                <h2 className="text-2xl">Questions about this visa</h2>
                <Accordion
                  type="single"
                  collapsible
                  className="mt-5 rounded-2xl border border-border bg-card px-5 sm:px-6"
                >
                  {product.faqs.map((faq) => (
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
              </Reveal>
            )}

            <LegalNotes
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
            <div className="lg:sticky lg:top-24">
              <div className="rounded-2xl border border-border bg-card p-6 elev-md">
                {price !== null ? (
                  <>
                    <p className="text-eyebrow">Price per traveller</p>
                    <p className="mt-2 flex flex-wrap items-baseline gap-2">
                      <span className="text-3xl font-semibold tracking-tight">
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
                      <DemoContentBadge className="mt-3" />
                    )}

                    {(hasGovernmentFee || hasServiceFee) && (
                      <dl className="mt-5 space-y-2 border-t border-border pt-5 text-sm">
                        {hasGovernmentFee && (
                          <div className="flex items-baseline justify-between gap-4">
                            <dt className="text-muted-foreground">
                              Government fee
                            </dt>
                            <dd className="font-medium">
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
                            <dd className="font-medium">
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
                            <dd className="font-medium">
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
                            <dd className="font-medium">
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
                    <p className="mt-2 text-base font-medium">
                      Quoted on enquiry
                    </p>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      We have not published a fee for this visa yet. Ask us and we
                      will give you the current figure.
                    </p>
                  </>
                )}

                <dl className="mt-5 space-y-3 border-t border-border pt-5 text-sm">
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

                <div className="mt-6 space-y-3">
                  <Button asChild size="lg" className="w-full">
                    <Link href={`/apply?product=${product._id}`}>
                      Start your application
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="w-full">
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
                  <p className="mt-5 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
                    Official source:{" "}
                    <a
                      href={product.officialSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-sm font-medium text-brand underline-offset-4 hover:underline focus-brand"
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

              <ul className="mt-5 space-y-2.5 px-1 text-sm text-muted-foreground">
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
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function ProductSkeleton() {
  return (
    <>
      <section className="border-b border-border bg-background">
        <div className="container-page py-10 sm:py-12">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="mt-8 h-6 w-48" />
          <Skeleton className="mt-5 h-12 w-full max-w-xl" />
          <Skeleton className="mt-4 h-5 w-full max-w-2xl" />
        </div>
      </section>
      <section className="bg-background py-12 sm:py-16">
        <div className="container-page grid gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="space-y-6 lg:col-span-7 xl:col-span-8">
            <Skeleton className="h-8 w-56" />
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
