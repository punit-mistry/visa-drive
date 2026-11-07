"use client";

import { RouteError } from "@/components/shared/route-error";

/**
 * Partner portal error boundary. An agent who follows a stale link to another
 * agency's booking gets "not found" rather than a broken page — the Convex
 * query refused it, which is exactly the behaviour we want surfaced calmly.
 */
export default function PartnerError({
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
      backHref="/partner/dashboard"
      backLabel="Back to your dashboard"
    />
  );
}
