"use client";

import { FileWarning } from "lucide-react";

import { ContactDetails } from "@/components/marketing/contact-details";
import { Crumbs } from "@/components/marketing/crumbs";
import { FadeIn } from "@/components/marketing/reveal";
import { useSiteSettings } from "@/hooks/use-site-settings";

export interface LegalSection {
  id: string;
  heading: string;
  /** Paragraphs taken verbatim from `LEGAL` or from the client's own copy. */
  body?: string[];
  /**
   * What the client still has to supply. Rendered as a visible gap, not as
   * invented legal text — a policy we wrote ourselves would be worse than no
   * policy at all.
   */
  placeholder?: string;
}

/**
 * Shared shell for the privacy, terms and refund pages.
 *
 * Every sentence of substance on these pages comes from `LEGAL` in
 * `lib/constants/site.ts`. Anything the client has not written yet is shown
 * as an explicit "to be completed" block, so nobody mistakes a gap for a
 * policy.
 *
 * This file only styles the container. The editorial masthead borrows the
 * homepage's serif display type, but the body is deliberately plain: a
 * ~68-character measure, generous leading and hairline rules, because people
 * read these pages to understand a commitment, not to be impressed.
 */
export function LegalDocument({
  title,
  intro,
  lastUpdated,
  sections,
  crumbLabel,
}: {
  title: string;
  intro: string;
  lastUpdated?: string;
  sections: LegalSection[];
  crumbLabel: string;
}) {
  const settings = useSiteSettings();
  const outstanding = sections.filter((section) => section.placeholder).length;
  const contactNumber = String(sections.length + 1).padStart(2, "0");

  return (
    <>
      {/* The header is fixed, so the masthead carries its own clearance. */}
      <section className="border-b border-border bg-paper pb-12 pt-14 sm:pb-16 sm:pt-16 lg:pb-20 lg:pt-20">
        <div className="container-page">
          <FadeIn>
            <Crumbs items={[{ label: crumbLabel }]} />
            <p className="text-eyebrow mt-10 sm:mt-12">Legal</p>
            <h1 className="display-xl mt-4 max-w-4xl text-foreground">
              {title}
            </h1>
          </FadeIn>

          <FadeIn
            delay={0.08}
            className="mt-8 grid gap-6 border-t border-border pt-6 lg:mt-12 lg:grid-cols-12 lg:gap-14"
          >
            <p className="max-w-[62ch] text-base leading-relaxed text-muted-foreground sm:text-lg lg:col-span-8">
              {intro}
            </p>
            {lastUpdated && (
              <p className="text-sm text-muted-foreground lg:col-span-4 lg:text-right">
                <span className="text-eyebrow block">Last updated</span>
                <span className="mt-1.5 block font-medium text-foreground">
                  {lastUpdated}
                </span>
              </p>
            )}
          </FadeIn>
        </div>
      </section>

      {outstanding > 0 && (
        <div className="border-b border-warning/25 bg-warning-soft">
          <div className="container-page flex items-start gap-3 py-4">
            <FileWarning className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="text-sm leading-relaxed text-warning">
              <span className="font-semibold">
                {outstanding} section{outstanding === 1 ? "" : "s"} still to be
                completed.
              </span>{" "}
              The statements below are VisaDrive&rsquo;s own published wording.
              Anything marked as outstanding has deliberately been left blank
              rather than drafted for them.
            </p>
          </div>
        </div>
      )}

      <section className="bg-background py-12 sm:py-16 lg:py-24">
        <div className="container-page grid gap-12 lg:grid-cols-12 lg:gap-16">
          <nav
            aria-label="On this page"
            className="lg:col-span-4 xl:col-span-3"
          >
            <div className="lg:sticky lg:top-28">
              <p className="text-eyebrow">On this page</p>
              <ol className="mt-5 border-t border-border">
                {sections.map((section, index) => (
                  <li key={section.id} className="border-b border-border">
                    <a
                      href={`#${section.id}`}
                      className="group flex items-baseline gap-3 rounded-sm py-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-brand"
                    >
                      <span
                        className="numeral w-6 shrink-0 text-xs text-muted-foreground/70 transition-colors group-hover:text-brand"
                        aria-hidden
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="leading-snug">{section.heading}</span>
                    </a>
                  </li>
                ))}
                <li className="border-b border-border">
                  <a
                    href="#contact-us"
                    className="group flex items-baseline gap-3 rounded-sm py-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-brand"
                  >
                    <span
                      className="numeral w-6 shrink-0 text-xs text-muted-foreground/70 transition-colors group-hover:text-brand"
                      aria-hidden
                    >
                      {contactNumber}
                    </span>
                    <span className="leading-snug">
                      Contact us about this policy
                    </span>
                  </a>
                </li>
              </ol>
            </div>
          </nav>

          <div className="lg:col-span-8 xl:col-span-9">
            <div className="max-w-[46rem]">
              {sections.map((section, index) => (
                <section
                  key={section.id}
                  id={section.id}
                  aria-labelledby={`${section.id}-heading`}
                  className="scroll-mt-28 border-t border-border py-10 first:border-t-0 first:pt-0 sm:py-12"
                >
                  <p
                    className="numeral text-sm text-muted-foreground/70"
                    aria-hidden
                  >
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h2
                    id={`${section.id}-heading`}
                    className="display-md mt-2 text-foreground"
                  >
                    {section.heading}
                  </h2>

                  <div className="mt-5 space-y-5">
                    {section.body?.map((paragraph, paragraphIndex) => (
                      <p
                        key={`${section.id}-${paragraphIndex}`}
                        className="text-[1.0625rem] leading-[1.75] text-foreground/80"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>

                  {section.placeholder && (
                    <div className="mt-6 rounded-xl border border-dashed border-warning/40 bg-warning-soft/50 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warning">
                        To be completed by {settings.companyName}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {section.placeholder}
                      </p>
                    </div>
                  )}
                </section>
              ))}

              <section
                id="contact-us"
                aria-labelledby="contact-us-heading"
                className="scroll-mt-28 border-t border-border py-10 sm:py-12"
              >
                <p
                  className="numeral text-sm text-muted-foreground/70"
                  aria-hidden
                >
                  {contactNumber}
                </p>
                <h2
                  id="contact-us-heading"
                  className="display-md mt-2 text-foreground"
                >
                  Contact us about this policy
                </h2>
                <p className="mt-5 text-[1.0625rem] leading-[1.75] text-foreground/80">
                  Questions about this page, or a request about your personal
                  information, can go to the team directly.
                </p>
                <ContactDetails className="mt-8" layout="stack" withWhatsApp={false} />
              </section>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
