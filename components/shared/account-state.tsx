"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { VisaLoader } from "@/components/shared/visa-loader";

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
      <div className="container-page">
        <VisaLoader
          fullscreen
          label="Setting up your account"
          hint="This takes a moment the first time you sign in."
        />
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

      {process.env.NODE_ENV === "development" && (
        <p className="mt-6 max-w-md rounded-lg border border-dashed border-border bg-surface px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          Dev: this is almost always a stale Convex deployment. Run{" "}
          <span className="font-semibold text-foreground">npx convex dev</span>{" "}
          (or <span className="font-semibold text-foreground">npx convex deploy</span>
          ) so `users.syncFromClerk` exists, then refresh.
        </p>
      )}
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
