"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Globe } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { COUNTRIES, PRIORITY_ORIGIN_CODES, type Country } from "@/lib/constants/countries";
import { cn } from "@/lib/utils";

/**
 * Searchable country picker with flags.
 *
 * The backend stores these fields as plain strings (a nationality, a passport
 * issuing country, a departure country), so the component speaks names by
 * default and round-trips any value already in the database — including one
 * typed before this control existed, which is shown verbatim rather than
 * silently cleared.
 */

const PRIORITY = new Set(PRIORITY_ORIGIN_CODES);

const SUGGESTED: Country[] = PRIORITY_ORIGIN_CODES.map((code) =>
  COUNTRIES.find((country) => country.code === code),
).filter((country): country is Country => Boolean(country));

const REST: Country[] = COUNTRIES.filter((country) => !PRIORITY.has(country.code));

function findCountry(value: string | undefined): Country | undefined {
  if (!value) return undefined;
  const needle = value.trim().toLowerCase();
  if (!needle) return undefined;
  return COUNTRIES.find(
    (country) =>
      country.name.toLowerCase() === needle || country.code.toLowerCase() === needle,
  );
}

export function CountrySelect({
  value,
  onChange,
  placeholder = "Select a country",
  id,
  disabled,
  className,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = findCountry(value);
  const freeText = !selected && value?.trim() ? value.trim() : undefined;

  function pick(country: Country) {
    onChange(country.name);
    setOpen(false);
  }

  const renderItem = (country: Country) => (
    <CommandItem
      key={country.code}
      value={`${country.name} ${country.code}`}
      onSelect={() => pick(country)}
      className="gap-2.5"
    >
      <span className="text-base leading-none" aria-hidden>
        {country.flag}
      </span>
      <span className="flex-1 truncate">{country.name}</span>
      {selected?.code === country.code && (
        <Check className="size-4 text-primary" aria-hidden />
      )}
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-describedby={describedBy}
          data-invalid={invalid ? "" : undefined}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none",
            "hover:border-border-strong focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20",
            "data-[invalid]:border-destructive data-[invalid]:ring-destructive/20",
            "disabled:pointer-events-none disabled:bg-surface disabled:opacity-70",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected ? (
              <>
                <span className="text-base leading-none" aria-hidden>
                  {selected.flag}
                </span>
                <span className="truncate">{selected.name}</span>
              </>
            ) : freeText ? (
              <>
                <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{freeText}</span>
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search countries…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No country matches that search.</CommandEmpty>
            <CommandGroup heading="Frequently selected">
              {SUGGESTED.map(renderItem)}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="All countries">{REST.map(renderItem)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
