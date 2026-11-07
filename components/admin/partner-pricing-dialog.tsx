"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/form-field";
import { formatMoney, parseMoney } from "@/lib/helpers/pricing";
import { computePartnerPricing } from "@/lib/helpers/partner-pricing";
import {
  MAX_MARKUP_PERCENT,
  PARTNER_PRICING_MODES,
  PARTNER_PRICING_MODE_HINTS,
  PARTNER_PRICING_MODE_LABELS,
  type PartnerPricingMode,
} from "@/lib/constants/partners";

/**
 * Set one partner's price for one visa service.
 *
 * The live preview is computed with the *same* `computePartnerPricing` the
 * server uses, so what an admin sees before saving is what a booking will
 * charge afterwards. It is still only a preview: `partnerPricing.setRule`
 * recomputes from the catalogue row and stores the rule, never this number.
 */

export interface PricingTarget {
  visaProductId: Id<"visaProducts">;
  productName: string;
  destinationName: string;
  currency: string;
  /** The live catalogue figures, for the preview. */
  product: {
    currency: string;
    governmentFee: number;
    serviceFee: number;
    additionalCharges: number;
    taxPercent: number;
    promoPrice?: number;
    promoEndsAt?: number;
  };
  existing: {
    mode: PartnerPricingMode;
    value: number;
    note?: string;
  } | null;
}

export function PartnerPricingDialog({
  partnerId,
  target,
  onOpenChange,
}: {
  partnerId: Id<"partners">;
  /** `null` closes the dialog. */
  target: PricingTarget | null;
  onOpenChange: (target: PricingTarget | null) => void;
}) {
  const setRule = useMutation(api.partnerPricing.setRule);
  const clearRule = useMutation(api.partnerPricing.clearRule);

  const [mode, setMode] = useState<PartnerPricingMode>("markup_percent");
  const [raw, setRaw] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Load the existing rule into the form during render, keyed on which
  // product the dialog is open for. An effect would re-run on every reactive
  // re-read and throw away what the admin has just typed.
  const targetKey = target?.visaProductId ?? null;
  if (targetKey !== loadedFor) {
    setLoadedFor(targetKey);
    const existing = target?.existing ?? null;
    setMode(existing?.mode ?? "markup_percent");
    setRaw(
      existing
        ? existing.mode === "markup_percent"
          ? String(existing.value)
          : String(existing.value / 100)
        : "",
    );
    setNote(existing?.note ?? "");
  }

  if (!target) {
    return (
      <Dialog open={false} onOpenChange={() => onOpenChange(null)}>
        <DialogContent />
      </Dialog>
    );
  }

  const numeric =
    mode === "markup_percent"
      ? Number.parseFloat(raw)
      : (parseMoney(raw) ?? Number.NaN);

  const valid = Number.isFinite(numeric) && numeric >= 0;

  const preview = valid
    ? computePartnerPricing(target.product, 1, { mode, value: numeric })
    : computePartnerPricing(target.product, 1, null);

  async function save() {
    if (!valid) {
      toast.error("Enter a positive number.");
      return;
    }
    if (mode === "markup_percent" && numeric > MAX_MARKUP_PERCENT) {
      toast.error(`A markup cannot exceed ${MAX_MARKUP_PERCENT}%.`);
      return;
    }

    setBusy(true);
    try {
      const result = await setRule({
        partnerId,
        visaProductId: target!.visaProductId,
        mode,
        value: numeric,
        note: note.trim() || undefined,
      });
      toast.success(`${target!.productName} priced at ${formatMoney(
        result.partnerPrice,
        result.currency,
      )} per traveller.`, {
        description: `Margin ${formatMoney(result.marginAmount, result.currency)} (${result.marginPercent.toFixed(1)}%).`,
      });
      onOpenChange(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the price.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await clearRule({ partnerId, visaProductId: target!.visaProductId });
      toast.success(`${target!.productName} is back on this partner's default rate.`);
      onOpenChange(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not clear the price.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onOpenChange(null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{target.productName}</DialogTitle>
          <DialogDescription>
            {target.destinationName} · set what this partner sells it for.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <Field label="Pricing method" htmlFor="pricing-mode" hint={PARTNER_PRICING_MODE_HINTS[mode]}>
            <select
              id="pricing-mode"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as PartnerPricingMode);
                setRaw("");
              }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand"
              disabled={busy}
            >
              {PARTNER_PRICING_MODES.map((value) => (
                <option key={value} value={value}>
                  {PARTNER_PRICING_MODE_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={mode === "markup_percent" ? "Markup" : "Amount per traveller"}
            htmlFor="pricing-value"
            required
          >
            <div className="flex items-center gap-2">
              {mode !== "markup_percent" && (
                <span className="text-sm text-muted-foreground">₹</span>
              )}
              <Input
                id="pricing-value"
                inputMode="decimal"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={mode === "markup_percent" ? "12.5" : "800"}
                className="w-40 tabular-nums"
                disabled={busy}
              />
              {mode === "markup_percent" && (
                <span className="text-sm text-muted-foreground">%</span>
              )}
            </div>
          </Field>

          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Per traveller
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Base price</dt>
                <dd className="font-medium tabular-nums">
                  {formatMoney(preview.basePrice, target.currency)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Partner price</dt>
                <dd className="font-semibold tabular-nums">
                  {formatMoney(preview.partnerPrice, target.currency)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
                <dt className="text-muted-foreground">Partner margin</dt>
                <dd className="font-semibold tabular-nums text-success">
                  {formatMoney(preview.marginAmount, target.currency)}
                  {preview.marginPercent > 0 && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {preview.marginPercent.toFixed(1)}%
                    </span>
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Figures include tax on the uplift. Multi-traveller bookings
              multiply the per-traveller fee, so the margin scales with the
              party size.
            </p>
          </div>

          <Field label="Note" htmlFor="pricing-note" hint="Internal. Why this rate was agreed.">
            <Textarea
              id="pricing-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Agreed on the 2026 volume contract."
              disabled={busy}
            />
          </Field>
        </div>

        <DialogFooter className="sm:justify-between">
          {target.existing ? (
            <Button variant="ghost" onClick={clear} disabled={busy}>
              Use default rate
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !valid}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save price
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
