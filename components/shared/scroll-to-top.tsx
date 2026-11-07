"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

import { scrollPageToTop } from "@/components/providers/smooth-scroll";
import { cn } from "@/lib/utils";

/**
 * Back to top.
 *
 * The marketing pages are long by design — the homepage is a dozen screens on
 * a phone, and most of VisaDrive's visitors are on one. Getting back to the
 * navigation should not be a thumb exercise.
 *
 * It stays out of the way until it has a reason to exist: nothing is rendered
 * until the visitor is more than a screen and a half down, which is also the
 * point past which the header has scrolled away. It sits above the WhatsApp
 * button rather than beside it, so the two never fight for the same corner.
 *
 * The scroll itself goes through `scrollPageToTop`, not `window.scrollTo`,
 * because Lenis owns the scroll position on these pages and would undo a
 * direct call on the next frame.
 */

/** How far down before it is worth offering. */
const THRESHOLD = 1.5;

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      setVisible(window.scrollY > window.innerHeight * THRESHOLD);
    };

    const onScroll = () => {
      // One read per frame. A scroll listener that measures on every event is
      // the classic way to make a smooth-scrolled page stutter.
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => scrollPageToTop()}
      aria-label="Back to top"
      // Hidden from everything, not just from view: an invisible control that
      // a screen reader still reaches, or that a tab key still lands on, is
      // worse than no control.
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={cn(
        "fixed bottom-[5.5rem] right-5 z-40 flex size-11 items-center justify-center rounded-full",
        "border border-border bg-card/90 text-foreground backdrop-blur-sm elev-md",
        "transition-all duration-300 hover:border-border-strong hover:bg-card focus-brand print:hidden",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <ArrowUp className="size-5" aria-hidden />
    </button>
  );
}
