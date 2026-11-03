"use client";

import Link from "next/link";

import { Reveal } from "@/components/marketing/reveal";
import { ServiceIndexList } from "@/components/marketing/services-section";
import { Button } from "@/components/ui/button";

/**
 * Services, as an editorial index rather than a grid of icon cards.
 *
 * These are the five lines VisaDrive already sells — read from
 * `MARKETING_SERVICES`, which in turn reads the client's own copy, so nothing
 * is advertised here that the business does not do. The rows come from
 * ServiceIndexList, shared with the services pages, so a service is
 * numbered and styled identically wherever it appears.
 */
export function ServicesEditorial() {
  return (
    <section className="bg-paper py-20 sm:py-24 lg:py-32">
      <div className="container-wide">
        <Reveal className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="text-eyebrow">What we do</p>
            <h2 className="display-xl mt-4 text-ink-black">
              The work we take
              <br />
              off your hands.
            </h2>
          </div>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground lg:col-span-5">
            Form filling, appointments and interview preparation — the parts of
            a visa application that most often go wrong.
          </p>
        </Reveal>

        <ServiceIndexList className="mt-14 lg:mt-20" />

        <Reveal className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            If your case does not fit neatly into one of these, tell us what you
            need and we will say honestly whether we can help.
          </p>
          <div className="flex shrink-0 gap-3">
            <Button asChild variant="outline">
              <Link href="/services">All services</Link>
            </Button>
            <Button asChild>
              <Link href="/contact">Talk to an expert</Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
