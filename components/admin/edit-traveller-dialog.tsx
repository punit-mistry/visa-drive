"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Loader2, Pencil, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CountrySelect } from "@/components/shared/country-select";
import { DateField } from "@/components/shared/date-field";
import { Field, FieldGrid } from "@/components/shared/form-field";
import { PhoneField } from "@/components/shared/phone-field";
import { fromDateInput, toDateInput } from "@/lib/helpers/format";

/**
 * Add or correct a traveller on a booking from the CRM.
 *
 * These are passport numbers and dates of birth, so the mutation behind this
 * form needs `application:update_status` — a support agent who can read the
 * booking cannot open this dialog, and would be refused server-side even if
 * they did.
 */

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

type Gender = "male" | "female" | "other" | "prefer_not_to_say";

export function EditTravellerDialog({
  applicationId,
  applicant,
  canRemove,
}: {
  applicationId: Id<"applications">;
  /** Omitted when adding a new traveller. */
  applicant?: Doc<"applicants">;
  canRemove?: boolean;
}) {
  const upsert = useMutation(api.applicants.upsert);
  const remove = useMutation(api.applicants.remove);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [nationality, setNationality] = useState("");
  const [occupation, setOccupation] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [passportIssueDate, setPassportIssueDate] = useState("");
  const [passportExpiryDate, setPassportExpiryDate] = useState("");
  const [passportIssuingCountry, setPassportIssuingCountry] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);

  function hydrate() {
    setFirstName(applicant?.firstName ?? "");
    setMiddleName(applicant?.middleName ?? "");
    setLastName(applicant?.lastName ?? "");
    setDateOfBirth(toDateInput(applicant?.dateOfBirth));
    setGender((applicant?.gender as Gender | undefined) ?? "");
    setNationality(applicant?.nationality ?? "");
    setOccupation(applicant?.occupation ?? "");
    setEmail(applicant?.email ?? "");
    setPhone(applicant?.phone ?? "");
    setPassportNumber(applicant?.passportNumber ?? "");
    setPassportIssueDate(toDateInput(applicant?.passportIssueDate));
    setPassportExpiryDate(toDateInput(applicant?.passportExpiryDate));
    setPassportIssuingCountry(applicant?.passportIssuingCountry ?? "");
    setIsPrimary(applicant?.isPrimary ?? false);
    setError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      await upsert({
        applicationId,
        applicantId: applicant?._id,
        data: {
          firstName: firstName.trim(),
          middleName: middleName.trim() || undefined,
          lastName: lastName.trim(),
          dateOfBirth: fromDateInput(dateOfBirth),
          gender: gender || undefined,
          nationality: nationality.trim() || undefined,
          occupation: occupation.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          passportNumber: passportNumber.trim().toUpperCase() || undefined,
          passportIssueDate: fromDateInput(passportIssueDate),
          passportExpiryDate: fromDateInput(passportExpiryDate),
          passportIssuingCountry: passportIssuingCountry.trim() || undefined,
          isPrimary,
        },
      });
      toast.success(applicant ? "Traveller updated." : "Traveller added.");
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save this traveller.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function doRemove() {
    if (!applicant) return;
    setRemoving(true);
    try {
      await remove({ applicationId, applicantId: applicant._id });
      toast.success("Traveller removed.");
      setOpen(false);
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Could not remove this traveller.",
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) hydrate();
      }}
    >
      <DialogTrigger asChild>
        {applicant ? (
          <Button variant="ghost" size="sm">
            <Pencil className="size-3.5" aria-hidden />
            Edit
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <UserPlus className="size-3.5" aria-hidden />
            Add traveller
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>
              {applicant ? "Edit traveller" : "Add a traveller"}
            </DialogTitle>
            <DialogDescription>
              Names and the passport number must match the passport exactly —
              the embassy rejects a mismatch.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            <FieldGrid columns={3}>
              <Field label="First name" required>
                <Input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  required
                />
              </Field>
              <Field label="Middle name">
                <Input
                  value={middleName}
                  onChange={(event) => setMiddleName(event.target.value)}
                />
              </Field>
              <Field label="Last name" required>
                <Input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  required
                />
              </Field>
            </FieldGrid>

            <FieldGrid columns={3}>
              <Field label="Date of birth" htmlFor="traveller-dob">
                <DateField
                  id="traveller-dob"
                  value={dateOfBirth}
                  onChange={setDateOfBirth}
                  toYear={new Date().getFullYear()}
                  fromYear={1920}
                />
              </Field>
              <Field label="Gender" htmlFor="traveller-gender">
                <select
                  id="traveller-gender"
                  value={gender}
                  onChange={(event) => setGender(event.target.value as Gender | "")}
                  className={selectClass}
                >
                  <option value="">Not recorded</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </Field>
              <Field label="Nationality" htmlFor="traveller-nationality">
                <CountrySelect
                  id="traveller-nationality"
                  value={nationality}
                  onChange={setNationality}
                />
              </Field>
            </FieldGrid>

            <FieldGrid>
              <Field label="Passport number">
                <Input
                  value={passportNumber}
                  onChange={(event) => setPassportNumber(event.target.value)}
                  className="font-mono uppercase"
                  placeholder="Z1234567"
                />
              </Field>
              <Field label="Issuing country" htmlFor="traveller-passport-country">
                <CountrySelect
                  id="traveller-passport-country"
                  value={passportIssuingCountry}
                  onChange={setPassportIssuingCountry}
                />
              </Field>
            </FieldGrid>

            <FieldGrid>
              <Field label="Passport issued" htmlFor="traveller-passport-issued">
                <DateField
                  id="traveller-passport-issued"
                  value={passportIssueDate}
                  onChange={setPassportIssueDate}
                />
              </Field>
              <Field label="Passport expires" htmlFor="traveller-passport-expiry">
                <DateField
                  id="traveller-passport-expiry"
                  value={passportExpiryDate}
                  onChange={setPassportExpiryDate}
                />
              </Field>
            </FieldGrid>

            <FieldGrid columns={3}>
              <Field label="Occupation">
                <Input
                  value={occupation}
                  onChange={(event) => setOccupation(event.target.value)}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field label="Phone">
                <PhoneField value={phone} onChange={setPhone} />
              </Field>
            </FieldGrid>

            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(event) => setIsPrimary(event.target.checked)}
                disabled={applicant?.isPrimary}
                className="mt-0.5 size-4 rounded border-input"
              />
              <span className="text-muted-foreground">
                Primary applicant — the person the embassy correspondence is
                addressed to.
              </span>
            </label>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {applicant && canRemove ? (
              <ConfirmDialog
                title="Remove this traveller?"
                description="Their uploaded documents are deleted with them. This cannot be undone."
                confirmLabel="Remove traveller"
                destructive
                onConfirm={doRemove}
                trigger={
                  <Button type="button" variant="ghost" disabled={removing}>
                    {removing ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="size-4" aria-hidden />
                    )}
                    Remove
                  </Button>
                }
              />
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {applicant ? "Save traveller" : "Add traveller"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
