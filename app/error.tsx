"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/logo";

/**
 * Global error boundary.
 *
 * Deliberately shows nothing technical. A visa applicant seeing a stack trace
 * while uploading a passport learns only that the site is broken, so this
 * offers the two things that actually help: retry, and a way to reach a human.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[visadrive] unhandled error", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo size="lg" />

      <h1 className="mt-10 text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The page could not be loaded. Your application and documents are safe —
        nothing was lost.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>
          <RefreshCw className="size-4" aria-hidden />
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Go to homepage</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/contact">Contact support</Link>
        </Button>
      </div>

      {error.digest && (
        <p className="mt-8 font-mono text-xs text-muted-foreground/70">
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
