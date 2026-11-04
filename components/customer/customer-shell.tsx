"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";
import {
  Bell,
  CreditCard,
  FileText,
  LayoutDashboard,
  PlusCircle,
  ShieldCheck,
  User,
} from "lucide-react";

import { AccountBlockedState, AccountSetupState } from "@/components/shared/account-state";
import { Logo } from "@/components/shared/logo";
import { HelpAssistant } from "@/components/shared/help-assistant";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/applications", label: "Applications", icon: FileText },
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/profile", label: "Profile", icon: User },
];

/**
 * Portal shell.
 *
 * Desktop gets a quiet left rail; phones get a scrollable tab strip pinned
 * under the header instead, because a stacked five-item list pushed the
 * actual page content below the fold on every single route.
 *
 * The page only mounts once the Convex `users` row exists: until then every
 * protected query throws `NO_PROFILE`. `useCurrentUser` creates that row from
 * the signed JWT, so the gap closes without the visitor seeing an error.
 */
export function CustomerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading, isStaff, isSuspended, profileIssue } = useCurrentUser();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      <Show when="signed-out">
        <div className="container-page flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in required</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Please sign in to access your VisaDrive dashboard, applications, and
            payments.
          </p>
          <div className="mt-6 flex gap-2">
            <Button asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/destinations">Browse visas</Link>
            </Button>
          </div>
        </div>
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
        ) : (
          <div className="min-h-screen bg-surface">
            <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
              <div className="container-page flex h-16 items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Logo size="md" href="/" />
                  <span className="hidden rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline">
                    My portal
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isStaff && (
                    <Button asChild size="sm" variant="outline">
                      <Link href="/admin">
                        <ShieldCheck className="size-4" aria-hidden />
                        <span className="hidden sm:inline">Admin CRM</span>
                        <span className="sm:hidden">Admin</span>
                      </Link>
                    </Button>
                  )}
                  <Button asChild size="sm" data-tour="customer-apply">
                    <Link href="/apply">
                      <PlusCircle className="size-4" aria-hidden />
                      <span className="hidden sm:inline">New application</span>
                      <span className="sm:hidden">Apply</span>
                    </Link>
                  </Button>
                  <UserButton
                    appearance={{ elements: { avatarBox: "size-8" } }}
                    userProfileUrl="/dashboard/profile"
                  />
                </div>
              </div>

              {/* Phone navigation: one horizontal strip, never a stacked list. */}
              <nav
                aria-label="Customer portal"
                data-tour="customer-nav"
                className="scrollbar-thin container-page flex gap-1 overflow-x-auto pb-2 lg:hidden"
              >
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-tour={`customer-nav-${item.href.split("/").pop()}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-brand",
                        active
                          ? "bg-brand-tint text-brand-deep"
                          : "text-muted-foreground hover:bg-surface hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </header>

            <div className="container-page grid gap-8 py-6 lg:grid-cols-[216px_minmax(0,1fr)] lg:py-8">
              <aside className="hidden lg:block">
                <nav
                  aria-label="Customer portal"
                  data-tour="customer-nav"
                  className="sticky top-24 flex flex-col gap-0.5"
                >
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        data-tour={`customer-nav-${item.href.split("/").pop()}`}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-brand",
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
                </nav>
              </aside>

              <main className="min-w-0">{children}</main>
            </div>

            <HelpAssistant surface="customer" />
          </div>
        )}
      </Show>
    </>
  );
}
