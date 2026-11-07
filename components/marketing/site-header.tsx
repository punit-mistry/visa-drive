"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Phone, UserRound } from "lucide-react";

import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useClerkSession } from "@/hooks/use-clerk-session";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { MARKETING_NAV } from "@/lib/constants/site";
import { phoneDigits } from "@/lib/helpers/format";
import { cn } from "@/lib/utils";

/**
 * Marketing header.
 *
 * One sticky bar on every route, light on every route.
 *
 * It used to start transparent over a dark cinematic hero and then spring
 * into a floating pill — four animated layout properties riding a spring on
 * every scroll. The hero is light now, so there is nothing to disappear into,
 * and the bar earns its presence with a hairline instead: no border at the
 * top of the page, a 1px rule once the page has moved under it.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const settings = useSiteSettings();
  // Staff browsing the public site should be one click from the CRM rather
  // than having to type /admin. Customers never see this.
  /**
   * Signed-in state from the Clerk cookie, not from clerk-js.
   *
   * The public site does not load Clerk at all any more, so the header
   * answers the only question it needs — which pair of buttons to show —
   * from `__client_uat`. Until the first effect runs this is `null`, which
   * renders as signed out: that is also what a crawler and the prerendered
   * HTML get, and it is the honest default.
   *
   * The admin shortcut is gone from the public header along with it. The
   * cookie carries no role, and staff reach the CRM from the portal, which
   * is one click away and does know who they are.
   */
  const signedIn = useClerkSession();
  const [scrolled, setScrolled] = useState(false);
  const [drawer, setDrawer] = useState<{
    pathname: string;
    open: boolean;
  } | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A drawer left open across a navigation traps the visitor on the new page.
  // Keying the open flag to the pathname closes it automatically on navigation
  // without an effect that sets state after every route change.
  const mobileOpen = drawer?.pathname === pathname && drawer.open;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header className="sticky inset-x-0 top-0 z-50">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:elev-md"
        >
          Skip to content
        </a>

        <div
          className={cn(
            // Only colour moves, and it moves on a CSS transition: paint is
            // cheap, and the bar does not need physics to justify itself.
            "container-wide flex h-16 items-center justify-between gap-4",
            "border-b transition-colors duration-300 ease-out motion-reduce:transition-none",
            scrolled
              ? "border-border bg-background/90 backdrop-blur-xl"
              : "border-transparent bg-background",
          )}
        >
          <div className="flex items-center gap-10">
            <Logo size="md" />

            <nav aria-label="Main" className="hidden lg:block">
              <ul className="flex items-center gap-1">
                {MARKETING_NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      className={cn(
                        "rounded-md px-3 py-2 text-[13px] font-medium tracking-wide transition-colors focus-brand",
                        isActive(item.href)
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`tel:+${phoneDigits(settings.phone)}`}
              className={cn(
                "hidden items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-brand xl:inline-flex",
              )}
            >
              <Phone className="size-4" aria-hidden />
              {settings.phoneDisplay}
            </a>

            {signedIn ? (
              <>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="hidden sm:inline-flex"
                >
                  <Link href="/dashboard">My dashboard</Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="hidden sm:inline-flex"
                >
                  <Link href="/sign-out">Sign out</Link>
                </Button>
                <Button
                  asChild
                  size="icon"
                  variant="ghost"
                  aria-label="Your account"

                >
                  <Link href="/dashboard/profile">
                    <UserRound className="size-5" aria-hidden />
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="hidden sm:inline-flex"
                >
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button asChild size="sm" className="font-semibold">
                  <Link href="/destinations">Start your journey</Link>
                </Button>
              </>
            )}

            <Sheet
              open={mobileOpen}
              onOpenChange={(open) => setDrawer({ pathname, open })}
            >
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="size-5" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[min(22rem,88vw)] gap-0 p-0"
              >
                <SheetHeader className="border-b border-border">
                  <SheetTitle asChild>
                    <span>
                      <Logo size="md" asLink={false} />
                    </span>
                  </SheetTitle>
                  <SheetDescription className="sr-only">
                    Site navigation
                  </SheetDescription>
                </SheetHeader>

                <nav
                  aria-label="Mobile"
                  className="flex-1 overflow-y-auto px-4 py-2"
                >
                  <ul className="flex flex-col">
                    {MARKETING_NAV.map((item) => (
                      <li key={item.href}>
                        <SheetClose asChild>
                          <Link
                            href={item.href}
                            aria-current={
                              isActive(item.href) ? "page" : undefined
                            }
                            className={cn(
                              "flex items-center justify-between rounded-lg px-3 py-3 text-base font-medium transition-colors focus-brand",
                              isActive(item.href)
                                ? "bg-surface text-foreground"
                                : "text-muted-foreground hover:bg-surface hover:text-foreground",
                            )}
                          >
                            {item.label}
                          </Link>
                        </SheetClose>
                      </li>
                    ))}
                  </ul>
                </nav>

                <div className="space-y-3 border-t border-border p-4">
                  {signedIn ? (
                    <>
                      <SheetClose asChild>
                        <Button asChild className="w-full">
                          <Link href="/dashboard">My dashboard</Link>
                        </Button>
                      </SheetClose>
                      <SheetClose asChild>
                        <Button asChild variant="outline" className="w-full">
                          <Link href="/sign-out">Sign out</Link>
                        </Button>
                      </SheetClose>
                    </>
                  ) : (
                    <>
                      <SheetClose asChild>
                        <Button asChild className="w-full">
                          <Link href="/destinations">Start your journey</Link>
                        </Button>
                      </SheetClose>
                      <SheetClose asChild>
                        <Button asChild variant="outline" className="w-full">
                          <Link href="/sign-in">Sign in</Link>
                        </Button>
                      </SheetClose>
                    </>
                  )}

                  <a
                    href={`tel:+${phoneDigits(settings.phone)}`}
                    className="flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-brand"
                  >
                    <Phone className="size-4" aria-hidden />
                    {settings.phoneDisplay}
                  </a>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
    </>
  );
}
