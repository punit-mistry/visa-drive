"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import {
  Building2,
  LayoutDashboard,
  PlusCircle,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { AccountBlockedState, AccountSetupState } from "@/components/shared/account-state";
import { Logo } from "@/components/shared/logo";
import { VisaLoader } from "@/components/shared/visa-loader";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PARTNER_STATUS_CONFIG, type PartnerStatus } from "@/lib/constants/partners";
import { cn } from "@/lib/utils";

/**
 * The B2B partner portal shell.
 *
 * One design system, two products: this is built from the same tokens,
 * spacing and components as the customer portal and the CRM, with a quiet
 * left rail on desktop and a scrollable tab strip on phones. What makes it
 * read as a business tool rather than a consumer one is the content — margins,
 * volume, a customer book — not a different palette.
 *
 * Three states are handled before any page renders:
 *   • no partner profile at all → the registration invitation;
 *   • a profile that is pending, under review, rejected or suspended → the
 *     status screen, with the office's reason on it;
 *   • approved → the portal.
 *
 * The pages behind this still check for themselves. `requirePartner` runs
 * inside every Convex function this portal calls, so hiding the chrome is a
 * courtesy, not the boundary.
 */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/partner/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/partner/bookings", label: "Bookings", icon: Building2 },
  { href: "/partner/customers", label: "Customers", icon: Users },
  { href: "/partner/pricing", label: "Pricing", icon: Tags },
  { href: "/partner/profile", label: "Profile", icon: Building2 },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PartnerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading, isSuspended, profileIssue } = useCurrentUser();
  const profile = useQuery(api.partners.myProfile, user ? {} : "skip");

  // The registration form and its confirmation live inside /partner but must
  // stay reachable to somebody who is not a partner yet — that is the whole
  // point of them.
  const isRegistrationRoute = pathname.startsWith("/partner/register");

  return (
    <>
      <Show when="signed-out">
        <SignInPrompt />
      </Show>

      <Show when="signed-in">
        {isLoading || !user ? (
          profileIssue === "deleted" ? (
            <AccountBlockedState reason="deleted" />
          ) : (
            <AccountSetupState stalled={profileIssue !== null} />
          )
        ) : isSuspended ? (
          <AccountBlockedState reason="suspended" />
        ) : profile === undefined ? (
          <VisaLoader
            fullscreen
            label="Opening your partner portal"
            hint="Checking your agency's account."
          />
        ) : isRegistrationRoute ? (
          <PlainShell>{children}</PlainShell>
        ) : !profile ? (
          <PlainShell>
            <NotAPartnerState />
          </PlainShell>
        ) : !profile.canTrade ? (
          <PlainShell>
            <PendingState
              status={profile.partner.status as PartnerStatus}
              statusLabel={profile.statusLabel}
              statusDescription={profile.statusDescription}
              reason={profile.partner.statusReason}
              agencyName={profile.partner.agencyName}
              partnerCode={profile.partner.partnerCode}
              documentCount={profile.documentCount}
              verifiedDocumentCount={profile.verifiedDocumentCount}
            />
          </PlainShell>
        ) : (
          <div className="min-h-screen bg-surface">
            <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
              <div className="container-wide flex h-16 items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Logo size="md" href="/partner/dashboard" />
                  <span className="hidden truncate rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline">
                    {profile.partner.agencyName}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button asChild size="sm">
                    <Link href="/partner/bookings/new">
                      <PlusCircle className="size-4" aria-hidden />
                      <span className="hidden sm:inline">New booking</span>
                      <span className="sm:hidden">Book</span>
                    </Link>
                  </Button>
                  <UserButton
                    appearance={{ elements: { avatarBox: "size-8" } }}
                    userProfileUrl="/partner/profile"
                  />
                </div>
              </div>

              {/* Phones get one horizontal strip, never a stacked list. */}
              <nav
                aria-label="Partner portal"
                className="scrollbar-thin container-wide flex gap-1 overflow-x-auto pb-2 lg:hidden"
              >
                {NAV_ITEMS.map((item) => (
                  <NavPill
                    key={item.href}
                    item={item}
                    active={isActive(pathname, item.href)}
                  />
                ))}
              </nav>
            </header>

            <div className="container-wide flex gap-8 py-6 lg:py-8">
              <aside className="hidden w-52 shrink-0 lg:block">
                <nav aria-label="Partner portal" className="sticky top-24 space-y-1">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-brand",
                          active
                            ? "bg-brand-tint text-brand-deep"
                            : "text-muted-foreground hover:bg-background hover:text-foreground",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-4 transition-colors",
                            active
                              ? "text-brand"
                              : "text-muted-foreground group-hover:text-foreground",
                          )}
                          aria-hidden
                        />
                        {item.label}
                      </Link>
                    );
                  })}

                  <div className="mt-6 rounded-xl border border-border bg-background p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      Partner ID
                    </p>
                    <p className="mt-1 font-mono text-sm">
                      {profile.partner.partnerCode}
                    </p>
                  </div>
                </nav>
              </aside>

              <main className="min-w-0 flex-1">{children}</main>
            </div>
          </div>
        )}
      </Show>
    </>
  );
}

function NavPill({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-brand",
        active
          ? "bg-brand-tint text-brand-deep"
          : "text-muted-foreground hover:bg-surface hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {item.label}
    </Link>
  );
}

/** Header + centred panel, for the states that are not the portal proper. */
function PlainShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-background">
        <div className="container-page flex h-16 items-center justify-between">
          <Logo size="md" href="/" />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">My portal</Link>
            </Button>
            <UserButton
              appearance={{ elements: { avatarBox: "size-8" } }}
              userProfileUrl="/dashboard/profile"
            />
          </div>
        </div>
      </header>
      <main className="container-page py-10">{children}</main>
    </div>
  );
}

function SignInPrompt() {
  return (
    <div className="container-page flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Partner sign-in</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Sign in with your agency&apos;s VisaDrive account to reach the partner
        portal.
      </p>
      <div className="mt-6 flex gap-2">
        <Button asChild>
          <Link href="/sign-in?redirect_url=/partner/dashboard">Sign in</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-up?redirect_url=/partner/register">
            Create an account
          </Link>
        </Button>
      </div>
    </div>
  );
}

function NotAPartnerState() {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center elev-sm">
      <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-brand-tint">
        <Building2 className="size-5 text-brand" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">
        Become a VisaDrive partner
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        If you are a travel agent, agency or corporate travel desk, register
        your business to book visas for your customers at partner rates — with
        your own margin on every booking.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/partner/register">Register your agency</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to my portal</Link>
        </Button>
      </div>
    </div>
  );
}

function PendingState({
  status,
  statusLabel,
  statusDescription,
  reason,
  agencyName,
  partnerCode,
  documentCount,
  verifiedDocumentCount,
}: {
  status: PartnerStatus;
  statusLabel: string;
  statusDescription: string;
  reason?: string;
  agencyName: string;
  partnerCode: string;
  documentCount: number;
  verifiedDocumentCount: number;
}) {
  const config = PARTNER_STATUS_CONFIG[status];
  const rejected = status === "rejected";

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="rounded-2xl border border-border bg-card p-8 elev-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {partnerCode}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{agencyName}</h1>

        <div
          className={cn(
            "mt-4 rounded-xl border p-4",
            rejected || status === "suspended"
              ? "border-brand/25 bg-brand-tint"
              : "border-info/20 bg-info-soft",
          )}
        >
          <p className="text-sm font-medium text-foreground">{statusLabel}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {reason ?? statusDescription ?? config?.description}
          </p>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-4">
            <dt className="text-xs text-muted-foreground">Documents uploaded</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {documentCount}
            </dd>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <dt className="text-xs text-muted-foreground">Verified</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {verifiedDocumentCount}
            </dd>
          </div>
        </dl>

        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          {rejected
            ? "You can correct your details and submit the application again."
            : "We will email you as soon as a decision is made. Adding your verification documents speeds this up."}
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/partner/register">
              {rejected ? "Update and re-apply" : "Add documents"}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to my portal</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
