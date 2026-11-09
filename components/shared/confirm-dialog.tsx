"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Confirmation for anything destructive or hard to reverse.
 *
 * `requireReason` turns it into a reason-capture dialog — used for rejecting
 * a document or suspending a customer, where the reason is shown to the
 * customer and stored on the audit trail, so it must not be optional.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  requireReason = false,
  reasonLabel = "Reason",
  reasonPlaceholder = "Explain why — this is shown to the customer.",
  onConfirm,
  open,
  onOpenChange,
}: {
  trigger?: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason?: string) => void | Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [touched, setTouched] = useState(false);

  const reasonInvalid = requireReason && reason.trim().length < 3;

  async function handleConfirm(event: React.MouseEvent) {
    // Keep the dialog open while the mutation runs so the spinner is visible
    // and a slow network cannot be mistaken for a no-op.
    event.preventDefault();
    setTouched(true);
    if (reasonInvalid) {
      document.getElementById("confirm-reason")?.focus();
      return;
    }

    try {
      setPending(true);
      await onConfirm(requireReason ? reason.trim() : undefined);
      setReason("");
      setTouched(false);
      onOpenChange?.(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground">{description}</div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {requireReason && (
          <div className="space-y-2">
            <Label htmlFor="confirm-reason">{reasonLabel}</Label>
            <Textarea
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={reasonPlaceholder}
              rows={3}
              aria-invalid={touched && reasonInvalid}
              aria-describedby={
                touched && reasonInvalid ? "confirm-reason-error" : undefined
              }
            />
            {touched && reasonInvalid && (
              <p id="confirm-reason-error" role="alert" className="text-xs text-destructive">
                Please give a reason of at least 3 characters.
              </p>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className={cn(
              destructive &&
                "bg-destructive text-destructive-foreground hover:bg-brand-deep",
            )}
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
