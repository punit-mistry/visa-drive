"use client";

import { cn } from "@/lib/utils";

/**
 * The loading state, as a visa stamp being pressed.
 *
 * A bare spinner says "something is happening"; this says *what*. The motif is
 * the same circular stamp the destination cards carry, so the wait belongs to
 * the same product as the page it resolves into.
 *
 * Three layers, one idea:
 *   - a dashed ring that rotates, like a stamp being lined up
 *   - the stamp face, which pulses as though pressed
 *   - a passport-page rule underneath that fills left to right
 *
 * Every animation is CSS, so this costs nothing to mount and works inside a
 * server-rendered `loading.tsx` with no JavaScript at all. Under
 * `prefers-reduced-motion` the movement drops to a single slow pulse — the
 * component still reads as "working", which is the only thing it has to do.
 */

export function VisaLoader({
  label = "Preparing your workspace",
  hint,
  className,
  fullscreen = false,
  tone = "default",
  compact = false,
}: {
  label?: string;
  hint?: string;
  className?: string;
  /** Fills the viewport, for a route-level `loading.tsx`. */
  fullscreen?: boolean;
  /** "dark" for the placements that sit on the ink hero, where the semantic
   *  text tokens would be ink-on-ink. */
  tone?: "default" | "dark";
  /** Half scale, for an inline wait inside a row rather than a whole page. */
  compact?: boolean;
}) {
  const dark = tone === "dark";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-3" : "gap-5",
        // `fullscreen` is for the cases that replace the entire shell —
        // before the header exists — so it really is the whole window. A
        // loader that sits *inside* a shell must not use it: it would push
        // the content past the fold and leave a gap under the footer.
        fullscreen ? "min-h-screen px-4" : compact ? "py-4" : "py-16",
        className,
      )}
    >
      <span className={cn("relative flex items-center justify-center", compact ? "size-14" : "size-24")}>
        {/* The alignment ring. */}
        <span
          aria-hidden
          className="vd-stamp-ring absolute inset-0 rounded-full border-2 border-dashed border-brand/30"
        />

        {/* The stamp face. */}
        <span
          aria-hidden
          className={cn(
            "vd-stamp-press flex -rotate-6 flex-col items-center justify-center rounded-full border-2 border-brand/60 text-brand",
            compact ? "size-10" : "size-16",
          )}
        >
          <span className="font-mono text-[7px] font-bold uppercase tracking-[0.14em] opacity-70">
            Visa
          </span>
          <span className="font-mono text-[13px] font-bold leading-none tracking-[0.04em]">
            VD
          </span>
          <span className="font-mono text-[6px] uppercase tracking-[0.16em] opacity-60">
            VisaDrive
          </span>
        </span>
      </span>

      <div className="space-y-2">
        <p
          className={cn(
            "text-sm font-medium",
            dark ? "text-white/85" : "text-foreground",
          )}
        >
          {label}
        </p>
        {hint && (
          <p
            className={cn(
              "max-w-xs text-xs",
              dark ? "text-white/50" : "text-muted-foreground",
            )}
          >
            {hint}
          </p>
        )}
      </div>

      {/* The passport-page rule. */}
      <span
        aria-hidden
        className={cn(
          "relative h-px w-40 max-w-full overflow-hidden rounded-full",
          dark ? "bg-white/20" : "bg-border",
        )}
      >
        <span className="vd-stamp-sweep absolute inset-y-0 left-0 w-1/3 rounded-full bg-brand" />
      </span>

      <span className="sr-only">Loading</span>
    </div>
  );
}
