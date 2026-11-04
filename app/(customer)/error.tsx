"use client";

import { RouteError } from "@/components/shared/route-error";

/**
 * Portal error boundary. A customer who follows a stale link to an
 * application that is not theirs gets "not found" rather than a broken page.
 */
export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      backHref="/dashboard"
      backLabel="Back to your dashboard"
    />
  );
}
