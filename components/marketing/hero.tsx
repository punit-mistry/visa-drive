"use client";

import Link from "next/link";
import { ArrowRight, MapPin, ShieldCheck } from "lucide-react";

import { FadeIn } from "@/components/marketing/reveal";
import { VisaDiscoveryForm } from "@/components/marketing/visa-discovery-form";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { SITE } from "@/lib/constants/site";

/**
 * White hero. No colour wash, no imagery behind the type — the discovery form
 * is the centre of gravity and everything else defers to it.
 */
export function Hero() {
  const settings = useSiteSettings();

  return (
    <section className="relative overflow-hidden border-b border-border bg-background">
      {/* A single hairline grid, barely visible, to stop the white reading as
          empty. Not a gradient and not a glow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55] [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />

      <div className="container-page relative pb-16 pt-14 sm:pb-20 sm:pt-20 lg:pb-24 lg:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <FadeIn>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <MapPin className="size-3.5 text-brand" aria-hidden />
              {SITE.shortDescription}
            </p>
          </FadeIn>

          <FadeIn delay={0.05}>
            <h1 className="mt-6 text-4xl sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
              {settings.tagline}
            </h1>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {SITE.heroSubline}
            </p>
          </FadeIn>
        </div>

        <FadeIn delay={0.16} className="mx-auto mt-10 max-w-5xl sm:mt-12">
          <VisaDiscoveryForm />
        </FadeIn>

        <FadeIn delay={0.22}>
          <div className="mx-auto mt-8 flex flex-col items-center gap-4 sm:mt-10 sm:flex-row sm:justify-center">
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 text-brand" aria-hidden />
              No advance payment for appointment services
            </p>
            <span
              aria-hidden
              className="hidden h-4 w-px bg-border sm:inline-block"
            />
            <Button asChild variant="link" className="h-auto p-0 text-sm">
              <Link href="/how-it-works">
                See how it works
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
