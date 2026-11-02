import Link from "next/link";
import {
  FileText,
  MapPinned,
  Radar,
  Upload,
  type LucideIcon,
} from "lucide-react";

import { Reveal, RevealItem } from "@/components/marketing/reveal";
import { Section, SectionIntro } from "@/components/marketing/section";
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

export function HowItWorks({
  tone = "default",
  withCta = true,
}: {
  tone?: "default" | "surface";
  withCta?: boolean;
}) {
  return (
    <Section tone={tone}>
      <SectionIntro
        eyebrow="How it works"
        title="Four steps, start to finish"
        description="A visa application is mostly paperwork and timing. We take both off your desk and keep you informed at every stage."
        action={
          withCta ? (
            <Button asChild variant="outline">
              <Link href="/how-it-works">Read the detail</Link>
            </Button>
          ) : undefined
        }
      />

      <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4 lg:mt-12">
        {HOW_IT_WORKS_STEPS.map((step, index) => (
          <RevealItem as="li" key={step.number} index={index} className="bg-card">
            <div className="flex h-full flex-col p-6 lg:p-7">
              <div className="flex items-center justify-between">
                <span className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-background text-brand">
                  <step.icon className="size-[18px]" aria-hidden />
                </span>
                <span className="font-mono text-xs text-muted-foreground/70">
                  {step.number}
                </span>
              </div>
              <h3 className="mt-5 text-base font-semibold sm:text-base">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </div>
          </RevealItem>
        ))}
      </ol>

      <Reveal>
        <p className="mt-6 text-sm text-muted-foreground">
          Visa decisions are made by the relevant authorities. Our job is to make
          sure nothing in your application is the reason for a delay.
        </p>
      </Reveal>
    </Section>
  );
}
