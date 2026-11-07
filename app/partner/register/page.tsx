"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, BadgeCheck, Loader2, ShieldCheck, Tags } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { PartnerDocumentUploader } from "@/components/partner/partner-document-uploader";
import {
  PartnerBusinessForm,
  toPartnerBusinessArgs,
  usePartnerBusinessState,
  validatePartnerBusiness,
  type PartnerBusinessErrors,
} from "@/components/partner/partner-business-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { PartnerStatusBadge } from "@/components/shared/status-badge";
import { ListSkeleton } from "@/components/shared/states";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import type { PartnerBusinessType, PartnerStatus } from "@/lib/constants/partners";

/**
 * Register an agency as a VisaDrive partner — and, once registered, the place
 * to correct the application and add the verification paperwork.
 *
 * It is one page rather than two because the submitted form is the thing a
 * waiting applicant wants to look at: what did I send, what is missing, what
 * is the hold-up. A separate read-only "status" screen would make them click
 * twice to answer the same question.
 */
export default function PartnerRegisterPage() {
  const profile = useQuery(api.partners.myProfile, {});
  const register = useMutation(api.partners.register);
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
    partner?._id ?? "new",
  );

  const [errors, setErrors] = useState<PartnerBusinessErrors>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useUnsavedChanges(dirty);

  const isApproved = partner?.status === "approved";
  const alreadyRegistered = partner !== null;

  async function submit() {
    const found = validatePartnerBusiness(value);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Check the highlighted fields.");
      return;
    }

    setBusy(true);
    try {
      const args = toPartnerBusinessArgs(value);

      if (alreadyRegistered) {
        const result = await updateMyProfile(args);
        setDirty(false);
        toast.success("Your details are saved.", {
          description: result.returnedToReview
            ? "Because the business identity changed, the account is back with our team for a quick re-check."
            : undefined,
        });
      } else {
        const result = await register(args);
        setDirty(false);
        toast.success(`Registered as ${result.partnerCode}.`, {
          description:
            "Our team will review your application. Adding your documents below speeds it up.",
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save your details.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (profile === undefined) return <ListSkeleton rows={6} />;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title={alreadyRegistered ? "Your partner application" : "Become a partner"}
        description={
          alreadyRegistered
            ? "Keep your business details current and add any paperwork we still need."
            : "Register your agency to book visas for your customers at partner rates."
        }
      >
        {partner && (
          <div className="flex flex-wrap items-center gap-3">
            <PartnerStatusBadge status={partner.status as PartnerStatus} />
            <span className="font-mono text-xs text-muted-foreground">
              {partner.partnerCode}
            </span>
          </div>
        )}
      </PageHeader>

      {!alreadyRegistered && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Benefit
            icon={Tags}
            title="Your own margin"
            body="VisaDrive sets your rate; whatever you charge above it is yours."
          />
          <Benefit
            icon={BadgeCheck}
            title="One place for everything"
            body="Your customers, your bookings and every application's status."
          />
          <Benefit
            icon={ShieldCheck}
            title="We handle the filing"
            body="Documents, appointments and embassy liaison stay with our team."
          />
        </div>
      )}

      {partner?.statusReason && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            From the VisaDrive team
          </p>
          <p className="mt-1 text-sm leading-relaxed">{partner.statusReason}</p>
        </div>
      )}

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
            idPrefix="register"
          />

          <Separator className="my-6" />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              By registering you confirm you are authorised to act for this
              business. See our{" "}
              <Link
                href="/terms"
                className="rounded-sm font-medium text-brand transition-colors hover:text-brand-deep focus-brand"
              >
                terms
              </Link>
              .
            </p>
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {alreadyRegistered ? "Save details" : "Submit application"}
              {!alreadyRegistered && !busy && (
                <ArrowRight className="size-4" aria-hidden />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {alreadyRegistered && (
        <section>
          <SectionHeader
            title="Verification documents"
            description="Business registration is required; the rest speed up our checks."
          />
          <PartnerDocumentUploader />
        </section>
      )}

      {isApproved && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/25 bg-success-soft p-4">
          <p className="text-sm text-success">
            Your account is approved and ready to use.
          </p>
          <Button asChild size="sm">
            <Link href="/partner/dashboard">
              Open the portal
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function Benefit({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Tags;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Icon className="size-4 text-brand" aria-hidden />
      <p className="mt-2.5 text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
