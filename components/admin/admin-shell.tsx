"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Show, UserButton } from "@clerk/nextjs";
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Logo } from "@/components/shared/logo";
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
      { href: "/admin/conversations", label: "Conversations", icon: MessageSquare, permission: PERMISSIONS.CONVERSATION_VIEW_ALL },
      { href: "/admin/payments", label: "Payments", icon: CreditCard, permission: PERMISSIONS.PAYMENT_VIEW },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/customers", label: "Customers", icon: Users, permission: PERMISSIONS.CUSTOMER_VIEW },
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
  const { user, isLoading, isStaff, canAny } = useCurrentUser();
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
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <p className="text-sm text-muted-foreground">Checking access...</p>
      </div>
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
        {!isStaff ? (
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
            <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
              <div className="flex h-16 items-center gap-4 px-4 lg:px-6">
                <div className="flex items-center gap-3">
                  <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                    <SheetTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden"
                        aria-label="Open admin menu"
                      >
                        <Menu className="size-5" aria-hidden />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[min(18rem,88vw)] gap-0 p-0">
                      <SheetHeader className="border-b border-border">
                        <SheetTitle asChild>
                          <span>
                            <Logo size="md" asLink={false} />
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
                        />
                      </nav>
                    </SheetContent>
                  </Sheet>
                  <Logo size="md" href="/admin" />
                  <span className="hidden rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-medium text-brand-deep sm:inline">
                    Admin CRM
                  </span>
                </div>
                <div className="flex flex-1 items-center justify-end gap-3">
                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-medium">{user?.fullName ?? "Staff"}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {(user?.role ?? "").replace("_", " ")}
                    </p>
                  </div>
                  <UserButton
                    appearance={{ elements: { avatarBox: "size-8" } }}
                    userProfileUrl="/dashboard/profile"
                  />
                </div>
              </div>
            </header>
            <div className="flex">
              <aside className="hidden w-64 shrink-0 border-r border-border bg-background lg:flex lg:flex-col">
                <nav className="flex-1 space-y-6 overflow-y-auto p-4">
                  <AdminNav groups={navGroupsWithItems} pathname={pathname} />
                </nav>
              </aside>
              <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
            </div>
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
}: {
  groups: AdminNavGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors focus-brand",
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
          </div>
        </div>
      ))}
    </>
  );
}
