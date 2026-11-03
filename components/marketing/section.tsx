import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Reveal } from "@/components/marketing/reveal";

/**
 * Vertical rhythm for the marketing surface. Every section on the site uses
 * the same three spacing steps so the page reads as one document rather than
 * a stack of unrelated blocks.
 */
/** The four grounds the marketing site alternates between. */
export type SectionTone = "default" | "surface" | "paper" | "dark";

const TONE_CLASS: Record<SectionTone, string> = {
  default: "bg-background",
  surface: "bg-surface",
  paper: "bg-paper",
  dark: "bg-charcoal text-paper",
};

export function Section({
  children,
  className,
  tone = "default",
  size = "md",
  width = "page",
  id,
}: {
  children: ReactNode;
  className?: string;
  tone?: SectionTone;
  size?: "sm" | "md" | "lg";
  /** Editorial sections run to the viewport; reading sections keep a measure. */
  width?: "page" | "wide";
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        TONE_CLASS[tone],
        size === "sm" && "py-14 sm:py-16",
        size === "md" && "py-16 sm:py-20 lg:py-24",
        size === "lg" && "py-20 sm:py-24 lg:py-32",
        className,
      )}
    >
      <div className={width === "wide" ? "container-wide" : "container-page"}>
        {children}
      </div>
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
  tone = "light",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
  action?: ReactNode;
  /** Pass "dark" inside a Section with tone="dark". */
  tone?: "light" | "dark";
}) {
  const onDark = tone === "dark";
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
        {eyebrow && (
          <p className={onDark ? "text-eyebrow-dark" : "text-eyebrow"}>
            {eyebrow}
          </p>
        )}
        {/* The display serif carries every marketing section heading, so the
            secondary pages belong to the same publication as the homepage
            rather than reading as the old template underneath a new cover. */}
        <h2
          className={cn(
            "display-lg",
            onDark ? "text-paper" : "text-ink-black",
            eyebrow && "mt-3",
          )}
        >
          {title}
        </h2>
        {description && (
          <p
            className={cn(
              "mt-4 text-base leading-relaxed sm:text-lg",
              onDark ? "text-white/55" : "text-muted-foreground",
            )}
          >
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
