"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Show, UserButton } from "@clerk/nextjs";
import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import { Logo } from "@/components/shared/logo";
import { HelpAssistant } from "@/components/shared/help-assistant";
import { VisaLoader } from "@/components/shared/visa-loader";
import { AccountBlockedState, AccountSetupState } from "@/components/shared/account-state";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/lib/constants/roles";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3, permission: PERMISSIONS.ANALYTICS_VIEW },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/applications", label: "Applications", icon: FileText, permission: PERMISSIONS.APPLICATION_VIEW_ALL },
      { href: "/admin/enquiries", label: "Enquiries", icon: ClipboardList, permission: PERMISSIONS.ENQUIRY_VIEW },
      // Conversations is hidden from the menu for now, at the client's
      // request. Nothing else is switched off: the route, its permission
      // (CONVERSATION_VIEW_ALL) and the notification deep links into
      // /admin/conversations/<id> all still work, so an email or in-app
      // notification about a customer message still opens the thread. Put
      // the line back — and the MessageSquare import with it — to restore
      // the menu entry.
      // { href: "/admin/conversations", label: "Conversations", icon: MessageSquare, permission: PERMISSIONS.CONVERSATION_VIEW_ALL },
      { href: "/admin/payments", label: "Payments", icon: CreditCard, permission: PERMISSIONS.PAYMENT_VIEW },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/customers", label: "Customers", icon: Users, permission: PERMISSIONS.CUSTOMER_VIEW },
      { href: "/admin/partners", label: "B2B Partners", icon: Building2, permission: PERMISSIONS.PARTNER_VIEW },
      { href: "/admin/staff", label: "Staff", icon: ShieldCheck, permission: PERMISSIONS.STAFF_VIEW },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/catalogue", label: "Catalogue", icon: BookOpen, permission: PERMISSIONS.CATALOGUE_VIEW },
      { href: "/admin/settings", label: "Settings", icon: Settings, permission: PERMISSIONS.SETTINGS_VIEW },
      { href: "/admin/audit", label: "Audit log", icon: ClipboardList, permission: PERMISSIONS.AUDIT_LOG_VIEW },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading, isStaff, isSuspended, canAny, profileIssue } =
    useCurrentUser();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navGroupsWithItems = NAV_GROUPS.map((group) => {
    const visibleItems = group.items.filter((item) => {
      if (!item.permission) return true;
      return canAny(item.permission);
    });
    return { ...group, items: visibleItems };
  }).filter((group) => group.items.length > 0);

  if (isLoading) {
    return (
      <VisaLoader
        fullscreen
        label="Checking your access"
        hint="Matching your account to its role and permissions."
      />
    );
  }

  return (
    <>
      <Show when="signed-out">
        <div className="container-page flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in required</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Sign in with a VisaDrive staff account to access the admin CRM.
          </p>
          <div className="mt-6 flex gap-2">
            <Button asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Back to site</Link>
            </Button>
          </div>
        </div>
      </Show>

      <Show when="signed-in">
        {isSuspended ? (
          <AccountBlockedState reason="suspended" />
        ) : !user ? (
          profileIssue === "deleted" ? (
            <AccountBlockedState reason="deleted" />
          ) : (
            <AccountSetupState stalled={profileIssue !== null} />
          )
        ) : !isStaff ? (
          <div className="container-page flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Not authorised</h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              This area is restricted to VisaDrive staff. If you think you should
              have access, contact your administrator.
            </p>
            <Button asChild className="mt-6">
              <Link href="/dashboard">Go to your portal</Link>
            </Button>
          </div>
        ) : (
          <div className="min-h-screen bg-surface">
            {/* Mobile header */}
            <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
              <div className="flex items-center gap-3">
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Open admin menu"
                    >
                      <Menu className="size-5" aria-hidden />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[min(18rem,88vw)] gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
                    <SheetHeader className="border-b border-sidebar-border">
                      <SheetTitle asChild>
                        <span className="flex items-center justify-between">
                          <Logo size="md" asLink={false} />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-sidebar-foreground hover:bg-sidebar-accent"
                            onClick={() => setMobileOpen(false)}
                            aria-label="Close menu"
                          >
                            <X className="size-4" aria-hidden />
                          </Button>
                        </span>
                      </SheetTitle>
                      <SheetDescription className="sr-only">
                        Admin navigation
                      </SheetDescription>
                    </SheetHeader>
                    <nav aria-label="Admin" className="flex-1 overflow-y-auto p-4">
                      <AdminNav
                        groups={navGroupsWithItems}
                        pathname={pathname}
                        onNavigate={() => setMobileOpen(false)}
                        dark
                      />
                    </nav>
                    <div className="border-t border-sidebar-border p-4 text-xs text-sidebar-foreground/70">
                      Signed in as {user?.fullName ?? "Staff"}
                    </div>
                  </SheetContent>
                </Sheet>
                <Logo size="md" href="/admin" />
              </div>
              <UserButton
                appearance={{ elements: { avatarBox: "size-8" } }}
                userProfileUrl="/dashboard/profile"
              />
            </header>

            <div className="flex min-h-screen">
              {/* Desktop sidebar */}
              <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
                <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
                  <Logo size="md" href="/admin" />
                  <span className="rounded-full bg-sidebar-accent px-2 py-0.5 text-[11px] font-medium text-sidebar-foreground">
                    Admin
                  </span>
                </div>
                <nav data-tour="admin-nav" className="scrollbar-thin min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
                  <AdminNav groups={navGroupsWithItems} pathname={pathname} dark />
                </nav>
                <div className="shrink-0 border-t border-sidebar-border p-4">
                  <div className="flex items-center gap-3">
                    <UserButton
                      appearance={{ elements: { avatarBox: "size-8" } }}
                      userProfileUrl="/dashboard/profile"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-sidebar-foreground">
                        {user?.fullName ?? "Staff"}
                      </p>
                      <p className="truncate text-xs capitalize text-sidebar-foreground/60">
                        {(user?.role ?? "").replace("_", " ")}
                      </p>
                    </div>
                  </div>
                </div>
              </aside>

              <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-20 hidden h-16 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur lg:flex">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      VisaDrive CRM
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {navGroupsWithItems
                        .flatMap((g) => g.items)
                        .find((i) => isActive(pathname, i.href))?.label ?? "Dashboard"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/">View site</Link>
                    </Button>
                  </div>
                </header>
                <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
              </div>
            </div>

            <HelpAssistant surface="staff" />
          </div>
        )}
      </Show>
    </>
  );
}

type NavItem = (typeof NAV_GROUPS)[number]["items"][number];
type AdminNavGroup = { label: string; items: NavItem[] };

function AdminNav({
  groups,
  pathname,
  onNavigate,
  dark = false,
}: {
  groups: AdminNavGroup[];
  pathname: string;
  onNavigate?: () => void;
  dark?: boolean;
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.label}>
          <p
            className={cn(
              "mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
              dark ? "text-sidebar-foreground/50" : "text-muted-foreground/80",
            )}
          >
            {group.label}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-tour={`admin-nav-${item.href.split("/").pop()}`}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-brand",
                    dark
                      ? active
                        ? "bg-sidebar-accent text-sidebar-foreground"
                        : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                      : active
                        ? "bg-brand-tint text-brand-deep"
                        : "text-muted-foreground hover:bg-surface hover:text-foreground",
                    active && "ring-1 ring-sidebar-border",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 transition-colors",
                      dark
                        ? active
                          ? "text-sidebar-primary"
                          : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                        : active
                          ? "text-brand"
                          : "text-muted-foreground group-hover:text-foreground",
                    )}
                    aria-hidden
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
