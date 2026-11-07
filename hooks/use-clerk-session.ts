"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Is there a Clerk session, answered without loading Clerk.
 *
 * Clerk publishes `__client_uat` as a plain, readable cookie for exactly this
 * purpose — it is how Clerk's own middleware decides whether a request needs
 * a handshake. A value above zero is the timestamp of the last sign-in; `0`
 * means signed out. It carries no identity and no role, so it is only good
 * for one question: which pair of buttons does the public header show.
 *
 * Everything that actually depends on who someone is still goes through
 * Clerk and Convex inside the portal, where both are loaded.
 *
 * It returns `null` until the first effect runs, because the markup is also
 * served to a crawler and to the first paint, where no cookie has been read
 * yet. Callers render the signed-out state for `null`.
 *
 * The cookie is re-read whenever the visitor could have changed session state:
 *   • on every client-side navigation (signing in redirects client-side, and
 *     the header stays mounted, so a mount-only read goes stale);
 *   • when the page is restored from the back/forward cache;
 *   • when the tab becomes visible again (signed out or in another tab).
 */
function readSession(): boolean {
  try {
    const match = document.cookie.match(/(?:^|;\s*)__client_uat=([^;]*)/);
    // No cookie means Clerk has never run in this browser, the same as
    // signed out for our purposes.
    return match ? Number(decodeURIComponent(match[1])) > 0 : false;
  } catch {
    return false;
  }
}

export function useClerkSession(): boolean | null {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const read = () => setSignedIn(readSession());

    read();

    const onVisible = () => {
      if (document.visibilityState === "visible") read();
    };
    const onPageShow = () => read();

    window.addEventListener("focus", read);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("focus", read);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // Re-run on every route change so the header reflects a session created
    // by the sign-in page that just redirected here.
  }, [pathname]);

  return signedIn;
}
