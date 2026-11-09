"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Tags, Wallet } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { PartnerDocumentUploader } from "@/components/partner/partner-document-uploader";
import {
  PartnerBusinessForm,
  toPartnerBusinessArgs,
  usePartnerBusinessState,
  usePartnerBusinessValidation,
} from "@/components/partner/partner-business-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { PartnerStatusBadge } from "@/components/shared/status-badge";
import { ListSkeleton } from "@/components/shared/states";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { formatDate } from "@/lib/helpers/format";
import { formatMoney } from "@/lib/helpers/pricing";
import {
  PARTNER_BUSINESS_TYPE_LABELS,
  type PartnerBusinessType,
  type PartnerStatus,
} from "@/lib/constants/partners";
import { friendlyError } from "@/lib/helpers/error-messages";

export default function PartnerProfilePage() {
  const profile = useQuery(api.partners.myProfile, {});
  const updateMyProfile = useMutation(api.partners.updateMyProfile);

  const partner = profile?.partner ?? null;

  const [value, setValue] = usePartnerBusinessState(
    partner
      ? {
          agencyName: partner.agencyName,
          businessType: partner.businessType as PartnerBusinessType,
          gstNumber: partner.gstNumber ?? "",
          panNumber: partner.panNumber ?? "",
          website: partner.website ?? "",
          addressLine1: partner.addressLine1,
          addressLine2: partner.addressLine2 ?? "",
          city: partner.city,
          state: partner.state ?? "",
          postalCode: partner.postalCode ?? "",
          country: partner.country,
          contactPersonName: partner.contactPersonName,
          contactEmail: partner.contactEmail,
          contactPhone: partner.contactPhone,
          alternatePhone: partner.alternatePhone ?? "",
        }
      : null,
    partner?._id ?? null,
  );

  const { errors, check } = usePartnerBusinessValidation(value, "profile");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useUnsavedChanges(dirty);

  if (profile === undefined) return <ListSkeleton rows={6} />;
  if (!partner) return null;

  async function save() {
    if (!check()) {
      toast.error("Check the highlighted fields.");
      return;
    }

    setBusy(true);
    try {
      const result = await updateMyProfile(toPartnerBusinessArgs(value));
      setDirty(false);
      toast.success("Your details are saved.", {
        description: result.returnedToReview
          ? "Because the business name, type or GSTIN changed, your account is back with our team for a quick re-check. Existing bookings are unaffected."
          : undefined,
      });
    } catch (error) {
      toast.error(
        friendlyError(error, "Could not save your details."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Profile"
        description="Your agency's details, pricing and verification documents."
      >
        <div className="flex flex-wrap items-center gap-3">
          <PartnerStatusBadge status={partner.status as PartnerStatus} />
          <span className="font-mono text-xs text-muted-foreground">
            {partner.partnerCode}
          </span>
          <span className="text-xs text-muted-foreground">
            {PARTNER_BUSINESS_TYPE_LABELS[
              partner.businessType as PartnerBusinessType
            ] ?? partner.businessType}
            {partner.approvedAt
              ? ` · partner since ${formatDate(partner.approvedAt)}`
              : ""}
          </span>
        </div>
      </PageHeader>

      <StatGrid columns={3}>
        <StatCard
          label="Bookings placed"
          value={partner.bookingCount}
          icon={Tags}
          href="/partner/bookings"
        />
        <StatCard
          label="Business volume"
          value={formatMoney(partner.grossVolume, "INR")}
          icon={Wallet}
        />
        <StatCard
          label="Margin earned"
          value={formatMoney(partner.grossMargin, "INR")}
          icon={Wallet}
        />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your rate</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {partner.defaultMarkupPercent > 0 ? (
                <>
                  Your account markup is{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {partner.defaultMarkupPercent}%
                  </span>{" "}
                  on services without a specific price. VisaDrive sets these —
                  talk to your account manager to change them.
                </>
              ) : (
                <>
                  You trade at VisaDrive&apos;s base prices unless a service has
                  a specific rate. VisaDrive sets these — talk to your account
                  manager to change them.
                </>
              )}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/partner/pricing">View price list</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business details</CardTitle>
        </CardHeader>
        <CardContent>
          <PartnerBusinessForm
            value={value}
            onChange={(next) => {
              setValue(next);
              setDirty(true);
            }}
            errors={errors}
            disabled={busy}
            idPrefix="profile"
          />

          <Separator className="my-6" />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Changing the business name, type or GSTIN sends the account for a
              quick re-check. Bookings already in progress carry on as normal.
            </p>
            <Button onClick={save} disabled={busy || !dirty}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <section>
        <SectionHeader
          title="Verification documents"
          description={`${profile?.verifiedDocumentCount ?? 0} of ${
            profile?.documentCount ?? 0
          } verified.`}
        />
        <PartnerDocumentUploader />
      </section>
    </div>
  );
}
