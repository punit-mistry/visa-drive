import { Check, Circle, Dot } from "lucide-react";

import {
  APPLICATION_STATUS_CONFIG,
  TIMELINE_STAGES,
  TONE_DOT_CLASSES,
  type ApplicationStatus,
} from "@/lib/constants/statuses";
import { formatDateTime } from "@/lib/helpers/format";
import { cn } from "@/lib/utils";

export interface TimelineEntry {
  _id: string;
  toStatus: ApplicationStatus;
  fromStatus?: ApplicationStatus;
  note?: string;
  changedByName: string;
  createdAt: number;
  visibleToCustomer: boolean;
}

/**
 * Application progress.
 *
 * Deliberately shows two things at once:
 *  - the *expected* stages, so a customer can see what is still ahead, and
 *  - the *actual* recorded history, which is the truth.
 *
 * Stages a given application never passes through (an e-Visa has no
 * appointment, a DS-160 filling service has no embassy processing) are hidden
 * rather than shown as permanently incomplete, because a greyed-out step the
 * application will never reach reads as a stall.
 */
export function StatusTimeline({
  currentStatus,
  history,
  audience = "customer",
  skipStages = [],
  className,
}: {
  currentStatus: ApplicationStatus;
  history: TimelineEntry[];
  audience?: "customer" | "staff";
  /** Stages that do not apply to this visa product. */
  skipStages?: ApplicationStatus[];
  className?: string;
}) {
  const visible = history
    .filter((entry) => audience === "staff" || entry.visibleToCustomer)
    .sort((a, b) => a.createdAt - b.createdAt);

  const reachedAt = new Map<ApplicationStatus, TimelineEntry>();
  for (const entry of visible) {
    if (!reachedAt.has(entry.toStatus)) reachedAt.set(entry.toStatus, entry);
  }

  const currentOrder = APPLICATION_STATUS_CONFIG[currentStatus]?.timelineOrder;
  const stages = TIMELINE_STAGES.filter((s) => !skipStages.includes(s));

  const isTerminalAside =
    currentOrder === null &&
    (currentStatus === "cancelled" || currentStatus === "on_hold");

  return (
    <div className={cn("space-y-1", className)}>
      {isTerminalAside && (
        <div className="mb-4 rounded-lg border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-warning">
          This application is currently{" "}
          <span className="font-medium">
            {APPLICATION_STATUS_CONFIG[currentStatus].customerLabel.toLowerCase()}
          </span>
          . {APPLICATION_STATUS_CONFIG[currentStatus].description}
        </div>
      )}

      <ol className="relative">
        {stages.map((stage, index) => {
          const config = APPLICATION_STATUS_CONFIG[stage];
          const entry = reachedAt.get(stage);
          const stageOrder = config.timelineOrder ?? 0;

          const isDone =
            !!entry || (currentOrder !== null && stageOrder < currentOrder);
          const isCurrent = stage === currentStatus;
          const isLast = index === stages.length - 1;

          return (
            <li key={stage} className="relative flex gap-4 pb-6 last:pb-0">
              {!isLast && (
                <span
                  className={cn(
                    "absolute left-[11px] top-6 h-[calc(100%-18px)] w-px",
                    isDone ? "bg-success/40" : "bg-border",
                  )}
                  aria-hidden
                />
              )}

              <span
                className={cn(
                  "relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 bg-background",
                  isCurrent
                    ? "border-brand"
                    : isDone
                      ? "border-success bg-success"
                      : "border-border",
                )}
              >
                {isDone && !isCurrent ? (
                  <Check className="size-3 text-white" strokeWidth={3} aria-hidden />
                ) : isCurrent ? (
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      TONE_DOT_CLASSES[config.tone],
                    )}
                    aria-hidden
                  />
                ) : (
                  <Circle className="size-2 text-border" aria-hidden />
                )}
              </span>

              <div className="min-w-0 flex-1 pt-0.5">
                <p
                  className={cn(
                    "text-sm font-medium",
                    isCurrent
                      ? "text-foreground"
                      : isDone
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {audience === "customer" ? config.customerLabel : config.label}
                  {isCurrent && (
                    <span className="ml-2 rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-medium text-brand-deep">
                      Current
                    </span>
                  )}
                </p>

                {entry ? (
                  <>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDateTime(entry.createdAt)}
                      {audience === "staff" && ` · ${entry.changedByName}`}
                    </p>
                    {entry.note && (
                      <p className="mt-1.5 rounded-lg bg-surface px-3 py-2 text-sm text-muted-foreground">
                        {entry.note}
                      </p>
                    )}
                  </>
                ) : (
                  !isDone && (
                    <p className="mt-0.5 text-xs text-muted-foreground/70">
                      {config.description}
                    </p>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Dense version for the admin workspace side panel — every recorded change,
 * including internal ones, newest first.
 */
export function ActivityTimeline({
  history,
  className,
}: {
  history: TimelineEntry[];
  className?: string;
}) {
  const sorted = [...history].sort((a, b) => b.createdAt - a.createdAt);

  if (sorted.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        No activity recorded yet.
      </p>
    );
  }

  return (
    <ol className={cn("space-y-3", className)}>
      {sorted.map((entry) => {
        const config = APPLICATION_STATUS_CONFIG[entry.toStatus];
        return (
          <li key={entry._id} className="flex gap-3">
            <span className="mt-1.5 flex size-4 shrink-0 items-center justify-center">
              <Dot
                className={cn("size-5", config ? "text-foreground" : "text-muted-foreground")}
                aria-hidden
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{entry.changedByName}</span>
                {" set status to "}
                <span className="font-medium">{config?.label ?? entry.toStatus}</span>
                {!entry.visibleToCustomer && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Internal
                  </span>
                )}
              </p>
              {entry.note && (
                <p className="mt-1 text-sm text-muted-foreground">{entry.note}</p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(entry.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
