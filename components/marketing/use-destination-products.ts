"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { CatalogueProduct } from "@/components/marketing/catalogue";

/**
 * Published visa products grouped by destination slug.
 *
 * `destinations.listPublished` returns counts and a starting price but not the
 * products themselves, and the grid needs the real visa categories on each
 * card. `visaProducts.searchForDiscovery` with no filters is the one public
 * query that returns the whole published catalogue in a single round trip, so
 * the grid costs two queries rather than one per card.
 */
export function useDestinationProducts(): {
  isLoading: boolean;
  byDestination: Record<string, CatalogueProduct[]>;
} {
  const discovery = useQuery(api.visaProducts.searchForDiscovery, {});

  return useMemo(() => {
    if (discovery === undefined) {
      return { isLoading: true, byDestination: {} };
    }

    const byDestination: Record<string, CatalogueProduct[]> = {};
    for (const product of discovery.results as CatalogueProduct[]) {
      const key = product.destinationSlug;
      (byDestination[key] ??= []).push(product);
    }

    for (const list of Object.values(byDestination)) {
      list.sort((a, b) => a.displayOrder - b.displayOrder);
    }

    return { isLoading: false, byDestination };
  }, [discovery]);
}
