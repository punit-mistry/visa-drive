"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Loader2, Pencil } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/form-field";
import { PhoneField } from "@/components/shared/phone-field";

/**
 * Correct a customer's contact details from the application they are on.
 *
 * Only the fields `users.updateCustomer` accepts are offered, and the email is
 * shown read-only with the reason — it is the Clerk identity this row is keyed
 * to, so changing it here would silently detach their sign-in.
 */
export function EditCustomerDialog({
  customer,
}: {
  customer: {
    _id: Id<"users">;
    fullName: string;
    email: string;
    phone?: string;
  };
}) {
  const updateCustomer = useMutation(api.users.updateCustomer);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState(customer.fullName);
  const [phone, setPhone] = useState(customer.phone ?? "");

  function reset() {
    setFullName(customer.fullName);
    setPhone(customer.phone ?? "");
    setError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      await updateCustomer({
        userId: customer._id,
        fullName: fullName.trim(),
        phone: phone.trim(),
      });
      toast.success("Customer details updated.");
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save those changes.",
      );
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    fullName.trim() !== customer.fullName ||
    phone.trim() !== (customer.phone ?? "");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-3.5" aria-hidden />
          Edit details
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>Edit customer details</DialogTitle>
            <DialogDescription>
              The corrected name and phone are copied onto this customer&apos;s
              bookings, and the change is written to the audit log.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            <Field label="Full name" required>
              <Input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
                minLength={2}
              />
            </Field>

            <Field label="Phone">
              <PhoneField value={phone} onChange={setPhone} />
            </Field>

            <Field
              label="Email"
              hint="Their sign-in address. It is managed by the login provider and cannot be changed from here."
            >
              <Input value={customer.email} readOnly disabled />
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
            <Button type="submit" disabled={saving || !dirty}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
