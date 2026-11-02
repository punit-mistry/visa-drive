"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Loader2, Search, Stamp } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { CardGridSkeleton, EmptyState } from "@/components/shared/states";
import { DemoContentBadge } from "@/components/shared/status-badge";
import { formatProcessingTime, formatMoney } from "@/lib/helpers/pricing";
import { titleCase } from "@/lib/helpers/format";

export default function ApplyPage() {
  const router = useRouter();
  const createDraft = useMutation(api.applications.createDraft);
  const discovery = useQuery(api.visaProducts.searchForDiscovery, { limit: 100 });
  const [search, setSearch] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);

  const results = useMemo(() => {
    const rows = discovery?.results ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.destination.name.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term) ||
        item.visaType.toLowerCase().includes(term),
    );
  }, [discovery?.results, search]);

  async function startApplication(visaProductId: Id<"visaProducts">) {
    setStartingId(visaProductId);
    try {
      const result = await createDraft({ visaProductId, travellerCount: 1 });
      toast.success(
        result.reused ? "Resumed your saved draft." : "Draft created. Let's complete your details.",
      );
      router.push(`/apply/${result.applicationId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start this application.");
    } finally {
      setStartingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Start a visa application"
        description="Choose the visa service you need. You can save a draft at any point and finish it later."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "New application" },
        ]}
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by country, visa type, or category"
          className="pl-9"
          aria-label="Search visa services"
        />
      </div>

      {discovery === undefined ? (
        <CardGridSkeleton count={6} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Stamp}
          title="No visa services match"
          description={
            search
              ? "Try a different search term, or browse the full catalogue on the marketing site."
              : "The catalogue is empty right now. Please check back shortly."
          }
          action={
            search ? (
              <Button variant="outline" onClick={() => setSearch("")}>
                Clear search
              </Button>
            ) : (
              <Button asChild>
                <Link href="/destinations">Browse destinations</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((item) => {
            const price = item.promoPrice ?? item.governmentFee + item.serviceFee;
            const processing = formatProcessingTime(
              item.processingTimeMinDays,
              item.processingTimeMaxDays,
              item.processingTimeNote,
            );

            return (
              <Card key={item._id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {item.destination.flagEmoji} {item.destination.name}
                      </p>
                      <p className="mt-1 text-base font-semibold leading-tight">{item.name}</p>
                    </div>
                    <Badge variant="outline">{titleCase(item.category)}</Badge>
                  </div>

                  <p className="text-sm text-muted-foreground">{item.shortDescription}</p>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{item.visaType}</span>
                    {processing && <span>· {processing}</span>}
                  </div>

                  <div className="mt-auto space-y-3 pt-2">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-semibold tabular-nums">
                        {formatMoney(price, item.currency)}
                      </p>
                      <span className="text-xs text-muted-foreground">per traveller</span>
                      {item.isDemoContent && <DemoContentBadge />}
                    </div>

                    <Button
                      className="w-full"
                      onClick={() => startApplication(item._id)}
                      disabled={startingId === item._id}
                    >
                      {startingId === item._id ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <ArrowRight className="size-4" aria-hidden />
                      )}
                      Apply now
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
