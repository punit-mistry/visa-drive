"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowRight, Loader2, Search } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { PublishedDestination } from "@/components/marketing/catalogue";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTodayIso } from "@/hooks/use-current-date";
import { ORIGIN_COUNTRIES, TRAVEL_PURPOSES } from "@/lib/constants/countries";
import {
  visaDiscoverySchema,
  type VisaDiscoveryValues,
} from "@/lib/validators/forms";
import { cn } from "@/lib/utils";

/**
 * The homepage's primary conversion path.
 *
 * "Visiting" is populated from the published catalogue rather than the full
 * ISO country list, so the form can only ever offer a destination VisaDrive
 * actually serves. Submitting hands the four inputs to the results view,
 * which runs `visaProducts.searchForDiscovery` against them.
 */
export function VisaDiscoveryForm({
  className,
  defaultValues,
  variant = "hero",
}: {
  className?: string;
  defaultValues?: Partial<VisaDiscoveryValues>;
  variant?: "hero" | "compact";
}) {
  const router = useRouter();
  const destinations = useQuery(api.destinations.listPublished, {}) as
    | PublishedDestination[]
    | undefined;

  const form = useForm<VisaDiscoveryValues>({
    resolver: zodResolver(visaDiscoverySchema),
    defaultValues: {
      fromCountry: defaultValues?.fromCountry ?? "IN",
      toCountry: defaultValues?.toCountry ?? "",
      purpose: defaultValues?.purpose,
      travelDate: defaultValues?.travelDate,
    },
    mode: "onSubmit",
  });

  const isLoading = destinations === undefined;
  const hasDestinations = !isLoading && destinations.length > 0;

  function onSubmit(values: VisaDiscoveryValues) {
    const params = new URLSearchParams();
    params.set("from", values.fromCountry);
    params.set("to", values.toCountry);
    if (values.purpose) params.set("purpose", values.purpose);
    if (values.travelDate) {
      params.set("date", new Date(values.travelDate).toISOString().slice(0, 10));
    }
    router.push(`/destinations?${params.toString()}`);
  }

  // Today in ISO form, for the date input's `min` — nobody applies for a visa
  // for a trip that has already happened.
  const today = useTodayIso();

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn(
          "rounded-[2rem] border border-border bg-card p-2 elev-xl",
          variant === "compact" && "elev-md",
          className,
        )}
        aria-label="Find your visa"
      >
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[1.5rem] bg-border sm:grid-cols-2 lg:grid-cols-[1.1fr_1.1fr_1fr_1.1fr_auto]">
          {/* Travelling from */}
          <FormField
            control={form.control}
            name="fromCountry"
            render={({ field }) => (
              <FormItem className="gap-0 bg-card px-4 py-3">
                <FormLabel className="text-eyebrow">Travelling from</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger
                      size="default"
                      className="h-auto w-full rounded-none border-0 bg-transparent px-0 py-1 text-base font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
                    >
                      <SelectValue placeholder="Select a country" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent position="popper" className="max-h-72">
                    {ORIGIN_COUNTRIES.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        <span className="mr-1">{country.flag}</span>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="mt-1 text-xs" />
              </FormItem>
            )}
          />

          {/* Visiting */}
          <FormField
            control={form.control}
            name="toCountry"
            render={({ field }) => (
              <FormItem className="gap-0 bg-card px-4 py-3">
                <FormLabel className="text-eyebrow">Visiting</FormLabel>
                {isLoading ? (
                  <Skeleton className="mt-2 h-6 w-32" />
                ) : (
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!hasDestinations}
                  >
                    <FormControl>
                      <SelectTrigger
                        size="default"
                        className="h-auto w-full rounded-none border-0 bg-transparent px-0 py-1 text-base font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
                      >
                        <SelectValue
                          placeholder={
                            hasDestinations
                              ? "Choose a destination"
                              : "No destinations yet"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent position="popper" className="max-h-72">
                      {(destinations ?? []).map((destination) => (
                        <SelectItem key={destination._id} value={destination.slug}>
                          <span className="mr-1">{destination.flagEmoji}</span>
                          {destination.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <FormMessage className="mt-1 text-xs" />
              </FormItem>
            )}
          />

          {/* Travel date */}
          <FormField
            control={form.control}
            name="travelDate"
            render={({ field }) => (
              <FormItem className="gap-0 bg-card px-4 py-3">
                <FormLabel className="text-eyebrow">Travel date</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    min={today || undefined}
                    value={
                      field.value
                        ? new Date(field.value).toISOString().slice(0, 10)
                        : ""
                    }
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (!raw) {
                        field.onChange(undefined);
                        return;
                      }
                      const parsed = Date.parse(`${raw}T00:00:00`);
                      field.onChange(Number.isNaN(parsed) ? undefined : parsed);
                    }}
                    className="h-auto rounded-none border-0 bg-transparent px-0 py-1 text-base font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
                  />
                </FormControl>
                <FormMessage className="mt-1 text-xs" />
              </FormItem>
            )}
          />

          {/* Purpose */}
          <FormField
            control={form.control}
            name="purpose"
            render={({ field }) => (
              <FormItem className="gap-0 bg-card px-4 py-3">
                <FormLabel className="text-eyebrow">Purpose</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                  <FormControl>
                    <SelectTrigger
                      size="default"
                      className="h-auto w-full rounded-none border-0 bg-transparent px-0 py-1 text-base font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
                    >
                      <SelectValue placeholder="Any purpose" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent position="popper">
                    {TRAVEL_PURPOSES.map((purpose) => (
                      <SelectItem key={purpose.value} value={purpose.value}>
                        {purpose.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="mt-1 text-xs" />
              </FormItem>
            )}
          />

          <div className="flex items-center bg-card p-2 sm:col-span-2 lg:col-span-1">
            <Button
              type="submit"
              size="lg"
              className="h-12 w-full gap-2 rounded-full lg:w-auto lg:px-7"
              disabled={form.formState.isSubmitting || !hasDestinations}
            >
              {form.formState.isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Search className="size-4" aria-hidden />
              )}
              Search visa
            </Button>
          </div>
        </div>

        {!isLoading && !hasDestinations && (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            Our destination catalogue is being set up.{" "}
            <a
              href="/contact"
              className="inline-flex items-center gap-1 font-medium text-brand underline-offset-4 hover:underline focus-brand"
            >
              Tell us where you are going
              <ArrowRight className="size-3.5" aria-hidden />
            </a>
          </p>
        )}
      </form>
    </Form>
  );
}
