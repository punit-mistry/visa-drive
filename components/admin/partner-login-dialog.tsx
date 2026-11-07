"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";

/**
 * Create a partner's sign-in from the CRM.
 *
 * Generates a password (or accepts one the operator types), creates the Clerk
 * account for the partner's contact email and links it to the partner row.
 * The password is shown once, with a copy button, and is not stored anywhere.
 */
export function PartnerLoginDialog({
  partnerId,
  agencyName,
  trigger,
}: {
  partnerId: Id<"partners">;
  agencyName: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customPassword, setCustomPassword] = useState("");
  const [result, setResult] = useState<{
    email: string;
    password: string | null;
    message: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setCustomPassword("");
    setResult(null);
    setCopied(false);
  }

  async function create() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/partners/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId,
          password: customPassword.trim() || undefined,
        }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        message: string;
        email?: string;
        password?: string | null;
      };

      if (!response.ok || !body.ok) {
        toast.error(body.message || "Could not create the sign-in.");
        return;
      }

      setResult({
        email: body.email ?? "",
        password: body.password ?? null,
        message: body.message,
      });
      toast.success("Sign-in ready.");
    } catch {
      toast.error("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
        {trigger ?? (
          <Button size="sm" variant="outline">
            <KeyRound className="size-3.5" aria-hidden />
            Create sign-in
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a partner sign-in</DialogTitle>
          <DialogDescription>
            For {agencyName}. The account uses the partner&apos;s contact email.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="partner-login-password">
                Password <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="partner-login-password"
                type="text"
                value={customPassword}
                onChange={(e) => setCustomPassword(e.target.value)}
                placeholder="Leave blank to generate a strong one"
                autoComplete="off"
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                At least 8 characters. Clerk&apos;s password policy applies.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium">{result.email}</p>

              {result.password && (
                <>
                  <p className="mt-3 text-xs text-muted-foreground">Password</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 break-all rounded-md bg-background px-2 py-1.5 font-mono text-sm">
                      {result.password}
                    </code>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => copy(result.password!)}
                      aria-label="Copy password"
                    >
                      {copied ? (
                        <Check className="size-3.5" aria-hidden />
                      ) : (
                        <Copy className="size-3.5" aria-hidden />
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {result.message}
            </p>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={create} disabled={busy}>
                {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                Create sign-in
              </Button>
            </>
          ) : (
            <Button onClick={() => setOpen(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
