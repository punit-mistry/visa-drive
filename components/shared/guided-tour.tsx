"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Tour, TourStep } from "@/lib/constants/tours";
import { cn } from "@/lib/utils";

/**
 * The guided tour runner.
 *
 * It spotlights elements that are already on the page — anchored by
 * `data-tour="…"` — rather than describing the UI in a separate document that
 * drifts out of date the first time a nav item moves.
 *
 * Two things make it survive contact with a role-based product:
 *
 * 1. **A step whose anchor is missing is skipped, not shown broken.** The CRM
 *    hides nav items a role cannot use, so one staff tour serves all six roles
 *    without a per-role script.
 * 2. **Nothing is measured until the element exists.** Anchors are re-measured
 *    on scroll and resize, so a sticky header or a late-loading sidebar cannot
 *    leave the cut-out stranded somewhere the element no longer is.
 */

const PADDING = 8;
const CARD_WIDTH = 340;
const GAP = 14;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * The *visible* element for an anchor.
 *
 * Both shells render their navigation twice — a phone strip and a desktop rail
 * — and only one of them is ever laid out. `querySelector` would hand back
 * whichever comes first in the DOM, so on a laptop the tour would measure the
 * hidden phone nav, get a zero rect, and silently drop a step that is plainly
 * on screen. Picking the first anchor with a real box fixes that for every
 * responsive duplicate, not just these two.
 */
function anchorElement(anchor?: string): Element | null {
  if (!anchor) return null;
  const candidates = document.querySelectorAll(`[data-tour="${CSS.escape(anchor)}"]`);
  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) return candidate;
  }
  return null;
}

function measure(anchor?: string): Rect | null {
  const element = anchorElement(anchor);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  };
}

/** Where the card sits relative to the cut-out, clamped into the viewport. */
function placeCard(
  rect: Rect | null,
  placement: TourStep["placement"],
): { top: number; left: number; centred: boolean } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_WIDTH, vw - 32);

  if (!rect) {
    return { top: Math.max(24, vh / 2 - 140), left: (vw - width) / 2, centred: true };
  }

  // Estimated, not measured: the card renders after this runs, and being a
  // little conservative about its height is cheaper than a second paint.
  const height = 210;
  const below = vh - (rect.top + rect.height);
  const right = vw - (rect.left + rect.width);

  let top: number;
  let left: number;

  // On a narrow screen the side placements never fit; fall back to stacking.
  const canSide = vw >= 768;
  const side =
    canSide && (placement === "left" || placement === "right")
      ? placement === "right" && right > width + GAP
        ? "right"
        : rect.left > width + GAP
          ? "left"
          : null
      : null;

  if (side === "right") {
    left = rect.left + rect.width + GAP;
    top = rect.top;
  } else if (side === "left") {
    left = rect.left - width - GAP;
    top = rect.top;
  } else if (placement === "top" ? rect.top > height + GAP : below > height + GAP) {
    left = rect.left;
    top = placement === "top" ? rect.top - height - GAP : rect.top + rect.height + GAP;
  } else {
    // Neither side of the anchor has room — sit wherever there is more of it.
    left = rect.left;
    top = below > rect.top ? rect.top + rect.height + GAP : rect.top - height - GAP;
  }

  return {
    top: Math.min(Math.max(16, top), Math.max(16, vh - height - 16)),
    left: Math.min(Math.max(16, left), Math.max(16, vw - width - 16)),
    centred: false,
  };
}

/**
 * Mounting the runner only while the tour is open is what keeps its state
 * honest: the visible steps and the step index are decided once, at mount,
 * instead of being reset by an effect every time `open` flips.
 */
export function GuidedTour({
  tour,
  open,
  onFinish,
}: {
  tour: Tour;
  open: boolean;
  /** Called on finish, skip, Escape or a backdrop click — all mean "done". */
  onFinish: () => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return <TourRunner tour={tour} onFinish={onFinish} />;
}

function TourRunner({ tour, onFinish }: { tour: Tour; onFinish: () => void }) {
  // Only the steps whose anchor is actually on this page. Resolved at mount so
  // the step count in the footer cannot change under the reader mid-tour.
  const [steps] = useState<TourStep[]>(() =>
    tour.steps.filter((step) => !step.anchor || measure(step.anchor)),
  );
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const step = steps[index];

  const sync = useCallback(() => {
    setRect(measure(steps[index]?.anchor));
  }, [steps, index]);

  useEffect(() => {
    if (!step) return;

    anchorElement(step.anchor)?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    // Measured on the next frame rather than inline: the scroll above has to
    // land first, or the cut-out is drawn where the element used to be.
    const frame = requestAnimationFrame(sync);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [step, sync]);

  // The card takes focus so the arrow keys and Escape reach it, and so a
  // screen reader announces the step instead of leaving focus behind the veil.
  useEffect(() => {
    if (step) cardRef.current?.focus();
  }, [step, index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onFinish();
      } else if (event.key === "ArrowRight") {
        setIndex((i) => (i + 1 < steps.length ? i + 1 : i));
      } else if (event.key === "ArrowLeft") {
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [steps.length, onFinish]);

  // The page behind must not scroll away from the thing being pointed at.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!step) return null;

  const card = placeCard(rect, step.placement);
  const isLast = index === steps.length - 1;

  return createPortal(
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label={tour.label}
    >
      {/* One SVG mask rather than four positioned divs: the cut-out keeps its
          rounded corners and stays exact at any zoom level. */}
      <svg className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <mask id={`tour-mask-${tour.id}`}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left}
                y={rect.top}
                width={rect.width}
                height={rect.height}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="oklch(0% 0 0 / 0.55)"
          mask={`url(#tour-mask-${tour.id})`}
          onClick={onFinish}
        />
      </svg>

      {rect && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-brand ring-offset-0 transition-all duration-200"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        className={cn(
          "animate-fade-up absolute rounded-xl border border-border bg-card p-5 elev-xl outline-none",
          card.centred && "text-center",
        )}
        style={{
          top: card.top,
          left: card.left,
          width: Math.min(CARD_WIDTH, window.innerWidth - 32),
        }}
      >
        <button
          type="button"
          onClick={onFinish}
          aria-label="Close the tour"
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-brand"
        >
          <X className="size-4" aria-hidden />
        </button>

        <p className="text-eyebrow text-brand">
          Step {index + 1} of {steps.length}
        </p>
        <h2 className="mt-1.5 pr-6 text-base font-semibold tracking-tight text-balance">
          {step.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

        <div
          className={cn(
            "mt-5 flex items-center gap-2",
            card.centred ? "justify-center" : "justify-between",
          )}
        >
          <div className="flex gap-1" aria-hidden>
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-brand" : "w-1.5 bg-border",
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {index > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
              >
                <ArrowLeft className="size-4" aria-hidden />
                Back
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={onFinish}>
                <Check className="size-4" aria-hidden />
                Got it
              </Button>
            ) : (
              <Button size="sm" onClick={() => setIndex((i) => i + 1)}>
                Next
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        </div>

        {!isLast && (
          <button
            type="button"
            onClick={onFinish}
            className="mt-3 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-brand"
          >
            Skip the tour
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
