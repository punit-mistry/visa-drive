"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff, Loader2, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";

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
import { Field, FieldGrid } from "@/components/shared/form-field";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useValidation, zodMessage, type FieldErrors } from "@/hooks/use-validation";
import { emailField } from "@/lib/validators/forms";
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  assignableRoles,
  isStaffRole,
  type StaffRole,
  type UserRole,
} from "@/lib/constants/roles";

/**
 * Create a colleague's account in one step: Clerk sign-in, Convex role and
 * the credentials email.
 *
 * The roles offered are narrowed by `assignableRoles` so the form never shows
 * a grant the operator cannot make — but that is a courtesy, not the control:
 * `users.inviteStaff` refuses the same grant server-side whatever this form
 * submits.
 *
 * On success the password is shown once. It is returned by the API for this
 * single render and stored nowhere, so if the email did not go out this panel
 * is the only place it exists.
 */

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

interface Result {
  account: "created" | "existing";
  promoted: boolean;
  email: { status: "sent" | "skipped" | "failed"; reason?: string };
  password: string | null;
  fullName: string;
  address: string;
  role: StaffRole;
}

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return `${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}#7`;
}

export function AddStaffDialog() {
  const { role: actorRole } = useCurrentUser();
  const grantable = assignableRoles(actorRole as UserRole).filter(isStaffRole);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>(grantable[0] ?? "support_agent");
  const [password, setPassword] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [sendEmail, setSendEmail] = useState(true);

  const { errors, check, reset: resetValidation } = useValidation(
    (): FieldErrors => {
      const found: FieldErrors = {};
      if (fullName.trim().length < 2) {
        found["staff-name"] = "Enter their full name.";
      } else if (fullName.trim().length > 120) {
        found["staff-name"] = "Keep the name under 120 characters.";
      }
      const emailError = zodMessage(emailField, email);
      if (emailError) found["staff-email"] = emailError;
      else if (email.trim().length > 160) {
        found["staff-email"] = "Keep the email under 160 characters.";
      }
      if (password.trim() && password.trim().length < 8) {
        found["staff-password"] = "Use at least 8 characters, or leave it blank.";
      } else if (password.trim().length > 100) {
        found["staff-password"] = "Keep the password under 100 characters.";
      }
      if (designation.trim().length > 120) {
        found["staff-designation"] = "Keep this under 120 characters.";
      }
      if (department.trim().length > 120) {
        found["staff-department"] = "Keep this under 120 characters.";
      }
      return found;
    },
  );

  if (grantable.length === 0) return null;

  function reset() {
    setFullName("");
    setEmail("");
    setRole(grantable[0] ?? "support_agent");
    setPassword("");
    setDesignation("");
    setDepartment("");
    setSendEmail(true);
    setResult(null);
    setError(null);
    setShowPassword(false);
    setCopied(false);
    resetValidation();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!check()) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          role,
          password: password.trim() || undefined,
          designation: designation.trim() || undefined,
          department: department.trim() || undefined,
          sendEmail,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        account?: "created" | "existing";
        promoted?: boolean;
        email?: { status: "sent" | "skipped" | "failed"; reason?: string };
        password?: string | null;
      };

      if (!response.ok || !payload.ok) {
        setError(payload.message ?? "Could not create that staff account.");
        return;
      }

      setResult({
        account: payload.account ?? "created",
        promoted: payload.promoted ?? false,
        email: payload.email ?? { status: "skipped" },
        password: payload.password ?? null,
        fullName: fullName.trim(),
        address: email.trim().toLowerCase(),
        role,
      });

      toast.success(
        payload.email?.status === "sent"
          ? `${fullName.trim()} has been added and emailed.`
          : `${fullName.trim()} has been added.`,
      );
    } catch {
      setError("The request did not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCredentials() {
    if (!result?.password) return;
    try {
      await navigator.clipboard.writeText(
        `VisaDrive sign-in\nEmail: ${result.address}\nPassword: ${result.password}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select the password and copy it by hand.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" aria-hidden />
          Add staff member
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>{result.fullName} can sign in now</DialogTitle>
              <DialogDescription>
                {result.account === "existing"
                  ? "They already had a VisaDrive login, so their password is unchanged — the new role is attached to the same account."
                  : "A sign-in has been created and the role is live."}
              </DialogDescription>
            </DialogHeader>

            <dl className="space-y-3 rounded-lg border border-border bg-surface p-4 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{result.address}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="font-medium">{ROLE_LABELS[result.role]}</dd>
              </div>
              {result.password && (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Temporary password</dt>
                  <dd className="flex items-center gap-1.5">
                    <code className="rounded bg-background px-2 py-0.5 font-mono text-[13px]">
                      {showPassword ? result.password : "•".repeat(result.password.length)}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="size-3.5" aria-hidden />
                      ) : (
                        <Eye className="size-3.5" aria-hidden />
                      )}
                    </Button>
                  </dd>
                </div>
              )}
            </dl>

            <p className="text-sm text-muted-foreground">
              {result.email.status === "sent"
                ? "The sign-in details have been emailed to them. Ask them to change the password once they are in."
                : result.email.status === "failed"
                  ? `The email did not go out (${result.email.reason ?? "unknown error"}). Copy the details below and send them yourself.`
                  : result.password
                    ? `No email was sent${result.email.reason ? ` — ${result.email.reason}` : ""}. This is the only place the password is shown, so copy it now.`
                    : "No email was sent. They sign in with the password they already use."}
            </p>

            <DialogFooter className="gap-2 sm:justify-between">
              {result.password ? (
                <Button type="button" variant="outline" onClick={copyCredentials}>
                  {copied ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                  {copied ? "Copied" : "Copy sign-in details"}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={reset}>
                  Add another
                </Button>
                <Button type="button" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>Add a staff member</DialogTitle>
              <DialogDescription>
                Creates their sign-in, grants the role and emails them the details.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              <FieldGrid>
                <Field label="Full name" required htmlFor="staff-name" error={errors["staff-name"]}>
                  <Input
                    id="staff-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Asha Mehta"
                    autoComplete="off"
                  />
                </Field>

                <Field
                  label="Work email"
                  required
                  htmlFor="staff-email"
                  hint="This is their sign-in."
                  error={errors["staff-email"]}
                >
                  <Input
                    id="staff-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="asha@visadrive.in"
                    autoComplete="off"
                  />
                </Field>
              </FieldGrid>

              <Field
                label="Role"
                required
                htmlFor="add-staff-role"
                hint={ROLE_DESCRIPTIONS[role]}
              >
                <select
                  id="add-staff-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as StaffRole)}
                  className={selectClass}
                >
                  {grantable.map((value) => (
                    <option key={value} value={value}>
                      {ROLE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Password"
                htmlFor="staff-password"
                error={errors["staff-password"]}
                hint="Leave blank to generate a strong one. They should change it after signing in."
              >
                <div className="flex gap-2">
                  <Input
                    id="staff-password"
                    aria-invalid={errors["staff-password"] ? true : undefined}
                    aria-describedby={
                      errors["staff-password"] ? "staff-password-error" : undefined
                    }
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Generated automatically"
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setPassword(generatePassword());
                      setShowPassword(true);
                    }}
                    aria-label="Generate a password"
                  >
                    <RefreshCw className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden />
                    ) : (
                      <Eye className="size-4" aria-hidden />
                    )}
                  </Button>
                </div>
              </Field>

              <FieldGrid>
                <Field
                  label="Designation"
                  hint="Optional"
                  htmlFor="staff-designation"
                  error={errors["staff-designation"]}
                >
                  <Input
                    id="staff-designation"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="Senior Visa Consultant"
                  />
                </Field>
                <Field
                  label="Department"
                  hint="Optional"
                  htmlFor="staff-department"
                  error={errors["staff-department"]}
                >
                  <Input
                    id="staff-department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Processing"
                  />
                </Field>
              </FieldGrid>

              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-input"
                />
                <span className="text-muted-foreground">
                  Email them their sign-in details
                </span>
              </label>

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
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {busy ? "Creating…" : "Create account"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
