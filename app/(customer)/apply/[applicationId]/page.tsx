"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Loader2,
  Plus,
  Save,
  Send,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/page-header";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { DetailSkeleton, ErrorState } from "@/components/shared/states";
import { DocumentStatusBadge } from "@/components/shared/status-badge";
import { useDocumentUpload } from "@/hooks/use-document-upload";
import { formatBytes } from "@/lib/constants/documents";
import { formatMoney } from "@/lib/helpers/pricing";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Trip details" },
  { id: 2, label: "Travellers" },
  { id: 3, label: "Documents" },
  { id: 4, label: "Review & submit" },
];

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function toDateInput(ms?: number): string {
  if (!ms) return "";
  const date = new Date(ms);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function fromDateInput(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(parsed) ? parsed : undefined;
}

interface IncompleteDetails {
  code: "INCOMPLETE_APPLICATION";
  problems?: string[];
  applicants?: Array<{ name: string; missingFields: string[] }>;
  documents?: Array<{ label: string; applicantName?: string }>;
}

function readIncomplete(error: unknown): IncompleteDetails | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.code !== "INCOMPLETE_APPLICATION") return null;
  return record as unknown as IncompleteDetails;
}

type DraftData = FunctionReturnType<typeof api.applications.getDraft>;

export default function DraftWizardPage() {
  const applicationId = param(useParams().applicationId) as Id<"applications">;
  const router = useRouter();
  const draft = useQuery(api.applications.getDraft, { applicationId });

  if (draft === undefined) return <DetailSkeleton />;
  if (draft === null) {
    return (
      <ErrorState
        title="Draft not found"
        description="This application does not exist or you do not have access to it."
      />
    );
  }

  if (!draft.application.isDraft) {
    return (
      <ErrorState
        title="This application has already been submitted"
        description="You can view its status and documents from your applications page."
        className=""
        onRetry={() => router.push(`/dashboard/applications/${applicationId}`)}
      />
    );
  }

  return (
    <DraftWizard
      key={draft.application._id}
      applicationId={applicationId}
      draft={draft}
    />
  );
}

function DraftWizard({
  applicationId,
  draft,
}: {
  applicationId: Id<"applications">;
  draft: DraftData;
}) {
  const router = useRouter();
  const checklist = useQuery(api.documents.listByApplication, { applicationId });
  const saveStep = useMutation(api.applications.saveDraftStep);
  const submit = useMutation(api.applications.submit);
  const app = draft.application;

  const [step, setStep] = useState(() =>
    Math.max(1, Math.min(app.currentStep ?? 1, 4)),
  );
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [incomplete, setIncomplete] = useState<IncompleteDetails | null>(null);

  const [trip, setTrip] = useState(() => ({
    travellerCount: app.travellerCount,
    departureCountry: app.departureCountry ?? "",
    travelPurpose: app.travelPurpose ?? "",
    intendedArrivalDate: toDateInput(app.intendedArrivalDate),
    intendedDepartureDate: toDateInput(app.intendedDepartureDate),
    previousTravelHistory: app.previousTravelHistory ?? "",
    hasPreviousVisaRejection: app.hasPreviousVisaRejection ?? false,
    previousVisaRejectionNote: app.previousVisaRejectionNote ?? "",
    customerPhone: app.customerPhone ?? "",
  }));
  const [termsAccepted, setTermsAccepted] = useState(app.termsAcceptedAt !== undefined);

  const requiredFields = useMemo(
    () => new Set(draft.product?.requiredApplicantFields ?? []),
    [draft.product?.requiredApplicantFields],
  );

  async function saveTripDetails(nextStep: number) {
    setSaving(true);
    try {
      await saveStep({
        applicationId,
        step: nextStep,
        patch: {
          travellerCount: trip.travellerCount,
          departureCountry: trip.departureCountry.trim() || undefined,
          travelPurpose: trip.travelPurpose.trim() || undefined,
          intendedArrivalDate: fromDateInput(trip.intendedArrivalDate),
          intendedDepartureDate: fromDateInput(trip.intendedDepartureDate),
          previousTravelHistory: trip.previousTravelHistory.trim() || undefined,
          hasPreviousVisaRejection: trip.hasPreviousVisaRejection,
          previousVisaRejectionNote: trip.previousVisaRejectionNote.trim() || undefined,
          customerPhone: trip.customerPhone.trim() || undefined,
        },
      });
      setStep(nextStep);
      toast.success("Progress saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your progress.");
    } finally {
      setSaving(false);
    }
  }

  async function goToStep(nextStep: number) {
    setSaving(true);
    try {
      await saveStep({ applicationId, step: nextStep, patch: {} });
      setStep(nextStep);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your progress.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!termsAccepted) {
      toast.error("Please accept the terms and conditions first.");
      return;
    }
    setSubmitting(true);
    setIncomplete(null);
    try {
      const result = await submit({ applicationId, acceptTerms: true });
      toast.success(`Application ${result.referenceId} submitted.`);
      if (result.requiresPayment) {
        router.push(`/checkout/${applicationId}`);
      } else {
        router.push(`/dashboard/applications/${applicationId}`);
      }
    } catch (error) {
      const details = readIncomplete(error);
      if (details) {
        setIncomplete(details);
        if ((details.documents?.length ?? 0) > 0) setStep(3);
        else if ((details.applicants?.length ?? 0) > 0) setStep(2);
        else setStep(1);
        toast.error("A few things still need your attention.");
      } else {
        toast.error(error instanceof Error ? error.message : "Could not submit the application.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Complete your application`}
        description={`${app.referenceId} · ${app.visaProductName} · ${app.destinationName}`}
        breadcrumbs={[
          { label: "Applications", href: "/dashboard/applications" },
          { label: "Draft" },
        ]}
        actions={
          <Button asChild variant="outline">
            <Link href="/dashboard/applications">
              <ArrowLeft className="size-4" aria-hidden />
              Save and exit
            </Link>
          </Button>
        }
      />

      <ol className="flex flex-wrap gap-2" aria-label="Application steps">
        {STEPS.map((item) => {
          const active = item.id === step;
          const done = item.id < step;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => goToStep(item.id)}
                disabled={saving}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors focus-brand",
                  active
                    ? "border-brand bg-brand-tint text-brand-deep"
                    : done
                      ? "border-success/30 bg-success-soft text-success"
                      : "border-border bg-card text-muted-foreground hover:bg-surface",
                )}
              >
                <span className="flex size-4 items-center justify-center rounded-full text-[10px] font-semibold">
                  {done ? <Check className="size-3" aria-hidden /> : item.id}
                </span>
                {item.label}
              </button>
            </li>
          );
        })}
      </ol>

      {incomplete && (
        <div className="rounded-xl border border-brand/25 bg-brand-tint p-4 text-sm">
          <p className="font-medium text-brand-deep">This application is not complete yet</p>
          {incomplete.problems && incomplete.problems.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1 text-brand-deep">
              {incomplete.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          {incomplete.applicants && incomplete.applicants.length > 0 && (
            <div className="mt-2 text-brand-deep">
              <p className="font-medium">Missing traveller details:</p>
              <ul className="mt-1 list-inside list-disc space-y-1">
                {incomplete.applicants.map((applicant) => (
                  <li key={applicant.name}>
                    {applicant.name}: {applicant.missingFields.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {incomplete.documents && incomplete.documents.length > 0 && (
            <div className="mt-2 text-brand-deep">
              <p className="font-medium">Missing documents:</p>
              <ul className="mt-1 list-inside list-disc space-y-1">
                {incomplete.documents.map((document) => (
                  <li key={`${document.label}-${document.applicantName ?? ""}`}>
                    {document.label}
                    {document.applicantName ? ` — ${document.applicantName}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Trip details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="travellerCount">Number of travellers</Label>
                <Input
                  id="travellerCount"
                  type="number"
                  min={1}
                  max={20}
                  value={trip.travellerCount}
                  onChange={(event) =>
                    setTrip((current) => ({
                      ...current,
                      travellerCount: Math.max(1, Math.min(20, Number(event.target.value) || 1)),
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Add each traveller in the next step. The price updates with this count.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="departureCountry">Departure country</Label>
                <Input
                  id="departureCountry"
                  value={trip.departureCountry}
                  onChange={(event) =>
                    setTrip((current) => ({ ...current, departureCountry: event.target.value }))
                  }
                  placeholder="India"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="travelPurpose">Purpose of travel</Label>
                <Input
                  id="travelPurpose"
                  value={trip.travelPurpose}
                  onChange={(event) =>
                    setTrip((current) => ({ ...current, travelPurpose: event.target.value }))
                  }
                  placeholder="Tourism, business, visiting family…"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customerPhone">Contact phone</Label>
                <Input
                  id="customerPhone"
                  value={trip.customerPhone}
                  onChange={(event) =>
                    setTrip((current) => ({ ...current, customerPhone: event.target.value }))
                  }
                  placeholder="+91 98765 43210"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="arrivalDate">Intended arrival</Label>
                <Input
                  id="arrivalDate"
                  type="date"
                  value={trip.intendedArrivalDate}
                  onChange={(event) =>
                    setTrip((current) => ({ ...current, intendedArrivalDate: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="departureDate">Intended departure</Label>
                <Input
                  id="departureDate"
                  type="date"
                  value={trip.intendedDepartureDate}
                  onChange={(event) =>
                    setTrip((current) => ({ ...current, intendedDepartureDate: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="travelHistory">Previous travel history</Label>
              <Textarea
                id="travelHistory"
                rows={3}
                value={trip.previousTravelHistory}
                onChange={(event) =>
                  setTrip((current) => ({ ...current, previousTravelHistory: event.target.value }))
                }
                placeholder="Countries visited in the last five years, if any."
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="rejected"
                  checked={trip.hasPreviousVisaRejection}
                  onCheckedChange={(value) =>
                    setTrip((current) => ({ ...current, hasPreviousVisaRejection: value === true }))
                  }
                />
                <div>
                  <Label htmlFor="rejected">I have had a visa refused before</Label>
                  <p className="text-xs text-muted-foreground">
                    Declaring it now avoids delays later.
                  </p>
                </div>
              </div>
              {trip.hasPreviousVisaRejection && (
                <Textarea
                  rows={2}
                  value={trip.previousVisaRejectionNote}
                  onChange={(event) =>
                    setTrip((current) => ({
                      ...current,
                      previousVisaRejectionNote: event.target.value,
                    }))
                  }
                  placeholder="Which country, when, and why?"
                />
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={() => saveTripDetails(2)} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
                Save and continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <TravellersStep
          applicationId={applicationId}
          applicants={draft.applicants}
          travellerCount={trip.travellerCount}
          requiredFields={requiredFields}
          onContinue={() => goToStep(3)}
        />
      )}

      {step === 3 && (
        <DocumentsStep
          applicationId={applicationId}
          checklist={checklist}
          canUpload={checklist?.canUpload ?? true}
          onContinue={() => goToStep(4)}
        />
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Review and submit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Summary label="Visa service" value={app.visaProductName} />
              <Summary label="Destination" value={app.destinationName} />
              <Summary label="Travellers" value={String(trip.travellerCount)} />
              <Summary
                label="Travel dates"
                value={
                  trip.intendedArrivalDate || trip.intendedDepartureDate
                    ? `${trip.intendedArrivalDate || "—"} to ${trip.intendedDepartureDate || "—"}`
                    : "Not provided"
                }
              />
              <Summary label="Travellers added" value={String(draft.applicants.length)} />
              <Summary
                label="Documents uploaded"
                value={String(checklist?.counts.uploaded ?? draft.documents.length)}
              />
            </div>

            <Separator />

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estimated total</span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatMoney(app.pricing.total, app.pricing.currency)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                The final amount is re-checked against the catalogue when you submit. Payment is
                handled separately.
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
              <Checkbox
                id="terms"
                checked={termsAccepted}
                onCheckedChange={(value) => setTermsAccepted(value === true)}
              />
              <div>
                <Label htmlFor="terms">I accept the terms and conditions</Label>
                <p className="text-xs text-muted-foreground">
                  You confirm the information provided is accurate and authorise VisaDrive to
                  process this application.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" onClick={() => goToStep(3)} disabled={saving || submitting}>
                <ArrowLeft className="size-4" aria-hidden />
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || !termsAccepted}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="size-4" aria-hidden />
                )}
                Submit application
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/*                              travellers step                              */
/* ------------------------------------------------------------------------- */

interface ApplicantDraft {
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  maritalStatus: string;
  occupation: string;
  email: string;
  phone: string;
  passportNumber: string;
  passportIssueDate: string;
  passportExpiryDate: string;
  passportIssuingCountry: string;
  passportIssuingAuthority: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

const EMPTY_APPLICANT: ApplicantDraft = {
  firstName: "",
  middleName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  nationality: "",
  maritalStatus: "",
  occupation: "",
  email: "",
  phone: "",
  passportNumber: "",
  passportIssueDate: "",
  passportExpiryDate: "",
  passportIssuingCountry: "",
  passportIssuingAuthority: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
};

function applicantToDraft(applicant: Doc<"applicants">): ApplicantDraft {
  return {
    firstName: applicant.firstName,
    middleName: applicant.middleName ?? "",
    lastName: applicant.lastName,
    dateOfBirth: toDateInput(applicant.dateOfBirth),
    gender: applicant.gender ?? "",
    nationality: applicant.nationality ?? "",
    maritalStatus: applicant.maritalStatus ?? "",
    occupation: applicant.occupation ?? "",
    email: applicant.email ?? "",
    phone: applicant.phone ?? "",
    passportNumber: applicant.passportNumber ?? "",
    passportIssueDate: toDateInput(applicant.passportIssueDate),
    passportExpiryDate: toDateInput(applicant.passportExpiryDate),
    passportIssuingCountry: applicant.passportIssuingCountry ?? "",
    passportIssuingAuthority: applicant.passportIssuingAuthority ?? "",
    line1: applicant.address?.line1 ?? "",
    line2: applicant.address?.line2 ?? "",
    city: applicant.address?.city ?? "",
    state: applicant.address?.state ?? "",
    postalCode: applicant.address?.postalCode ?? "",
    country: applicant.address?.country ?? "India",
  };
}

function TravellersStep({
  applicationId,
  applicants,
  travellerCount,
  requiredFields,
  onContinue,
}: {
  applicationId: Id<"applications">;
  applicants: Doc<"applicants">[];
  travellerCount: number;
  requiredFields: Set<string>;
  onContinue: () => void;
}) {
  const [adding, setAdding] = useState(false);

  const canAdd = applicants.length < travellerCount;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" aria-hidden />
            Travellers
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            {applicants.length} of {travellerCount} added
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          {applicants.length === 0 && !adding && (
            <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Add at least one traveller to continue.
              </p>
            </div>
          )}

          {applicants.map((applicant) => (
            <ApplicantForm
              key={applicant._id}
              applicationId={applicationId}
              applicant={applicant}
              requiredFields={requiredFields}
            />
          ))}

          {adding && (
            <ApplicantForm
              applicationId={applicationId}
              requiredFields={requiredFields}
              onSaved={() => setAdding(false)}
              onCancel={() => setAdding(false)}
            />
          )}

          {!adding && canAdd && (
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden />
              Add traveller
            </Button>
          )}

          {applicants.length < travellerCount && !adding && (
            <p className="text-xs text-muted-foreground">
              You selected {travellerCount} travellers. Add {travellerCount - applicants.length} more
              before submitting.
            </p>
          )}

          <Separator />

          <div className="flex justify-end">
            <Button onClick={onContinue}>
              Save and continue
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ApplicantForm({
  applicationId,
  applicant,
  requiredFields,
  onSaved,
  onCancel,
}: {
  applicationId: Id<"applications">;
  applicant?: Doc<"applicants">;
  requiredFields: Set<string>;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const upsert = useMutation(api.applicants.upsert);
  const [values, setValues] = useState<ApplicantDraft>(
    applicant ? applicantToDraft(applicant) : EMPTY_APPLICANT,
  );
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ApplicantDraft>(key: K, value: ApplicantDraft[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await upsert({
        applicationId,
        applicantId: applicant?._id,
        data: {
          firstName: values.firstName.trim(),
          middleName: values.middleName.trim() || undefined,
          lastName: values.lastName.trim(),
          dateOfBirth: fromDateInput(values.dateOfBirth),
          gender:
            values.gender === "male" ||
            values.gender === "female" ||
            values.gender === "other" ||
            values.gender === "prefer_not_to_say"
              ? values.gender
              : undefined,
          nationality: values.nationality.trim() || undefined,
          maritalStatus: values.maritalStatus.trim() || undefined,
          occupation: values.occupation.trim() || undefined,
          email: values.email.trim() || undefined,
          phone: values.phone.trim() || undefined,
          address: values.line1.trim()
            ? {
                line1: values.line1.trim(),
                line2: values.line2.trim() || undefined,
                city: values.city.trim(),
                state: values.state.trim() || undefined,
                postalCode: values.postalCode.trim() || undefined,
                country: values.country.trim() || "India",
              }
            : undefined,
          passportNumber: values.passportNumber.trim() || undefined,
          passportIssueDate: fromDateInput(values.passportIssueDate),
          passportExpiryDate: fromDateInput(values.passportExpiryDate),
          passportIssuingCountry: values.passportIssuingCountry.trim() || undefined,
          passportIssuingAuthority: values.passportIssuingAuthority.trim() || undefined,
        },
      });
      toast.success(applicant ? "Traveller updated." : "Traveller added.");
      onSaved?.();
      if (!applicant) setValues(EMPTY_APPLICANT);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this traveller.");
    } finally {
      setSaving(false);
    }
  }

  const isRequired = (key: string) => requiredFields.has(key);

  return (
    <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {applicant
            ? `${applicant.firstName} ${applicant.lastName}`.trim()
            : "New traveller"}
        </p>
        {applicant?.isPrimary && (
          <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-medium text-brand-deep">
            Primary
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required={isRequired("firstName")}>
          <Input value={values.firstName} onChange={(e) => set("firstName", e.target.value)} required />
        </Field>
        <Field label="Last name" required={isRequired("lastName")}>
          <Input value={values.lastName} onChange={(e) => set("lastName", e.target.value)} required />
        </Field>
        <Field label="Middle name">
          <Input value={values.middleName} onChange={(e) => set("middleName", e.target.value)} />
        </Field>
        <Field label="Date of birth" required={isRequired("dateOfBirth")}>
          <Input type="date" value={values.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
        </Field>
        <Field label="Gender" required={isRequired("gender")}>
          <select
            value={values.gender}
            onChange={(e) => set("gender", e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </Field>
        <Field label="Nationality" required={isRequired("nationality")}>
          <Input value={values.nationality} onChange={(e) => set("nationality", e.target.value)} />
        </Field>
        <Field label="Marital status" required={isRequired("maritalStatus")}>
          <Input value={values.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value)} />
        </Field>
        <Field label="Occupation" required={isRequired("occupation")}>
          <Input value={values.occupation} onChange={(e) => set("occupation", e.target.value)} />
        </Field>
        <Field label="Email" required={isRequired("email")}>
          <Input type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Phone" required={isRequired("phone")}>
          <Input value={values.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
      </div>

      <Separator />

      <p className="text-sm font-medium">Passport</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Passport number" required={isRequired("passportNumber")}>
          <Input value={values.passportNumber} onChange={(e) => set("passportNumber", e.target.value)} />
        </Field>
        <Field label="Issuing country" required={isRequired("passportIssuingCountry")}>
          <Input
            value={values.passportIssuingCountry}
            onChange={(e) => set("passportIssuingCountry", e.target.value)}
          />
        </Field>
        <Field label="Issue date" required={isRequired("passportIssueDate")}>
          <Input
            type="date"
            value={values.passportIssueDate}
            onChange={(e) => set("passportIssueDate", e.target.value)}
          />
        </Field>
        <Field label="Expiry date" required={isRequired("passportExpiryDate")}>
          <Input
            type="date"
            value={values.passportExpiryDate}
            onChange={(e) => set("passportExpiryDate", e.target.value)}
          />
        </Field>
        <Field label="Issuing authority">
          <Input
            value={values.passportIssuingAuthority}
            onChange={(e) => set("passportIssuingAuthority", e.target.value)}
          />
        </Field>
      </div>

      <Separator />

      <p className="text-sm font-medium">
        Address {isRequired("address") && <span className="text-brand">*</span>}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Address line 1">
          <Input value={values.line1} onChange={(e) => set("line1", e.target.value)} />
        </Field>
        <Field label="Address line 2">
          <Input value={values.line2} onChange={(e) => set("line2", e.target.value)} />
        </Field>
        <Field label="City">
          <Input value={values.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field label="State">
          <Input value={values.state} onChange={(e) => set("state", e.target.value)} />
        </Field>
        <Field label="Postal code">
          <Input value={values.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
        </Field>
        <Field label="Country">
          <Input value={values.country} onChange={(e) => set("country", e.target.value)} />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          {applicant ? "Save traveller" : "Add traveller"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label} {required && <span className="text-brand">*</span>}
      </Label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/*                              documents step                               */
/* ------------------------------------------------------------------------- */

type Checklist = FunctionReturnType<typeof api.documents.listByApplication>;

function DocumentsStep({
  applicationId,
  checklist,
  canUpload,
  onContinue,
}: {
  applicationId: Id<"applications">;
  checklist: Checklist | undefined;
  canUpload: boolean;
  onContinue: () => void;
}) {
  const uploader = useDocumentUpload({ applicationId });

  if (checklist === undefined) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Loading your document checklist…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4" aria-hidden />
          Documents
        </CardTitle>
        <span className="text-sm text-muted-foreground">
          {checklist.counts.uploaded} uploaded · {checklist.counts.required} required
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {checklist.checklist.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This visa service has no document checklist. You can continue.
          </p>
        ) : (
          checklist.checklist.map((item) => (
            <div
              key={`${item.documentKey}-${item.applicantId ?? "general"}`}
              className="rounded-xl border border-border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {item.label}
                    {item.isMandatory && <span className="ml-1 text-brand">*</span>}
                  </p>
                  {item.applicantName && (
                    <p className="text-xs text-muted-foreground">{item.applicantName}</p>
                  )}
                  {item.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                  )}
                </div>
                {item.document ? (
                  <DocumentStatusBadge status={item.document.status} />
                ) : (
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    Not uploaded
                  </span>
                )}
              </div>

              {item.document && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.document.fileName} · {formatBytes(item.document.size)}
                  {item.document.reviewNote ? ` · ${item.document.reviewNote}` : ""}
                </p>
              )}

              {canUpload && (
                <FileDropzone
                  className="mt-3"
                  compact
                  uploads={uploader.uploads.filter((upload) => upload.id.startsWith(`${item.documentKey}:`))}
                  onRemove={uploader.removeUpload}
                  disabled={uploader.isUploading}
                  allowedMimeTypes={item.allowedMimeTypes}
                  maxSizeBytes={item.maxSizeBytes}
                  label={`Upload ${item.label}`}
                  onFiles={(files) => {
                    const file = files[0];
                    if (!file) return;
                    void uploader.upload(file, {
                      documentKey: item.documentKey,
                      label: item.label,
                      constraints: {
                        allowedMimeTypes: item.allowedMimeTypes,
                        maxSizeBytes: item.maxSizeBytes,
                      },
                    });
                  }}
                />
              )}
            </div>
          ))
        )}

        {!canUpload && (
          <p className="rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-sm text-warning">
            This application is no longer accepting uploads. Contact the VisaDrive team if you need
            to send a document.
          </p>
        )}

        <Separator />

        <div className="flex justify-end">
          <Button onClick={onContinue}>
            Save and continue
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
