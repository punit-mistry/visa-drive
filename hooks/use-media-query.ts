"use client";

import { useCallback, useSyncExternalStore } from "react";

const getServerSnapshot = () => false;

/**
 * SSR-safe media query hook.
 *
 * The server snapshot is `false`, so markup matches on hydration; the real
 * value is read from the browser once React subscribes to the query.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Tailwind's breakpoints, so JS and CSS agree on what "mobile" means. */
export const useIsMobile = () => !useMediaQuery("(min-width: 768px)");
export const useIsTablet = () =>
  useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");

/** True when the visitor has asked for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
