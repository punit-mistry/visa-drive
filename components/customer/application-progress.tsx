"use client";

import { Check, CircleAlert, CircleSlash, Loader2 } from "lucide-react";

import {
  APPLICATION_STATUS_CONFIG,
  type ApplicationStatus,
} from "@/lib/constants/statuses";
import { cn } from "@/lib/utils";

/**
 * Where an application has got to, in one glance.
 *
 * Only the four milestones a customer actually recognises are drawn — the
 * fourteen internal statuses collapse onto them. `timelineOrder` on each
 * status config decides which milestone a status falls under, so adding a
 * status to the backend never silently breaks this strip.
 *
 * Statuses that sit off the timeline entirely (cancelled, on hold) and
 * refusal are shown as their own state instead of being forced onto a track
 * that would imply progress that is not happening.
 */

const MILESTONES = [
  { label: "Submitted", upTo: 1 },
  { label: "Documents", upTo: 3 },
  { label: "In review", upTo: 8 },
  { label: "Decision", upTo: 10 },
];

export function ApplicationProgress({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  const config = APPLICATION_STATUS_CONFIG[status];
  const order = config.timelineOrder;

  const halted =
    status === "cancelled" || status === "on_hold" || status === "rejected";

  if (halted || order === null) {
    const tone =
      status === "rejected"
        ? "danger"
        : status === "on_hold"
          ? "warning"
          : "neutral";
    const Icon = status === "on_hold" ? CircleAlert : CircleSlash;

    return (
      <div
        className={cn(
          "flex items-start gap-3 rounded-2xl border p-5",
          tone === "danger" && "border-destructive/25 bg-destructive/5",
          tone === "warning" && "border-warning/30 bg-warning-soft",
          tone === "neutral" && "border-border bg-surface",
          className,
        )}
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full bg-background",
            tone === "danger" && "text-destructive",
            tone === "warning" && "text-warning",
            tone === "neutral" && "text-muted-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{config.customerLabel}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
            {config.description}
          </p>
        </div>
      </div>
    );
  }

  // The index of the milestone the application is currently sitting in.
  const currentIndex = MILESTONES.findIndex((milestone) => order <= milestone.upTo);
  const activeIndex = currentIndex === -1 ? MILESTONES.length - 1 : currentIndex;
  const complete = status === "completed";
  const needsCustomer =
    status === "documents_pending" || status === "additional_documents_requested";

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{config.customerLabel}</p>
        <p className="text-xs text-muted-foreground">
          Step {activeIndex + 1} of {MILESTONES.length}
        </p>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {config.description}
      </p>

      <ol className="mt-5 flex items-start gap-0" aria-label="Application progress">
        {MILESTONES.map((milestone, index) => {
          const done = complete || index < activeIndex;
          const active = !complete && index === activeIndex;
          const isLast = index === MILESTONES.length - 1;

          return (
            <li key={milestone.label} className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-2">
                <span
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors",
                    done && "border-success bg-success text-success-foreground",
                    active &&
                      (needsCustomer
                        ? "border-warning bg-warning text-warning-foreground"
                        : "border-primary bg-primary text-primary-foreground"),
                    !done && !active && "border-border bg-card text-muted-foreground",
                  )}
                >
                  {done ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : active && !needsCustomer ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    index + 1
                  )}
                </span>
                {!isLast && (
                  <span
                    aria-hidden
                    className={cn(
                      "h-px flex-1 transition-colors",
                      done ? "bg-success" : "bg-border",
                    )}
                  />
                )}
              </div>
              <p
                className={cn(
                  "mt-2 truncate pr-2 text-xs",
                  done || active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {milestone.label}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
