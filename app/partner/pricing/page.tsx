"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Info, PlusCircle, Search, Tags } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { DemoContentBadge } from "@/components/shared/status-badge";
import { EmptyState, ListSkeleton } from "@/components/shared/states";
import { useDebounce } from "@/hooks/use-debounce";
import { formatProcessingTime, formatMoney } from "@/lib/helpers/pricing";
import { formatMarginPercent } from "@/lib/helpers/partner-pricing";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * The partner's price list.
 *
 * Read-only, and said plainly rather than implied by a missing button: an
 * agent who wants a different rate needs to talk to VisaDrive, and a screen
 * that looked editable would waste their time. Every figure here is resolved
 * server-side by `partnerPricing.myCatalogue` against the caller's own
 * partner id — there is no parameter that could fetch another agency's rates.
 */
export default function PartnerPricingPage() {
  const [destinationId, setDestinationId] = useState<string>("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  const catalogue = useQuery(api.partnerPricing.myCatalogue, {
    destinationId: destinationId
      ? (destinationId as Id<"destinations">)
      : undefined,
    search: debouncedSearch.trim() || undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing"
        description="What you pay VisaDrive, what your customer pays, and the margin in between."
      />

      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 text-sm leading-relaxed text-muted-foreground">
          <p>
            Prices are set by VisaDrive and shown per traveller. A booking
            multiplies the per-traveller fee by the party size, so your margin
            scales with it. Government fees are collected at actual cost and are
            outside this margin.
          </p>
          {catalogue && catalogue.defaultMarkupPercent > 0 && (
            <p className="mt-1.5">
              Your account rate is{" "}
              <span className="font-medium text-foreground tabular-nums">
                {catalogue.defaultMarkupPercent}%
              </span>{" "}
              on anything without a specific price.
            </p>
          )}
        </div>
      </div>

      {catalogue === undefined ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search services"
                className="pl-9"
                aria-label="Search your price list"
              />
            </div>

            <select
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand"
              aria-label="Filter by destination"
            >
              <option value="">All destinations</option>
              {catalogue.destinations.map((destination) => (
                <option key={destination._id} value={destination._id}>
                  {destination.name}
                </option>
              ))}
            </select>
          </div>

          {catalogue.rows.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="No services match"
              description="Try a different destination or clear the search."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="scrollbar-thin overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-surface">
                      <tr className="text-left text-xs font-medium text-muted-foreground">
                        <th className="px-4 py-3">Destination</th>
                        <th className="px-4 py-3">Visa type</th>
                        <th className="px-4 py-3 text-right">Base price</th>
                        <th className="px-4 py-3 text-right">Your price</th>
                        <th className="px-4 py-3 text-right">Your margin</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {catalogue.rows.map((row) => (
                        <tr key={row.visaProductId}>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="inline-flex items-center gap-1.5">
                              {row.flagEmoji && (
                                <span aria-hidden>{row.flagEmoji}</span>
                              )}
                              {row.destinationName}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium">{row.productName}</p>
                            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {row.visaType}
                              {formatProcessingTime(
                                row.processingTimeMinDays,
                                row.processingTimeMaxDays,
                                row.processingTimeNote,
                              ) && (
                                <span>
                                  ·{" "}
                                  {formatProcessingTime(
                                    row.processingTimeMinDays,
                                    row.processingTimeMaxDays,
                                    row.processingTimeNote,
                                  )}
                                </span>
                              )}
                              {row.isDemoContent && <DemoContentBadge />}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {formatMoney(row.basePrice, row.currency)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">
                            {formatMoney(row.partnerPrice, row.currency)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                            {row.marginAmount > 0 ? (
                              <>
                                <span className="text-success">
                                  {formatMoney(row.marginAmount, row.currency)}
                                </span>
                                <span className="ml-1.5 text-xs text-muted-foreground">
                                  {formatMarginPercent(row.marginPercent)}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <Button asChild variant="ghost" size="sm">
                              <Link
                                href={`/partner/bookings/new?product=${row.visaProductId}`}
                              >
                                <PlusCircle className="size-3.5" aria-hidden />
                                Book
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {catalogue.truncated && (
            <p className="text-xs text-muted-foreground">
              Showing the first 500 services. Filter by destination to see the
              rest.
            </p>
          )}
        </>
      )}
    </div>
  );
}
