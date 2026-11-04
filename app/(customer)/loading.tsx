import { VisaLoader } from "@/components/shared/visa-loader";

/**
 * Shown while a portal route resolves.
 *
 * Deliberately *not* `fullscreen`: `loading.tsx` renders inside the shell's
 * `<main>`, so the header and the nav rail are still on screen around it.
 * A viewport-height block in that slot pushes the page past the fold and
 * leaves a dead gap under the footer — it has to fit the content area, not
 * the window.
 */
export default function CustomerLoading() {
  return (
    <VisaLoader
      label="Opening your applications"
      hint="Fetching the latest status from our team."
      className="min-h-[50vh]"
    />
  );
}
