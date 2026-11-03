"use client";

import Link from "next/link";
import { Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Portal states that exist between "Clerk says you are signed in" and "Convex
 * knows who you are".
 *
 * Every protected query throws `NO_PROFILE` during that window, so the shells
 * render these instead of mounting a page that would blow up.
 */

export function AccountSetupState({ stalled = false }: { stalled?: boolean }) {
  if (!stalled) {
    return (
      <div className="container-page flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Setting up your account…</p>
      </div>
    );
  }

  return (
    <div className="container-page flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        We couldn&apos;t finish setting up your account
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        This usually clears by itself. Refresh to try again — if it keeps
        happening, contact support and we&apos;ll sort it out.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => window.location.reload()}>Refresh</Button>
        <Button variant="outline" asChild>
          <Link href="/contact">Contact support</Link>
        </Button>
      </div>
    </div>
  );
}

export function AccountBlockedState({
  reason,
}: {
  reason: "suspended" | "deleted";
}) {
  return (
    <div className="container-page flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-brand-tint">
        <ShieldAlert className="size-5 text-brand" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">
        {reason === "suspended"
          ? "Your account is suspended"
          : "This account is no longer active"}
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {reason === "suspended"
          ? "Please contact VisaDrive support to restore access to your applications and documents."
          : "If you think this is a mistake, contact VisaDrive support and we'll take a look."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/contact">Contact support</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to site</Link>
        </Button>
      </div>
    </div>
  );
}
