"use client";

import { useMemo, useState } from "react";
import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarRange,
  Check,
  CheckCircle2,
  CreditCard,
  FileText,
  History,
  Loader2,
  MapPin,
  Plane,
  Plus,
  Printer,
  Save,
  Send,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { WizardStepper } from "@/components/customer/wizard-stepper";
import { BookingSummary } from "@/components/customer/booking-summary";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { Field, FieldGrid, FormSection } from "@/components/shared/form-field";
import { CountrySelect } from "@/components/shared/country-select";
import { DateField } from "@/components/shared/date-field";
import { PhoneField } from "@/components/shared/phone-field";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DetailSkeleton, ErrorState } from "@/components/shared/states";
import { DocumentStatusBadge } from "@/components/shared/status-badge";
import { useDocumentUpload } from "@/hooks/use-document-upload";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { formatBytes } from "@/lib/constants/documents";
import { TRAVEL_PURPOSES } from "@/lib/constants/countries";
import { computePricing, formatMoney } from "@/lib/helpers/pricing";
import type { PriceBreakdown } from "@/lib/helpers/pricing";
import { formatDate } from "@/lib/helpers/format";
import { cn } from "@/lib/utils";

/**
 * The booking wizard.
 *
 * Four steps, one decision each, with the price and the chosen service pinned
 * to the side of the page the whole way through. Everything the customer
 * types stays in local state until a step boundary, where one mutation writes
 * it — so a half-typed passport number never reaches the database, and a
 * refresh never silently drops a filled-in step.
 */

const STEPS = [
  { id: 1, label: "Trip details", description: "Where and when you travel" },
  { id: 2, label: "Travellers", description: "Passport and contact details" },
  { id: 3, label: "Documents", description: "Uploads against the checklist" },
  { id: 4, label: "Review & submit", description: "Confirm before sending" },
];

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const MARITAL_STATUSES = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
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

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
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

/** Human labels for the field names the server reports as missing. */
const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  middleName: "Middle name",
  dateOfBirth: "Date of birth",
  gender: "Gender",
  nationality: "Nationality",
  maritalStatus: "Marital status",
  occupation: "Occupation",
  email: "Email",
  phone: "Phone",
  passportNumber: "Passport number",
  passportIssueDate: "Passport issue date",
  passportExpiryDate: "Passport expiry date",
  passportIssuingCountry: "Passport issuing country",
  passportIssuingAuthority: "Issuing authority",
  address: "Address",
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
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
  const product = draft.product;

  const [step, setStep] = useState(() => Math.max(1, Math.min(app.currentStep ?? 1, 4)));
  // Stepping back must not lock the way forward through steps already seen.
  const [maxReached, setMaxReached] = useState(step);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [incomplete, setIncomplete] = useState<IncompleteDetails | null>(null);
  const [submitted, setSubmitted] = useState<{
    referenceId: string;
    requiresPayment: boolean;
  } | null>(null);

  const initialTrip = useMemo(
    () => ({
      travellerCount: app.travellerCount,
      departureCountry: app.departureCountry ?? "",
      travelPurpose: app.travelPurpose ?? "",
      intendedArrivalDate: toDateInput(app.intendedArrivalDate),
      intendedDepartureDate: toDateInput(app.intendedDepartureDate),
      previousTravelHistory: app.previousTravelHistory ?? "",
      hasPreviousVisaRejection: app.hasPreviousVisaRejection ?? false,
      previousVisaRejectionNote: app.previousVisaRejectionNote ?? "",
      customerPhone: app.customerPhone ?? "",
    }),
    [
      app.travellerCount,
      app.departureCountry,
      app.travelPurpose,
      app.intendedArrivalDate,
      app.intendedDepartureDate,
      app.previousTravelHistory,
      app.hasPreviousVisaRejection,
      app.previousVisaRejectionNote,
      app.customerPhone,
    ],
  );

  const [trip, setTrip] = useState(initialTrip);
  const [termsAccepted, setTermsAccepted] = useState(app.termsAcceptedAt !== undefined);
  const [dateError, setDateError] = useState<string | null>(null);

  // Step 1 is the only step that buffers edits locally, so it is the only one
  // that can hold unsaved work when the tab closes.
  const tripDirty = useMemo(
    () => JSON.stringify(trip) !== JSON.stringify(initialTrip),
    [trip, initialTrip],
  );
  useUnsavedChanges(tripDirty && !submitted);

  const requiredFields = useMemo(
    () => new Set(product?.requiredApplicantFields ?? []),
    [product?.requiredApplicantFields],
  );

  // Priced with the same helper the server uses, so what the rail shows and
  // what `saveDraftStep` writes can never drift. The server still recomputes.
  const livePricing: PriceBreakdown = useMemo(() => {
    if (!product) return app.pricing;
    return computePricing({
      currency: product.currency,
      governmentFee: product.governmentFee,
      serviceFee: product.serviceFee,
      additionalCharges: product.additionalCharges,
      taxPercent: product.taxPercent,
      travellerCount: trip.travellerCount,
      promoPrice: product.promoPrice,
      promoEndsAt: product.promoEndsAt,
    });
  }, [product, trip.travellerCount, app.pricing]);

  function tripPatch() {
    return {
      travellerCount: trip.travellerCount,
      departureCountry: trip.departureCountry.trim() || undefined,
      travelPurpose: trip.travelPurpose.trim() || undefined,
      intendedArrivalDate: fromDateInput(trip.intendedArrivalDate),
      intendedDepartureDate: fromDateInput(trip.intendedDepartureDate),
      previousTravelHistory: trip.previousTravelHistory.trim() || undefined,
      hasPreviousVisaRejection: trip.hasPreviousVisaRejection,
      previousVisaRejectionNote: trip.previousVisaRejectionNote.trim() || undefined,
      customerPhone: trip.customerPhone.trim() || undefined,
    };
  }

  function validateDates(): boolean {
    if (trip.intendedArrivalDate && trip.intendedDepartureDate) {
      const arrival = Date.parse(`${trip.intendedArrivalDate}T00:00:00`);
      const departure = Date.parse(`${trip.intendedDepartureDate}T00:00:00`);
      if (Number.isFinite(arrival) && Number.isFinite(departure) && departure < arrival) {
        setDateError("Your return date cannot be before your arrival date.");
        return false;
      }
    }
    setDateError(null);
    return true;
  }

  async function saveTripDetails(nextStep: number) {
    if (!validateDates()) {
      toast.error("Please check your travel dates.");
      return;
    }
    setSaving(true);
    try {
      await saveStep({ applicationId, step: nextStep, patch: tripPatch() });
      setStep(nextStep);
      setMaxReached((furthest) => Math.max(furthest, nextStep));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save your progress.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveAndExit() {
    setSaving(true);
    try {
      await saveStep({ applicationId, step, patch: tripPatch() });
      toast.success("Draft saved. Pick it up any time from your applications.");
      router.push("/dashboard/applications");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save your progress.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function goToStep(nextStep: number) {
    // Moving away from step 1 must not lose what is in the buffer.
    if (step === 1 && tripDirty) {
      await saveTripDetails(nextStep);
      return;
    }
    setSaving(true);
    try {
      await saveStep({ applicationId, step: nextStep, patch: {} });
      setStep(nextStep);
      setMaxReached((furthest) => Math.max(furthest, nextStep));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save your progress.",
      );
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
      setSubmitted({
        referenceId: result.referenceId,
        requiresPayment: result.requiresPayment,
      });
      return;
    } catch (error) {
      const details = readIncomplete(error);
      if (details) {
        setIncomplete(details);
        if ((details.documents?.length ?? 0) > 0) setStep(3);
        else if ((details.applicants?.length ?? 0) > 0) setStep(2);
        else setStep(1);
        window.scrollTo({ top: 0, behavior: "smooth" });
        toast.error("A few things still need your attention.");
      } else {
        toast.error(
          error instanceof Error ? error.message : "Could not submit the application.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <SubmittedScreen
        applicationId={applicationId}
        referenceId={submitted.referenceId}
        requiresPayment={submitted.requiresPayment}
        visaProductName={app.visaProductName}
        destinationName={app.destinationName}
        travellerCount={app.travellerCount}
        total={formatMoney(app.pricing.total, app.pricing.currency)}
      />
    );
  }

  const busy = saving || submitting;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Complete your application"
        description={`${app.referenceId} · ${app.visaProductName} · ${app.destinationName}`}
        breadcrumbs={[
          { label: "Applications", href: "/dashboard/applications" },
          { label: "Draft" },
        ]}
        actions={
          <>
            <SaveStatus dirty={tripDirty} saving={saving} savedAt={app.lastAutosaveAt} />
            <Button variant="outline" onClick={saveAndExit} disabled={busy}>
              <Save className="size-4" aria-hidden />
              Save and exit
            </Button>
          </>
        }
      />

      <div className="rounded-2xl border border-border bg-card p-5">
        <WizardStepper
          steps={STEPS}
          current={step}
          maxReached={maxReached}
          disabled={busy}
          onSelect={(id) => {
            if (id !== step) void goToStep(id);
          }}
        />
      </div>

      {incomplete && <IncompleteNotice details={incomplete} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {step === 1 && (
            <TripStep
              trip={trip}
              setTrip={setTrip}
              dateError={dateError}
              saving={saving}
              onContinue={() => saveTripDetails(2)}
            />
          )}

          {step === 2 && (
            <TravellersStep
              applicationId={applicationId}
              applicants={draft.applicants}
              travellerCount={trip.travellerCount}
              requiredFields={requiredFields}
              busy={busy}
              onBack={() => goToStep(1)}
              onContinue={() => goToStep(3)}
            />
          )}

          {step === 3 && (
            <DocumentsStep
              applicationId={applicationId}
              checklist={checklist}
              canUpload={checklist?.canUpload ?? true}
              busy={busy}
              onBack={() => goToStep(2)}
              onContinue={() => goToStep(4)}
            />
          )}

          {step === 4 && (
            <ReviewStep
              app={app}
              trip={trip}
              applicants={draft.applicants}
              requiredFields={requiredFields}
              checklist={checklist}
              pricing={livePricing}
              termsAccepted={termsAccepted}
              setTermsAccepted={setTermsAccepted}
              submitting={submitting}
              busy={busy}
              onEdit={(target) => goToStep(target)}
              onSubmit={handleSubmit}
            />
          )}
        </div>

        <div className="xl:relative">
          <BookingSummary
            className="xl:sticky xl:top-6"
            visaProductName={app.visaProductName}
            destinationName={app.destinationName}
            destinationCountryCode={draft.destination?.countryCode}
            visaType={product?.visaType}
            travellerCount={trip.travellerCount}
            pricing={livePricing}
            processingTimeMinDays={product?.processingTimeMinDays}
            processingTimeMaxDays={product?.processingTimeMaxDays}
            processingTimeNote={product?.processingTimeNote}
            isDemoContent={product?.isDemoContent}
            footnote="Fees are re-checked against the catalogue on our server when you submit. Payment is a separate, secure step."
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 chrome bits                                */
/* -------------------------------------------------------------------------- */

function SaveStatus({
  dirty,
  saving,
  savedAt,
}: {
  dirty: boolean;
  saving: boolean;
  savedAt?: number;
}) {
  if (saving) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Saving…
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-warning" aria-hidden />
        Unsaved changes
      </span>
    );
  }
  if (!savedAt) return null;
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <CheckCircle2 className="size-3.5 text-success" aria-hidden />
      Saved
    </span>
  );
}

function IncompleteNotice({ details }: { details: IncompleteDetails }) {
  return (
    <div
      role="alert"
      className="animate-fade-up rounded-2xl border border-warning/30 bg-warning-soft p-5"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 space-y-3 text-sm">
          <p className="font-semibold text-foreground">
            A few things still need your attention
          </p>

          {details.problems && details.problems.length > 0 && (
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              {details.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}

          {details.applicants && details.applicants.length > 0 && (
            <div>
              <p className="font-medium text-foreground">Missing traveller details</p>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {details.applicants.map((applicant) => (
                  <li key={applicant.name}>
                    <span className="font-medium text-foreground">{applicant.name}</span>
                    {" — "}
                    {applicant.missingFields.map(fieldLabel).join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {details.documents && details.documents.length > 0 && (
            <div>
              <p className="font-medium text-foreground">Missing documents</p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-muted-foreground">
                {details.documents.map((document) => (
                  <li key={`${document.label}-${document.applicantName ?? ""}`}>
                    {document.label}
                    {document.applicantName ? ` — ${document.applicantName}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Footer shared by every step so Back/Continue never move between steps. */
function StepFooter({
  onBack,
  onContinue,
  continueLabel = "Save and continue",
  busy,
  continueIcon,
}: {
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  busy: boolean;
  continueIcon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
      {onBack ? (
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button onClick={onContinue} disabled={busy} size="lg" className="sm:min-w-44">
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          (continueIcon ?? null)
        )}
        {continueLabel}
        {!busy && !continueIcon && <ArrowRight className="size-4" aria-hidden />}
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               step 1 — trip                                */
/* -------------------------------------------------------------------------- */

interface TripState {
  travellerCount: number;
  departureCountry: string;
  travelPurpose: string;
  intendedArrivalDate: string;
  intendedDepartureDate: string;
  previousTravelHistory: string;
  hasPreviousVisaRejection: boolean;
  previousVisaRejectionNote: string;
  customerPhone: string;
}

function TripStep({
  trip,
  setTrip,
  dateError,
  saving,
  onContinue,
}: {
  trip: TripState;
  setTrip: React.Dispatch<React.SetStateAction<TripState>>;
  dateError: string | null;
  saving: boolean;
  onContinue: () => void;
}) {
  const purposeId = React.useId();
  const today = startOfToday();

  function set<K extends keyof TripState>(key: K, value: TripState[K]) {
    setTrip((current) => ({ ...current, [key]: value }));
  }

  return (
    <Card className="animate-fade-up gap-0 py-0">
      <div className="space-y-8 p-6 sm:p-7">
        <FormSection
          icon={Plane}
          title="Your trip"
          description="The basics we need to price the application and prepare your file."
        >
          <FieldGrid>
            <Field
              label="Number of travellers"
              required
              hint="Add each traveller in the next step. The total updates with this count."
            >
              <TravellerCounter
                value={trip.travellerCount}
                onChange={(value) => set("travellerCount", value)}
              />
            </Field>

            <Field label="Departure country" hint="Where you are flying from.">
              <CountrySelect
                value={trip.departureCountry}
                onChange={(value) => set("departureCountry", value)}
                placeholder="Select departure country"
              />
            </Field>

            <Field label="Purpose of travel" htmlFor={purposeId}>
              <Select
                value={trip.travelPurpose || undefined}
                onValueChange={(value) => set("travelPurpose", value)}
              >
                <SelectTrigger id={purposeId} className="h-10 w-full">
                  <SelectValue placeholder="Select a purpose" />
                </SelectTrigger>
                <SelectContent>
                  {TRAVEL_PURPOSES.map((purpose) => (
                    <SelectItem key={purpose.value} value={purpose.value}>
                      {purpose.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Contact phone"
              hint="We send status updates here on WhatsApp."
            >
              <PhoneField
                value={trip.customerPhone}
                onChange={(value) => set("customerPhone", value)}
              />
            </Field>
          </FieldGrid>
        </FormSection>

        <Separator />

        <FormSection
          icon={CalendarRange}
          title="Travel dates"
          description="Approximate dates are fine — tell us if they change later."
        >
          <FieldGrid>
            <Field label="Intended arrival" error={dateError ?? undefined}>
              <DateField
                value={trip.intendedArrivalDate}
                onChange={(value) => set("intendedArrivalDate", value)}
                minDate={today}
                placeholder="Select arrival date"
              />
            </Field>
            <Field label="Intended return">
              <DateField
                value={trip.intendedDepartureDate}
                onChange={(value) => set("intendedDepartureDate", value)}
                minDate={
                  trip.intendedArrivalDate
                    ? new Date(`${trip.intendedArrivalDate}T00:00:00`)
                    : today
                }
                placeholder="Select return date"
              />
            </Field>
          </FieldGrid>
        </FormSection>

        <Separator />

        <FormSection
          icon={History}
          title="Travel history"
          description="Optional, but a complete history helps consulates decide faster."
        >
          <div className="space-y-5">
            <Field
              label="Countries visited in the last five years"
              hint="A short list is enough — no dates needed."
            >
              <Textarea
                rows={3}
                value={trip.previousTravelHistory}
                onChange={(event) => set("previousTravelHistory", event.target.value)}
                placeholder="Thailand, Singapore, United Arab Emirates…"
              />
            </Field>

            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="rejected"
                  checked={trip.hasPreviousVisaRejection}
                  onCheckedChange={(value) =>
                    set("hasPreviousVisaRejection", value === true)
                  }
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <Label htmlFor="rejected" className="text-[13px] font-medium">
                    I have had a visa refused before
                  </Label>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Declaring a refusal now avoids delays later. It does not disqualify
                    your application.
                  </p>
                </div>
              </div>

              {trip.hasPreviousVisaRejection && (
                <div className="mt-4 animate-fade-up">
                  <Field label="What happened?" hint="Which country, roughly when, and the reason given.">
                    <Textarea
                      rows={2}
                      value={trip.previousVisaRejectionNote}
                      onChange={(event) =>
                        set("previousVisaRejectionNote", event.target.value)
                      }
                      placeholder="Schengen visa refused in 2023 — insufficient funds shown."
                    />
                  </Field>
                </div>
              )}
            </div>
          </div>
        </FormSection>

        <StepFooter onContinue={onContinue} busy={saving} />
      </div>
    </Card>
  );
}

function TravellerCounter({
  value,
  onChange,
  id,
}: {
  value: number;
  onChange: (value: number) => void;
  id?: string;
}) {
  const clamp = (next: number) => Math.max(1, Math.min(20, next));

  return (
    <div className="flex h-10 w-full items-center justify-between rounded-lg border border-input bg-card px-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Remove a traveller"
        disabled={value <= 1}
        onClick={() => onChange(clamp(value - 1))}
      >
        <span aria-hidden className="text-base leading-none">
          −
        </span>
      </Button>
      <input
        id={id}
        type="number"
        min={1}
        max={20}
        value={value}
        aria-label="Number of travellers"
        onChange={(event) => onChange(clamp(Number(event.target.value) || 1))}
        className="w-full [appearance:textfield] bg-transparent text-center text-sm font-medium tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Add a traveller"
        disabled={value >= 20}
        onClick={() => onChange(clamp(value + 1))}
      >
        <span aria-hidden className="text-base leading-none">
          +
        </span>
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            step 2 — travellers                             */
/* -------------------------------------------------------------------------- */

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

/**
 * The same completeness rule the server applies at submit, run locally so a
 * traveller shows "3 details missing" long before the submit button is
 * pressed. The server remains the authority.
 */
function missingFor(
  applicant: Doc<"applicants">,
  requiredFields: Set<string>,
): string[] {
  const fields = new Set<string>(["firstName", "lastName", ...requiredFields]);
  const missing: string[] = [];
  for (const field of fields) {
    const value = (applicant as unknown as Record<string, unknown>)[field];
    if (value === undefined || value === null) {
      missing.push(field);
      continue;
    }
    if (typeof value === "string" && value.trim() === "") missing.push(field);
  }
  return missing;
}

function TravellersStep({
  applicationId,
  applicants,
  travellerCount,
  requiredFields,
  busy,
  onBack,
  onContinue,
}: {
  applicationId: Id<"applications">;
  applicants: Doc<"applicants">[];
  travellerCount: number;
  requiredFields: Set<string>;
  busy: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const removeApplicant = useMutation(api.applicants.remove);
  const [adding, setAdding] = useState(applicants.length === 0);
  const [open, setOpen] = useState<string>(() =>
    applicants.length === 0 ? "new" : `applicant-${applicants[0]._id}`,
  );
  const [removing, setRemoving] = useState<Id<"applicants"> | null>(null);

  const canAdd = applicants.length < travellerCount;
  const remaining = travellerCount - applicants.length;

  async function handleRemove(applicantId: Id<"applicants">) {
    setRemoving(applicantId);
    try {
      await removeApplicant({ applicationId, applicantId });
      toast.success("Traveller removed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove this traveller.",
      );
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Card className="animate-fade-up gap-0 py-0">
      <div className="space-y-6 p-6 sm:p-7">
        <FormSection
          icon={Users}
          title="Travellers"
          description="Enter each traveller's details exactly as they appear in their passport."
          aside={
            <Badge
              variant="outline"
              className={cn(
                "font-normal",
                applicants.length >= travellerCount &&
                  "border-success/30 bg-success-soft text-success",
              )}
            >
              {applicants.length} of {travellerCount} added
            </Badge>
          }
        />

        {applicants.length === 0 && !adding && (
          <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center">
            <User className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No travellers yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Add at least one traveller to continue. You can add the rest later.
            </p>
            <Button className="mt-5" onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden />
              Add traveller
            </Button>
          </div>
        )}

        {(applicants.length > 0 || adding) && (
          <Accordion
            type="single"
            collapsible
            value={open}
            onValueChange={setOpen}
            className="space-y-3"
          >
            {applicants.map((applicant, index) => {
              const missing = missingFor(applicant, requiredFields);
              const name = `${applicant.firstName} ${applicant.lastName}`.trim();
              return (
                <AccordionItem
                  key={applicant._id}
                  value={`applicant-${applicant._id}`}
                  className="overflow-hidden rounded-xl border border-border bg-card last:border-b"
                >
                  <AccordionTrigger className="px-4 py-3.5 hover:no-underline">
                    <div className="flex min-w-0 flex-1 items-center gap-3 pr-3">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          missing.length === 0
                            ? "bg-success-soft text-success"
                            : "bg-surface-strong text-muted-foreground",
                        )}
                      >
                        {missing.length === 0 ? (
                          <Check className="size-4" aria-hidden />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <div className="min-w-0 text-left">
                        <p className="truncate text-sm font-medium">
                          {name || `Traveller ${index + 1}`}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {missing.length === 0
                            ? applicant.passportNumber
                              ? `Passport ${applicant.passportNumber}`
                              : "All required details complete"
                            : `${missing.length} ${missing.length === 1 ? "detail" : "details"} still needed`}
                        </p>
                      </div>
                      {applicant.isPrimary && (
                        <Badge variant="outline" className="ml-auto hidden font-normal sm:inline-flex">
                          Primary
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="border-t border-border px-4 pb-5 pt-5">
                    <ApplicantForm
                      applicationId={applicationId}
                      applicant={applicant}
                      requiredFields={requiredFields}
                      missing={missing}
                      footer={
                        !applicant.isPrimary && (
                          <ConfirmDialog
                            title="Remove this traveller?"
                            description={`${name || "This traveller"} and any documents uploaded for them will be removed from the application.`}
                            confirmLabel="Remove traveller"
                            destructive
                            onConfirm={() => handleRemove(applicant._id)}
                            trigger={
                              <Button
                                type="button"
                                variant="ghost"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                disabled={removing === applicant._id}
                              >
                                <Trash2 className="size-4" aria-hidden />
                                Remove
                              </Button>
                            }
                          />
                        )
                      }
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}

            {adding && (
              <AccordionItem
                value="new"
                className="overflow-hidden rounded-xl border border-primary/40 bg-card last:border-b"
              >
                <AccordionTrigger className="px-4 py-3.5 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-full bg-brand-tint text-brand-deep">
                      <Plus className="size-4" aria-hidden />
                    </span>
                    <p className="text-sm font-medium">New traveller</p>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="border-t border-border px-4 pb-5 pt-5">
                  <ApplicantForm
                    applicationId={applicationId}
                    requiredFields={requiredFields}
                    onSaved={() => setAdding(false)}
                    footer={
                      <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                        Cancel
                      </Button>
                    }
                  />
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        )}

        {!adding && canAdd && applicants.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setAdding(true);
                setOpen("new");
              }}
            >
              <Plus className="size-4" aria-hidden />
              Add traveller
            </Button>
            <p className="text-xs text-muted-foreground">
              {remaining} more {remaining === 1 ? "traveller" : "travellers"} to add
              before you can submit.
            </p>
          </div>
        )}

        <StepFooter onBack={onBack} onContinue={onContinue} busy={busy} />
      </div>
    </Card>
  );
}

function ApplicantForm({
  applicationId,
  applicant,
  requiredFields,
  missing,
  onSaved,
  footer,
}: {
  applicationId: Id<"applications">;
  applicant?: Doc<"applicants">;
  requiredFields: Set<string>;
  missing?: string[];
  onSaved?: () => void;
  footer?: React.ReactNode;
}) {
  const upsert = useMutation(api.applicants.upsert);
  const initial = useMemo(
    () => (applicant ? applicantToDraft(applicant) : EMPTY_APPLICANT),
    [applicant],
  );
  const [values, setValues] = useState<ApplicantDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const genderId = React.useId();
  const maritalId = React.useId();
  const today = startOfToday();

  // Another device (or a staff edit) can change the row underneath an open
  // form. Adopt the new values during render — never in an effect, which
  // would paint the stale form first — and only when nothing local is at risk.
  const [syncedFrom, setSyncedFrom] = useState(initial);
  if (!dirty && syncedFrom !== initial) {
    setSyncedFrom(initial);
    setValues(initial);
  }

  function set<K extends keyof ApplicantDraft>(key: K, value: ApplicantDraft[K]) {
    setDirty(true);
    setValues((current) => ({ ...current, [key]: value }));
  }

  const missingSet = new Set(missing ?? []);
  const isRequired = (key: string) => requiredFields.has(key);

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
          passportIssuingAuthority:
            values.passportIssuingAuthority.trim() || undefined,
        },
      });
      setDirty(false);
      toast.success(applicant ? "Traveller updated." : "Traveller added.");
      onSaved?.();
      if (!applicant) setValues(EMPTY_APPLICANT);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save this traveller.",
      );
    } finally {
      setSaving(false);
    }
  }

  /** Flags a field the server has already told us is missing. */
  const flag = (key: string) =>
    missingSet.has(key) ? "Required for this visa" : undefined;

  return (
    <form onSubmit={handleSave} className="space-y-7">
      <FormSection icon={User} title="Personal details">
        <FieldGrid>
          <Field label="First name" required error={flag("firstName")}>
            <Input
              value={values.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              autoComplete="given-name"
              required
            />
          </Field>
          <Field label="Last name" required error={flag("lastName")}>
            <Input
              value={values.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              autoComplete="family-name"
              required
            />
          </Field>
          <Field label="Middle name" hint="Only if printed in the passport.">
            <Input
              value={values.middleName}
              onChange={(e) => set("middleName", e.target.value)}
              autoComplete="additional-name"
            />
          </Field>
          <Field
            label="Date of birth"
            required={isRequired("dateOfBirth")}
            error={flag("dateOfBirth")}
          >
            <DateField
              value={values.dateOfBirth}
              onChange={(value) => set("dateOfBirth", value)}
              maxDate={today}
              placeholder="Select date of birth"
            />
          </Field>
          <Field
            label="Gender"
            required={isRequired("gender")}
            htmlFor={genderId}
            error={flag("gender")}
          >
            <Select
              value={values.gender || undefined}
              onValueChange={(value) => set("gender", value)}
            >
              <SelectTrigger id={genderId} className="h-10 w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {GENDERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Nationality"
            required={isRequired("nationality")}
            error={flag("nationality")}
          >
            <CountrySelect
              value={values.nationality}
              onChange={(value) => set("nationality", value)}
              placeholder="Select nationality"
            />
          </Field>
          <Field
            label="Marital status"
            required={isRequired("maritalStatus")}
            htmlFor={maritalId}
            error={flag("maritalStatus")}
          >
            <Select
              value={values.maritalStatus || undefined}
              onValueChange={(value) => set("maritalStatus", value)}
            >
              <SelectTrigger id={maritalId} className="h-10 w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {MARITAL_STATUSES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Occupation"
            required={isRequired("occupation")}
            error={flag("occupation")}
          >
            <Input
              value={values.occupation}
              onChange={(e) => set("occupation", e.target.value)}
              placeholder="Software engineer"
            />
          </Field>
          <Field label="Email" required={isRequired("email")} error={flag("email")}>
            <Input
              type="email"
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
              autoComplete="email"
              placeholder="name@example.com"
            />
          </Field>
          <Field label="Phone" required={isRequired("phone")} error={flag("phone")}>
            <PhoneField
              value={values.phone}
              onChange={(value) => set("phone", value)}
            />
          </Field>
        </FieldGrid>
      </FormSection>

      <Separator />

      <FormSection
        icon={BadgeCheck}
        title="Passport"
        description="Copy these exactly from the passport data page."
      >
        <FieldGrid>
          <Field
            label="Passport number"
            required={isRequired("passportNumber")}
            error={flag("passportNumber")}
          >
            <Input
              value={values.passportNumber}
              onChange={(e) => set("passportNumber", e.target.value.toUpperCase())}
              className="uppercase"
              placeholder="A1234567"
            />
          </Field>
          <Field
            label="Issuing country"
            required={isRequired("passportIssuingCountry")}
            error={flag("passportIssuingCountry")}
          >
            <CountrySelect
              value={values.passportIssuingCountry}
              onChange={(value) => set("passportIssuingCountry", value)}
              placeholder="Select issuing country"
            />
          </Field>
          <Field
            label="Issue date"
            required={isRequired("passportIssueDate")}
            error={flag("passportIssueDate")}
          >
            <DateField
              value={values.passportIssueDate}
              onChange={(value) => set("passportIssueDate", value)}
              maxDate={today}
              placeholder="Select issue date"
            />
          </Field>
          <Field
            label="Expiry date"
            required={isRequired("passportExpiryDate")}
            error={flag("passportExpiryDate")}
            hint="Most consulates want at least six months left."
          >
            <DateField
              value={values.passportExpiryDate}
              onChange={(value) => set("passportExpiryDate", value)}
              placeholder="Select expiry date"
            />
          </Field>
          <Field label="Issuing authority">
            <Input
              value={values.passportIssuingAuthority}
              onChange={(e) => set("passportIssuingAuthority", e.target.value)}
              placeholder="Mumbai"
            />
          </Field>
        </FieldGrid>
      </FormSection>

      <Separator />

      <FormSection
        icon={MapPin}
        title="Residential address"
        required={isRequired("address")}
        description={
          isRequired("address")
            ? "Required for this visa."
            : "Optional, but it speeds up document verification."
        }
      >
        <FieldGrid>
          <Field label="Address line 1" className="sm:col-span-2" error={flag("address")}>
            <Input
              value={values.line1}
              onChange={(e) => set("line1", e.target.value)}
              autoComplete="address-line1"
              placeholder="Flat 402, Sea Breeze Apartments"
            />
          </Field>
          <Field label="Address line 2" className="sm:col-span-2">
            <Input
              value={values.line2}
              onChange={(e) => set("line2", e.target.value)}
              autoComplete="address-line2"
              placeholder="Linking Road, Khar West"
            />
          </Field>
          <Field label="City">
            <Input
              value={values.city}
              onChange={(e) => set("city", e.target.value)}
              autoComplete="address-level2"
              placeholder="Mumbai"
            />
          </Field>
          <Field label="State">
            <Input
              value={values.state}
              onChange={(e) => set("state", e.target.value)}
              autoComplete="address-level1"
              placeholder="Maharashtra"
            />
          </Field>
          <Field label="Postal code">
            <Input
              value={values.postalCode}
              onChange={(e) => set("postalCode", e.target.value)}
              autoComplete="postal-code"
              inputMode="numeric"
              placeholder="400052"
            />
          </Field>
          <Field label="Country">
            <CountrySelect
              value={values.country}
              onChange={(value) => set("country", value)}
              placeholder="Select country"
            />
          </Field>
        </FieldGrid>
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-5">
        {footer}
        <Button type="submit" disabled={saving || (!dirty && Boolean(applicant))}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          {applicant ? (dirty ? "Save changes" : "Saved") : "Add traveller"}
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*                            step 3 — documents                              */
/* -------------------------------------------------------------------------- */

type Checklist = FunctionReturnType<typeof api.documents.listByApplication>;

function DocumentsStep({
  applicationId,
  checklist,
  canUpload,
  busy,
  onBack,
  onContinue,
}: {
  applicationId: Id<"applications">;
  checklist: Checklist | undefined;
  canUpload: boolean;
  busy: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const uploader = useDocumentUpload({ applicationId });

  if (checklist === undefined) {
    return (
      <Card className="animate-fade-up">
        <CardContent className="space-y-3">
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          <div className="h-24 w-full animate-pulse rounded-xl bg-muted" />
          <div className="h-24 w-full animate-pulse rounded-xl bg-muted" />
        </CardContent>
      </Card>
    );
  }

  const mandatory = checklist.checklist.filter((item) => item.isMandatory);
  const mandatoryDone = mandatory.filter((item) => item.document).length;
  const percent =
    mandatory.length === 0 ? 100 : Math.round((mandatoryDone / mandatory.length) * 100);

  return (
    <Card className="animate-fade-up gap-0 py-0">
      <div className="space-y-6 p-6 sm:p-7">
        <FormSection
          icon={FileText}
          title="Documents"
          description="Clear photos or scans are fine. Each file is stored privately and only visible to you and our team."
        />

        {mandatory.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="font-medium">Required documents</p>
              <p className="tabular-nums text-muted-foreground">
                {mandatoryDone} of {mandatory.length}
              </p>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-strong">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500 ease-out",
                  percent === 100 ? "bg-success" : "bg-primary",
                )}
                style={{ width: `${Math.max(percent, 2)}%` }}
                role="progressbar"
                aria-valuenow={mandatoryDone}
                aria-valuemin={0}
                aria-valuemax={mandatory.length}
                aria-label="Required documents uploaded"
              />
            </div>
          </div>
        )}

        {checklist.checklist.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center">
            <FileText className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No documents needed yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              This visa service has no document checklist. If our team needs anything
              later, it will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {checklist.checklist.map((item) => {
              const slot = `${item.documentKey}:${item.applicantId ?? "general"}`;
              return (
                <div
                  key={slot}
                  className={cn(
                    "rounded-xl border bg-card p-4 transition-colors",
                    item.document ? "border-success/30" : "border-border",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                          item.document
                            ? "bg-success-soft text-success"
                            : "bg-surface text-muted-foreground",
                        )}
                      >
                        {item.document ? (
                          <Check className="size-4" aria-hidden />
                        ) : (
                          <FileText className="size-4" aria-hidden />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {item.label}
                          {item.isMandatory && (
                            <span className="ml-1 text-destructive" aria-label="required">
                              *
                            </span>
                          )}
                        </p>
                        {item.applicantName && (
                          <p className="text-xs text-muted-foreground">
                            For {item.applicantName}
                          </p>
                        )}
                        {item.description && (
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>
                    {item.document ? (
                      <DocumentStatusBadge status={item.document.status} />
                    ) : (
                      <Badge variant="outline" className="font-normal text-muted-foreground">
                        Not uploaded
                      </Badge>
                    )}
                  </div>

                  {item.document && (
                    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-surface px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {item.document.fileName}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{formatBytes(item.document.size)}</span>
                      {item.document.reviewNote && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{item.document.reviewNote}</span>
                        </>
                      )}
                    </p>
                  )}

                  {canUpload && (
                    <FileDropzone
                      className="mt-3"
                      compact
                      uploads={uploader.uploads.filter((upload) =>
                        upload.id.startsWith(`${slot}:`),
                      )}
                      onRemove={uploader.removeUpload}
                      disabled={uploader.isUploading}
                      allowedMimeTypes={item.allowedMimeTypes}
                      maxSizeBytes={item.maxSizeBytes}
                      label={
                        item.document ? `Replace ${item.label}` : `Upload ${item.label}`
                      }
                      onFiles={(files) => {
                        const file = files[0];
                        if (!file) return;
                        void uploader.upload(file, {
                          documentKey: item.documentKey,
                          label: item.label,
                          applicantId: item.applicantId,
                          constraints: {
                            allowedMimeTypes: item.allowedMimeTypes,
                            maxSizeBytes: item.maxSizeBytes,
                          },
                        });
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!canUpload && (
          <p className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-foreground">
            This application is no longer accepting uploads. Contact the VisaDrive team
            if you need to send a document.
          </p>
        )}

        <StepFooter onBack={onBack} onContinue={onContinue} busy={busy} />
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*                             step 4 — review                                */
/* -------------------------------------------------------------------------- */

function ReviewStep({
  app,
  trip,
  applicants,
  requiredFields,
  checklist,
  pricing,
  termsAccepted,
  setTermsAccepted,
  submitting,
  busy,
  onEdit,
  onSubmit,
}: {
  app: NonNullable<DraftData>["application"];
  trip: TripState;
  applicants: Doc<"applicants">[];
  requiredFields: Set<string>;
  checklist: Checklist | undefined;
  pricing: PriceBreakdown;
  termsAccepted: boolean;
  setTermsAccepted: (value: boolean) => void;
  submitting: boolean;
  busy: boolean;
  onEdit: (step: number) => void;
  onSubmit: () => void;
}) {
  const mandatory = checklist?.checklist.filter((item) => item.isMandatory) ?? [];
  const mandatoryMissing = mandatory.filter((item) => !item.document);
  const travellersMissing = applicants.filter(
    (applicant) => missingFor(applicant, requiredFields).length > 0,
  );
  const travellersShort = applicants.length < trip.travellerCount;

  const purposeLabel =
    TRAVEL_PURPOSES.find((purpose) => purpose.value === trip.travelPurpose)?.label ??
    (trip.travelPurpose || "Not provided");

  const blockers =
    travellersShort || travellersMissing.length > 0 || mandatoryMissing.length > 0;

  return (
    <div className="animate-fade-up space-y-6">
      <Card className="gap-0 py-0">
        <div className="space-y-6 p-6 sm:p-7">
          <FormSection
            icon={Plane}
            title="Trip details"
            aside={
              <Button variant="ghost" size="sm" onClick={() => onEdit(1)} disabled={busy}>
                Edit
              </Button>
            }
          >
            <dl className="grid gap-4 sm:grid-cols-2">
              <Summary label="Visa service" value={app.visaProductName} />
              <Summary label="Destination" value={app.destinationName} />
              <Summary
                label="Travellers"
                value={`${trip.travellerCount} ${trip.travellerCount === 1 ? "traveller" : "travellers"}`}
              />
              <Summary label="Purpose of travel" value={purposeLabel} />
              <Summary
                label="Departure country"
                value={trip.departureCountry || "Not provided"}
              />
              <Summary label="Contact phone" value={trip.customerPhone || "Not provided"} />
              <Summary
                label="Travel dates"
                value={
                  trip.intendedArrivalDate || trip.intendedDepartureDate
                    ? `${formatDate(fromDateInput(trip.intendedArrivalDate))} – ${formatDate(fromDateInput(trip.intendedDepartureDate))}`
                    : "Not provided"
                }
              />
              <Summary
                label="Previous refusal"
                value={trip.hasPreviousVisaRejection ? "Declared" : "None declared"}
              />
            </dl>
          </FormSection>
        </div>
      </Card>

      <Card className="gap-0 py-0">
        <div className="space-y-5 p-6 sm:p-7">
          <FormSection
            icon={Users}
            title="Travellers"
            description={`${applicants.length} of ${trip.travellerCount} added`}
            aside={
              <Button variant="ghost" size="sm" onClick={() => onEdit(2)} disabled={busy}>
                Edit
              </Button>
            }
          />

          {applicants.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted-foreground">
              No travellers added yet.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {applicants.map((applicant) => {
                const missing = missingFor(applicant, requiredFields);
                return (
                  <li
                    key={applicant._id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                  >
                    <span className="font-medium">
                      {`${applicant.firstName} ${applicant.lastName}`.trim()}
                    </span>
                    {missing.length === 0 ? (
                      <span className="flex items-center gap-1.5 text-xs text-success">
                        <Check className="size-3.5" aria-hidden />
                        Complete
                      </span>
                    ) : (
                      <span className="text-xs text-warning">
                        Missing: {missing.map(fieldLabel).join(", ")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {travellersShort && (
            <p className="text-xs text-warning">
              You selected {trip.travellerCount} travellers but added{" "}
              {applicants.length}. Add the rest, or reduce the count in step one.
            </p>
          )}
        </div>
      </Card>

      <Card className="gap-0 py-0">
        <div className="space-y-5 p-6 sm:p-7">
          <FormSection
            icon={FileText}
            title="Documents"
            description={
              mandatory.length === 0
                ? "No required documents for this service."
                : `${mandatory.length - mandatoryMissing.length} of ${mandatory.length} required documents uploaded`
            }
            aside={
              <Button variant="ghost" size="sm" onClick={() => onEdit(3)} disabled={busy}>
                Edit
              </Button>
            }
          />

          {mandatoryMissing.length > 0 && (
            <ul className="space-y-1.5 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm">
              {mandatoryMissing.map((item) => (
                <li
                  key={`${item.documentKey}-${item.applicantId ?? "general"}`}
                  className="text-foreground"
                >
                  {item.label}
                  {item.applicantName ? ` — ${item.applicantName}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="gap-0 py-0">
        <div className="space-y-5 p-6 sm:p-7">
          <FormSection icon={CreditCard} title="What you will pay" />

          <dl className="space-y-2.5 text-sm">
            <ReviewLine
              label="Government fee"
              value={formatMoney(pricing.governmentFee, pricing.currency)}
            />
            <ReviewLine
              label="Service fee"
              value={formatMoney(pricing.serviceFee, pricing.currency)}
            />
            {pricing.additionalCharges > 0 && (
              <ReviewLine
                label="Additional charges"
                value={formatMoney(pricing.additionalCharges, pricing.currency)}
              />
            )}
            {pricing.taxPercent > 0 && (
              <ReviewLine
                label={`Tax (${pricing.taxPercent}%)`}
                value={formatMoney(pricing.taxAmount, pricing.currency)}
              />
            )}
            <Separator />
            <div className="flex items-baseline justify-between">
              <dt className="font-medium">Total</dt>
              <dd className="text-xl font-semibold tabular-nums tracking-tight">
                {formatMoney(pricing.total, pricing.currency)}
              </dd>
            </div>
          </dl>

          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
            <Checkbox
              id="terms"
              checked={termsAccepted}
              onCheckedChange={(value) => setTermsAccepted(value === true)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="terms" className="text-[13px] font-medium">
                I accept the terms and conditions
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                You confirm the information provided is accurate and authorise VisaDrive
                to process this application. Read our{" "}
                <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
                  terms
                </Link>{" "}
                and{" "}
                <Link href="/refund-policy" className="underline underline-offset-2 hover:text-foreground">
                  refund policy
                </Link>
                .
              </p>
            </div>
          </div>

          {blockers && (
            <p className="text-xs text-muted-foreground">
              You can still submit — we will check everything and come back to you if
              anything is missing.
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={() => onEdit(3)} disabled={busy}>
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </Button>
            <Button
              size="lg"
              className="sm:min-w-52"
              onClick={onSubmit}
              disabled={submitting || !termsAccepted}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              {submitting ? "Submitting…" : "Submit application"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-eyebrow">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              confirmation                                  */
/* -------------------------------------------------------------------------- */

function SubmittedScreen({
  applicationId,
  referenceId,
  requiresPayment,
  visaProductName,
  destinationName,
  travellerCount,
  total,
}: {
  applicationId: Id<"applications">;
  referenceId: string;
  requiresPayment: boolean;
  visaProductName: string;
  destinationName: string;
  travellerCount: number;
  total: string;
}) {
  const nextSteps = [
    {
      title: requiresPayment ? "Complete your payment" : "We start the review",
      body: requiresPayment
        ? "Your application is held until payment clears. It takes under a minute."
        : "A visa specialist checks your details and documents against the consulate's requirements.",
    },
    {
      title: "We verify your documents",
      body: "If anything needs replacing you will get a notification here with exactly what to change.",
    },
    {
      title: "Track every status change",
      body: "Your application timeline updates as we lodge, follow up and return your passport.",
    },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <div className="flex flex-col items-center text-center">
        <span className="animate-success-pop flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="size-8" aria-hidden strokeWidth={2.5} />
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">
          Application submitted
        </h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          We have everything we need to begin. Keep your reference handy — it identifies
          this application in every message from us.
        </p>
      </div>

      <Card className="animate-fade-up gap-0 py-0">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-5">
          <div>
            <p className="text-eyebrow">Reference</p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-tight">
              {referenceId}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="print:hidden"
          >
            <Printer className="size-4" aria-hidden />
            Print
          </Button>
        </div>

        <dl className="grid gap-4 p-5 sm:grid-cols-2">
          <Summary label="Visa service" value={visaProductName} />
          <Summary label="Destination" value={destinationName} />
          <Summary
            label="Travellers"
            value={`${travellerCount} ${travellerCount === 1 ? "traveller" : "travellers"}`}
          />
          <Summary label="Total" value={total} />
        </dl>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="p-5 pb-0">
          <CardTitle className="text-base">What happens next</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <ol className="space-y-4">
            {nextSteps.map((stage, index) => (
              <li key={stage.title} className="flex gap-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{stage.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    {stage.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 pb-4 sm:flex-row-reverse print:hidden">
        {requiresPayment ? (
          <Button asChild size="lg" className="sm:flex-1">
            <Link href={`/checkout/${applicationId}`}>
              Continue to secure payment
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button asChild size="lg" className="sm:flex-1">
            <Link href={`/dashboard/applications/${applicationId}`}>
              View my application
            </Link>
          </Button>
        )}
        <Button asChild variant="outline" size="lg" className="sm:flex-1">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
