"use client";

import Link from "next/link";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Reveal } from "@/components/marketing/reveal";
import { Section, SectionIntro } from "@/components/marketing/section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface FaqRow {
  _id: string;
  question: string;
  answer: string;
}

/**
 * FAQs, rendered only when the database has some. There is no fallback copy —
 * an answer about fees or eligibility that nobody at VisaDrive wrote is
 * exactly the kind of invented fact this site must not carry.
 */
export function FaqSection({
  scope = "global",
  destinationId,
  visaProductId,
  title = "Questions, answered",
  eyebrow = "FAQ",
  description,
  tone = "default",
  withContactCta = true,
}: {
  scope?: "global" | "destination" | "visa_product";
  destinationId?: string;
  visaProductId?: string;
  title?: string;
  eyebrow?: string;
  description?: string;
  tone?: "default" | "surface";
  withContactCta?: boolean;
}) {
  // The ids arrive as plain strings from a parent query result; Convex brands
  // them, so they are re-narrowed here rather than leaking `Id` into props.
  const faqs = useQuery(api.visaFAQs.listPublic, {
    scope,
    ...(destinationId
      ? { destinationId: destinationId as Id<"destinations"> }
      : {}),
    ...(visaProductId
      ? { visaProductId: visaProductId as Id<"visaProducts"> }
      : {}),
  }) as FaqRow[] | undefined;

  if (faqs !== undefined && faqs.length === 0) return null;

  return (
    <Section tone={tone}>
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4">
          <SectionIntro
            eyebrow={eyebrow}
            title={title}
            description={description}
          />
          {withContactCta && (
            <Reveal>
              <Button asChild variant="outline" className="mt-6">
                <Link href="/contact">Ask us directly</Link>
              </Button>
            </Reveal>
          )}
        </div>

        <div className="lg:col-span-8">
          {faqs === undefined ? (
            <div className="space-y-4" aria-busy aria-label="Loading questions">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="border-b border-border pb-4">
                  <Skeleton className="h-5 w-3/5" />
                </div>
              ))}
            </div>
          ) : (
            <Reveal>
              <Accordion
                type="single"
                collapsible
                className="rounded-2xl border border-border bg-card px-5 sm:px-6"
              >
                {faqs.map((faq) => (
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
        </div>
      </div>
    </Section>
  );
}
