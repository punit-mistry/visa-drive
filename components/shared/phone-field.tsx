"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { COUNTRIES, PRIORITY_ORIGIN_CODES, type Country } from "@/lib/constants/countries";
import { cn } from "@/lib/utils";

/**
 * Phone input with a dial-code picker.
 *
 * The value stays one string ("+91 98765 43210") because that is what the
 * backend, the WhatsApp templates and the CRM all already read. The picker
 * only decides the prefix; it never reformats what the customer typed.
 */

const DIALLABLE: Country[] = COUNTRIES.filter((country) => Boolean(country.dial));

const PRIORITY = new Set<string>(PRIORITY_ORIGIN_CODES);
const ORDERED = [
  ...DIALLABLE.filter((country) => PRIORITY.has(country.code)),
  ...DIALLABLE.filter((country) => !PRIORITY.has(country.code)),
];

const DEFAULT_DIAL = "+91";

/** Split a stored value into its dial code and the rest of the number. */
function split(value: string): { dial: string; rest: string } {
  const trimmed = value.trim();
  if (!trimmed.startsWith("+")) {
    return { dial: DEFAULT_DIAL, rest: trimmed };
  }
  // Longest dial code wins, so +1 never swallows +971.
  const match = ORDERED.map((country) => country.dial!)
    .filter((dial) => trimmed.startsWith(dial))
    .sort((a, b) => b.length - a.length)[0];
  if (!match) return { dial: DEFAULT_DIAL, rest: trimmed };
  return { dial: match, rest: trimmed.slice(match.length).trim() };
}

export function PhoneField({
  value = "",
  onChange,
  id,
  disabled,
  placeholder = "98765 43210",
  className,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  value?: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const { dial, rest } = split(value);

  const flag =
    ORDERED.find((country) => country.dial === dial)?.flag ?? "🌐";

  function compose(nextDial: string, nextRest: string) {
    const body = nextRest.trim();
    onChange(body ? `${nextDial} ${body}` : "");
  }

  return (
    <div
      className={cn(
        "flex h-10 w-full items-stretch rounded-lg border border-input bg-card shadow-xs transition-[color,box-shadow,border-color]",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20",
        invalid && "border-destructive ring-destructive/20",
        disabled && "pointer-events-none bg-surface opacity-70",
        className,
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Dialling code, currently ${dial}`}
            className="flex shrink-0 items-center gap-1.5 rounded-l-lg border-r border-border px-2.5 text-sm transition-colors hover:bg-surface focus-visible:outline-none focus-visible:bg-surface"
          >
            <span className="text-base leading-none" aria-hidden>
              {flag}
            </span>
            <span className="tabular-nums text-muted-foreground">{dial}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(18rem,calc(100vw-2rem))] p-0">
          <Command
            filter={(itemValue, search) =>
              itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder="Search country or code…" />
            <CommandList className="max-h-64">
              <CommandEmpty>No match.</CommandEmpty>
              <CommandGroup>
                {ORDERED.map((country) => (
                  <CommandItem
                    key={country.code}
                    value={`${country.name} ${country.dial}`}
                    onSelect={() => {
                      compose(country.dial!, rest);
                      setOpen(false);
                    }}
                    className="gap-2.5"
                  >
                    <span className="text-base leading-none" aria-hidden>
                      {country.flag}
                    </span>
                    <span className="flex-1 truncate">{country.name}</span>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {country.dial}
                    </span>
                    {country.dial === dial && (
                      <Check className="size-4 text-primary" aria-hidden />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        disabled={disabled}
        placeholder={placeholder}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        value={rest}
        onChange={(event) => compose(dial, event.target.value)}
        className="min-w-0 flex-1 rounded-r-lg bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground md:text-sm"
      />
    </div>
  );
}
