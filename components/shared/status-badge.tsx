import { cn } from "@/lib/utils";
import {
  APPLICATION_STATUS_CONFIG,
  CONVERSATION_STATUS_CONFIG,
  DOCUMENT_STATUS_CONFIG,
  LEAD_STATUS_CONFIG,
  PAYMENT_STATUS_CONFIG,
  TONE_CLASSES,
  TONE_DOT_CLASSES,
  type ApplicationStatus,
  type ConversationStatusValue,
  type DocumentStatusValue,
  type LeadStatusValue,
  type PaymentStatusValue,
  type StatusTone,
} from "@/lib/constants/statuses";

/**
 * One badge component for every status vocabulary in the product, so a status
 * reads identically in the customer portal and the admin CRM.
 *
 * Pass `audience="customer"` to get the softened customer-facing wording
 * ("Action needed from you" rather than "Additional Documents Requested").
 */

interface BaseProps {
  className?: string;
  size?: "sm" | "md";
  withDot?: boolean;
}

function Badge({
  label,
  tone,
  className,
  size = "md",
  withDot = true,
}: BaseProps & { label: string; tone: StatusTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {withDot && (
        <span
          className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT_CLASSES[tone])}
          aria-hidden
        />
      )}
      {label}
    </span>
  );
}

export function ApplicationStatusBadge({
  status,
  audience = "staff",
  ...rest
}: BaseProps & { status: ApplicationStatus; audience?: "staff" | "customer" }) {
  const config = APPLICATION_STATUS_CONFIG[status];
  if (!config) return <Badge label={status} tone="neutral" {...rest} />;

  return (
    <Badge
      label={audience === "customer" ? config.customerLabel : config.label}
      tone={config.tone}
      {...rest}
    />
  );
}

export function PaymentStatusBadge({
  status,
  ...rest
}: BaseProps & { status: PaymentStatusValue }) {
  const config = PAYMENT_STATUS_CONFIG[status];
  if (!config) return <Badge label={status} tone="neutral" {...rest} />;
  return <Badge label={config.label} tone={config.tone} {...rest} />;
}

export function DocumentStatusBadge({
  status,
  ...rest
}: BaseProps & { status: DocumentStatusValue }) {
  const config = DOCUMENT_STATUS_CONFIG[status];
  if (!config) return <Badge label={status} tone="neutral" {...rest} />;
  return <Badge label={config.label} tone={config.tone} {...rest} />;
}

export function LeadStatusBadge({
  status,
  ...rest
}: BaseProps & { status: LeadStatusValue }) {
  const config = LEAD_STATUS_CONFIG[status];
  if (!config) return <Badge label={status} tone="neutral" {...rest} />;
  return <Badge label={config.label} tone={config.tone} {...rest} />;
}

export function ConversationStatusBadge({
  status,
  ...rest
}: BaseProps & { status: ConversationStatusValue }) {
  const config = CONVERSATION_STATUS_CONFIG[status];
  if (!config) return <Badge label={status} tone="neutral" {...rest} />;
  return <Badge label={config.label} tone={config.tone} {...rest} />;
}

/** Escape hatch for one-off labels that still need to match the system. */
export function ToneBadge(props: BaseProps & { label: string; tone: StatusTone }) {
  return <Badge {...props} />;
}

/* --------------------------- payment records -----------------------------
 * Payment rows have two extra lifecycle states (`created`, `cancelled`) that
 * application-level payment statuses do not. A separate badge keeps both
 * vocabularies honest instead of widening the application union.
 */

export const PAYMENT_RECORD_STATUSES = [
  "created",
  "pending",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
  "cancelled",
] as const;

export type PaymentRecordStatusValue = (typeof PAYMENT_RECORD_STATUSES)[number];

const PAYMENT_RECORD_STATUS_CONFIG: Record<
  PaymentRecordStatusValue,
  { label: string; tone: StatusTone }
> = {
  created: { label: "Created", tone: "neutral" },
  pending: { label: "Pending", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  refunded: { label: "Refunded", tone: "neutral" },
  partially_refunded: { label: "Partially Refunded", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function PaymentRecordStatusBadge({
  status,
  ...rest
}: BaseProps & { status: PaymentRecordStatusValue }) {
  const config = PAYMENT_RECORD_STATUS_CONFIG[status];
  if (!config) return <Badge label={status} tone="neutral" {...rest} />;
  return <Badge label={config.label} tone={config.tone} {...rest} />;
}

/**
 * Marks catalogue content that has not been verified against an official
 * source yet. Used wherever a seeded fee or processing time is shown.
 */
export function DemoContentBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-warning/25 bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning",
        className,
      )}
      title="These figures are demonstration content and have not been verified against an official source."
    >
      <span className="size-1.5 rounded-full bg-warning" aria-hidden />
      Sample data
    </span>
  );
}
