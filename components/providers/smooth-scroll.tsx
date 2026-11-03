"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

/**
 * Smooth scrolling for the marketing site.
 *
 * Deliberately scoped to `app/(marketing)` rather than the whole app. Eased
 * scrolling suits a page you read; it fights a page you work in, where the
 * portal's wizard and the CRM's long tables need the scroll position to land
 * exactly where the browser put it.
 *
 * Three things it has to get right, all of which a naive setup breaks:
 *
 *  - **Reduced motion.** Lenis is never constructed at all in that case, so
 *    native scrolling is untouched rather than wrapped in a shorter easing.
 *  - **In-page anchors.** Lenis takes over the scroll position, so the
 *    browser's own `#hash` jump would be overridden the moment the next frame
 *    runs. Anchor clicks are intercepted and handed to Lenis instead.
 *  - **Route changes.** Lenis keeps its own scroll value, so a new page would
 *    otherwise open part-way down wherever the previous one was left.
 */
export function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      // Slightly longer than the default so the page feels weighted rather
      // than slippery, with an easing that decelerates hard at the end.
      duration: 1.05,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      // Touch devices already have excellent native inertia; overriding it
      // makes a phone feel laggy and breaks pull-to-refresh.
      smoothWheel: true,
      syncTouch: false,
    });

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    // Hand same-page anchor clicks to Lenis, or they fight each other.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.(
        'a[href^="#"]',
      ) as HTMLAnchorElement | null;
      if (!anchor) return;

      const hash = anchor.getAttribute("href");
      if (!hash || hash === "#") return;

      const target = document.querySelector(hash);
      if (!target) return;

      event.preventDefault();
      // The header is fixed over the top of the page, so an anchor that lands
      // flush with the viewport top lands underneath it.
      lenis.scrollTo(target as HTMLElement, { offset: -88 });
      history.pushState(null, "", hash);
    };

    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  // A new route starts at the top, the way a browser navigation does.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
