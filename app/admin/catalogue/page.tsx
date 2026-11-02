"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import type { ColumnDef } from "@tanstack/react-table";
import { BookOpen, ExternalLink, Globe2, Plane, Search, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { DemoContentBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { useDebounce } from "@/hooks/use-debounce";
import { formatDate, titleCase } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";

type DestinationRow = Doc<"destinations"> & {
  productCount: number;
  publishedProductCount: number;
  startingPrice: number | null;
};

type ProductRow = Doc<"visaProducts"> & {
  destination: Doc<"destinations"> | null;
};

const selectClass =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

const VISA_CATEGORIES = [
  "tourist",
  "business",
  "student",
  "transit",
  "medical",
  "work",
  "exchange_visitor",
  "service",
  "other",
] as const;

export default function AdminCataloguePage() {
  const [tab, setTab] = useState("destinations");

  const [destinationSearch, setDestinationSearch] = useState("");
  const [destinationPublished, setDestinationPublished] = useState<"" | "true" | "false">("");
  const debouncedDestinationSearch = useDebounce(destinationSearch);

  const [productSearch, setProductSearch] = useState("");
  const [productPublished, setProductPublished] = useState<"" | "true" | "false">("");
  const [productCategory, setProductCategory] = useState<string>("");
  const [productDestination, setProductDestination] = useState<string>("");
  const debouncedProductSearch = useDebounce(productSearch);

  const destinations = useQuery(api.destinations.listAll, {
    search: debouncedDestinationSearch.trim() || undefined,
    isPublished:
      destinationPublished === "" ? undefined : destinationPublished === "true",
  });

  const allDestinations = useQuery(api.destinations.listAll, {});

  const products = useQuery(api.visaProducts.listAll, {
    search: debouncedProductSearch.trim() || undefined,
    isPublished:
      productPublished === "" ? undefined : productPublished === "true",
    category: (productCategory || undefined) as
      | Doc<"visaProducts">["category"]
      | undefined,
    destinationId: (productDestination || undefined) as
      | Id<"destinations">
      | undefined,
  });

  const destinationColumns = useMemo<ColumnDef<DestinationRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Destination",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden>
              {row.original.flagEmoji || "🌍"}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {row.original.countryCode} · /{row.original.slug}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "products",
        header: "Products",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.publishedProductCount} published
            <span className="text-muted-foreground"> / {row.original.productCount}</span>
          </span>
        ),
      },
      {
        id: "startingPrice",
        header: "From",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.startingPrice == null
              ? "—"
              : formatMoney(row.original.startingPrice, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: "isPublished",
        header: "Status",
        cell: ({ row }) => (
          <span
            className={
              row.original.isPublished
                ? "rounded-full border border-success/25 bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success"
                : "rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            }
          >
            {row.original.isPublished ? "Published" : "Draft"}
          </span>
        ),
      },
      {
        accessorKey: "displayOrder",
        header: "Order",
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.displayOrder}
          </span>
        ),
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/destinations/${row.original.slug}`} target="_blank">
              View
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          </Button>
        ),
      },
    ],
    [],
  );

  const productColumns = useMemo<ColumnDef<ProductRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Visa product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.visaType} · {titleCase(row.original.category)}
            </p>
          </div>
        ),
      },
      {
        id: "destination",
        header: "Destination",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">
              {row.original.destination?.name ?? row.original.destinationSlug}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              /{row.original.destinationSlug}/{row.original.slug}
            </p>
          </div>
        ),
      },
      {
        id: "price",
        header: "Price",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatMoney(
              row.original.governmentFee + row.original.serviceFee,
              row.original.currency,
            )}
          </span>
        ),
      },
      {
        accessorKey: "paymentMode",
        header: "Payment",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {titleCase(row.original.paymentMode)}
          </span>
        ),
      },
      {
        accessorKey: "isPublished",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={
                row.original.isPublished
                  ? "rounded-full border border-success/25 bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success"
                  : "rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              }
            >
              {row.original.isPublished ? "Published" : "Draft"}
            </span>
            {row.original.isDemoContent && <DemoContentBadge />}
          </div>
        ),
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) =>
          row.original.destination ? (
            <Button asChild variant="ghost" size="sm">
              <Link
                href={`/destinations/${row.original.destinationSlug}/${row.original.slug}`}
                target="_blank"
              >
                View
                <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            </Button>
          ) : null,
      },
    ],
    [],
  );

  const destinationFiltersActive =
    !!destinationSearch || destinationPublished !== "";
  const productFiltersActive =
    !!productSearch || productPublished !== "" || !!productCategory || !!productDestination;

  function resetDestinationFilters() {
    setDestinationSearch("");
    setDestinationPublished("");
  }

  function resetProductFilters() {
    setProductSearch("");
    setProductPublished("");
    setProductCategory("");
    setProductDestination("");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalogue"
        description="Destinations and the visa products customers can book. Content is read-only here; publish changes from the catalogue editor."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="destinations">
            <Globe2 className="size-4" aria-hidden />
            Destinations
          </TabsTrigger>
          <TabsTrigger value="products">
            <Plane className="size-4" aria-hidden />
            Visa products
          </TabsTrigger>
        </TabsList>

        <TabsContent value="destinations" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <DataTable
                columns={destinationColumns}
                data={(destinations ?? []) as DestinationRow[]}
                isLoading={destinations === undefined}
                getRowId={(row) => row._id}
                emptyIcon={Globe2}
                emptyTitle={
                  destinationFiltersActive
                    ? "No destinations match"
                    : "No destinations yet"
                }
                emptyDescription={
                  destinationFiltersActive
                    ? "Try clearing one or more filters to see more results."
                    : "Destinations appear here once they are added to the catalogue."
                }
                emptyAction={
                  destinationFiltersActive ? (
                    <Button variant="outline" onClick={resetDestinationFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
                toolbar={
                  <>
                    <div className="relative w-full max-w-xs">
                      <Search
                        className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                      />
                      <Input
                        value={destinationSearch}
                        onChange={(event) => setDestinationSearch(event.target.value)}
                        placeholder="Search destinations"
                        className="pl-9"
                        aria-label="Search destinations"
                      />
                    </div>

                    <select
                      value={destinationPublished}
                      onChange={(event) =>
                        setDestinationPublished(
                          event.target.value as "" | "true" | "false",
                        )
                      }
                      className={selectClass}
                      aria-label="Filter destinations by status"
                    >
                      <option value="">All statuses</option>
                      <option value="true">Published</option>
                      <option value="false">Draft</option>
                    </select>

                    {destinationFiltersActive && (
                      <Button variant="ghost" size="sm" onClick={resetDestinationFilters}>
                        <X className="size-3.5" aria-hidden />
                        Clear
                      </Button>
                    )}
                  </>
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <DataTable
                columns={productColumns}
                data={(products ?? []) as ProductRow[]}
                isLoading={products === undefined}
                getRowId={(row) => row._id}
                emptyIcon={BookOpen}
                emptyTitle={
                  productFiltersActive ? "No products match" : "No visa products yet"
                }
                emptyDescription={
                  productFiltersActive
                    ? "Try clearing one or more filters to see more results."
                    : "Visa products appear here once they are added to a destination."
                }
                emptyAction={
                  productFiltersActive ? (
                    <Button variant="outline" onClick={resetProductFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
                toolbar={
                  <>
                    <div className="relative w-full max-w-xs">
                      <Search
                        className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                      />
                      <Input
                        value={productSearch}
                        onChange={(event) => setProductSearch(event.target.value)}
                        placeholder="Search visa products"
                        className="pl-9"
                        aria-label="Search visa products"
                      />
                    </div>

                    <select
                      value={productDestination}
                      onChange={(event) => setProductDestination(event.target.value)}
                      className={selectClass}
                      aria-label="Filter products by destination"
                    >
                      <option value="">All destinations</option>
                      {(allDestinations ?? []).map((destination) => (
                        <option key={destination._id} value={destination._id}>
                          {destination.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={productCategory}
                      onChange={(event) => setProductCategory(event.target.value)}
                      className={selectClass}
                      aria-label="Filter products by category"
                    >
                      <option value="">All categories</option>
                      {VISA_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {titleCase(category)}
                        </option>
                      ))}
                    </select>

                    <select
                      value={productPublished}
                      onChange={(event) =>
                        setProductPublished(
                          event.target.value as "" | "true" | "false",
                        )
                      }
                      className={selectClass}
                      aria-label="Filter products by status"
                    >
                      <option value="">All statuses</option>
                      <option value="true">Published</option>
                      <option value="false">Draft</option>
                    </select>

                    {productFiltersActive && (
                      <Button variant="ghost" size="sm" onClick={resetProductFilters}>
                        <X className="size-3.5" aria-hidden />
                        Clear
                      </Button>
                    )}
                  </>
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
