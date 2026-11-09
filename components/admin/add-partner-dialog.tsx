"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Field } from "@/components/shared/form-field";
import {
  EMPTY_PARTNER_BUSINESS,
  PartnerBusinessForm,
  toPartnerBusinessArgs,
  usePartnerBusinessValidation,
  type PartnerBusinessValue,
} from "@/components/partner/partner-business-form";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useValidation, type FieldErrors } from "@/hooks/use-validation";
import { PERMISSIONS } from "@/lib/constants/roles";
import { MAX_MARKUP_PERCENT } from "@/lib/constants/partners";
import { friendlyError } from "@/lib/helpers/error-messages";

/**
 * Register a partner from the CRM — for the agency that phoned in rather than
 * filling the form themselves.
 *
 * "Approve immediately" is only offered to an operator who actually holds
 * `partner:approve`; without it the record is filed as pending, which is also
 * what Convex enforces regardless of what this dialog submits.
 */
export function AddPartnerDialog({ trigger }: { trigger?: ReactNode }) {
  const router = useRouter();
  const { can } = useCurrentUser();
  const canApprove = can(PERMISSIONS.PARTNER_APPROVE);
  const createByAdmin = useMutation(api.partners.createByAdmin);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState<PartnerBusinessValue>(EMPTY_PARTNER_BUSINESS);
  const [approveNow, setApproveNow] = useState(false);
  const [markup, setMarkup] = useState("0");

  const business = usePartnerBusinessValidation(value, "add-partner");
  const markupPercent = Number.parseFloat(markup);
  const validateMarkup = useCallback((): FieldErrors => {
    const bad =
      markup.trim() !== "" &&
      (!Number.isFinite(markupPercent) ||
        markupPercent < 0 ||
        markupPercent > MAX_MARKUP_PERCENT);
    return bad
      ? {
          "add-partner-markup": `Enter a markup between 0 and ${MAX_MARKUP_PERCENT}%.`,
        }
      : {};
  }, [markup, markupPercent]);
  const markupCheck = useValidation(validateMarkup);

  function reset() {
    setValue(EMPTY_PARTNER_BUSINESS);
    business.reset();
    markupCheck.reset();
    setApproveNow(false);
    setMarkup("0");
  }

  async function submit() {
    if (!business.check()) {
      toast.error("Check the highlighted fields.");
      return;
    }
    if (!markupCheck.check()) return;

    setBusy(true);
    try {
      const result = await createByAdmin({
        ...toPartnerBusinessArgs(value),
        approveNow: canApprove ? approveNow : undefined,
        defaultMarkupPercent: Number.isFinite(markupPercent) ? markupPercent : 0,
      });

      toast.success(`${value.agencyName} registered as ${result.partnerCode}.`, {
        description: result.createdLogin
          ? "A partner login was created for the contact email. They sign in with that address."
          : "The existing account at that email is now the partner login.",
      });

      setOpen(false);
      reset();
      router.push(`/admin/partners/${result.partnerId}`);
    } catch (error) {
      const message =
        friendlyError(error, "Could not register the partner.");
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="size-4" aria-hidden />
            Add partner
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Register a B2B partner</DialogTitle>
          <DialogDescription>
            The contact email becomes their partner portal sign-in. If that
            address already has a VisaDrive account, it is reused rather than
            duplicated.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <PartnerBusinessForm
            value={value}
            onChange={setValue}
            errors={business.errors}
            disabled={busy}
            idPrefix="add-partner"
          />

          <Separator className="my-6" />

          <div className="space-y-5">
            <Field
              label="Default markup"
              htmlFor="add-partner-markup"
              error={markupCheck.errors["add-partner-markup"]}
              hint="Applied to every service that has no price of its own. You can set per-service prices later."
            >
              <div className="flex items-center gap-2">
                <Input
                  id="add-partner-markup"
                  aria-invalid={markupCheck.errors["add-partner-markup"] ? true : undefined}
                  aria-describedby={
                    markupCheck.errors["add-partner-markup"]
                      ? "add-partner-markup-error"
                      : undefined
                  }
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={MAX_MARKUP_PERCENT}
                  step="0.5"
                  value={markup}
                  onChange={(e) => setMarkup(e.target.value)}
                  disabled={busy}
                  className="w-32 tabular-nums"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </Field>

            {canApprove && (
              <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3">
                <Checkbox
                  id="add-partner-approve"
                  checked={approveNow}
                  onCheckedChange={(checked) => setApproveNow(checked === true)}
                  disabled={busy}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <Label
                    htmlFor="add-partner-approve"
                    className="text-[13px] font-medium"
                  >
                    Approve immediately
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Grants the partner role straight away and emails them that
                    their account is live. Leave this off to verify their
                    documents first.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {busy ? "Registering…" : "Register partner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
