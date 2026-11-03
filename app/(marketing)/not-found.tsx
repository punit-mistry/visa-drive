import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { MARKETING_SERVICES } from "@/components/marketing/services";
import { Button } from "@/components/ui/button";
import { MARKETING_NAV } from "@/lib/constants/site";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That page does not exist. Here is where to go instead.",
  robots: { index: false, follow: true },
};

/**
 * Marketing 404, framed like the homepage's dark editorial sections.
 *
 * The oversized "404" is decoration only (hidden from assistive tech); the
 * real heading, the explanation and the routes back into the site are all
 * ordinary text and links.
 */
export default function NotFound() {
  return (
    <section className="relative overflow-hidden bg-ink-black text-paper">
      {/* The giant numeral sits in its own layer with no negative z-index, and
          the readable content is a sibling with its own stacking context. */}
      <div
        aria-hidden
        className="numeral pointer-events-none absolute -bottom-10 -right-4 select-none text-[clamp(14rem,42vw,44rem)] leading-none text-white/[0.04]"
      >
        404
      </div>

      <div className="container-wide relative z-10 pb-20 pt-16 sm:pb-24 sm:pt-20 lg:pb-32 lg:pt-24">
        <div className="max-w-4xl">
          <p className="text-eyebrow-dark">Error 404</p>
          <h1 className="display-xl mt-4 text-paper">
            That page has moved on without you
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/60 sm:text-lg">
            The link is broken or the page no longer exists. Here is the way
            back.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="font-semibold">
              <Link href="/">
                Back to home
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/30 bg-white/5 text-white hover:border-white/50 hover:bg-white/10 hover:text-white dark:border-white/30 dark:bg-white/5"
            >
              <Link href="/destinations">Browse destinations</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/30 bg-white/5 text-white hover:border-white/50 hover:bg-white/10 hover:text-white dark:border-white/30 dark:bg-white/5"
            >
              <Link href="/contact">Talk to an expert</Link>
            </Button>
          </div>
        </div>

        <div className="mt-20 grid gap-12 border-t border-white/12 pt-10 sm:grid-cols-2 lg:mt-28 lg:max-w-4xl">
          <nav aria-labelledby="notfound-pages">
            <h2 id="notfound-pages" className="text-eyebrow-dark">
              Main pages
            </h2>
            <ul className="mt-5 border-t border-white/12">
              <li className="border-b border-white/12">
                <NotFoundLink href="/" label="Home" />
              </li>
              {MARKETING_NAV.map((item) => (
                <li key={item.href} className="border-b border-white/12">
                  <NotFoundLink href={item.href} label={item.label} />
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="notfound-services">
            <h2 id="notfound-services" className="text-eyebrow-dark">
              Services
            </h2>
            <ul className="mt-5 border-t border-white/12">
              {MARKETING_SERVICES.map((service) => (
                <li key={service.key} className="border-b border-white/12">
                  <NotFoundLink
                    href={`/services/${service.slug}`}
                    label={service.name}
                  />
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </section>
  );
}

function NotFoundLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-sm py-3.5 text-[15px] text-white/70 transition-colors hover:text-white focus-brand focus-visible:ring-offset-ink-black"
    >
      {label}
      <ArrowRight
        className="size-4 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-brand group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
        aria-hidden
      />
    </Link>
  );
}
