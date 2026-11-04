"use client";

import { RouteError } from "@/components/shared/route-error";

/**
 * CRM error boundary. Scoped to `/admin` so the shell — sidebar, header,
 * account menu — stays on screen and the staff member can navigate somewhere
 * they do have access to.
 */
export default function AdminError({
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
      backHref="/admin"
      backLabel="Back to the dashboard"
    />
  );
}
