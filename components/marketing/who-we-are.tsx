import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Reveal, RevealItem } from "@/components/marketing/reveal";
import { Button } from "@/components/ui/button";
import { SITE, WHO_WE_ARE } from "@/lib/constants/site";

/**
 * Who we are — the introduction, placed where someone who has just read the
 * hero decides whether to keep reading.
 *
 * It is a server component on purpose. There is nothing interactive here and
 * nothing that needs a Convex query, so it costs the page no JavaScript at
 * all; the entrance animation rides on `Reveal`, which is the one client
 * island inside it.
 *
 * The copy is the client's, with two superlatives removed — see the note on
 * `WHO_WE_ARE` in `lib/constants/site.ts`. The years figure is their own and
 * is listed in `NEEDS_VERIFICATION`, so it is marked in the admin settings
 * rather than quietly treated as fact.
 *
 * On a phone the photographs come last: the sentence is the content, the
 * pictures are the atmosphere, and the visitor is holding a 390px screen.
 */

const PORTRAIT = "/media/hero-services.jpg";

export function WhoWeAre() {
  return (
    <section className="bg-background py-20 sm:py-24 lg:py-28">
      <div className="container-wide">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16 xl:gap-24">
          {/* ------------------------------- words ------------------------- */}
          <div className="order-1">
            <Reveal>
              <p className="text-eyebrow">{WHO_WE_ARE.eyebrow}</p>
              <h2 className="display-lg mt-4 max-w-[18ch] text-balance">
                {SITE.name}:{" "}
                <span className="text-brand">{WHO_WE_ARE.title}</span>
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                {WHO_WE_ARE.body}
              </p>
            </Reveal>

            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {WHO_WE_ARE.visaTypes.map((type, index) => (
                <RevealItem
                  as="li"
                  key={type}
                  index={index}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-tint"
                    aria-hidden
                  >
                    <Check className="size-3.5 text-brand-deep" />
                  </span>
                  <span className="text-sm font-medium leading-snug">
                    {type}
                  </span>
                </RevealItem>
              ))}
            </ul>

            <Reveal delay={0.1} className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/about">
                  More about {SITE.name}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/contact">Talk to an expert</Link>
              </Button>
            </Reveal>
          </div>

          {/* --------------------------- picture + figure ------------------ */}
          <Reveal className="order-2" delay={0.08}>
            {/* Extra bottom room on the column: the figure hangs below the
                frame and would otherwise crop into the next section. */}
            <div className="relative pb-10 sm:pb-12">
              {/* The tall frame. `sizes` is honest about the two-column
                  layout, so a phone never downloads the desktop crop. */}
              <div className="relative aspect-[4/5] overflow-hidden rounded-3xl border border-border bg-surface sm:aspect-[3/2] lg:aspect-[4/5]">
                <Image
                  src={PORTRAIT}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 44vw, 100vw"
                  quality={70}
                  className="object-cover object-center"
                />
              </div>

              {/* The one figure on this section, and the client's own, so it
                  is set at display size rather than tucked into a badge. The
                  numeral is the serif from the hero — the same face that
                  carries "Apply for your visa." — which is what makes a bare
                  number read as a statement instead of a data point. */}
              <div className="absolute -bottom-7 -left-4 flex items-center gap-4 rounded-2xl border border-border bg-card py-5 pl-5 pr-6 elev-xl sm:-left-6 sm:gap-5 sm:py-6 sm:pl-7 sm:pr-9">
                <p className="numeral text-6xl leading-[0.85] text-brand sm:text-7xl lg:text-8xl">
                  {WHO_WE_ARE.yearsOfExperience}
                  <span className="align-top text-[0.45em] leading-none">
                    +
                  </span>
                </p>
                <p className="max-w-[7rem] text-[13px] font-semibold uppercase leading-tight tracking-[0.14em] text-muted-foreground sm:text-sm">
                  Years of experience
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
