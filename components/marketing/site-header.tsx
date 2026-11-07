"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Phone, UserRound } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

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
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { MARKETING_NAV } from "@/lib/constants/site";
import { phoneDigits } from "@/lib/helpers/format";
import { cn } from "@/lib/utils";

/**
 * Marketing header.
 *
 * On the homepage it starts transparent inside the hero clip, then detaches
 * into a floating pill once the page has moved — so the clip owns the first
 * screen and the chrome only asserts itself when it starts overlapping
 * content. Everything below that hero is on paper, so the settled pill is
 * the light one on every route.
 *
 * It carries no rule along its bottom edge. The blur and the shadow already
 * separate it from the page, and a hairline on top of those was one
 * separator too many.
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

  /** The homepage opens on a full-bleed clip, so the bar overlaps it. */
  const overHero = pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /** True only while the bar is actually floating on the clip. */
  const onDark = overHero && !scrolled;

  const reduceMotion = useReducedMotion();

  // The resting bar has to line its logo up with the page content beneath it,
  // and that content sits inside `.container-wide`. Since the padding is now
  // animated it cannot come from responsive classes, so the breakpoints are
  // read here instead — these numbers mirror `.container-wide` in globals.css
  // and have to move with it.
  const isSmUp = useMediaQuery("(min-width: 640px)");
  const isLgUp = useMediaQuery("(min-width: 1024px)");
  const isXlUp = useMediaQuery("(min-width: 1280px)");
  const is2XlUp = useMediaQuery("(min-width: 1536px)");

  const restingGutter = is2XlUp
    ? 96
    : isXlUp
      ? 64
      : isLgUp
        ? 48
        : isSmUp
          ? 32
          : 20;
  const pillGutter = isSmUp ? 28 : 20;

  // One spring drives every dimension that changes, so the bar resolves as a
  // single object settling rather than four CSS curves finishing at slightly
  // different moments. A spring is the whole difference in feel here: eased
  // keyframes on layout properties always read as mechanical.
  const spring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 240, damping: 30, mass: 0.85 };

  const gutter = scrolled ? (isSmUp ? 20 : 12) : 0;

  // A drawer left open across a navigation traps the visitor on the new page.
  // Keying the open flag to the pathname closes it automatically on navigation
  // without an effect that sets state after every route change.
  const mobileOpen = drawer?.pathname === pathname && drawer.open;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <motion.header
        animate={{
          paddingLeft: gutter,
          paddingRight: gutter,
          paddingTop: gutter,
        }}
        transition={spring}
        className={cn(
          "inset-x-0 top-0 z-50",
          // Keyed to the route, not to `onDark`: switching position part-way
          // down the page would make the bar jump at the scroll threshold.
          overHero ? "fixed" : "sticky",
        )}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:elev-md"
        >
          Skip to content
        </a>

        {/* At the top the bar spans the viewport edge to edge, the way it
            always has. Once the page moves it detaches into a floating pill —
            so the chrome stops being a lid on the page and starts being an
            object on top of it. */}
        <motion.div
          animate={{
            height: scrolled ? 64 : 80,
            borderRadius: scrolled ? 999 : 0,
            // 1760 is `.container-wide`'s ceiling: at rest the bar has to
            // sit on exactly the same measure as the page under it.
            maxWidth: scrolled ? 1600 : 1760,
            paddingLeft: scrolled ? pillGutter : restingGutter,
            paddingRight: scrolled ? pillGutter : restingGutter,
          }}
          transition={spring}
          className={cn(
            // Colour, shadow and blur stay on CSS transitions: they are paint,
            // they are cheap, and they do not need physics. Only the
            // dimensions ride the spring.
            "relative mx-auto flex w-full items-center justify-between gap-4 border",
            "transition-[background-color,border-color,box-shadow] duration-500 ease-out motion-reduce:transition-none",
            scrolled && "elev-lg",
            onDark
              ? "border-transparent bg-transparent"
              : scrolled
                ? "border-border bg-background/85 backdrop-blur-xl"
                : "border-transparent bg-background/95 backdrop-blur-sm",
          )}
        >
          <div className="flex items-center gap-10">
            <Logo size="md" onDark={onDark} />

            <nav aria-label="Main" className="hidden lg:block">
              <ul className="flex items-center gap-1">
                {MARKETING_NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      className={cn(
                        "rounded-md px-3 py-2 text-[13px] font-medium tracking-wide transition-colors focus-brand",
                        onDark
                          ? isActive(item.href)
                            ? "text-white"
                            : "text-white/60 hover:text-white"
                          : isActive(item.href)
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
                "hidden items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition-colors focus-brand xl:inline-flex",
                onDark
                  ? "text-white/60 hover:text-white"
                  : "text-muted-foreground hover:text-foreground",
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
                  className={cn(
                    "hidden sm:inline-flex",
                    onDark &&
                      "border-white/30 bg-white/5 text-white hover:border-white/50 hover:bg-white/10 hover:text-white dark:border-white/30 dark:bg-white/5",
                  )}
                >
                  <Link href="/dashboard">My dashboard</Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className={cn(
                    "hidden sm:inline-flex",
                    onDark &&
                      "border-white/30 bg-white/5 text-white hover:border-white/50 hover:bg-white/10 hover:text-white dark:border-white/30 dark:bg-white/5",
                  )}
                >
                  <Link href="/sign-out">Sign out</Link>
                </Button>
                <Button
                  asChild
                  size="icon"
                  variant="ghost"
                  aria-label="Your account"
                  className={cn(
                    onDark &&
                      "text-white/80 hover:bg-white/10 hover:text-white dark:hover:bg-white/10",
                  )}
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
                  className={cn(
                    "hidden sm:inline-flex",
                    onDark &&
                      "text-white/70 hover:bg-white/10 hover:text-white dark:hover:bg-white/10",
                  )}
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
                  className={cn(
                    "lg:hidden",
                    onDark &&
                      "text-white hover:bg-white/10 hover:text-white dark:hover:bg-white/10",
                  )}
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
        </motion.div>
      </motion.header>
    </>
  );
}
