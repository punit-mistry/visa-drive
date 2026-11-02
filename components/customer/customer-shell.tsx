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
  User,
} from "lucide-react";

import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/applications", label: "Applications", icon: FileText },
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/profile", label: "Profile", icon: User },
];

export function CustomerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === href;
    }
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
        <div className="border-b border-border bg-background">
          <div className="container-page flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-6">
              <Logo size="md" href="/" />
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-foreground">My Portal</p>
                <p className="text-xs text-muted-foreground">
                  Track applications, upload documents, and manage payments
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild size="sm">
                <Link href="/apply">
                  <PlusCircle className="size-4" aria-hidden />
                  New application
                </Link>
              </Button>
              <UserButton
                appearance={{ elements: { avatarBox: "size-8" } }}
                userProfileUrl="/dashboard/profile"
              />
            </div>
          </div>
        </div>
        <div className="container-page grid gap-6 py-6 lg:grid-cols-[240px_1fr]">
          <aside className="space-y-1">
            <nav aria-label="Customer portal">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors focus-brand",
                      active
                        ? "bg-surface text-foreground"
                        : "text-muted-foreground hover:bg-surface hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
          <main className="min-w-0">{children}</main>
        </div>
      </Show>
    </>
  );
}
