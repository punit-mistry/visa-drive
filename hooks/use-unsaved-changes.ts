"use client";

import { useEffect } from "react";

/**
 * Warns before a reload or tab close while a form holds unsaved edits.
 *
 * The browser owns the dialog and its wording — all a page can do is opt in,
 * which is why this is a one-line hook rather than a component. In-app
 * navigation is handled separately by the surfaces that need it, because the
 * App Router has no cancellable navigation event to hang this off.
 */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome still requires returnValue to be set for the prompt to show.
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
