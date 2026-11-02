import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * KPI tile used on both dashboards.
 *
 * `delta` is a percentage change against the previous equivalent period. It is
 * only rendered when the backend actually supplied one — a missing delta shows
 * nothing rather than a fake 0%.
 *
 * `invertDelta` flips the colour semantics for metrics where "up" is bad
 * (rejected applications, pending payments).
 */
export function StatCard({
  label,
  value,
  delta,
  deltaLabel = "vs last period",
  icon: Icon,
  href,
  invertDelta = false,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  deltaLabel?: string;
  icon?: LucideIcon;
  href?: string;
  invertDelta?: boolean;
  hint?: string;
  className?: string;
}) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const isFlat = hasDelta && Math.abs(delta!) < 0.05;
  const isUp = hasDelta && delta! > 0;
  const isGood = invertDelta ? !isUp : isUp;

  const DeltaIcon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;

  const body = (
    <div
      className={cn(
        "group relative rounded-xl border border-border bg-card p-5 transition-shadow",
        href && "hover:elev-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && (
          <Icon
            className="size-4 shrink-0 text-muted-foreground/60"
            aria-hidden
          />
        )}
      </div>

      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>

      {hasDelta ? (
        <p className="mt-2 flex items-center gap-1 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              isFlat
                ? "text-muted-foreground"
                : isGood
                  ? "text-success"
                  : "text-brand",
            )}
          >
            <DeltaIcon className="size-3" aria-hidden />
            {isFlat ? "No change" : `${Math.abs(delta!).toFixed(1)}%`}
          </span>
          <span className="text-muted-foreground">{deltaLabel}</span>
        </p>
      ) : hint ? (
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );

  if (!href) return body;

  return (
    <Link href={href} className="block rounded-xl focus-brand">
      {body}
    </Link>
  );
}

/** Responsive grid wrapper so KPI rows line up the same way everywhere. */
export function StatGrid({
  children,
  columns = 4,
  className,
}: {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
