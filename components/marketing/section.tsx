import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Reveal } from "@/components/marketing/reveal";

/**
 * Vertical rhythm for the marketing surface. Every section on the site uses
 * the same three spacing steps so the page reads as one document rather than
 * a stack of unrelated blocks.
 */
export function Section({
  children,
  className,
  tone = "default",
  size = "md",
  id,
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "surface";
  size?: "sm" | "md" | "lg";
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        tone === "surface" ? "bg-surface" : "bg-background",
        size === "sm" && "py-14 sm:py-16",
        size === "md" && "py-16 sm:py-20 lg:py-24",
        size === "lg" && "py-20 sm:py-24 lg:py-32",
        className,
      )}
    >
      <div className="container-page">{children}</div>
    </section>
  );
}

export function SectionIntro({
  eyebrow,
  title,
  description,
  align = "left",
  className,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
  action?: ReactNode;
}) {
  return (
    <Reveal
      as="header"
      className={cn(
        "flex flex-col gap-4",
        align === "center"
          ? "mx-auto max-w-2xl text-center"
          : "sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow && <p className="text-eyebrow">{eyebrow}</p>}
        <h2 className={cn("text-3xl sm:text-4xl", eyebrow && "mt-3")}>{title}</h2>
        {description && (
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </Reveal>
  );
}

/** A hairline rule used to separate editorial blocks inside a section. */
export function HairlineGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-2xl border border-border bg-border",
        className,
      )}
    >
      {children}
    </div>
  );
}
