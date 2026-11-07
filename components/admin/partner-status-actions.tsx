"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  BadgeCheck,
  Loader2,
  PauseCircle,
  PlayCircle,
  SearchCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/lib/constants/roles";
import {
  PARTNER_STATUS_CONFIG,
  canTransitionPartner,
  type PartnerStatus,
} from "@/lib/constants/partners";

/**
 * The approve / reject / suspend controls on a partner's profile.
 *
 * Only the transitions `PARTNER_TRANSITIONS` actually allows are rendered, so
 * the row never offers a move that would be refused — and the two that are
 * hard to undo (reject, suspend) go through the reason-capture dialog,
 * because that reason is shown to the partner and kept on the audit trail.
 */

interface Action {
  to: PartnerStatus;
  label: string;
  icon: LucideIcon;
  variant: "default" | "outline" | "destructive";
  requireReason: boolean;
  confirmTitle: string;
  confirmDescription: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
}

const ACTIONS: Action[] = [
  {
    to: "approved",
    label: "Approve",
    icon: BadgeCheck,
    variant: "default",
    requireReason: false,
    confirmTitle: "Approve this partner?",
    confirmDescription:
      "They get the partner role, the portal opens for them, and they are emailed that their account is live.",
  },
  {
    to: "under_review",
    label: "Move to review",
    icon: SearchCheck,
    variant: "outline",
    requireReason: false,
    confirmTitle: "Move this registration into review?",
    confirmDescription:
      "Marks the account as being verified. The partner is not notified of this step.",
  },
  {
    to: "rejected",
    label: "Reject",
    icon: XCircle,
    variant: "destructive",
    requireReason: true,
    confirmTitle: "Reject this partner application?",
    confirmDescription:
      "They are emailed the reason you give below and can correct their details and re-apply.",
    reasonLabel: "Reason for rejection",
    reasonPlaceholder: "Explain why — the partner is shown this text.",
  },
  {
    to: "suspended",
    label: "Suspend",
    icon: PauseCircle,
    variant: "destructive",
    requireReason: true,
    confirmTitle: "Suspend this partner?",
    confirmDescription:
      "New bookings stop immediately. Applications already in progress carry on as normal.",
    reasonLabel: "Reason for suspension",
    reasonPlaceholder: "Explain why — the partner is shown this text.",
  },
];

/** Reactivating is the same transition as approving, worded for the case. */
const REACTIVATE: Action = {
  to: "approved",
  label: "Reactivate",
  icon: PlayCircle,
  variant: "default",
  requireReason: false,
  confirmTitle: "Reactivate this partner?",
  confirmDescription: "They can create bookings again straight away.",
};

export function PartnerStatusActions({
  partnerId,
  status,
  agencyName,
}: {
  partnerId: Id<"partners">;
  status: PartnerStatus;
  agencyName: string;
}) {
  const { can } = useCurrentUser();
  const setStatus = useMutation(api.partners.setStatus);
  const [pending, setPending] = useState<PartnerStatus | null>(null);

  if (!can(PERMISSIONS.PARTNER_APPROVE)) return null;

  const available = (status === "suspended" ? [REACTIVATE, ...ACTIONS] : ACTIONS)
    .filter((action) => canTransitionPartner(status, action.to))
    // "Reactivate" and "Approve" are the same transition; keep whichever
    // reads correctly for the state we are actually in.
    .filter((action) =>
      status === "suspended"
        ? action.label !== "Approve"
        : action.label !== "Reactivate",
    );

  if (available.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No status change is available from{" "}
        {PARTNER_STATUS_CONFIG[status].label.toLowerCase()}.
      </p>
    );
  }

  async function run(action: Action, reason?: string) {
    setPending(action.to);
    try {
      await setStatus({
        partnerId,
        status: action.to,
        reason: reason?.trim() || undefined,
      });
      toast.success(
        `${agencyName} is now ${PARTNER_STATUS_CONFIG[action.to].label.toLowerCase()}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update the partner.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {available.map((action) => {
        const Icon = action.icon;
        const busy = pending === action.to;

        return (
          <ConfirmDialog
            key={`${action.to}-${action.label}`}
            title={action.confirmTitle}
            description={action.confirmDescription}
            confirmLabel={action.label}
            destructive={action.variant === "destructive"}
            requireReason={action.requireReason}
            reasonLabel={action.reasonLabel}
            reasonPlaceholder={action.reasonPlaceholder}
            onConfirm={(reason) => run(action, reason)}
            trigger={
              <Button
                variant={action.variant}
                size="sm"
                disabled={pending !== null}
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Icon className="size-3.5" aria-hidden />
                )}
                {action.label}
              </Button>
            }
          />
        );
      })}
    </div>
  );
}
