"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { Loader2, Pencil } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { CountrySelect } from "@/components/shared/country-select";
import { DateField } from "@/components/shared/date-field";
import { Field, FieldGrid } from "@/components/shared/form-field";
import { PhoneField } from "@/components/shared/phone-field";
import { useValidation, zodMessage, type FieldErrors } from "@/hooks/use-validation";
import { toDateInput, fromDateInput } from "@/lib/helpers/format";
import { phoneField } from "@/lib/validators/forms";
import { friendlyError } from "@/lib/helpers/error-messages";

/**
 * Correct the trip details on a booking the customer can no longer edit.
 *
 * The customer's own route into these fields closes at submission, so after
 * that a date change arrives by phone and somebody in the office has to make
 * it. The fields here are exactly the ones `applications.updateTripDetails`
 * accepts — status, pricing and the traveller count each have their own
 * mutation and are not reachable from this form.
 */
export function EditTripDialog({
  application,
}: {
  application: Doc<"applications"> & { _id: Id<"applications"> };
}) {
  const updateTrip = useMutation(api.applications.updateTripDetails);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [departureCountry, setDepartureCountry] = useState("");
  const [travelPurpose, setTravelPurpose] = useState("");
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [phone, setPhone] = useState("");
  const [rejection, setRejection] = useState<"unknown" | "yes" | "no">("unknown");
  const [rejectionNote, setRejectionNote] = useState("");
  const [note, setNote] = useState("");

  const validate = useCallback((): FieldErrors => {
    const errors: FieldErrors = {};
    const from = fromDateInput(arrival);
    const to = fromDateInput(departure);
    if (from !== undefined && to !== undefined && to <= from) {
      errors["trip-departure"] = "The return date must be after the arrival date.";
    }
    if (phone.trim()) {
      const message = zodMessage(phoneField, phone);
      if (message) errors["trip-phone"] = message;
    }
    if (rejection === "yes" && rejectionNote.trim().length < 10) {
      errors["trip-rejection-note"] =
        "Describe the previous rejection — at least 10 characters.";
    }
    return errors;
  }, [arrival, departure, phone, rejection, rejectionNote]);
  const { errors, check, reset: resetValidation } = useValidation(validate);

  function hydrate() {
    setDepartureCountry(application.departureCountry ?? "");
    setTravelPurpose(application.travelPurpose ?? "");
    setArrival(toDateInput(application.intendedArrivalDate));
    setDeparture(toDateInput(application.intendedDepartureDate));
    setPhone(application.customerPhone ?? "");
    setRejection(
      application.hasPreviousVisaRejection === undefined
        ? "unknown"
        : application.hasPreviousVisaRejection
          ? "yes"
          : "no",
    );
    setRejectionNote(application.previousVisaRejectionNote ?? "");
    setNote("");
    setError(null);
    resetValidation();
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!check()) return;

    setSaving(true);
    setError(null);
    try {
      await updateTrip({
        applicationId: application._id,
        patch: {
          departureCountry,
          travelPurpose,
          // `null` clears the date; `fromDateInput` gives undefined for "",
          // and undefined means "leave this column alone".
          intendedArrivalDate: arrival ? fromDateInput(arrival) : null,
          intendedDepartureDate: departure ? fromDateInput(departure) : null,
          customerPhone: phone,
          ...(rejection === "unknown"
            ? {}
            : { hasPreviousVisaRejection: rejection === "yes" }),
          previousVisaRejectionNote: rejectionNote,
        },
        note: note.trim() || undefined,
      });
      toast.success("Trip details updated.");
      setOpen(false);
    } catch (caught) {
      setError(
        friendlyError(caught, "Could not save those changes."),
      );
    } finally {
      setSaving(false);
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
        <Button variant="outline" size="sm">
          <Pencil className="size-3.5" aria-hidden />
          Edit trip
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={save} noValidate>
          <DialogHeader>
            <DialogTitle>Edit trip details</DialogTitle>
            <DialogDescription>
              For corrections the customer can no longer make themselves. Every
              change is recorded in the audit log against your name.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            <FieldGrid>
              <Field label="Arrival date" htmlFor="trip-arrival">
                <DateField id="trip-arrival" value={arrival} onChange={setArrival} />
              </Field>
              <Field label="Return date" htmlFor="trip-departure" error={errors["trip-departure"]}>
                <DateField
                  id="trip-departure"
                  value={departure}
                  onChange={setDeparture}
                />
              </Field>
            </FieldGrid>

            <FieldGrid>
              <Field label="Departure country" htmlFor="trip-country">
                <CountrySelect
                  id="trip-country"
                  value={departureCountry}
                  onChange={setDepartureCountry}
                />
              </Field>
              <Field label="Purpose of travel">
                <Input
                  value={travelPurpose}
                  onChange={(event) => setTravelPurpose(event.target.value)}
                  placeholder="Holiday, business, family visit…"
                />
              </Field>
            </FieldGrid>

            <Field
              label="Contact phone for this booking"
              htmlFor="trip-phone"
              error={errors["trip-phone"]}
            >
              <PhoneField id="trip-phone" value={phone} onChange={setPhone} />
            </Field>

            <Field label="Previous visa rejection" htmlFor="trip-rejection">
              <select
                id="trip-rejection"
                value={rejection}
                onChange={(event) =>
                  setRejection(event.target.value as "unknown" | "yes" | "no")
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand"
              >
                <option value="unknown">Not recorded</option>
                <option value="no">No previous rejection</option>
                <option value="yes">Yes, previously rejected</option>
              </select>
            </Field>

            {rejection === "yes" && (
              <Field
                label="Rejection details"
                htmlFor="trip-rejection-note"
                error={errors["trip-rejection-note"]}
                hint="Country, year and the reason given, as far as the customer knows it."
              >
                <Textarea
                  id="trip-rejection-note"
                  value={rejectionNote}
                  onChange={(event) => setRejectionNote(event.target.value)}
                  rows={3}
                />
              </Field>
            )}

            <Field
              label="Why are you changing this?"
              hint="Optional, but it is what the audit log will show next to your name."
            >
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Customer called to move the trip"
              />
            </Field>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
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
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
