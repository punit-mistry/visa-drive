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
 * Slim, white, sticky. The bottom hairline only appears once the page has
 * moved, so the header sits flush against the hero on load and gains a
 * boundary exactly when it starts overlapping content.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const settings = useSiteSettings();
  const [scrolled, setScrolled] = useState(false);
  const [drawer, setDrawer] = useState<{ pathname: string; open: boolean } | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
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
    <header
      className={cn(
        "sticky top-0 z-50 w-full bg-background/95 backdrop-blur-sm transition-shadow duration-200",
        scrolled ? "border-b border-border" : "border-b border-transparent",
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:elev-md"
      >
        Skip to content
      </a>

      <div className="container-page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Logo size="md" />

          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {MARKETING_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm font-medium transition-colors focus-brand",
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
            className="hidden items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-brand xl:inline-flex"
          >
            <Phone className="size-4" aria-hidden />
            {settings.phoneDisplay}
          </a>

          <Show when="signed-out">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/destinations">Start application</Link>
            </Button>
          </Show>

          <Show when="signed-in">
            <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
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
                className="lg:hidden"
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
                      <Link href="/destinations">Start application</Link>
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
