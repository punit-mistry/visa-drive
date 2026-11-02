"use client";

import { FileWarning } from "lucide-react";

import { ContactDetails } from "@/components/marketing/contact-details";
import { Crumbs } from "@/components/marketing/crumbs";
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

  return (
    <>
      <section className="border-b border-border bg-background">
        <div className="container-page py-10 sm:py-14">
          <Crumbs items={[{ label: crumbLabel }]} />
          <h1 className="mt-8 max-w-3xl text-4xl sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {intro}
          </p>
          {lastUpdated && (
            <p className="mt-5 text-sm text-muted-foreground">
              Last updated {lastUpdated}
            </p>
          )}
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

      <section className="bg-background py-12 sm:py-16">
        <div className="container-page grid gap-10 lg:grid-cols-12 lg:gap-14">
          <nav
            aria-label="On this page"
            className="lg:col-span-4 xl:col-span-3"
          >
            <div className="lg:sticky lg:top-24">
              <p className="text-eyebrow">On this page</p>
              <ol className="mt-4 space-y-2.5 text-sm">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-brand"
                    >
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <div className="lg:col-span-8 xl:col-span-9">
            <div className="space-y-12">
              {sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <h2 className="text-2xl">{section.heading}</h2>

                  {section.body?.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="mt-4 max-w-prose text-base leading-relaxed text-muted-foreground"
                    >
                      {paragraph}
                    </p>
                  ))}

                  {section.placeholder && (
                    <div className="mt-4 rounded-xl border border-dashed border-warning/40 bg-warning-soft/50 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warning">
                        To be completed by {settings.companyName}
                      </p>
                      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
                        {section.placeholder}
                      </p>
                    </div>
                  )}
                </section>
              ))}

              <section id="contact-us" className="scroll-mt-24">
                <h2 className="text-2xl">Contact us about this policy</h2>
                <p className="mt-4 max-w-prose text-base leading-relaxed text-muted-foreground">
                  Questions about this page, or a request about your personal
                  information, can go to the team directly.
                </p>
                <ContactDetails className="mt-6" layout="stack" withWhatsApp={false} />
              </section>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
