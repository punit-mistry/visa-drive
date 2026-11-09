"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { Field, FieldGrid } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { PhoneField } from "@/components/shared/phone-field";
import { DemoContentBadge } from "@/components/shared/status-badge";
import { EmptyState, ListSkeleton } from "@/components/shared/states";
import { useDebounce } from "@/hooks/use-debounce";
import { useDocumentUpload } from "@/hooks/use-document-upload";
import { useValidation, zodMessage, type FieldErrors } from "@/hooks/use-validation";
import { fullName } from "@/lib/helpers/format";
import { emailField, phoneField } from "@/lib/validators/forms";
import { formatMoney, formatProcessingTime } from "@/lib/helpers/pricing";
import { formatMarginPercent } from "@/lib/helpers/partner-pricing";
import { cn } from "@/lib/utils";
import {
  fieldLabel,
  friendlyError,
  incompleteApplicationSummary,
  parseIncompleteApplication,
  pruneIncomplete,
  type IncompleteApplication,
} from "@/lib/helpers/error-messages";
import {
  ApplicantForm,
  missingFor,
} from "@/components/application/applicant-form";
import { IncompleteChecklist } from "@/components/shared/incomplete-checklist";
import { FieldError } from "@/components/shared/form-field";

/* ============================================================================
 * The partner booking wizard.
 *
 * Six steps, one draft application behind them. The draft is created at the
 * end of step 2 — once a product and a customer exist, there is something
 * real to save against — and from then on every keystroke lands through the
 * same `applicants.upsert` / `documents.attach` / `applications.submit` the
 * B2C wizard uses. There is no second booking system here; there is a second
 * front door onto the same one.
 *
 * Pricing is displayed, never submitted. Every figure on screen came from
 * `partnerPricing.myProduct`, and `partnerBookings.createDraft` recomputes it
 * server-side before writing anything.
 * ========================================================================== */

const STEPS = [
  { id: 1, label: "Service" },
  { id: 2, label: "Customer" },
  { id: 3, label: "Travellers" },
  { id: 4, label: "Documents" },
  { id: 5, label: "Review" },
] as const;

export default function PartnerNewBookingPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <NewBookingWizard />
    </Suspense>
  );
}

function NewBookingWizard() {
  const router = useRouter();
  const params = useSearchParams();

  const draftParam = params.get("draft");
  const productParam = params.get("product");
  const customerParam = params.get("customer");

  const [step, setStep] = useState(1);
  const [visaProductId, setVisaProductId] = useState<Id<"visaProducts"> | null>(
    productParam ? (productParam as Id<"visaProducts">) : null,
  );
  const [travellerCount, setTravellerCount] = useState(1);
  const [partnerCustomerId, setPartnerCustomerId] =
    useState<Id<"partnerCustomers"> | null>(
      customerParam ? (customerParam as Id<"partnerCustomers">) : null,
    );
  const [newCustomer, setNewCustomer] = useState({
    fullName: "",
    email: "",
    phone: "",
    reference: "",
  });
  const [useNewCustomer, setUseNewCustomer] = useState(false);
  const [applicationId, setApplicationId] = useState<Id<"applications"> | null>(
    draftParam ? (draftParam as Id<"applications">) : null,
  );
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [incomplete, setIncomplete] = useState<IncompleteApplication | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const createDraft = useMutation(api.partnerBookings.createDraft);
  const submit = useMutation(api.applications.submit);
  const discardDraft = useMutation(api.partnerBookings.discardDraft);

  // Once a draft exists it is the source of truth for product, travellers and
  // customer — so a reload, or a partner coming back tomorrow, resumes
  // exactly where they were rather than from an empty form.
  const draft = useQuery(
    api.applications.getDraft,
    applicationId ? { applicationId } : "skip",
  );

  // Adopt the draft's own product and traveller count during render, keyed on
  // which draft we are looking at. An effect would re-run on every reactive
  // re-read from Convex and fight whatever the partner is editing.
  const [adoptedDraft, setAdoptedDraft] = useState<string | null>(null);
  const draftKey = draft?.application?._id ?? null;
  if (draftKey && draftKey !== adoptedDraft && draft?.application) {
    setAdoptedDraft(draftKey);
    setVisaProductId(draft.application.visaProductId);
    setTravellerCount(draft.application.travellerCount);
    // A resumed draft starts on the travellers step: the first two are done.
    setStep((current) => (current === 1 ? 3 : current));
  }

  const quote = useQuery(
    api.partnerPricing.myProduct,
    visaProductId ? { visaProductId, travellerCount } : "skip",
  );

  // The refused-submit checklist, minus whatever has been fixed since.
  const liveIncomplete = useMemo(() => {
    if (!incomplete) return null;
    const required = new Set(draft?.product?.requiredApplicantFields ?? []);
    return pruneIncomplete(incomplete, {
      travellers: (draft?.applicants ?? []).map((a) => ({
        id: a._id,
        missingKeys: missingFor(a, required),
      })),
      uploaded: (draft?.documents ?? []).map((d) => ({
        documentKey: d.documentKey,
        applicantId: d.applicantId,
      })),
      termsAccepted,
      travellerCount,
    });
  }, [incomplete, draft, termsAccepted, travellerCount]);

  // Validated when Continue / Submit is clicked, then live: the button is never
  // disabled for a reason the user cannot see.
  const validateStep = useCallback((): FieldErrors => {
    const errors: FieldErrors = {};
    if (step === 1) {
      if (!visaProductId) errors["service-list"] = "Choose a visa service to continue.";
      if (!(travellerCount >= 1)) errors["traveller-count"] = "At least one traveller.";
    } else if (step === 2) {
      if (useNewCustomer) {
        if (newCustomer.fullName.trim().length < 2) {
          errors["nc-name"] = "Enter the customer's name.";
        }
        const email = zodMessage(emailField, newCustomer.email);
        if (email) errors["nc-email"] = email;
        if (newCustomer.phone.trim()) {
          const phone = zodMessage(phoneField, newCustomer.phone);
          if (phone) errors["nc-phone"] = phone;
        }
      } else if (!partnerCustomerId) {
        errors["customer-list"] = "Choose a customer, or add a new one.";
      }
    } else if (step === STEPS.length && !termsAccepted) {
      errors["partner-terms"] = "Confirm your customer has agreed to the terms.";
    }
    return errors;
  }, [step, visaProductId, travellerCount, useNewCustomer, newCustomer, partnerCustomerId, termsAccepted]);
  const { errors, check } = useValidation(validateStep, step);

  /** Create (or reuse) the draft, which is what steps 3+ write against. */
  const ensureDraft = useCallback(async (): Promise<Id<"applications"> | null> => {
    if (applicationId) return applicationId;
    if (!visaProductId) return null;

    setCreating(true);
    try {
      const result = await createDraft({
        visaProductId,
        travellerCount,
        partnerCustomerId: useNewCustomer ? undefined : (partnerCustomerId ?? undefined),
        newCustomer: useNewCustomer
          ? {
              fullName: newCustomer.fullName.trim(),
              email: newCustomer.email.trim().toLowerCase(),
              phone: newCustomer.phone.trim() || undefined,
              reference: newCustomer.reference.trim() || undefined,
            }
          : undefined,
      });

      setApplicationId(result.applicationId);
      setPartnerCustomerId(result.partnerCustomerId);
      toast.success(
        result.reused
          ? `Resuming ${result.referenceId}.`
          : `Booking ${result.referenceId} started.`,
        {
          description: `${formatMoney(result.partnerPrice, result.currency)} · your margin ${formatMoney(
            result.marginAmount,
            result.currency,
          )}.`,
        },
      );
      return result.applicationId;
    } catch (error) {
      toast.error(
        friendlyError(error, "Could not start the booking."),
      );
      return null;
    } finally {
      setCreating(false);
    }
  }, [
    applicationId,
    createDraft,
    newCustomer,
    partnerCustomerId,
    travellerCount,
    useNewCustomer,
    visaProductId,
  ]);

  async function goNext() {
    if (step === 1) {
      if (!check()) return;
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!check()) return;
      const id = await ensureDraft();
      if (id) setStep(3);
      return;
    }

    setStep((current) => Math.min(current + 1, STEPS.length));
  }

  async function handleSubmit() {
    if (!applicationId) return;
    if (!check()) return;

    setSubmitting(true);
    setIncomplete(null);
    try {
      const result = await submit({ applicationId, acceptTerms: true });
      toast.success(`Booking ${result.referenceId} submitted.`, {
        description: "Our team will start processing it and keep you updated.",
      });
      router.push(`/partner/bookings/${result.applicationId}`);
    } catch (error) {
      const details = parseIncompleteApplication(error);
      if (details) {
        setIncomplete(details);
        toast.error(incompleteApplicationSummary(details));
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        toast.error(friendlyError(error, "Could not submit the booking."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/partner/bookings" },
          { label: "New booking" },
        ]}
        title="New booking"
        description="Create a visa application on behalf of one of your customers."
        actions={
          applicationId && draft?.application?.isDraft ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={async () => {
                try {
                  await discardDraft({ applicationId });
                  toast.success("Draft discarded.");
                  router.push("/partner/bookings");
                } catch (error) {
                  toast.error(
                    friendlyError(error, "Could not discard the draft."),
                  );
                }
              }}
            >
              <Trash2 className="size-3.5" aria-hidden />
              Discard
            </Button>
          ) : undefined
        }
      />

      <Stepper current={step} onJump={(id) => applicationId && setStep(id)} />

      {liveIncomplete && (
        <IncompleteChecklist
          info={liveIncomplete}
          onFix={(target) => {
            if (target === "travellers") {
              setEditingId(
                liveIncomplete.travellers.find((t) => t.applicantId)?.applicantId ??
                  null,
              );
            }
            setStep(target === "travellers" ? 3 : 4);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {step === 1 && (
            <ServiceStep
              visaProductId={visaProductId}
              onSelect={setVisaProductId}
              travellerCount={travellerCount}
              onTravellerCount={setTravellerCount}
              locked={!!applicationId}
              errors={errors}
            />
          )}

          {step === 2 && (
            <CustomerStep
              partnerCustomerId={partnerCustomerId}
              onSelect={(id) => {
                setPartnerCustomerId(id);
                setUseNewCustomer(false);
              }}
              useNewCustomer={useNewCustomer}
              onUseNewCustomer={setUseNewCustomer}
              newCustomer={newCustomer}
              onNewCustomer={setNewCustomer}
              locked={!!applicationId}
              errors={errors}
            />
          )}

          {step === 3 && applicationId && (
            <TravellersStep
              applicationId={applicationId}
              travellerCount={travellerCount}
              draft={draft}
              editingId={editingId}
              onEditingId={setEditingId}
            />
          )}

          {step === 4 && applicationId && (
            <DocumentsStep applicationId={applicationId} draft={draft} />
          )}

          {step === 5 && applicationId && (
            <ReviewStep
              draft={draft}
              termsAccepted={termsAccepted}
              onTermsAccepted={setTermsAccepted}
              error={errors["partner-terms"]}
            />
          )}

          {step > 2 && !applicationId && (
            <EmptyState
              icon={FileText}
              title="Start at the beginning"
              description="Pick a visa service and a customer first."
              action={<Button onClick={() => setStep(1)}>Go to step 1</Button>}
            />
          )}

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => setStep((current) => Math.max(1, current - 1))}
              disabled={step === 1 || creating || submitting}
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </Button>

            {step < STEPS.length ? (
              <Button onClick={goNext} disabled={creating}>
                {creating && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {step === 2 && !applicationId ? "Start booking" : "Continue"}
                {!creating && <ArrowRight className="size-4" aria-hidden />}
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {submitting ? "Submitting…" : "Submit booking"}
                {!submitting && <Check className="size-4" aria-hidden />}
              </Button>
            )}
          </div>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <QuoteSummary quote={quote} travellerCount={travellerCount} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   stepper                                  */
/* -------------------------------------------------------------------------- */

function Stepper({
  current,
  onJump,
}: {
  current: number;
  onJump: (id: number) => void;
}) {
  return (
    <ol className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
      {STEPS.map((step) => {
        const done = step.id < current;
        const active = step.id === current;

        return (
          <li key={step.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onJump(step.id)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-brand",
                active
                  ? "border-brand/25 bg-brand-tint text-brand-deep"
                  : done
                    ? "border-border bg-background text-foreground"
                    : "border-border bg-background text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] tabular-nums",
                  active
                    ? "bg-brand text-brand-foreground"
                    : done
                      ? "bg-success text-white"
                      : "bg-muted text-muted-foreground",
                )}
                aria-hidden
              >
                {done ? <Check className="size-3" /> : step.id}
              </span>
              {step.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*                               step 1: service                              */
/* -------------------------------------------------------------------------- */

function ServiceStep({
  visaProductId,
  onSelect,
  travellerCount,
  onTravellerCount,
  locked,
  errors,
}: {
  visaProductId: Id<"visaProducts"> | null;
  onSelect: (id: Id<"visaProducts">) => void;
  travellerCount: number;
  onTravellerCount: (count: number) => void;
  locked: boolean;
  errors: FieldErrors;
}) {
  const [search, setSearch] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const debouncedSearch = useDebounce(search);

  const catalogue = useQuery(api.partnerPricing.myCatalogue, {
    destinationId: destinationId ? (destinationId as Id<"destinations">) : undefined,
    search: debouncedSearch.trim() || undefined,
  });

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Which visa service?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Prices shown are yours, per traveller.
          </p>
        </div>

        {locked && (
          <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
            This booking has already been started, so the service is fixed.
            Discard the draft to change it.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services"
              className="pl-9"
              aria-label="Search visa services"
              disabled={locked}
            />
          </div>

          <select
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand"
            aria-label="Filter by destination"
            disabled={locked}
          >
            <option value="">All destinations</option>
            {(catalogue?.destinations ?? []).map((destination) => (
              <option key={destination._id} value={destination._id}>
                {destination.name}
              </option>
            ))}
          </select>
        </div>

        {catalogue === undefined ? (
          <ListSkeleton rows={4} />
        ) : catalogue.rows.length === 0 ? (
          <EmptyState
            compact
            icon={Search}
            title="No services match"
            description="Try a different destination or clear the search."
          />
        ) : (
          <ul
            id="service-list"
            tabIndex={-1}
            aria-describedby={errors["service-list"] ? "service-list-error" : undefined}
            className="max-h-[26rem] space-y-2 overflow-y-auto pr-1 focus-brand"
          >
            {catalogue.rows.map((row) => {
              const selected = row.visaProductId === visaProductId;
              return (
                <li key={row.visaProductId}>
                  <button
                    type="button"
                    onClick={() => !locked && onSelect(row.visaProductId)}
                    disabled={locked && !selected}
                    aria-pressed={selected}
                    className={cn(
                      "flex w-full items-center gap-4 rounded-xl border p-3.5 text-left transition-colors focus-brand",
                      selected
                        ? "border-brand/40 bg-brand-tint"
                        : "border-border bg-background hover:border-border-strong",
                      locked && !selected && "opacity-50",
                    )}
                  >
                    <span className="text-xl" aria-hidden>
                      {row.flagEmoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {row.productName}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{row.destinationName}</span>
                        <span aria-hidden>·</span>
                        <span>{row.visaType}</span>
                        {formatProcessingTime(
                          row.processingTimeMinDays,
                          row.processingTimeMaxDays,
                          row.processingTimeNote,
                        ) && (
                          <>
                            <span aria-hidden>·</span>
                            <span>
                              {formatProcessingTime(
                                row.processingTimeMinDays,
                                row.processingTimeMaxDays,
                                row.processingTimeNote,
                              )}
                            </span>
                          </>
                        )}
                        {row.isDemoContent && <DemoContentBadge />}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">
                        {formatMoney(row.partnerPrice, row.currency)}
                      </span>
                      {row.marginAmount > 0 && (
                        <span className="block text-xs tabular-nums text-success">
                          +{formatMoney(row.marginAmount, row.currency)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {errors["service-list"] && (
          <p id="service-list-error" role="alert" className="text-xs text-destructive">
            {errors["service-list"]}
          </p>
        )}

        <Separator />

        <Field
          label="How many travellers?"
          htmlFor="traveller-count"
          error={errors["traveller-count"]}
          hint="You can add their details on the next steps."
        >
          <Input
            id="traveller-count"
            type="number"
            min={1}
            max={20}
            value={travellerCount}
            onChange={(e) =>
              onTravellerCount(
                Math.max(1, Math.min(20, Number.parseInt(e.target.value, 10) || 1)),
              )
            }
            className="w-28 tabular-nums"
            disabled={locked}
          />
        </Field>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*                               step 2: customer                             */
/* -------------------------------------------------------------------------- */

function CustomerStep({
  partnerCustomerId,
  onSelect,
  useNewCustomer,
  onUseNewCustomer,
  newCustomer,
  onNewCustomer,
  locked,
  errors,
}: {
  partnerCustomerId: Id<"partnerCustomers"> | null;
  onSelect: (id: Id<"partnerCustomers">) => void;
  useNewCustomer: boolean;
  onUseNewCustomer: (value: boolean) => void;
  newCustomer: {
    fullName: string;
    email: string;
    phone: string;
    reference: string;
  };
  onNewCustomer: (value: {
    fullName: string;
    email: string;
    phone: string;
    reference: string;
  }) => void;
  locked: boolean;
  errors: FieldErrors;
}) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  const customers = useQuery(api.partnerBookings.listMyCustomers, {
    paginationOpts: { numItems: 50, cursor: null },
    search: debouncedSearch.trim() || undefined,
  });

  const rows = customers?.page ?? [];

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Who is this for?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick someone from your book, or add a new customer.
          </p>
        </div>

        {locked && (
          <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
            This booking is already linked to a customer. Discard the draft to
            change it.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant={useNewCustomer ? "outline" : "default"}
            size="sm"
            onClick={() => onUseNewCustomer(false)}
            disabled={locked}
          >
            <Users className="size-3.5" aria-hidden />
            Existing customer
          </Button>
          <Button
            variant={useNewCustomer ? "default" : "outline"}
            size="sm"
            onClick={() => onUseNewCustomer(true)}
            disabled={locked}
          >
            <Plus className="size-3.5" aria-hidden />
            New customer
          </Button>
        </div>

        {useNewCustomer ? (
          <FieldGrid>
            <Field
              label="Full name"
              required
              htmlFor="nc-name"
              className="sm:col-span-2"
              error={errors["nc-name"]}
            >
              <Input
                id="nc-name"
                value={newCustomer.fullName}
                onChange={(e) =>
                  onNewCustomer({ ...newCustomer, fullName: e.target.value })
                }
                placeholder="Rahul Mehta"
                disabled={locked}
              />
            </Field>
            <Field label="Email" required htmlFor="nc-email" error={errors["nc-email"]}>
              <Input
                id="nc-email"
                type="email"
                value={newCustomer.email}
                onChange={(e) =>
                  onNewCustomer({ ...newCustomer, email: e.target.value })
                }
                placeholder="rahul@example.com"
                disabled={locked}
              />
            </Field>
            <Field label="Phone" htmlFor="nc-phone" error={errors["nc-phone"]}>
              <PhoneField
                id="nc-phone"
                value={newCustomer.phone}
                onChange={(next) =>
                  onNewCustomer({ ...newCustomer, phone: next })
                }
                disabled={locked}
              />
            </Field>
            <Field
              label="Your reference"
              htmlFor="nc-ref"
              hint="Optional. Your own file number."
              className="sm:col-span-2"
            >
              <Input
                id="nc-ref"
                value={newCustomer.reference}
                onChange={(e) =>
                  onNewCustomer({ ...newCustomer, reference: e.target.value })
                }
                placeholder="Mehta family — Europe 2026"
                disabled={locked}
              />
            </Field>
          </FieldGrid>
        ) : (
          <>
            <div className="relative w-full max-w-xs">
              <Search
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your customers"
                className="pl-9"
                aria-label="Search your customers"
                disabled={locked}
              />
            </div>

            {customers === undefined ? (
              <ListSkeleton rows={3} />
            ) : rows.length === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title={search ? "No customers match" : "No customers yet"}
                description="Add a new customer instead — they are saved to your book automatically."
                action={
                  <Button size="sm" onClick={() => onUseNewCustomer(true)}>
                    <Plus className="size-3.5" aria-hidden />
                    New customer
                  </Button>
                }
              />
            ) : (
              <ul
                id="customer-list"
                tabIndex={-1}
                aria-describedby={
                  errors["customer-list"] ? "customer-list-error" : undefined
                }
                className="max-h-80 space-y-2 overflow-y-auto pr-1 focus-brand"
              >
                {rows.map((customer) => {
                  const selected = customer._id === partnerCustomerId;
                  return (
                    <li key={customer._id}>
                      <button
                        type="button"
                        onClick={() => !locked && onSelect(customer._id)}
                        disabled={locked && !selected}
                        aria-pressed={selected}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-brand",
                          selected
                            ? "border-brand/40 bg-brand-tint"
                            : "border-border bg-background hover:border-border-strong",
                          locked && !selected && "opacity-50",
                        )}
                      >
                        <User
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {customer.fullName}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {customer.email}
                            {customer.reference ? ` · ${customer.reference}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {customer.bookingCount} booking
                          {customer.bookingCount === 1 ? "" : "s"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {errors["customer-list"] && (
              <p
                id="customer-list-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {errors["customer-list"]}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*                              step 3: travellers                            */
/* -------------------------------------------------------------------------- */

type DraftPayload =
  | {
      application: Doc<"applications">;
      applicants: Doc<"applicants">[];
      documents: Doc<"documents">[];
      product: Doc<"visaProducts"> | null;
      requirements: Doc<"visaRequirements">[];
      destination: Doc<"destinations"> | null;
    }
  | undefined;

function TravellersStep({
  applicationId,
  travellerCount,
  draft,
  editingId,
  onEditingId,
}: {
  applicationId: Id<"applications">;
  travellerCount: number;
  draft: DraftPayload;
  /** The traveller whose details are open for editing, if any. */
  editingId: string | null;
  onEditingId: (id: string | null) => void;
}) {
  const remove = useMutation(api.applicants.remove);

  const applicants = draft?.applicants ?? [];
  const requiredFields = useMemo(
    () => new Set(draft?.product?.requiredApplicantFields ?? []),
    [draft?.product?.requiredApplicantFields],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Travellers</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {applicants.length} of {travellerCount} added.
              </p>
            </div>
            {applicants.length === travellerCount && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
                <CheckCircle2 className="size-3.5" aria-hidden />
                All travellers added
              </span>
            )}
          </div>

          {applicants.length === 0 ? (
            <EmptyState
              compact
              icon={User}
              title="No travellers yet"
              description="Add the people who are applying for this visa."
            />
          ) : (
            <ul className="divide-y divide-border">
              {applicants.map((applicant) => {
                const missing = missingFor(applicant, requiredFields);
                const editing = editingId === applicant._id;
                return (
                  <li key={applicant._id} className="py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {fullName(applicant)}
                          {applicant.isPrimary && (
                            <span className="ml-2 rounded-full border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              Primary
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {missing.length > 0
                            ? `Still to fill in: ${missing.map(fieldLabel).join(", ")}`
                            : [
                                applicant.nationality,
                                applicant.passportNumber
                                  ? `Passport ${applicant.passportNumber}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "Details complete"}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEditingId(editing ? null : applicant._id)}
                        aria-expanded={editing}
                      >
                        {editing ? "Close" : "Edit details"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${fullName(applicant)}`}
                        onClick={async () => {
                          try {
                            await remove({ applicationId, applicantId: applicant._id });
                            if (editing) onEditingId(null);
                            toast.success("Traveller removed.");
                          } catch (error) {
                            toast.error(
                              friendlyError(error, "Could not remove the traveller."),
                            );
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                    {editing && (
                      <div className="mt-4 rounded-xl border border-border bg-surface p-4">
                        <ApplicantForm
                          applicationId={applicationId}
                          applicant={applicant}
                          requiredFields={requiredFields}
                          missing={missing}
                          onSaved={() => onEditingId(null)}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {applicants.length < travellerCount && (
        <Card>
          <CardContent className="space-y-5 p-5">
            <h3 className="text-sm font-semibold tracking-tight">
              Add traveller {applicants.length + 1}
            </h3>
            <ApplicantForm
              key={applicants.length}
              applicationId={applicationId}
              requiredFields={requiredFields}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              step 4: documents                             */
/* -------------------------------------------------------------------------- */

function DocumentsStep({
  applicationId,
  draft,
}: {
  applicationId: Id<"applications">;
  draft: DraftPayload;
}) {
  const upload = useDocumentUpload({ applicationId });
  const removeDocument = useMutation(api.documents.remove);
  const [removing, setRemoving] = useState<string | null>(null);

  const requirements = draft?.requirements ?? [];
  const applicants = draft?.applicants ?? [];
  const documents = draft?.documents;

  const byKey = useMemo(() => {
    const map = new Map<string, Doc<"documents">[]>();
    for (const document of documents ?? []) {
      const list = map.get(document.documentKey) ?? [];
      list.push(document);
      map.set(document.documentKey, list);
    }
    return map;
  }, [documents]);

  if (requirements.length === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <EmptyState
            compact
            icon={FileText}
            title="No documents required"
            description="This service has no document checklist. Continue to the review step."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-5">
          <h2 className="text-base font-semibold tracking-tight">Documents</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload your customer&apos;s paperwork. Anything mandatory has to be
            in before the booking can be submitted.
          </p>
        </CardContent>
      </Card>

      {requirements.map((requirement) => {
        const perTraveller =
          requirement.appliesTo === "all" && applicants.length > 0;
        const all = byKey.get(requirement.documentKey) ?? [];
        // One block per traveller for "all" requirements; otherwise a single
        // block with no applicantId (matches the server's completeness check).
        const blocks: {
          id: string;
          applicantId?: Id<"applicants">;
          name?: string;
          uploaded: Doc<"documents">[];
        }[] = perTraveller
          ? applicants.map((applicant) => ({
              id: applicant._id,
              applicantId: applicant._id,
              name: fullName(applicant),
              uploaded: all.filter((d) => d.applicantId === applicant._id),
            }))
          : [{ id: "general", uploaded: all }];

        return (
          <Card key={requirement._id}>
            <CardContent className="space-y-4 p-5">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {requirement.label}
                  {requirement.isMandatory && (
                    <span className="ml-0.5 text-destructive" aria-label="required">
                      *
                    </span>
                  )}
                </p>
                {requirement.description && (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {requirement.description}
                  </p>
                )}
                {perTraveller && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Needed for each traveller.
                  </p>
                )}
              </div>

              {blocks.map((block) => (
                <div
                  key={block.id}
                  className={
                    perTraveller
                      ? "space-y-2 rounded-lg border border-border p-3"
                      : "space-y-2"
                  }
                >
                  {perTraveller && (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium">{block.name}</p>
                      {block.uploaded.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="size-3.5" aria-hidden />
                          Uploaded
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Not uploaded
                        </span>
                      )}
                    </div>
                  )}

                  {block.uploaded.length > 0 && (
                    <ul className="space-y-1.5">
                      {block.uploaded.map((document) => (
                        <li
                          key={document._id}
                          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs"
                        >
                          <FileText
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {document.fileName}
                          </span>
                          <CheckCircle2 className="size-3.5 text-success" aria-hidden />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            aria-label={`Remove ${document.fileName}`}
                            disabled={removing === document._id}
                            onClick={async () => {
                              setRemoving(document._id);
                              try {
                                await removeDocument({ documentId: document._id });
                                toast.success(`${document.fileName} removed.`);
                              } catch (error) {
                                toast.error(
                                  friendlyError(error, "Could not remove the file."),
                                );
                              } finally {
                                setRemoving(null);
                              }
                            }}
                          >
                            {removing === document._id ? (
                              <Loader2 className="size-3 animate-spin" aria-hidden />
                            ) : (
                              <Trash2 className="size-3" aria-hidden />
                            )}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <FileDropzone
                    compact
                    multiple={!perTraveller}
                    uploads={upload.uploads.filter((u) =>
                      u.id.startsWith(
                        `${requirement.documentKey}:${block.applicantId ?? "general"}:`,
                      ),
                    )}
                    onRemove={upload.removeUpload}
                    allowedMimeTypes={requirement.allowedMimeTypes}
                    maxSizeBytes={requirement.maxSizeBytes}
                    onFiles={(files) => {
                      void upload.uploadMany(files, {
                        documentKey: requirement.documentKey,
                        label: requirement.label,
                        applicantId: block.applicantId,
                        constraints: {
                          allowedMimeTypes: requirement.allowedMimeTypes,
                          maxSizeBytes: requirement.maxSizeBytes,
                        },
                      });
                    }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Upload className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Files are private to this application. VisaDrive staff review each one
        and will come back to you if anything needs replacing.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               step 5: review                               */
/* -------------------------------------------------------------------------- */

function ReviewStep({
  draft,
  termsAccepted,
  onTermsAccepted,
  error,
}: {
  draft: DraftPayload;
  termsAccepted: boolean;
  onTermsAccepted: (value: boolean) => void;
  error?: string;
}) {
  if (!draft) return <ListSkeleton rows={4} />;

  const { application, applicants, documents } = draft;
  const margin = application.partnerMargin;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5 p-5">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Review and submit
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Check everything before this goes to the VisaDrive team.
            </p>
          </div>

          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <ReviewRow label="Reference">
              <span className="font-mono">{application.referenceId}</span>
            </ReviewRow>
            <ReviewRow label="Customer">{application.customerName}</ReviewRow>
            <ReviewRow label="Service">{application.visaProductName}</ReviewRow>
            <ReviewRow label="Destination">
              {application.destinationName}
            </ReviewRow>
            <ReviewRow label="Travellers">
              {applicants.length} of {application.travellerCount}
            </ReviewRow>
            <ReviewRow label="Documents">
              {documents.length} uploaded
            </ReviewRow>
          </dl>

          <Separator />

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Travellers
            </p>
            {applicants.length === 0 ? (
              <p className="mt-2 text-sm text-destructive">
                No travellers have been added yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {applicants.map((applicant) => (
                  <li key={applicant._id} className="text-sm">
                    {fullName(applicant)}
                    {applicant.passportNumber && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {applicant.passportNumber}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            What this booking is worth
          </p>
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">VisaDrive base price</dt>
              <dd className="tabular-nums">
                {formatMoney(
                  margin?.basePrice ?? application.pricing.total,
                  application.pricing.currency,
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Your customer pays</dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(
                  application.pricing.total,
                  application.pricing.currency,
                )}
              </dd>
            </div>
            {margin && margin.marginAmount > 0 && (
              <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2.5">
                <dt className="text-muted-foreground">Your margin</dt>
                <dd className="font-semibold tabular-nums text-success">
                  {formatMoney(margin.marginAmount, margin.currency)}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {formatMarginPercent(margin.marginPercent)}
                  </span>
                </dd>
              </div>
            )}
          </dl>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Recomputed by VisaDrive when you submit, from the live catalogue and
            your agreed rate. This figure is what gets charged.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="partner-terms"
              checked={termsAccepted}
              onCheckedChange={(checked) => onTermsAccepted(checked === true)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "partner-terms-error" : undefined}
              className="mt-0.5"
            />
            <Label
              htmlFor="partner-terms"
              className="text-sm font-normal leading-relaxed text-muted-foreground"
            >
              I confirm my customer has agreed to VisaDrive&apos;s{" "}
              <Link
                href="/terms"
                target="_blank"
                className="rounded-sm font-medium text-brand transition-colors hover:text-brand-deep focus-brand"
              >
                terms
              </Link>{" "}
              and{" "}
              <Link
                href="/refund-policy"
                target="_blank"
                className="rounded-sm font-medium text-brand transition-colors hover:text-brand-deep focus-brand"
              >
                refund policy
              </Link>
              , and that the details above are accurate.
            </Label>
          </div>
          <div className="mt-2">
            <FieldError id="partner-terms" message={error} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   summary                                  */
/* -------------------------------------------------------------------------- */

function QuoteSummary({
  quote,
  travellerCount,
}: {
  quote: ReturnType<typeof useQuery<typeof api.partnerPricing.myProduct>>;
  travellerCount: number;
}) {
  if (quote === undefined) {
    return (
      <Card>
        <CardContent className="p-5">
          <ListSkeleton rows={1} />
        </CardContent>
      </Card>
    );
  }

  if (!quote) {
    return (
      <Card>
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground">
            Pick a visa service to see your price.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { product, destination, quote: pricing } = quote;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Your quote
          </p>
          <p className="mt-1.5 text-sm font-medium">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            {destination?.name}
            {product.isDemoContent && (
              <>
                {" "}
                <DemoContentBadge />
              </>
            )}
          </p>
        </div>

        <Separator />

        <dl className="space-y-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">Travellers</dt>
            <dd className="tabular-nums">{travellerCount}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">Base price</dt>
            <dd className="tabular-nums">
              {formatMoney(pricing.basePrice, pricing.currency)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="font-medium">Customer pays</dt>
            <dd className="text-base font-semibold tabular-nums">
              {formatMoney(pricing.partnerPrice, pricing.currency)}
            </dd>
          </div>
          {pricing.marginAmount > 0 && (
            <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2.5">
              <dt className="text-muted-foreground">Your margin</dt>
              <dd className="font-semibold tabular-nums text-success">
                {formatMoney(pricing.marginAmount, pricing.currency)}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {formatMarginPercent(pricing.marginPercent)}
                </span>
              </dd>
            </div>
          )}
        </dl>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {pricing.source === "product"
            ? "A rate agreed specifically for this service."
            : pricing.source === "default"
              ? "Your account's standard markup."
              : "VisaDrive's base price — no markup is configured for this service."}
        </p>
      </CardContent>
    </Card>
  );
}
