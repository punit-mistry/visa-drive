"use client";

import { useEffect, useRef } from "react";

/**
 * A small paper aircraft that drifts across the homepage as you scroll.
 *
 * It is decoration, so it is built to cost almost nothing and to disappear
 * the moment it would be unwelcome:
 *
 *   • Homepage only. The caller mounts it on `/` and nowhere else — a plane
 *     wandering over a booking form or a CRM table is noise during work.
 *   • Nothing runs until the visitor scrolls. The aircraft holds still on a
 *     page at rest, which is also what makes it read as a response rather
 *     than as an idle loop.
 *   • `prefers-reduced-motion` removes it completely. There is no reduced
 *     variant to design, because the whole thing is motion.
 *   • Pointer and touch devices with no room for it (phones) never get it.
 *
 * Mechanics: the scroll handler only records the latest scroll position. A
 * single rAF loop eases the aircraft toward a wandering target and writes one
 * `transform` — so the cost is one composited layer moving, not a layout on
 * every scroll event. `pointer-events-none` means it can never intercept a
 * click, and `aria-hidden` keeps it out of the accessibility tree entirely.
 */
export function PlaneCursor() {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Phones have neither the screen room nor the battery to spare.
    if (!window.matchMedia("(min-width: 1024px)").matches) return;

    const vw = () => window.innerWidth;
    const vh = () => window.innerHeight;

    // Current position, the target it is easing toward, and the heading it
    // is drawn at. Kept in refs-by-closure rather than state: this updates
    // every frame and must never cause a React render.
    let x = vw() * 0.78;
    let y = vh() * 0.3;
    let targetX = x;
    let targetY = y;
    let angle = 0;

    let lastScroll = window.scrollY;
    /** How hard the visitor is currently scrolling, decayed each frame. */
    let energy = 0;
    let frame = 0;
    let idle = 0;

    /** A fresh waypoint, kept inside a margin so it never sits on an edge. */
    function retarget() {
      const mx = 90;
      targetX = mx + Math.random() * (vw() - mx * 2);
      targetY = vh() * 0.14 + Math.random() * (vh() * 0.62);
    }

    const onScroll = () => {
      const delta = Math.abs(window.scrollY - lastScroll);
      lastScroll = window.scrollY;
      // Scrolling is what gives it somewhere to be. A big jump earns a new
      // waypoint; small nudges only top the energy up.
      energy = Math.min(energy + delta * 0.06, 14);
      if (delta > 40) retarget();
    };

    const tick = () => {
      frame = requestAnimationFrame(tick);

      // At rest it stops moving rather than circling forever.
      energy *= 0.94;
      if (energy < 0.05) {
        idle = 0;
        return;
      }

      // Having spent a while reaching one waypoint, pick another, so a long
      // scroll reads as a flight path rather than a single straight line.
      idle += 1;
      if (idle > 150) {
        retarget();
        idle = 0;
      }

      const dx = targetX - x;
      const dy = targetY - y;

      // Arrived: choose somewhere new.
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) retarget();

      // Ease toward the target, scaled by how much scrolling is happening.
      const speed = 0.012 + Math.min(energy, 10) * 0.0016;
      x += dx * speed;
      y += dy * speed;

      // Point where it is going. The SVG is drawn nose-right, so the heading
      // is the raw angle of travel.
      const heading = (Math.atan2(dy, dx) * 180) / Math.PI;
      // Shortest-path interpolation, so crossing ±180° does not spin it.
      const diff = ((heading - angle + 540) % 360) - 180;
      angle += diff * 0.06;

      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg)`;
      el.style.opacity = String(Math.min(energy / 3, 1) * 0.5);
    };

    const onResize = () => retarget();

    retarget();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <svg
      ref={ref}
      aria-hidden
      focusable="false"
      viewBox="0 0 24 24"
      className="pointer-events-none fixed left-0 top-0 z-30 size-7 text-brand opacity-0 will-change-transform"
      style={{ transition: "opacity 600ms ease-out" }}
    >
      {/* A flat paper dart, nose to the right. Two tones so it still reads
          as a shape rather than a blob at this size. */}
      <path d="M2 4.2 22 12 2 19.8l4.6-7.8L2 4.2Z" fill="currentColor" opacity="0.85" />
      <path d="M6.6 12 22 12 2 19.8 6.6 12Z" fill="currentColor" opacity="0.45" />
    </svg>
  );
}
