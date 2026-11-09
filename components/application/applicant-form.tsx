"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Loader2, Save, User, MapPin, BadgeCheck } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldGrid, FormSection } from "@/components/shared/form-field";
import { CountrySelect } from "@/components/shared/country-select";
import { DateField } from "@/components/shared/date-field";
import { PhoneField } from "@/components/shared/phone-field";
import { friendlyError } from "@/lib/helpers/error-messages";

/**
 * The traveller details form, shared by the customer booking wizard and the
 * partner booking wizard. Both write through `applicants.upsert`, which
 * resolves access from the session, so nothing here carries a role or id.
 */

export const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const MARITAL_STATUSES = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
];

export function toDateInput(ms?: number): string {
  if (!ms) return "";
  const date = new Date(ms);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function fromDateInput(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export interface ApplicantDraft {
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

export const EMPTY_APPLICANT: ApplicantDraft = {
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

export function applicantToDraft(applicant: Doc<"applicants">): ApplicantDraft {
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
export function missingFor(
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


export function ApplicantForm({
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
  const [attempted, setAttempted] = useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

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

  // What is still empty right now. Names always block a save; the rest of the
  // required details are pointed out but never stop a half-finished traveller
  // from being saved, because a draft is allowed to be incomplete.
  const emptyNow = new Set(
    (["firstName", "lastName", ...Array.from(requiredFields)] as string[]).filter(
      (key) => {
        const value = key === "address" ? values.line1 : (values as unknown as Record<string, string>)[key];
        return typeof value === "string" && value.trim() === "";
      },
    ),
  );

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (emptyNow.has("firstName") || emptyNow.has("lastName")) {
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
      return;
    }
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
      setAttempted(false);
      toast.success(applicant ? "Traveller updated." : "Traveller added.");
      onSaved?.();
      if (!applicant) setValues(EMPTY_APPLICANT);
    } catch (error) {
      toast.error(
        friendlyError(error, "Could not save this traveller."),
      );
    } finally {
      setSaving(false);
    }
  }

  /** Flags a field the server has already told us is missing. */
  const flag = (key: string) => {
    if (!emptyNow.has(key)) return undefined;
    if (key === "firstName") return attempted ? "Enter the first name." : undefined;
    if (key === "lastName") return attempted ? "Enter the last name." : undefined;
    return attempted || missingSet.has(key) ? "Required for this visa" : undefined;
  };

  return (
    <form ref={formRef} onSubmit={handleSave} noValidate className="space-y-7">
      <FormSection icon={User} title="Personal details">
        <FieldGrid>
          <Field label="First name" required error={flag("firstName")}>
            <Input
              value={values.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              autoComplete="given-name"
            />
          </Field>
          <Field label="Last name" required error={flag("lastName")}>
            <Input
              value={values.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              autoComplete="family-name"
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

