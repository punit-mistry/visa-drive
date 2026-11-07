"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * The page transition: an aircraft crosses the screen on a flight arc and
 * drags the page with it.
 *
 * The sheet's leading edge is an ellipse rather than a straight line, so it
 * reads as a wake being pulled along behind the aircraft rather than a panel
 * sliding in. The aircraft itself climbs out of the lower left, levels at the
 * top of the arc, and descends away to the right — the shape every airline
 * draws on a route map.
 *
 * It exists because the gap between pressing a link and the next page
 * painting is the one moment a marketing site feels like a website rather
 * than a product. The sheet covers that gap, so the wait reads as travel.
 *
 * Four rules, because an interstitial is the easiest thing to get wrong:
 *
 * 1. **It must never trap anyone.** If the navigation stalls, a watchdog
 *    reveals the page anyway. The sheet is decoration over a navigation that
 *    is already happening — it is not a gate in front of one.
 * 2. **It must not slow a working session down.** It runs only while the
 *    visitor is on the public site. Inside the portal and the CRM, where
 *    people are doing a job, links navigate instantly as before.
 * 3. **It must not break a link.** Anything that is not a plain left-click on
 *    a same-origin link — a new tab, a modifier click, a download, an anchor,
 *    an external host — is handed straight back to the browser untouched.
 * 4. **It must obey `prefers-reduced-motion`.** A visitor who has asked for
 *    stillness gets an ordinary navigation, with no sheet at all.
 *
 * It is mounted at the root rather than in the marketing layout so that it
 * survives the navigation it is animating: a component inside the layout
 * being left would unmount mid-flight and cut to the new page.
 */

/** Climb out, then descend away. Long enough to read as flight, no longer. */
const COVER_MS = 480;
const REVEAL_MS = 520;
/** If the next page has not arrived by now, show it regardless. */
const STALL_MS = 1800;

/** Surfaces where people are working, not browsing. */
const WORKING_SURFACES = [
  "/dashboard",
  "/admin",
  "/apply",
  "/checkout",
  "/sign-in",
  "/sign-up",
];

function isWorkingSurface(pathname: string) {
  return WORKING_SURFACES.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

type Phase = "idle" | "cover" | "reveal";

export function FlightTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  /**
   * The path we left, held while in the air. Arrival is "the path is no
   * longer this one" rather than "the path is the one we asked for", because
   * middleware can land us somewhere else entirely — a signed-out visitor
   * pressing "Start application" arrives at /sign-in, and that is still an
   * arrival.
   */
  const departedFrom = useRef<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // --------------------------------------------------------------- arrival
  // The sheet is covering the screen and the new path has landed: the
  // aircraft descends away to the right and takes the sheet with it.
  useEffect(() => {
    if (departedFrom.current === null || departedFrom.current === pathname) {
      return;
    }
    departedFrom.current = null;
    clearTimers();
    setPhase("reveal");
    after(REVEAL_MS, () => setPhase("idle"));
  }, [pathname, after, clearTimers]);

  // ------------------------------------------------------------ departure
  useEffect(() => {
    // Only on the public site. Inside the portal and the CRM this listener
    // is never installed, so nothing it could get wrong can happen there.
    if (isWorkingSurface(pathname)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      // Left button only, and never a modifier click — those mean "open this
      // somewhere else", which is the browser's job, not ours.
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.dataset.noTransition !== undefined) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      // Another host, a mailto:, a tel:, a WhatsApp link — not ours to animate.
      if (url.origin !== window.location.origin) return;
      if (url.protocol !== window.location.protocol) return;
      // Same page, or only the fragment changed: nothing is being loaded.
      if (url.pathname === window.location.pathname) return;

      const destination = url.pathname + url.search;

      event.preventDefault();
      clearTimers();
      departedFrom.current = window.location.pathname;
      setPhase("cover");

      // Push once the sheet has the screen, so the swap happens unseen.
      after(COVER_MS, () => router.push(destination));
      // Never leave anyone looking at a black sheet because a route was slow.
      after(STALL_MS, () => {
        departedFrom.current = null;
        setPhase("reveal");
        after(REVEAL_MS, () => setPhase("idle"));
      });
    };

    // Capture, not bubble. Next's `Link` handles the click on the way up and
    // calls `preventDefault()` before a document-level bubble listener ever
    // sees it, so this has to run on the way down. It is safe to take the
    // click here: `Link` checks `defaultPrevented` and stands down, and every
    // other handler on the path still runs because nothing is stopped.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname, router, after, clearTimers]);

  if (phase === "idle") return null;

  const covering = phase === "cover";

  return (
    <div
      aria-hidden
      className="pointer-events-auto fixed inset-0 z-[100] overflow-hidden"
    >
      {/* The sheet. Wider than the viewport so its curved edge is always a
          wake crossing the screen and never a shape sitting inside it. */}
      <div
        className={cn(
          "vd-flight-sheet absolute inset-y-0 left-0 bg-ink-black",
          covering ? "vd-flight-sheet--cover" : "vd-flight-sheet--reveal",
        )}
      />

      {/* The route arc the aircraft is flying, drawn in behind it. Stretched
          to the viewport, so the stroke is held to a true hairline by
          `non-scaling-stroke` rather than being squashed with the box. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        aria-hidden
      >
        <path
          d="M-6 70 Q 50 22 106 70"
          fill="none"
          stroke="currentColor"
          className={cn(
            "text-white/25",
            covering ? "vd-flight-trail--in" : "vd-flight-trail--out",
          )}
          strokeWidth={1.25}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* The aircraft. Two nested transforms rather than one: the outer box
          carries it across at a constant rate, the inner one climbs and
          banks on its own easing, and the sum of the two is the arc. A
          single keyframe track could only ever draw a straight line. */}
      <div
        className={cn(
          "absolute left-0 top-1/2 will-change-transform",
          covering ? "vd-flight-x--in" : "vd-flight-x--out",
        )}
      >
        <div
          className={cn(
            "will-change-transform",
            covering ? "vd-flight-y--in" : "vd-flight-y--out",
          )}
        >
          <Airliner className="size-16 text-brand drop-shadow-[0_6px_18px_rgba(0,0,0,0.45)] sm:size-20" />
        </div>
      </div>
    </div>
  );
}

/**
 * An airliner from above, nose to the right — the shape on a departures
 * board, not a paper dart.
 *
 * Drawn here rather than pulled from an icon set because every icon set's
 * aeroplane is a thin outline that vanishes at this size against ink, and
 * because a silhouette this simple has no business being a network request.
 * The outline is symmetric about y = 32: swept wings with a short tip chord,
 * a tailplane at the same sweep, and a blunt tail cone.
 */
function Airliner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="currentColor"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path
        d="M61 32c0-1.7-2.4-2.9-5.8-3H36.5L20.5 5.5h-3L26.5 29H12.5L6.5 17.5h-2L9.5 29
           C6.9 29.3 4.6 30.5 4.6 32s2.3 2.7 4.9 3L4.5 46.5h2L12.5 35h14L17.5 58.5h3
           L36.5 35h18.7c3.4-.1 5.8-1.3 5.8-3Z"
      />
    </svg>
  );
}
