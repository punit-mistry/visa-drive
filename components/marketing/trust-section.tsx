"use client";

import Link from "next/link";
import { ArrowRight, Check, MapPin, Phone, X } from "lucide-react";

import { Reveal, RevealItem } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { initials, phoneDigits } from "@/lib/helpers/format";
import { LEGAL, SITE } from "@/lib/constants/site";

/**
 * The anti-scam section, built as a comparison rather than an essay.
 *
 * Visa consultancy is a category people have been cheated in, so this has to
 * land before anyone decides to read. It is a scan: a row label, our side,
 * their side — three or four words a cell, so the shape of the table carries
 * the argument on its own and the type never has to be studied.
 *
 * The client's published wording is still here in full, below the table, and
 * still verbatim from `LEGAL`. It has to be: the short cells are an index to
 * the policy, not a replacement for it, and a summarised disclaimer is not a
 * disclaimer. Nothing here is a claim we invented or a figure we cannot
 * source.
 *
 * It closes with a named person and a street address, which the research on
 * trust pages is unanimous about: anonymity is what kills conversion.
 */

const COMPARISONS = [
  {
    label: "Payment",
    ours: "Nothing in advance",
    theirs: "Everything upfront",
    legal: LEGAL.noAdvancePayment,
  },
  {
    label: "Outcome",
    ours: "Never promised",
    theirs: "“100% guaranteed”",
    legal: LEGAL.noGuarantee,
  },
  {
    label: "Authority",
    ours: "A private consultancy",
    theirs: "Embassy-style seals",
    legal: LEGAL.notAffiliated,
  },
  {
    label: "Official fees",
    ours: "Paid to the government",
    theirs: "Bundled into one total",
    legal: LEGAL.governmentFeesSeparate,
  },
];

export function TrustSection() {
  const settings = useSiteSettings();

  return (
    <Section tone="dark" size="lg" width="wide">
      <Reveal className="grid gap-8 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          <p className="text-eyebrow-dark">
            Before you trust anyone with your passport
          </p>
          <h2 className="display-xl mt-4 text-paper">
            Four things we
            <br />
            will never do.
          </h2>
        </div>
        <p className="max-w-md text-base leading-relaxed text-white/55 lg:col-span-5">
          This category has a reputation problem, and it is earned. Here is the
          difference, in four lines.
        </p>
      </Reveal>

      {/* ------------------------------- the table ------------------------- */}
      <div className="mt-14 lg:mt-20">
        {/* Column heads. Hidden on phones, where each row restacks and the
            per-cell tick and cross carry the distinction instead. */}
        <div className="hidden border-b border-white/20 pb-4 lg:grid lg:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
          <span />
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-paper">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden />
            {SITE.name}
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            What to walk away from
          </p>
        </div>

        <ul>
          {COMPARISONS.map((row, index) => (
            <RevealItem as="li" key={row.label} index={index}>
              <div className="group relative grid gap-x-8 gap-y-3 border-b border-white/12 py-7 lg:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] lg:py-8">
                {/* The row underlines itself on hover, left to right, over the
                    hairline already beneath it. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-brand transition-transform duration-500 ease-out group-focus-within:scale-x-100 group-hover:scale-x-100"
                />

                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60 transition-colors duration-500 group-hover:text-brand">
                  {row.label}
                </p>

                <p className="flex items-center gap-3 text-lg font-medium text-paper transition-transform duration-500 ease-out group-hover:translate-x-1 sm:text-xl">
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
                    aria-hidden
                  >
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                  {row.ours}
                </p>

                <p className="flex items-center gap-3 text-lg text-white/60 sm:text-xl">
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/40"
                    aria-hidden
                  >
                    <X className="size-3.5" strokeWidth={3} />
                  </span>
                  <span className="line-through decoration-white/25">
                    {row.theirs}
                  </span>
                </p>
              </div>
            </RevealItem>
          ))}
        </ul>
      </div>

      {/* The policy itself: quiet, but present and word for word. The cells
          above index this, they do not stand in for it. */}
      <Reveal className="mt-10">
        <details className="group/legal">
          <summary className="link-rule inline-flex w-fit cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.16em] text-white/40 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none">
            In our own words
            <ArrowRight
              className="size-3.5 transition-transform duration-300 group-open/legal:rotate-90"
              aria-hidden
            />
          </summary>
          <ul className="mt-6 grid gap-x-10 gap-y-4 sm:grid-cols-2">
            {COMPARISONS.map((row) => (
              <li key={row.label} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-2 h-px w-4 shrink-0 bg-white/25"
                />
                <p className="text-xs leading-relaxed text-white/45">
                  {row.legal}
                </p>
              </li>
            ))}
          </ul>
        </details>
      </Reveal>

      {/* A name, a face-sized mark, a street and a phone number that rings. */}
      <Reveal>
        <div className="mt-12 grid gap-6 rounded-2xl border border-white/12 bg-white/[0.04] p-6 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center lg:p-8">
          <span
            className="flex size-14 items-center justify-center rounded-2xl bg-brand text-lg font-semibold text-brand-foreground"
            aria-hidden
          >
            {initials(SITE.founder)}
          </span>

          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight text-paper">
              {SITE.founder}
              <span className="ml-2 text-sm font-normal text-white/50">
                Founder, {SITE.name}
              </span>
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-white/60">
              A small team. The person who reads your file is the person you
              speak to.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/55">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0 text-brand" aria-hidden />
                {SITE.address.short}
              </span>
              <a
                href={`tel:+${phoneDigits(settings.phone)}`}
                className="inline-flex items-center gap-1.5 font-medium text-paper underline-offset-4 hover:underline focus-brand"
              >
                <Phone className="size-3.5 shrink-0 text-brand" aria-hidden />
                {settings.phoneDisplay}
              </a>
            </div>
          </div>

          <Button
            asChild
            variant="outline"
            className="border-white/30 bg-white/5 text-white hover:border-white/50 hover:bg-white/10 hover:text-white sm:shrink-0 dark:border-white/30 dark:bg-white/5"
          >
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
