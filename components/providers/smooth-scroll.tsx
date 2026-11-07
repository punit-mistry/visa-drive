"use client";

import { useEffect, useRef } from "react";
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
 *    otherwise open part-way down wherever the previous one was left. Note
 *    that a bare `window.scrollTo(0, 0)` does not fix this: Lenis restores
 *    its own `animatedScroll` on the next frame and the page slides straight
 *    back down. The reset has to go through Lenis itself.
 */

/**
 * The live Lenis instance, for the rest of the app.
 *
 * Anything that wants to move the page — the back-to-top button, a future
 * "jump to section" — has to ask Lenis rather than the window, for the reason
 * above. Module scope rather than context because there is exactly one of
 * these and the consumers are not always inside this provider's tree.
 */
let instance: Lenis | null = null;

/**
 * Send the page back to the top.
 *
 * `immediate` skips the easing, which is what a route change wants: the new
 * page should already be at the top when it appears, not travel there.
 */
export function scrollPageToTop({ immediate = false } = {}) {
  if (instance) {
    instance.scrollTo(0, { immediate });
    return;
  }
  // Reduced motion, or the provider has not mounted: the browser's own
  // scrolling is in charge and is perfectly good at this.
  window.scrollTo({ top: 0, behavior: immediate ? "auto" : "smooth" });
}
export function SmoothScroll() {
  const pathname = usePathname();
  // The first route change fires its effect on mount, before anyone has
  // scrolled. Resetting then would fight a browser restoring a scroll
  // position on a back navigation.
  const mounted = useRef(false);

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
    instance = lenis;

    // Hand same-page anchor clicks to Lenis, or they fight each other.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;

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
      instance = null;
      lenis.destroy();
    };
  }, []);

  // A new route starts at the top, the way a browser navigation does.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    // A link to `/services#faq` is asking for a particular place on the new
    // page, and the anchor handler is about to take it there.
    if (window.location.hash) return;
    scrollPageToTop({ immediate: true });
  }, [pathname]);

  return null;
}
