import type { SectionTone } from "@/components/marketing/section";
import Link from "next/link";
import {
  FileText,
  MapPinned,
  Radar,
  Upload,
  type LucideIcon,
} from "lucide-react";

import { Reveal, RevealItem } from "@/components/marketing/reveal";
import { Button } from "@/components/ui/button";

export interface HowItWorksStep {
  number: string;
  title: string;
  body: string;
  detail: string;
  icon: LucideIcon;
}

/**
 * The four steps of a VisaDrive application. These describe how the platform
 * works — they deliberately make no claim about fees, timelines or outcomes,
 * both of which are the authorities' to decide.
 */
export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    number: "01",
    title: "Choose Your Destination",
    body: "Pick the country you are travelling to and the visa type that matches your trip.",
    detail:
      "Each visa shows what it covers, what we do for you and what the catalogue records about it. Where a fee or a timeline has not been verified against the official source, we say so rather than guess.",
    icon: MapPinned,
  },
  {
    number: "02",
    title: "Complete Your Application",
    body: "Fill in your details once. We check the form before anything is submitted.",
    detail:
      "Your progress is saved as you go, so you can stop and come back. Our team reviews what you have entered and tells you plainly if something needs changing.",
    icon: FileText,
  },
  {
    number: "03",
    title: "Upload Your Documents",
    body: "Send us your documents securely against a checklist built for your visa.",
    detail:
      "Documents are stored privately and are only ever opened by the team handling your application. Every document is reviewed before submission so avoidable errors are caught early.",
    icon: Upload,
  },
  {
    number: "04",
    title: "Track Your Application",
    body: "Follow every stage from your dashboard, with updates recorded in one place.",
    detail:
      "You can see exactly where your application stands and message your assigned team. We will tell you what has happened and what is next, without promising an outcome we do not control.",
    icon: Radar,
  },
];

/**
 * Compact summary of the four steps, for embedding on other pages. The full
 * treatment — with the detail paragraph for each step — is `HowItWorksSteps`,
 * which the /how-it-works page uses.
 */
export function HowItWorks({
  withCta = true,
}: {
  /** Kept for call-site compatibility; the editorial layout has one ground. */
  tone?: SectionTone;
  withCta?: boolean;
}) {
  return (
    <section className="bg-paper py-20 sm:py-24 lg:py-32">
      <div className="container-wide">
        <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-eyebrow">How it works</p>
            <h2 className="display-xl mt-4 text-ink-black">
              Four steps,
              <br />
              start to finish.
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
              A visa application is mostly paperwork and timing. We take both
              off your desk and keep you informed at every stage.
            </p>
          </div>
          {withCta && (
            <Button asChild variant="outline" className="shrink-0">
              <Link href="/how-it-works">Read the detail</Link>
            </Button>
          )}
        </Reveal>

        <ol className="mt-14 grid border-t border-ink-black/12 sm:grid-cols-2 lg:mt-20 lg:grid-cols-4">
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <RevealItem as="li" key={step.number} index={index}>
              <div className="group h-full border-b border-ink-black/12 py-8 sm:pr-8 lg:border-b-0 lg:py-10">
                <span className="numeral text-5xl leading-none text-ink-black/25 transition-colors duration-500 group-hover:text-brand">
                  {step.number}
                </span>
                <h3 className="display-md mt-6 text-ink-black">{step.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </RevealItem>
          ))}
        </ol>

        <Reveal>
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Visa decisions are made by the relevant authorities. Our job is to
            make sure nothing in your application is the reason for a delay.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * The full walk-through: one row per step, with the plain description and the
 * detail paragraph beside it. Numerals are oversized and quiet until a row is
 * hovered, when the brand red picks the active step out.
 */
export function HowItWorksSteps() {
  return (
    <ol className="border-t border-ink-black/12">
      {HOW_IT_WORKS_STEPS.map((step, index) => (
        <RevealItem as="li" key={step.number} index={index}>
          <div className="group grid gap-x-8 gap-y-5 border-b border-ink-black/12 py-10 sm:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[9rem_minmax(0,22rem)_minmax(0,1fr)] lg:py-14">
            <span className="numeral text-5xl leading-none text-ink-black/25 transition-colors duration-500 group-hover:text-brand lg:text-7xl">
              {step.number}
            </span>

            <div>
              <step.icon className="size-5 text-brand" aria-hidden />
              <h2 className="display-md mt-4 text-ink-black">{step.title}</h2>
            </div>

            <div className="sm:col-start-2 lg:col-start-3">
              <p className="max-w-lg text-lg leading-relaxed text-ink-black">
                {step.body}
              </p>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
                {step.detail}
              </p>
            </div>
          </div>
        </RevealItem>
      ))}
    </ol>
  );
}
