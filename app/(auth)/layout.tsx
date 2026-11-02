import Link from "next/link";
import { ArrowLeft, Headset, Lock, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/shared/logo";
import { LEGAL, SITE } from "@/lib/constants/site";

/**
 * Split auth shell: the form on the left, reassurance on the right.
 *
 * People are about to hand over passport details, so the right-hand panel
 * carries the trust signals rather than decoration — and repeats the "not a
 * government agency" disclaimer, which is the client's own wording and the
 * thing most likely to be misunderstood at sign-up.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Form side */}
      <div className="flex w-full flex-col px-5 py-8 sm:px-8 lg:w-[54%] lg:px-16 lg:py-10">
        <div className="flex items-center justify-between">
          <Logo size="md" />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-brand"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to site
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[420px]">{children}</div>
        </div>

        <p className="text-center text-xs text-muted-foreground lg:text-left">
          Need help?{" "}
          <a
            href={`tel:${SITE.contact.phonePrimary}`}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {SITE.contact.phonePrimaryDisplay}
          </a>
        </p>
      </div>

      {/* Reassurance side */}
      <aside className="relative hidden flex-1 flex-col justify-between bg-sidebar px-14 py-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />

        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
            {SITE.name}
          </p>
          <h2 className="mt-4 max-w-md text-[32px] font-semibold leading-[1.15] tracking-tight text-white">
            {SITE.tagline}
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/60">
            {SITE.heroSubline}
          </p>
        </div>

        <ul className="relative space-y-5">
          {[
            {
              icon: Lock,
              title: "Your documents stay private",
              body: "Passport scans and statements are stored with access controls and are only visible to you and the team handling your application.",
            },
            {
              icon: ShieldCheck,
              title: "Clear, honest advice",
              body: "We tell you what is possible and what is not. No false promises about dates or outcomes.",
            },
            {
              icon: Headset,
              title: "One place for every update",
              body: "Track status, upload what is missing and message the team without chasing an email thread.",
            },
          ].map((item) => (
            <li key={item.title} className="flex gap-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <item.icon className="size-4 text-white/80" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="mt-1 max-w-sm text-sm leading-relaxed text-white/55">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <p className="relative max-w-md text-xs leading-relaxed text-white/40">
          {LEGAL.notAffiliated}
        </p>
      </aside>
    </div>
  );
}
