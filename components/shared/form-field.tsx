"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Form primitives shared by the booking wizard, the portal and the CRM.
 *
 * `FormSection` gives a long form a readable spine — a short title, one line
 * of context, then the fields — so a twenty-field traveller form reads as
 * three small groups instead of one wall. `Field` owns the label/hint/error
 * triplet so every input in the product has the same anatomy and the same
 * required marker.
 */

export function FormSection({
  title,
  description,
  icon: Icon,
  aside,
  required,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  aside?: React.ReactNode;
  /** Marks the whole group as required, e.g. an address block. */
  required?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {Icon && (
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground">
              <Icon className="size-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              {title}
              {required && (
                <span className="ml-0.5 text-destructive" aria-label="required">
                  *
                </span>
              )}
            </h3>
            {description && (
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** Standard two-column field grid. Collapses to one column on phones. */
export function FieldGrid({
  children,
  className,
  columns = 2,
}: {
  children: React.ReactNode;
  className?: string;
  columns?: 1 | 2 | 3;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-4 gap-y-5",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  required,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** Pass when the control sets its own id; otherwise one is generated. */
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const generated = React.useId();
  const id = htmlFor ?? generated;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  // Clone a single element child so the label, the error wiring and the
  // invalid state attach without every call site repeating them.
  // Wire the control only when it is plainly the labelled one: no explicit
  // `htmlFor`, or a child that carries that very id. A wrapper div around an
  // input is left alone, and a describedby the child already has is kept.
  const child = React.isValidElement(children)
    ? (children as React.ReactElement<Record<string, unknown>>)
    : null;
  const isControl =
    child !== null &&
    child.type !== React.Fragment &&
    (!htmlFor || child.props.id === htmlFor);
  const control = isControl
    ? React.cloneElement(child, {
        ...(htmlFor ? {} : { id }),
        ...(describedBy
          ? {
              "aria-describedby": [child.props["aria-describedby"], describedBy]
                .filter(Boolean)
                .join(" "),
            }
          : {}),
        ...(error ? { "aria-invalid": true } : {}),
      })
    : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-[13px] font-medium text-foreground">
        {label}
        {required && (
          <span className="text-destructive" aria-label="required">
            *
          </span>
        )}
      </Label>
      {control}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Inline error for controls that are not wrapped in `Field` (a bare select,
 *  a checkbox row). Point the control's `aria-describedby` at `${id}-error`. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}
