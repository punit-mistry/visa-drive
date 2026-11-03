"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Show, UserButton } from "@clerk/nextjs";
import { Menu, Phone } from "lucide-react";

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
import { useSiteSettings } from "@/hooks/use-site-settings";
import { MARKETING_NAV } from "@/lib/constants/site";
import { phoneDigits } from "@/lib/helpers/format";
import { cn } from "@/lib/utils";

/**
 * Marketing header.
 *
 * On the homepage it starts transparent and sits inside the cinematic hero,
 * then resolves into a blurred dark bar once the page has moved — so the
 * photograph owns the first screen and the chrome only asserts itself when it
 * starts overlapping content. Every other route has no dark hero to sit in,
 * so the bar is solid from the first paint rather than flashing white type
 * onto a white page.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const settings = useSiteSettings();
  const [scrolled, setScrolled] = useState(false);
  const [drawer, setDrawer] = useState<{ pathname: string; open: boolean } | null>(
    null,
  );

  const hasCinematicHero = pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /** True while the bar is floating over the hero photograph. */
  const onDark = hasCinematicHero && !scrolled;

  // A drawer left open across a navigation traps the visitor on the new page.
  // Keying the open flag to the pathname closes it automatically on navigation
  // without an effect that sets state after every route change.
  const mobileOpen = drawer?.pathname === pathname && drawer.open;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={cn(
        "top-0 z-50 w-full transition-[background-color,border-color,backdrop-filter] duration-500",
        // Fixed only where there is a dark hero to float over. Everywhere
        // else it is sticky, so it occupies flow and no page has to
        // compensate with a magic top padding.
        hasCinematicHero ? "fixed" : "sticky",
        onDark
          ? "border-b border-transparent bg-transparent"
          : hasCinematicHero
            ? "border-b border-white/10 bg-ink-black/80 backdrop-blur-md"
            : "border-b border-border bg-background/95 backdrop-blur-sm",
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:elev-md"
      >
        Skip to content
      </a>

      <div className="container-wide flex h-20 items-center justify-between gap-4">
        <div className="flex items-center gap-10">
          <Logo size="md" onDark={hasCinematicHero} />

          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {MARKETING_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={cn(
                      "rounded-md px-3 py-2 text-[13px] font-medium tracking-wide transition-colors focus-brand",
                      hasCinematicHero
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
              hasCinematicHero
                ? "text-white/60 hover:text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Phone className="size-4" aria-hidden />
            {settings.phoneDisplay}
          </a>

          <Show when="signed-out">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className={cn(
                "hidden sm:inline-flex",
                hasCinematicHero &&
                  "text-white/70 hover:bg-white/10 hover:text-white dark:hover:bg-white/10",
              )}
            >
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm" className="font-semibold">
              <Link href="/destinations">Start your journey</Link>
            </Button>
          </Show>

          <Show when="signed-in">
            <Button
              asChild
              size="sm"
              variant="outline"
              className={cn(
                "hidden sm:inline-flex",
                hasCinematicHero &&
                  "border-white/30 bg-white/5 text-white hover:border-white/50 hover:bg-white/10 hover:text-white dark:border-white/30 dark:bg-white/5",
              )}
            >
              <Link href="/dashboard">My dashboard</Link>
            </Button>
            <UserButton
              appearance={{ elements: { avatarBox: "size-8" } }}
              userProfileUrl="/dashboard/profile"
            />
          </Show>

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
                  hasCinematicHero &&
                    "text-white hover:bg-white/10 hover:text-white dark:hover:bg-white/10",
                )}
                aria-label="Open menu"
              >
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(22rem,88vw)] gap-0 p-0">
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

              <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-4 py-2">
                <ul className="flex flex-col">
                  {MARKETING_NAV.map((item) => (
                    <li key={item.href}>
                      <SheetClose asChild>
                        <Link
                          href={item.href}
                          aria-current={isActive(item.href) ? "page" : undefined}
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
                <Show when="signed-out">
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
                </Show>

                <Show when="signed-in">
                  <SheetClose asChild>
                    <Button asChild className="w-full">
                      <Link href="/dashboard">My dashboard</Link>
                    </Button>
                  </SheetClose>
                </Show>

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
  );
}
