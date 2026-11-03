"use client";

import Link from "next/link";
import { ArrowRight, Check, MapPin, Phone, X } from "lucide-react";

import { Reveal, RevealItem } from "@/components/marketing/reveal";
import { Section, SectionIntro } from "@/components/marketing/section";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { initials, phoneDigits } from "@/lib/helpers/format";
import { LEGAL, SITE } from "@/lib/constants/site";

/**
 * The anti-scam section.
 *
 * Visa consultancy is a category people have been cheated in, so the strongest
 * thing this page can do is say out loud what VisaDrive will *not* do. Every
 * promise below is the client's own published policy from `LEGAL` — the same
 * wording that appears in their terms — paired with the thing a dishonest
 * operator does instead. Nothing here is a claim we invented, and nothing
 * here is a statistic we cannot source.
 *
 * It closes with a named person and a street address, which the research on
 * trust pages is unanimous about: anonymity is what kills conversion.
 */

const PROMISES = [
  {
    promise: "You pay nothing in advance",
    ours: LEGAL.noAdvancePayment,
    theirs: "Full payment demanded before anyone has lifted a finger.",
  },
  {
    promise: "We never promise an approval",
    ours: LEGAL.noGuarantee,
    theirs: "“100% visa guaranteed” — a promise nobody outside a consulate can make.",
  },
  {
    promise: "We are not a government agency",
    ours: LEGAL.notAffiliated,
    theirs: "Official-looking seals and names that imply embassy authority.",
  },
  {
    promise: "Government fees go to the government",
    ours: LEGAL.governmentFeesSeparate,
    theirs: "Official fees quietly bundled into one unexplained total.",
  },
];

export function TrustSection({ tone = "default" }: { tone?: "default" | "surface" }) {
  const settings = useSiteSettings();

  return (
    <Section tone={tone}>
      <SectionIntro
        eyebrow="Before you trust anyone with your passport"
        title="Four things we will never do"
        description="This category has a reputation problem, and it is earned. So here is our side of it in writing — the same wording that sits in our terms, not a sales page version of it."
      />

      <ul className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border lg:mt-12">
        {PROMISES.map((item, index) => (
          <RevealItem as="li" key={item.promise} index={index} className="bg-card">
            <div className="grid gap-5 p-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-8 lg:p-8">
              <div className="flex gap-4">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                  <Check className="size-4" aria-hidden strokeWidth={2.5} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold tracking-tight">
                    {item.promise}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {item.ours}
                  </p>
                </div>
              </div>

              <div className="flex gap-4 rounded-xl bg-surface p-4 sm:bg-transparent sm:p-0">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-strong text-muted-foreground sm:bg-muted">
                  <X className="size-4" aria-hidden strokeWidth={2.5} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    What to walk away from
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {item.theirs}
                  </p>
                </div>
              </div>
            </div>
          </RevealItem>
        ))}
      </ul>

      {/* A name, a face-sized mark, a street and a phone number that rings. */}
      <Reveal>
        <div className="mt-6 grid gap-6 rounded-2xl border border-border bg-card p-6 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center lg:p-8">
          <span
            className="flex size-14 items-center justify-center rounded-2xl bg-brand text-lg font-semibold text-brand-foreground"
            aria-hidden
          >
            {initials(SITE.founder)}
          </span>

          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight">
              {SITE.founder}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                Founder, {SITE.name}
              </span>
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {SITE.mission} We are a small team, so the person who reads your
              file is the person you speak to.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0 text-brand" aria-hidden />
                {SITE.address.short}
              </span>
              <a
                href={`tel:+${phoneDigits(settings.phone)}`}
                className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline focus-brand"
              >
                <Phone className="size-3.5 shrink-0 text-brand" aria-hidden />
                {settings.phoneDisplay}
              </a>
            </div>
          </div>

          <Button asChild variant="outline" className="sm:shrink-0">
            <Link href="/about">
              About us
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </Reveal>
    </Section>
  );
}
