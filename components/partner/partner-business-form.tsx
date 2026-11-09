"use client";

import { useCallback, useState } from "react";
import { Building2, Contact, MapPin } from "lucide-react";

import { CountrySelect } from "@/components/shared/country-select";
import { Field, FieldGrid, FormSection } from "@/components/shared/form-field";
import { PhoneField } from "@/components/shared/phone-field";
import { Input } from "@/components/ui/input";
import { useValidation, type FieldErrors } from "@/hooks/use-validation";
import {
  PARTNER_BUSINESS_TYPES,
  PARTNER_BUSINESS_TYPE_LABELS,
  type PartnerBusinessType,
} from "@/lib/constants/partners";

/**
 * The business + contact block, shared by the public partner registration
 * form, the partner's own profile page and the CRM's "add a partner" dialog.
 *
 * One component for all three means a field added for compliance reasons
 * appears in every place a partner record can be created, rather than in
 * whichever form somebody remembered.
 *
 * Validation here is the convenience layer. `convex/partners.ts` re-validates
 * every field — and is the only thing that decides whether the record is
 * written.
 */

export interface PartnerBusinessValue {
  agencyName: string;
  businessType: PartnerBusinessType;
  gstNumber: string;
  panNumber: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  contactPersonName: string;
  contactEmail: string;
  contactPhone: string;
  alternatePhone: string;
}

export const EMPTY_PARTNER_BUSINESS: PartnerBusinessValue = {
  agencyName: "",
  businessType: "travel_agency",
  gstNumber: "",
  panNumber: "",
  website: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
  contactPersonName: "",
  contactEmail: "",
  contactPhone: "",
  alternatePhone: "",
};

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export type PartnerBusinessErrors = Partial<
  Record<keyof PartnerBusinessValue, string>
>;

/** The same checks Convex runs, so the form can point at the offending field. */
export function validatePartnerBusiness(
  value: PartnerBusinessValue,
): PartnerBusinessErrors {
  const errors: PartnerBusinessErrors = {};

  if (value.agencyName.trim().length < 2) {
    errors.agencyName = "Enter the registered name of the business.";
  }
  if (value.addressLine1.trim().length < 3) {
    errors.addressLine1 = "Enter the business address.";
  }
  if (value.city.trim().length < 2) errors.city = "Enter the city.";
  if (value.country.trim().length < 2) errors.country = "Choose a country.";
  if (value.contactPersonName.trim().length < 2) {
    errors.contactPersonName = "Who should we speak to?";
  }
  if (!value.contactEmail.trim().includes("@")) {
    errors.contactEmail = "Enter a valid email address.";
  }
  if (value.contactPhone.replace(/\D/g, "").length < 8) {
    errors.contactPhone = "Enter a mobile number we can reach you on.";
  }
  if (value.gstNumber.trim() && !GSTIN.test(value.gstNumber.trim().toUpperCase())) {
    errors.gstNumber =
      "That does not look like a GSTIN. Leave it blank if you are not registered.";
  }
  if (value.website.trim() && !/^https?:\/\//i.test(value.website.trim())) {
    errors.website = "Start the address with http:// or https://";
  }

  return errors;
}

/** Control-id suffix per validated field, in the order they appear on screen. */
const VALIDATED_FIELDS: [keyof PartnerBusinessValue, string][] = [
  ["agencyName", "agency"],
  ["gstNumber", "gst"],
  ["website", "website"],
  ["addressLine1", "line1"],
  ["city", "city"],
  ["country", "country"],
  ["contactPersonName", "contact"],
  ["contactEmail", "email"],
  ["contactPhone", "phone"],
];

/**
 * Validate-on-click for any form that hosts the business block: `check()` on
 * Save reveals every error, focuses the first, and the errors then clear as
 * each field is fixed. `errors` plugs straight into `PartnerBusinessForm`.
 */
export function usePartnerBusinessValidation(
  value: PartnerBusinessValue,
  idPrefix: string,
) {
  const validate = useCallback((): FieldErrors => {
    const found = validatePartnerBusiness(value);
    const byId: FieldErrors = {};
    for (const [key, suffix] of VALIDATED_FIELDS) {
      const message = found[key];
      if (message) byId[`${idPrefix}-${suffix}`] = message;
    }
    return byId;
  }, [value, idPrefix]);

  const { errors: byId, check, reset } = useValidation(validate);

  const errors: PartnerBusinessErrors = {};
  for (const [key, suffix] of VALIDATED_FIELDS) {
    const message = byId[`${idPrefix}-${suffix}`];
    if (message) errors[key] = message;
  }

  return { errors, check, reset };
}

/** The payload shape the Convex mutations take. */
export function toPartnerBusinessArgs(value: PartnerBusinessValue) {
  const optional = (v: string) => {
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  return {
    agencyName: value.agencyName.trim(),
    businessType: value.businessType,
    gstNumber: optional(value.gstNumber)?.toUpperCase(),
    panNumber: optional(value.panNumber)?.toUpperCase(),
    website: optional(value.website),
    addressLine1: value.addressLine1.trim(),
    addressLine2: optional(value.addressLine2),
    city: value.city.trim(),
    state: optional(value.state),
    postalCode: optional(value.postalCode),
    country: value.country.trim(),
    contactPersonName: value.contactPersonName.trim(),
    contactEmail: value.contactEmail.trim().toLowerCase(),
    contactPhone: value.contactPhone.trim(),
    alternatePhone: optional(value.alternatePhone),
  };
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

export function PartnerBusinessForm({
  value,
  onChange,
  errors = {},
  disabled = false,
  idPrefix = "partner",
}: {
  value: PartnerBusinessValue;
  onChange: (next: PartnerBusinessValue) => void;
  errors?: PartnerBusinessErrors;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const set = <K extends keyof PartnerBusinessValue>(
    key: K,
    next: PartnerBusinessValue[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <div className="space-y-8">
      <FormSection
        title="Business information"
        description="As it appears on your registration documents."
        icon={Building2}
      >
        <FieldGrid>
          <Field
            label="Agency / business name"
            required
            htmlFor={`${idPrefix}-agency`}
            error={errors.agencyName}
            className="sm:col-span-2"
          >
            <Input
              id={`${idPrefix}-agency`}
              value={value.agencyName}
              onChange={(e) => set("agencyName", e.target.value)}
              placeholder="Horizon Travels Pvt Ltd"
              disabled={disabled}
              aria-invalid={!!errors.agencyName}
            />
          </Field>

          <Field
            label="Business type"
            required
            htmlFor={`${idPrefix}-type`}
            error={errors.businessType}
          >
            <select
              id={`${idPrefix}-type`}
              value={value.businessType}
              onChange={(e) =>
                set("businessType", e.target.value as PartnerBusinessType)
              }
              className={selectClass}
              disabled={disabled}
            >
              {PARTNER_BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PARTNER_BUSINESS_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="GST number"
            htmlFor={`${idPrefix}-gst`}
            error={errors.gstNumber}
            hint="Optional. Leave blank if you are not GST registered."
          >
            <Input
              id={`${idPrefix}-gst`}
              value={value.gstNumber}
              onChange={(e) => set("gstNumber", e.target.value.toUpperCase())}
              placeholder="27AAAAA0000A1Z5"
              className="font-mono"
              maxLength={15}
              disabled={disabled}
              aria-invalid={!!errors.gstNumber}
            />
          </Field>

          <Field label="PAN" htmlFor={`${idPrefix}-pan`} hint="Optional.">
            <Input
              id={`${idPrefix}-pan`}
              value={value.panNumber}
              onChange={(e) => set("panNumber", e.target.value.toUpperCase())}
              placeholder="AAAAA0000A"
              className="font-mono"
              maxLength={10}
              disabled={disabled}
            />
          </Field>

          <Field
            label="Website"
            htmlFor={`${idPrefix}-website`}
            error={errors.website}
            hint="Optional."
          >
            <Input
              id={`${idPrefix}-website`}
              type="url"
              value={value.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://horizontravels.in"
              disabled={disabled}
              aria-invalid={!!errors.website}
            />
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection
        title="Registered address"
        description="Where the business operates from."
        icon={MapPin}
      >
        <FieldGrid>
          <Field
            label="Address"
            required
            htmlFor={`${idPrefix}-line1`}
            error={errors.addressLine1}
            className="sm:col-span-2"
          >
            <Input
              id={`${idPrefix}-line1`}
              value={value.addressLine1}
              onChange={(e) => set("addressLine1", e.target.value)}
              placeholder="Unit 4, Linking Road"
              disabled={disabled}
              aria-invalid={!!errors.addressLine1}
            />
          </Field>

          <Field
            label="Address line 2"
            htmlFor={`${idPrefix}-line2`}
            className="sm:col-span-2"
          >
            <Input
              id={`${idPrefix}-line2`}
              value={value.addressLine2}
              onChange={(e) => set("addressLine2", e.target.value)}
              placeholder="Khar West"
              disabled={disabled}
            />
          </Field>

          <Field label="City" required htmlFor={`${idPrefix}-city`} error={errors.city}>
            <Input
              id={`${idPrefix}-city`}
              value={value.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Mumbai"
              disabled={disabled}
              aria-invalid={!!errors.city}
            />
          </Field>

          <Field label="State" htmlFor={`${idPrefix}-state`}>
            <Input
              id={`${idPrefix}-state`}
              value={value.state}
              onChange={(e) => set("state", e.target.value)}
              placeholder="Maharashtra"
              disabled={disabled}
            />
          </Field>

          <Field label="Postal code" htmlFor={`${idPrefix}-postal`}>
            <Input
              id={`${idPrefix}-postal`}
              value={value.postalCode}
              onChange={(e) => set("postalCode", e.target.value)}
              placeholder="400052"
              disabled={disabled}
            />
          </Field>

          <Field
            label="Country"
            required
            htmlFor={`${idPrefix}-country`}
            error={errors.country}
          >
            <CountrySelect
              id={`${idPrefix}-country`}
              value={value.country}
              onChange={(next) => set("country", next)}
              disabled={disabled}
              aria-invalid={!!errors.country}
            />
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection
        title="Contact person"
        description="Who we speak to about bookings and approvals."
        icon={Contact}
      >
        <FieldGrid>
          <Field
            label="Full name"
            required
            htmlFor={`${idPrefix}-contact`}
            error={errors.contactPersonName}
          >
            <Input
              id={`${idPrefix}-contact`}
              value={value.contactPersonName}
              onChange={(e) => set("contactPersonName", e.target.value)}
              placeholder="Priya Shah"
              disabled={disabled}
              aria-invalid={!!errors.contactPersonName}
            />
          </Field>

          <Field
            label="Email address"
            required
            htmlFor={`${idPrefix}-email`}
            error={errors.contactEmail}
            hint="This becomes the partner portal sign-in."
          >
            <Input
              id={`${idPrefix}-email`}
              type="email"
              value={value.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              placeholder="priya@horizontravels.in"
              disabled={disabled}
              aria-invalid={!!errors.contactEmail}
            />
          </Field>

          <Field
            label="Mobile number"
            required
            htmlFor={`${idPrefix}-phone`}
            error={errors.contactPhone}
          >
            <PhoneField
              id={`${idPrefix}-phone`}
              value={value.contactPhone}
              onChange={(next) => set("contactPhone", next)}
              disabled={disabled}
              aria-invalid={!!errors.contactPhone}
            />
          </Field>

          <Field label="Alternative number" htmlFor={`${idPrefix}-alt`}>
            <PhoneField
              id={`${idPrefix}-alt`}
              value={value.alternatePhone}
              onChange={(next) => set("alternatePhone", next)}
              disabled={disabled}
            />
          </Field>
        </FieldGrid>
      </FormSection>
    </div>
  );
}

/**
 * Keep a form in step with a record that arrives asynchronously, without
 * stamping over what the person is currently typing.
 *
 * The reset happens *during render*, keyed on the record's identity, rather
 * than in an effect. That is the pattern React recommends for derived state:
 * an effect would re-run after every reactive re-read from Convex and wipe a
 * half-typed field, and it would cost an extra render each time.
 */
export function usePartnerBusinessState(
  source: Partial<PartnerBusinessValue> | null | undefined,
  key: string | null | undefined,
) {
  const [value, setValue] = useState<PartnerBusinessValue>(() => ({
    ...EMPTY_PARTNER_BUSINESS,
    ...stripUndefined(source),
  }));
  const [loadedKey, setLoadedKey] = useState<string | null>(key ?? null);

  const currentKey = key ?? null;
  if (currentKey !== loadedKey) {
    setLoadedKey(currentKey);
    setValue({ ...EMPTY_PARTNER_BUSINESS, ...stripUndefined(source) });
  }

  return [value, setValue] as const;
}

function stripUndefined(
  source: Partial<PartnerBusinessValue> | null | undefined,
): Partial<PartnerBusinessValue> {
  if (!source) return {};
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(source)) {
    if (val !== undefined && val !== null) out[key] = val;
  }
  return out as Partial<PartnerBusinessValue>;
}
