"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Mail, MapPin, Phone } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Logo } from "@/components/shared/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentYear } from "@/hooks/use-current-date";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { FOOTER_NAV, LEGAL, SITE } from "@/lib/constants/site";
import { phoneDigits } from "@/lib/helpers/format";

/**
 * Footer.
 *
 * The two `LEGAL` disclaimers are reproduced verbatim and are not optional —
 * they are the client's own stated guard against guarantee-style claims, and
 * they sit on every page of the public site because of it.
 */
export function SiteFooter() {
  const settings = useSiteSettings();
  const destinations = useQuery(api.destinations.listPublished, { limit: 6 }) as
    | Array<{ _id: string; slug: string; name: string; flagEmoji: string }>
    | undefined;

  const year = useCurrentYear();

  return (
    <footer className="bg-ink-black text-paper">
      <div className="container-wide py-16 sm:py-20">
        {/* A masthead line, the way a magazine signs off. */}
        <p className="display-lg max-w-3xl text-paper">
          Your next destination,
          <br />
          <span className="text-brand">handled properly.</span>
        </p>

        <div className="mt-14 grid gap-10 border-t border-white/12 pt-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <Logo size="lg" onDark />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/55">
              {settings.description}
            </p>

            <ul className="mt-6 space-y-3 text-sm">
              <li>
                <a
                  href={`tel:+${phoneDigits(settings.phone)}`}
                  className="inline-flex items-start gap-2.5 rounded-sm text-white/55 transition-colors hover:text-white focus-brand"
                >
                  <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{settings.phoneDisplay}</span>
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${settings.email}`}
                  className="inline-flex items-start gap-2.5 rounded-sm text-white/55 transition-colors hover:text-white focus-brand"
                >
                  <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="break-all">{settings.email}</span>
                </a>
              </li>
              <li className="inline-flex items-start gap-2.5 text-white/55">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{settings.address}</span>
              </li>
            </ul>
          </div>

          <div className="grid gap-10 sm:grid-cols-3 lg:col-span-8 lg:gap-8">
            <FooterColumn title="Services" links={[...FOOTER_NAV.services]} />

            <nav aria-labelledby="footer-destinations">
              <h2
                id="footer-destinations"
                className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55"
              >
                Destinations
              </h2>
              <ul className="mt-4 space-y-3 text-sm">
                {destinations === undefined ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <li key={i}>
                      <Skeleton className="h-4 w-28" />
                    </li>
                  ))
                ) : destinations.length === 0 ? (
                  <li>
                    <FooterLink href="/destinations" label="Browse destinations" />
                  </li>
                ) : (
                  <>
                    {destinations.map((destination) => (
                      <li key={destination._id}>
                        <FooterLink
                          href={`/destinations/${destination.slug}`}
                          label={`${destination.flagEmoji} ${destination.name}`}
                        />
                      </li>
                    ))}
                    <li>
                      <FooterLink href="/destinations" label="All destinations" />
                    </li>
                  </>
                )}
              </ul>
            </nav>

            <div className="space-y-10">
              <FooterColumn title="Company" links={[...FOOTER_NAV.company]} />
              <FooterColumn title="Legal" links={[...FOOTER_NAV.legal]} />
            </div>
          </div>
        </div>

        <div className="mt-14 space-y-3 border-t border-white/12 pt-8">
          <p className="max-w-3xl text-xs leading-relaxed text-white/55">
            {LEGAL.notAffiliated}
          </p>
          <p className="max-w-3xl text-xs leading-relaxed text-white/55">
            {LEGAL.noGuarantee}
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year ? `${year} ` : ""}
            {settings.companyName}. All rights reserved.
          </p>
          <p>{SITE.jurisdiction}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) {
  const id = `footer-${title.toLowerCase()}`;
  return (
    <nav aria-labelledby={id}>
      <h2 id={id} className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
        {title}
      </h2>
      <ul className="mt-4 space-y-3 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <FooterLink href={link.href} label={link.label} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-sm text-white/65 transition-colors hover:text-white focus-brand"
    >
      {label}
    </Link>
  );
}
