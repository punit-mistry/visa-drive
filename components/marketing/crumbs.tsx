import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Breadcrumbs for the public catalogue routes. `Home` is always the first
 * item, so callers only pass what sits below it.
 */
export function Crumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  const all: Crumb[] = [{ label: "Home", href: "/" }, ...items];

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {all.map((crumb, index) => {
          const isLast = index === all.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="rounded-sm transition-colors hover:text-foreground focus-brand"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={cn(isLast && "font-medium text-foreground")}
                  aria-current={isLast ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              )}
              {!isLast && (
                <ChevronRight
                  className="size-3.5 text-muted-foreground/60"
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
