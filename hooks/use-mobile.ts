"use client";

import { useIsMobile as useMediaQueryIsMobile } from "@/hooks/use-media-query";

/**
 * shadcn's sidebar hook. Delegates to the shared media-query hook so there is
 * one breakpoint definition and one subscription implementation.
 */
export function useIsMobile() {
  return useMediaQueryIsMobile();
}
