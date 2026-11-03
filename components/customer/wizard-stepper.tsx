"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  id: number;
  label: string;
  description?: string;
}

export function WizardStepper({
  steps,
  current,
  onSelect,
  disabled,
  /** Furthest step reached, so going back does not lock the way forward. */
  maxReached,
}: {
  steps: WizardStep[];
  current: number;
  onSelect?: (id: number) => void;
  disabled?: boolean;
  maxReached?: number;
}) {
  const reachable = Math.max(maxReached ?? current, current);
  const progress = ((current - 1) / (steps.length - 1)) * 100;

  return (
    <div className="space-y-3">
      {/* Mobile: single-line progress */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="font-medium">
            Step {current} of {steps.length}
          </p>
          <p className="text-muted-foreground">{steps[current - 1]?.label}</p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-strong">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(6, progress)}%` }}
          />
        </div>
      </div>

      {/* Desktop: numbered rail */}
      <ol
        className="hidden items-start gap-0 lg:flex"
        aria-label="Application steps"
      >
        {steps.map((step, index) => {
          const active = step.id === current;
          // A step the visitor has already been through stays ticked even
          // after they jump back to an earlier one — otherwise going back to
          // edit step 1 makes three finished steps look undone.
          const done = !active && step.id < reachable;
          const isLast = index === steps.length - 1;
          return (
            <li
              key={step.id}
              className={cn("flex flex-1 flex-col", !isLast && "pr-3")}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={disabled || step.id > reachable}
                  onClick={() => onSelect?.(step.id)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "group flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-all",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : done
                        ? "border-success bg-success text-success-foreground"
                        : "border-border bg-card text-muted-foreground",
                    onSelect && step.id <= reachable && "cursor-pointer hover:scale-105",
                  )}
                >
                  {done ? <Check className="size-4" aria-hidden /> : step.id}
                </button>
                {!isLast && (
                  <div className="relative h-px flex-1 bg-border">
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 bg-primary transition-[width] duration-300",
                        step.id < reachable ? "w-full" : "w-0",
                      )}
                    />
                  </div>
                )}
              </div>
              <div className="mt-2.5 pr-6">
                <p
                  className={cn(
                    "text-sm font-medium",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </p>
                {step.description && (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
