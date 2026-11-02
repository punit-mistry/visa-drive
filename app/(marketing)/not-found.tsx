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

export default function NotFound() {
  return (
    <section className="bg-background">
      <div className="container-page py-20 sm:py-28 lg:py-32">
        <div className="max-w-xl">
          <p className="font-mono text-sm text-muted-foreground">404</p>
          <h1 className="mt-4 text-4xl sm:text-5xl">
            That page has moved on without you
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            The link is broken or the page no longer exists. Here is the way
            back.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/destinations">Browse destinations</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/contact">Talk to an expert</Link>
            </Button>
          </div>
        </div>

        <div className="mt-16 grid gap-10 border-t border-border pt-10 sm:grid-cols-2">
          <nav aria-labelledby="notfound-pages">
            <h2 id="notfound-pages" className="text-sm font-semibold">
              Main pages
            </h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <NotFoundLink href="/" label="Home" />
              </li>
              {MARKETING_NAV.map((item) => (
                <li key={item.href}>
                  <NotFoundLink href={item.href} label={item.label} />
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="notfound-services">
            <h2 id="notfound-services" className="text-sm font-semibold">
              Services
            </h2>
            <ul className="mt-4 space-y-3 text-sm">
              {MARKETING_SERVICES.map((service) => (
                <li key={service.key}>
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
      className="group inline-flex items-center gap-1.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-brand"
    >
      {label}
      <ArrowRight
        className="size-3.5 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
        aria-hidden
      />
    </Link>
  );
}
