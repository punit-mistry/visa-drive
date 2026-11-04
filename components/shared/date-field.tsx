"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import type { Matcher } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import { useCurrentYear } from "@/hooks/use-current-date";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Date picker over the wizard's `yyyy-MM-dd` string state.
 *
 * Dates in this product are epoch milliseconds at rest, but the draft forms
 * keep the ISO day string so a half-typed date never becomes a timestamp.
 * This control reads and writes that same string, which means it can replace
 * a native `<input type="date">` without touching any save path.
 */

/** Only ever used for the dropdown range during prerender, before the real
 *  year arrives on hydration. The range is ±decades wide, so being a year out
 *  for one frame changes nothing a user can see. */
const FALLBACK_YEAR = 2026;

function parseISODay(value?: string): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toISODay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const DISPLAY = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function DateField({
  value,
  onChange,
  placeholder = "Select a date",
  id,
  disabled,
  className,
  /** Year range offered by the month/year dropdowns. */
  fromYear,
  toYear,
  /** Disable every day before this one (inclusive of the day itself). */
  minDate,
  maxDate,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  fromYear?: number;
  toYear?: number;
  minDate?: Date;
  maxDate?: Date;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = parseISODay(value);
  // Not `new Date()`: this control now also renders on prerendered marketing
  // pages, and reading the clock during render bakes the build date into the
  // HTML — which Next rejects outright as an unstable value. The hook keeps
  // the server snapshot empty and reads the clock after hydration.
  const liveYear = useCurrentYear();
  const thisYear = liveYear ?? FALLBACK_YEAR;

  const startMonth = new Date(fromYear ?? thisYear - 90, 0, 1);
  const endMonth = new Date(toYear ?? thisYear + 10, 11, 31);

  const matcher = React.useMemo<Matcher[] | undefined>(() => {
    const rules: Matcher[] = [];
    if (minDate) rules.push({ before: minDate });
    if (maxDate) rules.push({ after: maxDate });
    return rules.length > 0 ? rules : undefined;
  }, [minDate, maxDate]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="dialog"
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
          <span className={cn("truncate", !selected && "text-[#98a2b3]")}>
            {selected ? DISPLAY.format(selected) : placeholder}
          </span>
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? (maxDate && maxDate < new Date() ? maxDate : undefined)}
          captionLayout="dropdown"
          startMonth={startMonth}
          endMonth={endMonth}
          disabled={matcher}
          onSelect={(date) => {
            if (!date) return;
            onChange(toISODay(date));
            setOpen(false);
          }}
          autoFocus
        />
        {selected && (
          <div className="flex justify-end border-t border-border p-2">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-brand"
            >
              Clear
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
