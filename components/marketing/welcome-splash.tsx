"use client";

import { useEffect, useState } from "react";

import { Logo } from "@/components/shared/logo";

/**
 * The welcome screen, shown once when someone first opens the site.
 *
 * Three rules it has to obey, because a splash screen is the easiest thing in
 * a product to get wrong:
 *
 * 1. **It must never trap anyone.** The page renders behind it and the CSS
 *    itself fades it out on a timer with `forwards`, so even with JavaScript
 *    broken or still downloading the site becomes usable on its own. The
 *    script only ever makes it leave *sooner*.
 * 2. **It must not repeat.** Once per browsing session, not once per page
 *    view. The flag is read by a blocking script in `<head>` (see
 *    `SPLASH_GUARD`) so a returning navigation never flashes it before React
 *    has hydrated enough to hide it.
 * 3. **It must not hide content from a crawler or a screen reader.** It is
 *    `aria-hidden`, it contains no content that is not also on the page, and
 *    it stops taking pointer events the moment it starts fading.
 *
 * Reduced motion gets a still frame that fades once — the point is to welcome
 * someone, not to make them wait for an animation they asked not to see.
 */

/** Minimum time on screen, so a fast load does not produce a flicker. */
const MIN_MS = 750;
/** Hard ceiling. The CSS backstop fires shortly after this. */
const MAX_MS = 2400;

const STORAGE_KEY = "vd:welcomed";

/**
 * Runs before first paint, from the document head.
 *
 * It marks the document when this session has already been welcomed, and the
 * stylesheet keys `display: none` off that attribute. Without this the splash
 * would be in the server's HTML on every navigation and only disappear once
 * React hydrated — a flash on every page.
 */
export const SPLASH_GUARD = `(function(){try{if(sessionStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)}))document.documentElement.setAttribute("data-welcomed","");}catch(e){}})();`;

export function WelcomeSplash() {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let welcomed = false;
    try {
      welcomed = Boolean(sessionStorage.getItem(STORAGE_KEY));
    } catch {
      /* Private mode or blocked storage: show it, just do not remember. */
    }
    // Already seen this session. The head script set `data-welcomed` before
    // first paint and the stylesheet has already hidden this, so there is
    // nothing to animate and nothing to time.
    if (welcomed) return;

    const started = Date.now();
    let leaveTimer: ReturnType<typeof setTimeout>;
    let doneTimer: ReturnType<typeof setTimeout>;

    const leave = () => {
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* Nothing to do — it simply shows again next time. */
      }
      setLeaving(true);
      // Unmount after the fade so nothing is left in the tree.
      doneTimer = setTimeout(() => setGone(true), 650);
    };

    const schedule = () => {
      const elapsed = Date.now() - started;
      leaveTimer = setTimeout(leave, Math.max(0, MIN_MS - elapsed));
    };

    // Leave when the page is actually ready, or at the ceiling, whichever
    // comes first — a slow catalogue read must not hold the door shut.
    const ceiling = setTimeout(leave, MAX_MS);

    if (document.readyState === "complete") {
      schedule();
    } else {
      window.addEventListener("load", schedule, { once: true });
    }

    return () => {
      clearTimeout(ceiling);
      clearTimeout(leaveTimer);
      clearTimeout(doneTimer);
      window.removeEventListener("load", schedule);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      aria-hidden
      data-leaving={leaving ? "" : undefined}
      className="vd-splash fixed inset-0 z-[100] flex flex-col items-center justify-center gap-7 bg-ink-black"
    >
      <Logo size="lg" onDark asLink={false} className="vd-splash-mark text-3xl" />

      <span className="relative flex size-20 items-center justify-center">
        <span
          className="vd-stamp-ring absolute inset-0 rounded-full border-2 border-dashed border-brand/35"
          aria-hidden
        />
        <span className="vd-stamp-press flex size-14 -rotate-6 flex-col items-center justify-center rounded-full border-2 border-brand/70 text-brand">
          <span className="font-mono text-[6px] font-bold uppercase tracking-[0.14em] opacity-70">
            Visa
          </span>
          <span className="font-mono text-[12px] font-bold leading-none tracking-[0.04em]">
            VD
          </span>
          <span className="font-mono text-[5px] uppercase tracking-[0.16em] opacity-60">
            VisaDrive
          </span>
        </span>
      </span>

      <p className="vd-splash-mark text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
        Your visa, handled
      </p>

      <span className="relative h-px w-36 overflow-hidden rounded-full bg-white/15">
        <span className="vd-stamp-sweep absolute inset-y-0 left-0 w-1/3 rounded-full bg-brand" />
      </span>
    </div>
  );
}
