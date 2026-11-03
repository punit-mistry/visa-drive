"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Search,
  Stamp,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { CardGridSkeleton, EmptyState } from "@/components/shared/states";
import { DemoContentBadge } from "@/components/shared/status-badge";
import { formatProcessingTime, formatMoney } from "@/lib/helpers/pricing";
import { titleCase } from "@/lib/helpers/format";
import { cn } from "@/lib/utils";

/**
 * Visa selection — step zero of the booking journey.
 *
 * Everything on this page serves one decision: which visa service. The brief
 * is stated once at the top, the catalogue filters by destination and
 * category without a page reload, and each card ends in the only action that
 * matters. Nothing here markets; the customer has already decided to apply.
 */

const HOW_IT_WORKS = [
  {
    icon: Stamp,
    title: "Choose your visa",
    body: "Pick the destination and service. Fees and processing times are shown upfront.",
  },
  {
    icon: FileText,
    title: "Add details and documents",
    body: "Fill in traveller details and upload what the checklist asks for. Saved as you go.",
  },
  {
    icon: CheckCircle2,
    title: "We take it from here",
    body: "Our specialists review, submit and keep you updated at every status change.",
  },
];

export default function ApplyPage() {
  const router = useRouter();
  const createDraft = useMutation(api.applications.createDraft);
  const discovery = useQuery(api.visaProducts.searchForDiscovery, { limit: 100 });
  const [search, setSearch] = useState("");
  const [destination, setDestination] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const rows = useMemo(() => discovery?.results ?? [], [discovery?.results]);

  // Facets are derived from what the catalogue actually returned, so a filter
  // chip can never offer a destination with nothing behind it.
  const destinations = useMemo(() => {
    const seen = new Map<string, { name: string; flag: string; count: number }>();
    for (const item of rows) {
      const key = item.destination.slug;
      const existing = seen.get(key);
      if (existing) existing.count += 1;
      else
        seen.set(key, {
          name: item.destination.name,
          flag: item.destination.flagEmoji,
          count: 1,
        });
    }
    return [...seen.entries()].map(([slug, value]) => ({ slug, ...value }));
  }, [rows]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const item of rows) seen.add(item.category);
    return [...seen];
  }, [rows]);

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((item) => {
      if (destination && item.destination.slug !== destination) return false;
      if (category && item.category !== category) return false;
      if (!term) return true;
      return (
        item.name.toLowerCase().includes(term) ||
        item.destination.name.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term) ||
        item.visaType.toLowerCase().includes(term)
      );
    });
  }, [rows, search, destination, category]);

  const filtered = Boolean(search.trim() || destination || category);

  function clearFilters() {
    setSearch("");
    setDestination(null);
    setCategory(null);
  }

  async function startApplication(visaProductId: Id<"visaProducts">) {
    setStartingId(visaProductId);
    try {
      const result = await createDraft({ visaProductId, travellerCount: 1 });
      toast.success(
        result.reused
          ? "Resumed your saved draft."
          : "Draft created. Let us complete your details.",
      );
      router.push(`/apply/${result.applicationId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not start this application.",
      );
    } finally {
      setStartingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Start a visa application"
        description="Choose the service you need. Your progress is saved automatically, so you can finish whenever suits you."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "New application" },
        ]}
      />

      {/* What the next ten minutes look like, before any form appears. */}
      <ol className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
        {HOW_IT_WORKS.map((stage, index) => {
          const Icon = stage.icon;
          return (
            <li key={stage.title} className="bg-card p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-brand-tint text-[13px] font-semibold text-brand-deep">
                  {index + 1}
                </span>
                <Icon className="size-4 text-muted-foreground" aria-hidden />
              </div>
              <p className="mt-3 text-sm font-semibold tracking-tight">{stage.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {stage.body}
              </p>
            </li>
          );
        })}
      </ol>

      {/* ------------------------------- filters ----------------------------- */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search country, visa type or category"
              className="pl-9"
              aria-label="Search visa services"
            />
          </div>

          {categories.length > 1 && (
            <div
              role="group"
              aria-label="Filter by category"
              className="flex flex-wrap items-center gap-1.5"
            >
              <FilterChip active={category === null} onClick={() => setCategory(null)}>
                All types
              </FilterChip>
              {categories.map((value) => (
                <FilterChip
                  key={value}
                  active={category === value}
                  onClick={() => setCategory(category === value ? null : value)}
                >
                  {titleCase(value)}
                </FilterChip>
              ))}
            </div>
          )}
        </div>

        {destinations.length > 1 && (
          <div
            role="group"
            aria-label="Filter by destination"
            className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
          >
            <FilterChip active={destination === null} onClick={() => setDestination(null)}>
              All destinations
            </FilterChip>
            {destinations.map((item) => (
              <FilterChip
                key={item.slug}
                active={destination === item.slug}
                onClick={() => setDestination(destination === item.slug ? null : item.slug)}
              >
                <span aria-hidden>{item.flag}</span>
                {item.name}
                <span className="text-[11px] opacity-70">{item.count}</span>
              </FilterChip>
            ))}
          </div>
        )}

        {filtered && discovery !== undefined && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              {results.length} {results.length === 1 ? "service" : "services"} match
            </span>
            <Button variant="ghost" size="xs" onClick={clearFilters}>
              <X className="size-3" aria-hidden />
              Clear filters
            </Button>
          </div>
        )}
      </div>

      {/* ------------------------------- results ----------------------------- */}
      {discovery === undefined ? (
        <CardGridSkeleton count={6} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Stamp}
          title={filtered ? "No visa services match" : "The catalogue is empty"}
          description={
            filtered
              ? "Try a broader search, or clear the filters to see everything we currently offer."
              : "No visa services have been published yet. Please check back shortly or talk to our team."
          }
          action={
            filtered ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button asChild>
                <Link href="/destinations">Browse destinations</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((item) => (
            <VisaOptionCard
              key={item._id}
              item={item}
              busy={startingId === item._id}
              disabled={startingId !== null && startingId !== item._id}
              onStart={() => startApplication(item._id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-all focus-brand",
        active
          ? "border-primary bg-primary text-primary-foreground elev-sm"
          : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

type DiscoveryResult = ReturnType<
  typeof useQuery<typeof api.visaProducts.searchForDiscovery>
>;
type DiscoveryItem = NonNullable<DiscoveryResult>["results"][number];

function VisaOptionCard({
  item,
  busy,
  disabled,
  onStart,
}: {
  item: DiscoveryItem;
  busy: boolean;
  disabled: boolean;
  onStart: () => void;
}) {
  const listPrice = item.governmentFee + item.serviceFee;
  const price = item.promoPrice ?? listPrice;
  const hasPromo = typeof item.promoPrice === "number" && item.promoPrice < listPrice;
  const processing = formatProcessingTime(
    item.processingTimeMinDays,
    item.processingTimeMaxDays,
    item.processingTimeNote,
  );

  return (
    <article className="group flex flex-col rounded-2xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:elev-md">
      <div className="flex items-start gap-3 p-5 pb-4">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-2xl leading-none"
          aria-hidden
        >
          {item.destination.flagEmoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-eyebrow">{item.destination.name}</p>
          <h3 className="mt-1 text-base font-semibold leading-snug tracking-tight">
            {item.name}
          </h3>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-5 pb-5">
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {item.shortDescription}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="font-normal">
            {item.visaType}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {titleCase(item.category)}
          </Badge>
          {item.isDemoContent && <DemoContentBadge />}
        </div>

        {processing && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" aria-hidden />
            {processing}
          </p>
        )}

        <div className="mt-auto space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-xl font-semibold tabular-nums tracking-tight">
              {formatMoney(price, item.currency)}
            </span>
            {hasPromo && (
              <span className="text-sm tabular-nums text-muted-foreground line-through">
                {formatMoney(listPrice, item.currency)}
              </span>
            )}
            <span className="text-xs text-muted-foreground">per traveller</span>
          </div>

          <Button className="w-full" onClick={onStart} disabled={busy || disabled}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Starting…
              </>
            ) : (
              <>
                Start application
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </>
            )}
          </Button>
        </div>
      </div>
    </article>
  );
}
