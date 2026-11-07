"use client";

import { useEffect, useState } from "react";

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
 * Clerk and Convex inside the portal, where both are loaded. This exists so
 * that a visitor reading a page about tourist visas is not made to download
 * an authentication SDK to be shown a "Sign in" link.
 *
 * It returns `null` until the first effect runs, because the markup is also
 * served to a crawler and to the first paint, where no cookie has been read
 * yet. Callers render the signed-out state for `null`.
 */
export function useClerkSession(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        const match = document.cookie.match(/(?:^|;\s*)__client_uat=([^;]*)/);
        // No cookie at all means Clerk has never run in this browser, which
        // is the same thing as signed out for our purposes.
        setSignedIn(match ? Number(decodeURIComponent(match[1])) > 0 : false);
      } catch {
        setSignedIn(false);
      }
    };

    read();
    // Signing out in another tab should not leave this one offering a
    // dashboard link that will bounce the visitor to sign-in.
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, []);

  return signedIn;
}
